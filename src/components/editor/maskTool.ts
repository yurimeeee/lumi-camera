import type { NormalizedPoint } from '@/types/editing';
import type { MaskShape } from '@/types/phase4';

/**
 * Editing a mask on the photo: brush settings, and the handles of radial and
 * linear masks. Everything is computed in source-normalised coordinates (the
 * document's), so handles stay right under any rotate / flip / crop; the
 * canvas only maps them to the screen.
 */

export interface MaskBrushSettings {
  mode: 'add' | 'erase';
  /** 0…100 → on-screen radius (see maskBrushRadius). */
  size: number;
  feather: number;
  flow: number;
  opacity: number;
}

export interface MaskTool {
  maskId: string;
  /** Painting (brush masks, or refining any mask); null = shape handles / colour picking. */
  brush: MaskBrushSettings | null;
  /** Tint the selected mask on the photo. */
  overlay: boolean;
  /** Touches edit the mask (handles, brush, colour pick); false = view only. */
  interactive: boolean;
}

/** Brush radius as a share of the photo's displayed short side. */
export const maskBrushRadius = (size: number) => 0.012 + (size / 100) * 0.2;

export type ShapeHandle = 'center' | 'rx' | 'ry' | 'p0' | 'p1' | 'move';

interface Px {
  x: number;
  y: number;
}

function axes(angleDeg: number) {
  const a = (angleDeg * Math.PI) / 180;
  return { X: { x: Math.cos(a), y: Math.sin(a) }, Y: { x: -Math.sin(a), y: Math.cos(a) } };
}

const toPx = (p: NormalizedPoint, w: number, h: number): Px => ({ x: p.x * w, y: p.y * h });
const toNorm = (p: Px, w: number, h: number): NormalizedPoint => ({ x: p.x / w, y: p.y / h });

/** Handle positions (source-normalised) of a radial or linear shape. */
export function shapeHandles(shape: MaskShape, srcW: number, srcH: number): Partial<Record<ShapeHandle, NormalizedPoint>> {
  if (shape.kind === 'radial') {
    const short = Math.min(srcW, srcH);
    const c = toPx({ x: shape.cx, y: shape.cy }, srcW, srcH);
    const { X, Y } = axes(shape.angle);
    return {
      center: { x: shape.cx, y: shape.cy },
      rx: toNorm({ x: c.x + X.x * shape.rx * short, y: c.y + X.y * shape.rx * short }, srcW, srcH),
      ry: toNorm({ x: c.x - Y.x * shape.ry * short, y: c.y - Y.y * shape.ry * short }, srcW, srcH),
    };
  }
  if (shape.kind === 'linear') return { p0: { x: shape.x0, y: shape.y0 }, p1: { x: shape.x1, y: shape.y1 } };
  return {};
}

/** Outline of a radial shape (source-normalised), `n` points. */
export function ellipseOutline(shape: Extract<MaskShape, { kind: 'radial' }>, srcW: number, srcH: number, scale = 1, n = 72): NormalizedPoint[] {
  const short = Math.min(srcW, srcH);
  const c = toPx({ x: shape.cx, y: shape.cy }, srcW, srcH);
  const { X, Y } = axes(shape.angle);
  const out: NormalizedPoint[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    const u = Math.cos(t) * shape.rx * short * scale;
    const v = Math.sin(t) * shape.ry * short * scale;
    out.push(toNorm({ x: c.x + X.x * u + Y.x * v, y: c.y + X.y * u + Y.y * v }, srcW, srcH));
  }
  return out;
}

/**
 * The shape after dragging `handle` from `from` to `to` (both source-
 * normalised), starting from `start` (the shape when the drag began).
 */
export function dragShape(start: MaskShape, handle: ShapeHandle, from: NormalizedPoint, to: NormalizedPoint, srcW: number, srcH: number): MaskShape {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (start.kind === 'radial') {
    if (handle === 'center' || handle === 'move') return { ...start, cx: start.cx + dx, cy: start.cy + dy };
    const short = Math.min(srcW, srcH);
    const c = toPx({ x: start.cx, y: start.cy }, srcW, srcH);
    const p = toPx(to, srcW, srcH);
    const v = { x: p.x - c.x, y: p.y - c.y };
    const { X, Y } = axes(start.angle);
    if (handle === 'rx') return { ...start, rx: Math.max(0.01, Math.abs(v.x * X.x + v.y * X.y) / short) };
    if (handle === 'ry') return { ...start, ry: Math.max(0.01, Math.abs(v.x * Y.x + v.y * Y.y) / short) };
    return start;
  }
  if (start.kind === 'linear') {
    if (handle === 'p0') return { ...start, x0: start.x0 + dx, y0: start.y0 + dy };
    if (handle === 'p1') return { ...start, x1: start.x1 + dx, y1: start.y1 + dy };
    return { ...start, x0: start.x0 + dx, y0: start.y0 + dy, x1: start.x1 + dx, y1: start.y1 + dy };
  }
  return start;
}

/**
 * Handle under a touch. `toScreen` maps source-normalised points to the same
 * space as `touch`; `reach` is the grab radius there. Radial shapes move
 * when touched inside; linear ones move when touched anywhere else.
 */
export function hitHandle(
  shape: MaskShape,
  touch: Px,
  toScreen: (p: NormalizedPoint) => Px,
  srcW: number,
  srcH: number,
  reach: number,
): ShapeHandle | null {
  const handles = shapeHandles(shape, srcW, srcH);
  let best: { h: ShapeHandle; d: number } | null = null;
  for (const [h, p] of Object.entries(handles) as [ShapeHandle, NormalizedPoint][]) {
    const s = toScreen(p);
    const d = Math.hypot(s.x - touch.x, s.y - touch.y);
    // Size handles win over the centre when they overlap (tiny shapes).
    const bias = h === 'center' ? 0.8 : 1;
    if (d <= reach && (!best || d * bias < best.d)) best = { h, d: d * bias };
  }
  if (best) return best.h;
  return shape.kind === 'radial' || shape.kind === 'linear' ? 'move' : null;
}

/** 선택 보정 panel state kept by the editor (the canvas needs it too). */
export interface SelectiveUi {
  maskId: string | null;
  /** 영역 = edit the area (handles, brush, ranges); 보정 = the mask's sliders. */
  view: 'area' | 'adjust';
  /** Brush refinement on a non-brush mask. */
  refine: boolean;
  brush: MaskBrushSettings;
  /** Tint the selected mask while adjusting too. */
  overlayAlways: boolean;
}

export const DEFAULT_SELECTIVE_UI: SelectiveUi = {
  maskId: null,
  view: 'area',
  refine: false,
  brush: { mode: 'add', size: 30, feather: 60, flow: 70, opacity: 100 },
  overlayAlways: false,
};

/** What the canvas does for the selected mask. */
export function maskToolOf(ui: SelectiveUi, kind: MaskShape['kind'] | null): MaskTool | null {
  if (!ui.maskId || !kind) return null;
  const painting = ui.view === 'area' && (kind === 'brush' || ui.refine);
  return { maskId: ui.maskId, brush: painting ? ui.brush : null, overlay: ui.view === 'area' || ui.overlayAlways, interactive: ui.view === 'area' };
}

/** 터치 › 객체 제거: how the user marks what to remove. */
export interface RemovalTool {
  mode: 'brush' | 'lasso' | 'tap';
  /** Brush size 0…100 (maskBrushRadius of the displayed short side). */
  size: number;
  selection: import('@/types/phase4').ObjectRemoval['selection'] | null;
  onSelection: (sel: import('@/types/phase4').ObjectRemoval['selection'] | null) => void;
  onTap: (point: NormalizedPoint) => void;
}
