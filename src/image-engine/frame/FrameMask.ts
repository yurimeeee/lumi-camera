import { FillType, Skia, type SkPath } from '@shopify/react-native-skia';

import type { SlotMask } from '@/features/frame-studio/types/document';

import type { Box } from './frameGeometry';

/**
 * Masks: the photo window (rect / rounded / ellipse / freeform), the frame's
 * paper region (outer print minus window, so texture and ageing never touch
 * the photo), and alpha analysis for imported frame images.
 */

export function roundedBoxPath(box: Box, r: number): SkPath {
  const rect = Skia.XYWHRect(box.x, box.y, box.width, box.height);
  return r > 0.01 ? Skia.Path.RRect(Skia.RRectXY(rect, r, r)) : Skia.Path.Rect(rect);
}

/** Outer print minus the window (even-odd). */
export function paperPath(w: number, h: number, outerRadius: number, hole: Box, holeRadius: number): SkPath {
  return Skia.PathBuilder.Make()
    .addPath(roundedBoxPath({ x: 0, y: 0, width: w, height: h }, outerRadius))
    .addPath(roundedBoxPath(hole, holeRadius))
    .setFillType(FillType.EvenOdd)
    .build();
}

/** Window path of a slot mask inside a w×h element. */
export function slotPath(slot: SlotMask, w: number, h: number): SkPath {
  const box = slotBox(slot, w, h);
  if (slot.shape === 'ellipse') return Skia.Path.Oval(Skia.XYWHRect(box.x, box.y, box.width, box.height));
  if (slot.shape === 'freeform' && slot.points && slot.points.length >= 3) {
    return Skia.PathBuilder.Make()
      .addPoly(slot.points.map((pt) => Skia.Point(pt.x * w, pt.y * h)), true)
      .build();
  }
  const r = slot.shape === 'rounded' ? (Math.max(0, slot.radius) / 100) * 0.5 * Math.min(box.width, box.height) : 0;
  return roundedBoxPath(box, r);
}

export function slotBox(slot: Pick<SlotMask, 'x' | 'y' | 'width' | 'height'>, w: number, h: number): Box {
  return { x: slot.x * w, y: slot.y * h, width: slot.width * w, height: slot.height * h };
}

/** Bounding box of a freeform outline (normalised). */
export function pointsBox(points: readonly { x: number; y: number }[]) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.max(0, Math.min(...xs));
  const y = Math.max(0, Math.min(...ys));
  return { x, y, width: Math.min(1, Math.max(...xs)) - x, height: Math.min(1, Math.max(...ys)) - y };
}

// ── Alpha analysis (pure) ───────────────────────────────────────

/** Alpha at or below this counts as a see-through pixel. */
const CLEAR = 96;

/** True when any pixel of an RGBA buffer is noticeably transparent. */
export function hasTransparency(rgba: Uint8Array | Uint8ClampedArray): boolean {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i]! < 250) return true;
  return false;
}

/**
 * The photo window of a transparent frame image: the largest connected
 * see-through region that doesn't touch the image border (a frame's hole),
 * falling back to the largest region overall. Returns a normalised box, or
 * null when the image has no usable transparent area.
 */
export function findTransparentSlot(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): Box | null {
  const n = width * height;
  const label = new Int32Array(n).fill(-1);
  const stack = new Int32Array(n);
  let best: { area: number; inner: boolean; x0: number; y0: number; x1: number; y1: number } | null = null;
  let id = 0;
  for (let start = 0; start < n; start++) {
    if (label[start] !== -1 || rgba[start * 4 + 3]! > CLEAR) continue;
    let sp = 0;
    stack[sp++] = start;
    label[start] = id;
    let area = 0;
    let x0 = width;
    let y0 = height;
    let x1 = -1;
    let y1 = -1;
    let touches = false;
    while (sp > 0) {
      const p = stack[--sp]!;
      const x = p % width;
      const y = (p - x) / width;
      area++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touches = true;
      const visit = (q: number) => {
        if (label[q] === -1 && rgba[q * 4 + 3]! <= CLEAR) {
          label[q] = id;
          stack[sp++] = q;
        }
      };
      if (x > 0) visit(p - 1);
      if (x < width - 1) visit(p + 1);
      if (y > 0) visit(p - width);
      if (y < height - 1) visit(p + width);
    }
    const cand = { area, inner: !touches, x0, y0, x1, y1 };
    // Prefer enclosed holes; among equals, the larger one.
    if (!best || (cand.inner && !best.inner) || (cand.inner === best.inner && cand.area > best.area)) best = cand;
    id++;
  }
  // Ignore specks (anti-aliasing, dust) under 1% of the image.
  if (!best || best.area < n * 0.01) return null;
  return {
    x: best.x0 / width,
    y: best.y0 / height,
    width: (best.x1 - best.x0 + 1) / width,
    height: (best.y1 - best.y0 + 1) / height,
  };
}
