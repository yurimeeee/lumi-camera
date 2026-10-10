import { AlphaType, BlendMode, ColorType, Skia, TileMode, vec, type SkCanvas, type SkImage, type SkMatrix } from '@shopify/react-native-skia';

import { SUBJECT_CHANNEL } from '@/constants/masks';
import { frameSize, sourceToFrame } from '@/services/frameCoords';
import type { Geometry } from '@/types/editing';
import type { MaskStroke, SelectiveMask } from '@/types/phase4';

/**
 * Mask rasterisation. Every mask is drawn — in source-image coordinates,
 * through the geometry's affine map — into one channel of an RGB "atlas"
 * texture covering the visible frame. The Lumi shader reads the atlas at the
 * same (unwarped) position it reads the photo, so masks stay on the content
 * whatever the render size: preview and export draw the same atlas from the
 * same document.
 *
 * Analytic shapes (radial, linear) use smooth multi-stop gradients, brush
 * strokes are soft dabs, AI masks are the stored mask image; refinements
 * (add / erase strokes) are drawn on top. Colour and luminance ranges are
 * evaluated per pixel in the shader (they depend on the pixel's colour).
 */

/** Long side of one atlas tile (mask resolution over the frame). */
export const MASK_TILE_SIDE = 1024;
/** Empty columns between tiles (the shader's cubic sampling stays inside a tile). */
export const MASK_TILE_PAD = 4;
export { SUBJECT_CHANNEL };

export interface MaskRasterContext {
  geometry: Geometry;
  srcW: number;
  srcH: number;
  /** AI mask images by uri (already loaded). */
  images: ReadonlyMap<string, SkImage>;
}

/** Size of one tile for a frame (aspect of the frame, long side `side`). */
export function tileSize(ctx: Pick<MaskRasterContext, 'geometry' | 'srcW' | 'srcH'>, side = MASK_TILE_SIDE) {
  const f = frameSize(ctx.srcW, ctx.srcH, ctx.geometry);
  const s = side / Math.max(f.width, f.height);
  return { width: Math.max(2, Math.round(f.width * s)), height: Math.max(2, Math.round(f.height * s)) };
}

/**
 * Affine map from source pixels to output pixels (an outW × outH image of
 * the frame), read off `sourceToFrame` so it can never disagree with it.
 * Row-major 3×3.
 */
export function sourceToOutput(g: Geometry, srcW: number, srcH: number, outW: number, outH: number): number[] {
  const o = sourceToFrame({ x: 0, y: 0 }, g);
  const a = sourceToFrame({ x: 1, y: 0 }, g);
  const b = sourceToFrame({ x: 0, y: 1 }, g);
  return [
    (outW * (a.x - o.x)) / srcW,
    (outW * (b.x - o.x)) / srcH,
    outW * o.x,
    (outH * (a.y - o.y)) / srcW,
    (outH * (b.y - o.y)) / srcH,
    outH * o.y,
    0,
    0,
    1,
  ];
}

/** Smoothstep-shaped gradient stops (1 → 0 between `inner` and 1), so feathered edges have no visible ramp ends. */
function falloffStops(inner: number): { colors: number[][]; pos: number[] } {
  const colors: number[][] = [];
  const pos: number[] = [];
  const n = 10;
  colors.push([1, 1, 1, 1]);
  pos.push(0);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const s = 1 - t * t * (3 - 2 * t);
    pos.push(inner + (1 - inner) * t);
    colors.push([s, s, s, 1]);
  }
  return { colors, pos };
}

function grey(v: number, a = 1) {
  return Float32Array.of(v, v, v, a);
}

function drawShape(canvas: SkCanvas, mask: SelectiveMask, ctx: MaskRasterContext) {
  const { srcW, srcH } = ctx;
  const short = Math.min(srcW, srcH);
  const big = Skia.XYWHRect(-srcW, -srcH, srcW * 3, srcH * 3);
  const shape = mask.shape;
  switch (shape.kind) {
    case 'brush':
      break;
    case 'color':
    case 'luminance': {
      const p = Skia.Paint();
      p.setColor(grey(1));
      canvas.drawRect(big, p);
      break;
    }
    case 'radial': {
      const feather = Math.min(0.98, Math.max(0, shape.feather / 100));
      const { colors, pos } = falloffStops(1 - feather);
      const local = Skia.Matrix()
        .translate(shape.cx * srcW, shape.cy * srcH)
        .rotate((shape.angle * Math.PI) / 180)
        .scale(Math.max(1e-3, shape.rx * short), Math.max(1e-3, shape.ry * short));
      const p = Skia.Paint();
      p.setShader(Skia.Shader.MakeRadialGradient(vec(0, 0), 1, colors.map((c) => Float32Array.from(c)), pos, TileMode.Clamp, local));
      canvas.drawRect(big, p);
      break;
    }
    case 'linear': {
      const { colors, pos } = falloffStops(0);
      const p = Skia.Paint();
      p.setShader(
        Skia.Shader.MakeLinearGradient(
          vec(shape.x0 * srcW, shape.y0 * srcH),
          vec(shape.x1 * srcW, shape.y1 * srcH),
          colors.map((c) => Float32Array.from(c)),
          pos,
          TileMode.Clamp,
        ),
      );
      canvas.drawRect(big, p);
      break;
    }
    case 'ai': {
      const img = ctx.images.get(shape.image.uri);
      if (!img) break;
      const p = Skia.Paint();
      canvas.drawImageRectCubic(img, Skia.XYWHRect(0, 0, img.width(), img.height()), Skia.XYWHRect(0, 0, srcW, srcH), 1 / 3, 1 / 3, p);
      break;
    }
  }
  // Invert the shape (range masks invert in the shader instead).
  if (mask.invert && shape.kind !== 'color' && shape.kind !== 'luminance') {
    const p = Skia.Paint();
    p.setColor(grey(1));
    p.setBlendMode(BlendMode.Difference);
    canvas.drawRect(big, p);
  }
}

/** Soft dabs along a stroke; `add` paints white, `erase` black, both up to the stroke's opacity. */
export function drawStroke(canvas: SkCanvas, stroke: MaskStroke, srcW: number, srcH: number) {
  if (stroke.points.length === 0) return;
  const r = Math.max(0.5, stroke.radius * Math.min(srcW, srcH));
  const feather = Math.min(0.98, Math.max(0, stroke.feather / 100));
  const flow = Math.min(1, Math.max(0.02, stroke.flow / 100));
  const v = stroke.mode === 'add' ? 1 : 0;
  const { pos } = falloffStops(1 - feather);
  const n = pos.length;
  // Dab: colour v, alpha = flow × falloff.
  const colors = pos.map((_, i) => {
    const t = i === 0 ? 0 : (i - 1) / (n - 2);
    const a = (1 - t * t * (3 - 2 * t)) * flow;
    return Float32Array.of(v, v, v, i === 0 ? flow : a);
  });
  const layer = Skia.Paint();
  layer.setAlphaf(Math.min(1, Math.max(0, stroke.opacity / 100)));
  canvas.saveLayer(layer);
  const dab = (x: number, y: number) => {
    const p = Skia.Paint();
    p.setShader(Skia.Shader.MakeRadialGradient(vec(x, y), r, colors, pos, TileMode.Clamp));
    canvas.drawCircle(x, y, r, p);
  };
  const pts = stroke.points.map((q) => ({ x: q.x * srcW, y: q.y * srcH }));
  dab(pts[0]!.x, pts[0]!.y);
  const spacing = Math.max(0.5, r * 0.22);
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    let d = spacing - carry;
    while (d <= len) {
      dab(a.x + ((b.x - a.x) * d) / len, a.y + ((b.y - a.y) * d) / len);
      d += spacing;
    }
    carry = len - (d - spacing);
  }
  canvas.restore();
}

/** One mask as 8-bit values over a `width × height` image of the frame. */
export function rasterizeMask(mask: SelectiveMask, ctx: MaskRasterContext, width: number, height: number): Uint8Array {
  const surface = Skia.Surface.Make(width, height);
  if (!surface) throw new Error('mask surface');
  const canvas = surface.getCanvas();
  canvas.clear(grey(0));
  canvas.save();
  canvas.concat(Skia.Matrix(sourceToOutput(ctx.geometry, ctx.srcW, ctx.srcH, width, height)) as SkMatrix);
  drawShape(canvas, mask, ctx);
  for (const s of mask.strokes) drawStroke(canvas, s, ctx.srcW, ctx.srcH);
  canvas.restore();
  surface.flush();
  const snap = surface.makeImageSnapshot();
  const px = snap.readPixels(0, 0, { width, height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul });
  snap.dispose();
  surface.dispose();
  const out = new Uint8Array(width * height);
  if (!px) return out;
  const bytes = px instanceof Uint8Array ? px : Uint8Array.from(px as ArrayLike<number>, (x) => Math.round(x * 255));
  for (let i = 0; i < out.length; i++) out[i] = bytes[i * 4]!;
  return out;
}

// ── Atlas ───────────────────────────────────────────────────────

export interface MaskAtlas {
  image: SkImage;
  tileW: number;
  tileH: number;
  /** Atlas x of tile i = i × stride. */
  stride: number;
}

/**
 * Packs channels (index → 8-bit plane, tileW × tileH) into an opaque RGB
 * atlas: channel c lives in tile ⌊c / 3⌋, component c mod 3.
 */
export function packAtlas(planes: ReadonlyMap<number, Uint8Array>, tileW: number, tileH: number): MaskAtlas | null {
  if (planes.size === 0) return null;
  const tiles = Math.floor(Math.max(...planes.keys()) / 3) + 1;
  const stride = tileW + MASK_TILE_PAD;
  const W = tiles * stride;
  const bytes = new Uint8Array(W * tileH * 4);
  for (let i = 3; i < bytes.length; i += 4) bytes[i] = 255;
  for (const [ch, plane] of planes) {
    const x0 = Math.floor(ch / 3) * stride;
    const comp = ch % 3;
    for (let y = 0; y < tileH; y++) {
      const row = (y * W + x0) * 4 + comp;
      const src = y * tileW;
      for (let x = 0; x < tileW; x++) bytes[row + x * 4] = plane[src + x]!;
    }
  }
  const image = Skia.Image.MakeImage(
    { width: W, height: tileH, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Opaque },
    Skia.Data.fromBytes(bytes),
    W * 4,
  );
  return image ? { image, tileW, tileH, stride } : null;
}

let neutralAtlas: SkImage | null = null;

/** 1×1 black atlas, bound when no mask is active (the shader always has the child). */
export function neutralMaskAtlas(): SkImage {
  if (!neutralAtlas) {
    neutralAtlas = Skia.Image.MakeImage(
      { width: 1, height: 1, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Opaque },
      Skia.Data.fromBytes(Uint8Array.of(0, 0, 0, 255)),
      4,
    )!;
  }
  return neutralAtlas;
}

/** Cache key of a mask's pixels (adjustment values don't change them). */
export function maskRasterKey(mask: SelectiveMask, ctx: Pick<MaskRasterContext, 'geometry' | 'srcW' | 'srcH'>, w: number, h: number): string {
  return JSON.stringify([mask.shape, mask.invert, mask.strokes, ctx.geometry, ctx.srcW, ctx.srcH, w, h]);
}
