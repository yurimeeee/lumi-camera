import type { FrameStyle } from '@/features/frame-studio/types/document';

import type { FrameSpec } from './svgFrame';

/**
 * Frame geometry (pure): where the photo window and the frame's decorations
 * go for a frame drawn into a w×h element with the user's border settings.
 *
 * Thickness never scales the SVG. The four borders are recomputed (asset
 * border × thickness × that side's multiplier) and the window takes the rest.
 * Decorations are re-placed with a 9-slice mapping: a point in the left
 * border stays at the same relative position inside the (new) left border,
 * a point beside the window moves with the window, and so on — so sprocket
 * holes stay in the margins and the caption stays in the bottom border.
 */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FrameGeometry {
  width: number;
  height: number;
  /** Photo window, element units. */
  hole: Box;
  /** Window corner radius. */
  holeRadius: number;
  /** Outer corner radius of the print. */
  outerRadius: number;
  /** Frame (SVG) pixels → element units, piecewise per border. */
  mapX: (x: number) => number;
  mapY: (y: number) => number;
  /** Local scale of the band a frame-pixel y falls in (for caption sizes). */
  bandScaleY: (y: number) => number;
  /** Element units per frame pixel (uniform part). */
  unit: number;
}

/** Window may not get smaller than this share of the element. */
const MIN_HOLE = 0.2;
/** Corner radius 100 = this share of the window's short side. */
const MAX_RADIUS = 0.08;

const pct = (v: number) => Math.max(0, v) / 100;

/** cornerRadius value (0…100) that reproduces the SVG hole's rx. */
export function defaultCornerRadius(spec: FrameSpec): number {
  const r = spec.hole.rx / (MAX_RADIUS * Math.min(spec.hole.width, spec.hole.height));
  return Math.min(100, Math.round(r * 1000) / 10);
}

function piecewise(a0: number, a1: number, b0: number, b1: number, total: number, newTotal: number) {
  // [0,a0] → [0,b0], [a0,a1] → [b0,b1], [a1,total] → [b1,newTotal]
  const s0 = a0 > 0 ? b0 / a0 : 1;
  const s1 = a1 > a0 ? (b1 - b0) / (a1 - a0) : 1;
  const s2 = total > a1 ? (newTotal - b1) / (total - a1) : 1;
  const map = (v: number) => (v <= a0 ? v * s0 : v <= a1 ? b0 + (v - a0) * s1 : b1 + (v - a1) * s2);
  const scale = (v: number) => (v <= a0 ? s0 : v <= a1 ? s1 : s2);
  return { map, scale };
}

/** Geometry of a kit frame (`spec`) drawn w×h with the user's border settings. */
export function frameGeometry(spec: FrameSpec, style: Pick<FrameStyle, 'thickness' | 'top' | 'side' | 'bottom' | 'cornerRadius'>, w: number, h: number): FrameGeometry {
  const sx = w / spec.width;
  const sy = h / spec.height;
  const { hole } = spec;
  const t = pct(style.thickness);
  // Asset borders (frame px) → element units.
  let left = hole.x * sx * t * pct(style.side);
  let right = (spec.width - hole.x - hole.width) * sx * t * pct(style.side);
  let top = hole.y * sy * t * pct(style.top);
  let bottom = (spec.height - hole.y - hole.height) * sy * t * pct(style.bottom);
  // Keep a usable window.
  const fitX = Math.min(1, (w * (1 - MIN_HOLE)) / Math.max(1e-6, left + right));
  const fitY = Math.min(1, (h * (1 - MIN_HOLE)) / Math.max(1e-6, top + bottom));
  left *= fitX;
  right *= fitX;
  top *= fitY;
  bottom *= fitY;
  const box = { x: left, y: top, width: w - left - right, height: h - top - bottom };
  const holeRadius = pct(style.cornerRadius) * MAX_RADIUS * Math.min(box.width, box.height);
  const base = defaultCornerRadius(spec);
  const outerRadius = Math.max(0, pct(style.cornerRadius - base)) * 0.05 * Math.min(w, h);
  const px = piecewise(hole.x, hole.x + hole.width, box.x, box.x + box.width, spec.width, w);
  const py = piecewise(hole.y, hole.y + hole.height, box.y, box.y + box.height, spec.height, h);
  return {
    width: w,
    height: h,
    hole: box,
    holeRadius,
    outerRadius,
    mapX: px.map,
    mapY: py.map,
    bandScaleY: py.scale,
    unit: Math.min(sx, sy),
  };
}

/** No frame: the photo fills the element; corner radius rounds it. */
export function bareGeometry(cornerRadius: number, w: number, h: number): FrameGeometry {
  const r = pct(cornerRadius) * MAX_RADIUS * Math.min(w, h);
  const id = (v: number) => v;
  return { width: w, height: h, hole: { x: 0, y: 0, width: w, height: h }, holeRadius: r, outerRadius: r, mapX: id, mapY: id, bandScaleY: () => 1, unit: 1 };
}

/** Largest box of `aspect` (w/h) centred in `box`. */
export function containBox(aspect: number, box: Box): Box {
  const width = Math.min(box.width, box.height * aspect);
  const height = width / aspect;
  return { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height };
}

/**
 * Scale that makes an iw×ih image cover a w×h window when turned by
 * `rotationDeg` (so rotating a photo never opens gaps at scale 1).
 */
export function coverScale(iw: number, ih: number, w: number, h: number, rotationDeg = 0): number {
  const a = (rotationDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  const bw = w * c + h * s;
  const bh = w * s + h * c;
  return Math.max(bw / iw, bh / ih);
}
