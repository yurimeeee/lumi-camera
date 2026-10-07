import { AlphaType, ColorType, Skia, type SkImage } from '@shopify/react-native-skia';

import type { Geometry, NormalizedPoint, ReshapeStroke } from '@/types/editing';

import { rotatedSize } from './imagePipeline';

/**
 * 터치 보정 (push / liquify).
 *
 * Strokes live in source-image coordinates. For a given geometry they are
 * replayed into a displacement field over the visible frame: a grid where
 * every cell stores where its content is sampled from (source = p + d(p)).
 * The grid is resolution-independent, so the preview and the export share
 * it, and it reaches the shader as two textures with 16 bits per axis.
 */

// ── Coordinates ──────────────────────────────────────────────

/** Source-normalised point → frame-normalised (after rotate → flip → crop). */
export function sourceToFrame(pt: NormalizedPoint, g: Geometry): NormalizedPoint {
  let { x, y } = pt;
  // expo-image-manipulator rotates clockwise.
  if (g.rotation === 90) [x, y] = [1 - y, x];
  else if (g.rotation === 180) [x, y] = [1 - x, 1 - y];
  else if (g.rotation === 270) [x, y] = [y, 1 - x];
  if (g.flipH) x = 1 - x;
  if (g.flipV) y = 1 - y;
  const c = g.crop;
  return c ? { x: (x - c.x) / c.width, y: (y - c.y) / c.height } : { x, y };
}

/** Inverse of {@link sourceToFrame}. */
export function frameToSource(pt: NormalizedPoint, g: Geometry): NormalizedPoint {
  let { x, y } = pt;
  const c = g.crop;
  if (c) {
    x = c.x + x * c.width;
    y = c.y + y * c.height;
  }
  if (g.flipH) x = 1 - x;
  if (g.flipV) y = 1 - y;
  if (g.rotation === 90) [x, y] = [y, 1 - x];
  else if (g.rotation === 180) [x, y] = [1 - x, 1 - y];
  else if (g.rotation === 270) [x, y] = [1 - y, x];
  return { x, y };
}

/** Size of the visible frame in source pixels. */
export function frameSize(srcW: number, srcH: number, g: Geometry) {
  const turned = rotatedSize(srcW, srcH, g.rotation);
  return { width: turned.width * (g.crop?.width ?? 1), height: turned.height * (g.crop?.height ?? 1) };
}

// ── Displacement field ───────────────────────────────────────

const GRID_LONG_SIDE = 320;
/** Largest storable displacement, as a fraction of the frame width/height. */
const RANGE = 0.25;
/** Sub-step length relative to the brush radius; small steps keep the warp fold-free. */
const STEP = 0.15;
/**
 * Most a single stroke can move content, relative to the brush radius. The
 * push eases off as a stroke approaches it (and stops there), so one drag only
 * nudges — bigger changes take several small strokes, like in retouching apps.
 * With the falloff below this keeps local squash/stretch within ~18 %, where
 * skin texture still reads as natural.
 */
const MAX_TRAVEL = 0.12;

export class ReshapeField {
  readonly gw: number;
  readonly gh: number;
  /** (dx, dy) per cell, in cell units. */
  private readonly d: Float32Array;
  private scratch = new Float32Array(0);
  private sw = 0;
  private sx0 = 0;
  private sy0 = 0;
  private sx1 = 0;
  private sy1 = 0;
  /** Frame pixels per cell. */
  private readonly cell: number;
  private readonly srcShort: number;
  /** Displacement each stroke has applied so far (cell units), by stroke id. */
  private readonly travel = new Map<number, number>();

  constructor(
    private readonly geometry: Geometry,
    srcW: number,
    srcH: number,
  ) {
    const frame = frameSize(srcW, srcH, geometry);
    const s = GRID_LONG_SIDE / Math.max(frame.width, frame.height);
    this.gw = Math.max(2, Math.round(frame.width * s));
    this.gh = Math.max(2, Math.round(frame.height * s));
    this.cell = frame.width / this.gw;
    this.srcShort = Math.min(srcW, srcH);
    this.d = new Float32Array(this.gw * this.gh * 2);
  }

  /** Replays `stroke`'s segments ending at point `from` onward (0 = whole stroke). */
  addStroke(stroke: ReshapeStroke, from = 0) {
    const r = (stroke.radius * this.srcShort) / this.cell;
    let moved = from > 0 ? (this.travel.get(stroke.id) ?? 0) : 0;
    for (let i = Math.max(1, from); i < stroke.points.length; i++) {
      const a = this.toCell(stroke.points[i - 1]!);
      const b = this.toCell(stroke.points[i]!);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const cap = r * MAX_TRAVEL;
      const ease = Math.max(0, 1 - moved / cap);
      const amount = Math.min(len * stroke.strength * ease, cap - moved);
      if (amount <= 0) continue;
      moved += amount;
      this.pushSegment(a.x, a.y, b.x, b.y, amount, r);
    }
    this.travel.set(stroke.id, moved);
  }

  private toCell(pt: NormalizedPoint) {
    const f = sourceToFrame(pt, this.geometry);
    return { x: f.x * this.gw, y: f.y * this.gh };
  }

  /** Brush travels a → b while pushing the content `amount` along that direction. */
  private pushSegment(ax: number, ay: number, bx: number, by: number, amount: number, r: number) {
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 1e-6 || r <= 0) return;
    const steps = Math.ceil(Math.max(len, amount) / (r * STEP));
    const mx = ((bx - ax) / len) * (amount / steps);
    const my = ((by - ay) / len) * (amount / steps);
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      this.pushStep(ax + (bx - ax) * t, ay + (by - ay) * t, mx, my, r);
    }
  }

  /** Moves the content around (cx, cy) by (mx, my), fading out at radius r. */
  private pushStep(cx: number, cy: number, mx: number, my: number, r: number) {
    const { gw, gh, d } = this;
    const reach = r + Math.hypot(mx, my) + 2;
    this.snapshot(
      Math.max(0, Math.floor(cx - reach)),
      Math.max(0, Math.floor(cy - reach)),
      Math.min(gw - 1, Math.ceil(cx + reach)),
      Math.min(gh - 1, Math.ceil(cy + reach)),
    );
    const r2 = r * r;
    const limX = RANGE * 2 * gw;
    const limY = RANGE * 2 * gh;
    const i0 = Math.max(0, Math.floor(cx - r));
    const i1 = Math.min(gw - 1, Math.ceil(cx + r));
    const j0 = Math.max(0, Math.floor(cy - r));
    const j1 = Math.min(gh - 1, Math.ceil(cy + r));
    for (let j = j0; j <= j1; j++) {
      const py = j + 0.5;
      for (let i = i0; i <= i1; i++) {
        const px = i + 0.5;
        const t2 = ((px - cx) ** 2 + (py - cy) ** 2) / r2;
        if (t2 >= 1) continue;
        // Smooth bump: flat in the middle (the centre moves almost rigidly),
        // gentlest overall slope, zero slope at the rim.
        const w = (1 - t2) * (1 - t2);
        // New map: S'(p) = S(p − m·w)  ⇒  d'(p) = d(p − m·w) − m·w
        const qx = px - mx * w;
        const qy = py - my * w;
        const k = (j * gw + i) * 2;
        d[k] = clamp(this.sample(qx, qy, 0) - mx * w, -limX, limX);
        d[k + 1] = clamp(this.sample(qx, qy, 1) - my * w, -limY, limY);
      }
    }
  }

  /** Copies a region so a step reads the field as it was before the step. */
  private snapshot(x0: number, y0: number, x1: number, y1: number) {
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    if (this.scratch.length < w * h * 2) this.scratch = new Float32Array(w * h * 2);
    for (let j = 0; j < h; j++) {
      const from = ((y0 + j) * this.gw + x0) * 2;
      this.scratch.set(this.d.subarray(from, from + w * 2), j * w * 2);
    }
    this.sw = w;
    this.sx0 = x0;
    this.sy0 = y0;
    this.sx1 = x1;
    this.sy1 = y1;
  }

  /** Bilinear read of the snapshot; cell (i, j) is centred at (i + .5, j + .5). */
  private sample(x: number, y: number, axis: 0 | 1) {
    const fx = x - 0.5;
    const fy = y - 0.5;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const at = (i: number, j: number) => {
      const ci = Math.min(this.sx1, Math.max(this.sx0, i)) - this.sx0;
      const cj = Math.min(this.sy1, Math.max(this.sy0, j)) - this.sy0;
      return this.scratch[(cj * this.sw + ci) * 2 + axis]!;
    };
    const top = at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx;
    const bottom = at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx;
    return top * (1 - ty) + bottom * ty;
  }

  /**
   * Encodes the field as two opaque RGBA8 images: R = high byte, G = low byte.
   * A light [1 4 6 4 1] blur first irons out the small kinks where strokes
   * overlap, so pushed areas bend smoothly (the preview and export share it).
   */
  toTextures(): ReshapeTextures | null {
    const n = this.gw * this.gh;
    const smooth = smoothField(this.d, this.gw, this.gh);
    const xs = new Uint8Array(n * 4);
    const ys = new Uint8Array(n * 4);
    for (let k = 0; k < n; k++) {
      encode(xs, k, smooth[k * 2]! / this.gw);
      encode(ys, k, smooth[k * 2 + 1]! / this.gh);
    }
    const x = makeImage(xs, this.gw, this.gh);
    const y = makeImage(ys, this.gw, this.gh);
    if (!x || !y) {
      x?.dispose();
      y?.dispose();
      return null;
    }
    return { x, y };
  }
}

export interface ReshapeTextures {
  x: SkImage;
  y: SkImage;
}

const KERNEL = [1 / 16, 4 / 16, 6 / 16, 4 / 16, 1 / 16];

/** Separable binomial blur of an interleaved (dx, dy) grid, edges clamped. */
function smoothField(d: Float32Array, gw: number, gh: number): Float32Array {
  const tmp = new Float32Array(d.length);
  const out = new Float32Array(d.length);
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      let sx = 0;
      let sy = 0;
      for (let t = -2; t <= 2; t++) {
        const k = (j * gw + Math.min(gw - 1, Math.max(0, i + t))) * 2;
        sx += d[k]! * KERNEL[t + 2]!;
        sy += d[k + 1]! * KERNEL[t + 2]!;
      }
      tmp[(j * gw + i) * 2] = sx;
      tmp[(j * gw + i) * 2 + 1] = sy;
    }
  }
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      let sx = 0;
      let sy = 0;
      for (let t = -2; t <= 2; t++) {
        const k = (Math.min(gh - 1, Math.max(0, j + t)) * gw + i) * 2;
        sx += tmp[k]! * KERNEL[t + 2]!;
        sy += tmp[k + 1]! * KERNEL[t + 2]!;
      }
      out[(j * gw + i) * 2] = sx;
      out[(j * gw + i) * 2 + 1] = sy;
    }
  }
  return out;
}

function clamp(v: number, min: number, max: number) {
  return v < min ? min : v > max ? max : v;
}

function encode(out: Uint8Array, k: number, v: number) {
  const q = Math.round(clamp(v / (2 * RANGE) + 0.5, 0, 1) * 65535);
  out[k * 4] = q >> 8;
  out[k * 4 + 1] = q & 255;
  out[k * 4 + 2] = 0;
  out[k * 4 + 3] = 255;
}

function makeImage(bytes: Uint8Array, width: number, height: number) {
  return Skia.Image.MakeImage(
    { width, height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Opaque },
    Skia.Data.fromBytes(bytes),
    width * 4,
  );
}

/** Field for `strokes` under `geometry`, built from scratch (export). */
export function buildReshapeField(
  strokes: readonly ReshapeStroke[],
  geometry: Geometry,
  srcW: number,
  srcH: number,
): ReshapeField {
  const field = new ReshapeField(geometry, srcW, srcH);
  for (const s of strokes) field.addStroke(s);
  return field;
}

let neutral: ReshapeTextures | null = null;

/** 1×1 zero field, bound when there are no strokes (the shader always has the children). */
export function neutralReshapeTextures(): ReshapeTextures {
  if (!neutral) {
    const px = new Uint8Array(4);
    encode(px, 0, 0);
    neutral = { x: makeImage(px, 1, 1)!, y: makeImage(px, 1, 1)! };
  }
  return neutral;
}

/** Shader constant: keep in sync with `RANGE`. */
export const RESHAPE_RANGE = RANGE;
