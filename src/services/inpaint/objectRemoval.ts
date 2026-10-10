import { AlphaType, BlendMode, ColorType, ImageFormat, PaintStyle, Skia, StrokeCap, StrokeJoin, type SkCanvas, type SkImage, type SkMatrix } from '@shopify/react-native-skia';

import { writeMaskPng } from '@/services/appFiles';
import type { NormalizedPoint } from '@/types/editing';
import type { InpaintEngine, ObjectRemoval } from '@/types/phase4';

import { inpaintPatchMatchAsync, type InpaintImage } from './patchmatch';

/**
 * 객체 제거: selection → a region of the photo around it → inpainting →
 * an RGBA patch (alpha = the softened selection) stored as a file and
 * referenced by the edit (ObjectRemoval). The source file is never changed;
 * the preview and the export composite the same patches (composeRemovals).
 */

export type RemovalSelection = ObjectRemoval['selection'];

export interface Inpainter {
  engine: InpaintEngine;
  /** Largest region side the engine works at (the patch is upscaled past it). */
  workSide: number;
  run(input: InpaintImage, opts: { shouldCancel: () => boolean; onProgress: (p: number) => void }): Promise<Uint8Array>;
}

export const PATCHMATCH: Inpainter = {
  engine: 'patchmatch',
  workSide: 448,
  run: (input, opts) => inpaintPatchMatchAsync(input, { seed: 1, ...opts }),
};

/** Selection bounds in source pixels (strokes include their radius). */
export function selectionBounds(sel: RemovalSelection, srcW: number, srcH: number, tapImage: SkImage | null) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = (p: NormalizedPoint, r = 0) => {
    x0 = Math.min(x0, p.x * srcW - r);
    y0 = Math.min(y0, p.y * srcH - r);
    x1 = Math.max(x1, p.x * srcW + r);
    y1 = Math.max(y1, p.y * srcH + r);
  };
  if (sel.kind === 'brush') {
    const short = Math.min(srcW, srcH);
    for (const s of sel.strokes) for (const p of s.points) add(p, s.radius * short);
  } else if (sel.kind === 'lasso') {
    for (const p of sel.points) add(p);
  } else if (tapImage) {
    const w = tapImage.width();
    const h = tapImage.height();
    const px = tapImage.readPixels(0, 0, { width: w, height: h, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul });
    const bytes = px instanceof Uint8Array ? px : px ? Uint8Array.from(px as ArrayLike<number>, (v) => Math.round(v * 255)) : new Uint8Array(0);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (bytes[(y * w + x) * 4]! > 127) add({ x: (x + 0.5) / w, y: (y + 0.5) / h }, srcW / w);
  }
  if (!Number.isFinite(x0)) return null;
  return { x0: Math.max(0, x0), y0: Math.max(0, y0), x1: Math.min(srcW, x1), y1: Math.min(srcH, y1) };
}

/** Draws the selection (white) in source-pixel coordinates. */
export function drawSelection(canvas: SkCanvas, sel: RemovalSelection, srcW: number, srcH: number, tapImage: SkImage | null) {
  const p = Skia.Paint();
  p.setColor(Float32Array.of(1, 1, 1, 1));
  p.setAntiAlias(true);
  if (sel.kind === 'brush') {
    const short = Math.min(srcW, srcH);
    for (const s of sel.strokes) {
      const line = Skia.Paint();
      line.setColor(Float32Array.of(1, 1, 1, 1));
      line.setAntiAlias(true);
      line.setStyle(PaintStyle.Stroke);
      line.setStrokeCap(StrokeCap.Round);
      line.setStrokeJoin(StrokeJoin.Round);
      line.setStrokeWidth(s.radius * short * 2);
      line.setBlendMode(s.mode === 'erase' ? BlendMode.Clear : BlendMode.SrcOver);
      const path = Skia.Path.Make();
      s.points.forEach((q, i) => (i === 0 ? path.moveTo(q.x * srcW, q.y * srcH) : path.lineTo(q.x * srcW, q.y * srcH)));
      if (s.points.length === 1) path.lineTo(s.points[0]!.x * srcW + 0.01, s.points[0]!.y * srcH);
      canvas.drawPath(path, line);
    }
  } else if (sel.kind === 'lasso') {
    const path = Skia.Path.Make();
    sel.points.forEach((q, i) => (i === 0 ? path.moveTo(q.x * srcW, q.y * srcH) : path.lineTo(q.x * srcW, q.y * srcH)));
    path.close();
    canvas.drawPath(path, p);
  } else if (tapImage) {
    canvas.drawImageRectCubic(tapImage, Skia.XYWHRect(0, 0, tapImage.width(), tapImage.height()), Skia.XYWHRect(0, 0, srcW, srcH), 1 / 3, 1 / 3, null);
  }
}

function readRgba(img: SkImage): Uint8Array {
  const px = img.readPixels(0, 0, { width: img.width(), height: img.height(), colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul });
  if (!px) throw new Error('readPixels');
  return px instanceof Uint8Array ? px : Uint8Array.from(px as ArrayLike<number>, (v) => Math.round(v * 255));
}

/** Morphological dilation of a binary mask by `r` pixels (square), two separable passes. */
function dilate(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return m;
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let run = -1e9;
    for (let x = 0; x < w; x++) {
      if (m[y * w + x]) run = x;
      if (x - run <= r) tmp[y * w + x] = 1;
    }
    run = 1e9;
    for (let x = w - 1; x >= 0; x--) {
      if (m[y * w + x]) run = x;
      if (run - x <= r) tmp[y * w + x] = 1;
    }
  }
  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    let run = -1e9;
    for (let y = 0; y < h; y++) {
      if (tmp[y * w + x]) run = y;
      if (y - run <= r) out[y * w + x] = 1;
    }
    run = 1e9;
    for (let y = h - 1; y >= 0; y--) {
      if (tmp[y * w + x]) run = y;
      if (run - y <= r) out[y * w + x] = 1;
    }
  }
  return out;
}

export interface RemovalInput {
  /** The photo to fill from (source orientation, any resolution; existing removals already composited). */
  photo: SkImage;
  srcW: number;
  srcH: number;
  selection: RemovalSelection;
  /** Tap selections: the mask image. */
  tapImage: SkImage | null;
  inpainter: Inpainter;
  shouldCancel: () => boolean;
  onProgress: (p: number) => void;
  /** Stores the patch PNG and returns its uri (default: Lumi's masks folder / a data URL on web). */
  store?: (png: Uint8Array) => string;
}

/** Runs one removal; returns the document entry (patch already stored). Null for an empty selection. */
export async function removeObject(input: RemovalInput): Promise<ObjectRemoval | null> {
  const { srcW, srcH, selection } = input;
  const b = selectionBounds(selection, srcW, srcH, input.tapImage);
  if (!b || b.x1 - b.x0 < 1 || b.y1 - b.y0 < 1) return null;
  const short = Math.min(srcW, srcH);
  // Grow the selection a little (edges, soft shadows), then add context to copy from.
  const grow = Math.max(3, short * 0.008);
  const bw = b.x1 - b.x0 + grow * 2;
  const bh = b.y1 - b.y0 + grow * 2;
  const margin = Math.max(short * 0.06, Math.max(bw, bh) * 0.9);
  const rx0 = Math.max(0, Math.floor(b.x0 - grow - margin));
  const ry0 = Math.max(0, Math.floor(b.y0 - grow - margin));
  const rx1 = Math.min(srcW, Math.ceil(b.x1 + grow + margin));
  const ry1 = Math.min(srcH, Math.ceil(b.y1 + grow + margin));
  const s = Math.min(1, input.inpainter.workSide / Math.max(rx1 - rx0, ry1 - ry0));
  const w = Math.max(8, Math.round((rx1 - rx0) * s));
  const h = Math.max(8, Math.round((ry1 - ry0) * s));
  const toWork = Skia.Matrix([w / (rx1 - rx0), 0, (-rx0 * w) / (rx1 - rx0), 0, h / (ry1 - ry0), (-ry0 * h) / (ry1 - ry0), 0, 0, 1]) as SkMatrix;

  // Region pixels (the photo may be at another resolution than the source).
  const region = Skia.Surface.Make(w, h)!;
  const rc = region.getCanvas();
  rc.save();
  rc.concat(toWork);
  rc.drawImageRectCubic(input.photo, Skia.XYWHRect(0, 0, input.photo.width(), input.photo.height()), Skia.XYWHRect(0, 0, srcW, srcH), 1 / 3, 1 / 3, null);
  rc.restore();
  region.flush();
  const regionImg = region.makeImageSnapshot();
  const rgba = readRgba(regionImg);
  region.dispose();

  // Selection mask at work resolution, grown.
  const sel = Skia.Surface.Make(w, h)!;
  const sc = sel.getCanvas();
  sc.clear(Float32Array.of(0, 0, 0, 1));
  sc.save();
  sc.concat(toWork);
  drawSelection(sc, selection, srcW, srcH, input.tapImage);
  sc.restore();
  sel.flush();
  const selImg = sel.makeImageSnapshot();
  const selBytes = readRgba(selImg);
  sel.dispose();
  const hole0 = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) hole0[i] = selBytes[i * 4]! > 96 ? 1 : 0;
  const hole = dilate(hole0, w, h, Math.round(grow * s));
  if (!hole.some((v) => v)) return null;

  const rgb = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) rgb.set(rgba.subarray(i * 4, i * 4 + 3), i * 3);
  const filled = await input.inpainter.run({ width: w, height: h, rgb, mask: hole }, { shouldCancel: input.shouldCancel, onProgress: input.onProgress });

  // Patch: filled RGB, alpha = the hole softened by ~1.5 px (pixels outside the hole are the original anyway).
  const alpha = softAlpha(hole, w, h);
  const patch = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    patch.set(filled.subarray(i * 3, i * 3 + 3), i * 4);
    patch[i * 4 + 3] = alpha[i]!;
  }
  const patchImg = Skia.Image.MakeImage({ width: w, height: h, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul }, Skia.Data.fromBytes(patch), w * 4);
  const png = patchImg?.encodeToBytes(ImageFormat.PNG, 100);
  if (!png?.length) throw new Error('patch encode');
  return {
    id: `rm-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
    engine: input.inpainter.engine,
    rect: { x: rx0 / srcW, y: ry0 / srcH, width: (rx1 - rx0) / srcW, height: (ry1 - ry0) / srcH },
    patch: { uri: (input.store ?? ((b: Uint8Array) => writeMaskPng(b, 'patch')))(png), width: w, height: h },
    selection,
    createdAt: Date.now(),
  };
}

/** Hole → 8-bit alpha with a 1–2 px soft rim (3×3 box blur of the dilated hole). */
function softAlpha(hole: Uint8Array, w: number, h: number): Uint8Array {
  const grown = dilate(hole, w, h, 1);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          sum += grown[yy * w + xx]!;
          n++;
        }
      }
      out[y * w + x] = hole[y * w + x] ? 255 : Math.round((sum / n) * 255);
    }
  }
  return out;
}

// ── Compositing (preview + export) ──────────────────────────────

/**
 * `base` (the photo at render resolution, geometry applied) with every
 * removal patch drawn over it through the geometry's source → frame map.
 */
export function composeRemovals(
  base: SkImage,
  removals: readonly ObjectRemoval[],
  patches: ReadonlyMap<string, SkImage>,
  sourceToOutput: number[],
  srcW: number,
  srcH: number,
): SkImage {
  if (removals.length === 0) return base;
  const w = base.width();
  const h = base.height();
  const surface = Skia.Surface.Make(w, h);
  if (!surface) return base;
  const c = surface.getCanvas();
  c.drawImage(base, 0, 0);
  c.save();
  c.concat(Skia.Matrix(sourceToOutput) as SkMatrix);
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  for (const r of removals) {
    const img = patches.get(r.patch.uri);
    if (!img) continue;
    c.drawImageRectCubic(
      img,
      Skia.XYWHRect(0, 0, img.width(), img.height()),
      Skia.XYWHRect(r.rect.x * srcW, r.rect.y * srcH, r.rect.width * srcW, r.rect.height * srcH),
      1 / 3,
      1 / 3,
      paint,
    );
  }
  c.restore();
  surface.flush();
  const out = surface.makeImageSnapshot();
  surface.dispose();
  return out.makeNonTextureImage() ?? out;
}
