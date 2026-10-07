import type { EyeLandmarks, FaceLandmarks, NormalizedBounds, Point } from './types';

/**
 * Small geometry helpers shared by the detector mappings. Detectors disagree
 * on point order and on which eye is "left", so mappings pick points by
 * geometry (extremes along the face's own axes), not by index.
 */

export const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export function centroid(pts: readonly Point[]): Point {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  const n = Math.max(1, pts.length);
  return { x: x / n, y: y / n };
}

export function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Face axes in the detection image (pixel-isotropic: y scaled by `aspect` = h/w). */
export interface FaceAxes {
  origin: Point;
  /** Unit vector from the image-left eye to the image-right eye. */
  across: Point;
  /** Unit vector toward the chin. */
  down: Point;
  aspect: number;
}

export function makeAxes(leftEye: Point, rightEye: Point, mouth: Point, aspect: number): FaceAxes {
  const ax = rightEye.x - leftEye.x;
  const ay = (rightEye.y - leftEye.y) * aspect;
  const len = Math.hypot(ax, ay) || 1;
  const across = { x: ax / len, y: ay / len };
  let down = { x: -across.y, y: across.x };
  const origin = mid(leftEye, rightEye);
  if ((mouth.x - origin.x) * down.x + (mouth.y - origin.y) * aspect * down.y < 0) down = { x: -down.x, y: -down.y };
  return { origin, across, down, aspect };
}

/** Coordinates of `p` along (across, down), in image-width units. */
export function project(p: Point, axes: FaceAxes) {
  const dx = p.x - axes.origin.x;
  const dy = (p.y - axes.origin.y) * axes.aspect;
  return { s: dx * axes.across.x + dy * axes.across.y, t: dx * axes.down.x + dy * axes.down.y };
}

/** Inverse of {@link project}. */
export function unproject(s: number, t: number, axes: FaceAxes): Point {
  return {
    x: axes.origin.x + s * axes.across.x + t * axes.down.x,
    y: axes.origin.y + (s * axes.across.y + t * axes.down.y) / axes.aspect,
  };
}

export function extreme(pts: readonly Point[], axes: FaceAxes, key: 's' | 't', sign: 1 | -1): Point {
  let best = pts[0]!;
  let score = -Infinity;
  for (const p of pts) {
    const v = project(p, axes)[key] * sign;
    if (v > score) {
      score = v;
      best = p;
    }
  }
  return best;
}

/** Sorts by position across the face (image-left first). */
export function sortAcross(pts: readonly Point[], axes: FaceAxes): Point[] {
  return [...pts].sort((a, b) => project(a, axes).s - project(b, axes).s);
}

/**
 * Eye from its outline: corners are the extremes along the eye line, lids are
 * the outline points above/below the corner-to-corner line.
 */
export function eyeFromOutline(outline: readonly Point[], other: Point, axes: FaceAxes, iris?: Point): EyeLandmarks {
  const c = centroid(outline);
  // Toward the other eye = inner.
  const towardInner: 1 | -1 = project(other, axes).s > project(c, axes).s ? 1 : -1;
  const inner = extreme(outline, axes, 's', towardInner);
  const outer = extreme(outline, axes, 's', towardInner === 1 ? -1 : 1);
  const a = project(outer, axes);
  const b = project(inner, axes);
  const lineT = (s: number) => a.t + ((s - a.s) / (b.s - a.s || 1)) * (b.t - a.t);
  const byInner = (p: Point) => project(p, axes).s * towardInner;
  const rest = outline.filter((p) => p !== inner && p !== outer);
  const upperLid = rest.filter((p) => project(p, axes).t < lineT(project(p, axes).s)).sort((p, q) => byInner(p) - byInner(q));
  const lowerLid = rest.filter((p) => project(p, axes).t >= lineT(project(p, axes).s)).sort((p, q) => byInner(p) - byInner(q));
  return { contour: [...outline], inner, outer, upperLid, lowerLid, center: iris ?? c };
}

/**
 * Forehead arc when the detector only sees the lower face: an ellipse from
 * temple to temple through an estimated hairline. Face thirds put the
 * hairline about 0.6 × (eye line → chin) above the eye line.
 */
export function estimateForehead(leftTemple: Point, rightTemple: Point, chin: Point, axes: FaceAxes): Point[] {
  const l = project(leftTemple, axes);
  const r = project(rightTemple, axes);
  const len = project(chin, axes).t;
  const cs = (l.s + r.s) / 2;
  const ct = (l.t + r.t) / 2;
  const hw = (r.s - l.s) / 2;
  const top = -0.6 * len;
  const hh = Math.max(0.05 * len, ct - top);
  const out: Point[] = [];
  const N = 9;
  for (let i = 0; i < N; i++) {
    const a = Math.PI - (i / (N - 1)) * Math.PI;
    out.push(unproject(cs + hw * Math.cos(a), ct - hh * Math.sin(a), axes));
  }
  return out;
}

export function boundsOf(pts: readonly Point[]): NormalizedBounds {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Rejects landmark sets that would make the warp misbehave (NaN, collapsed faces). */
export function isUsable(lm: FaceLandmarks, aspect: number): boolean {
  const all = [lm.chin, lm.leftEye.center, lm.rightEye.center, lm.nose.tip, lm.lips.center, ...lm.jaw];
  if (all.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false;
  const eyeSpan = Math.hypot(lm.rightEye.center.x - lm.leftEye.center.x, (lm.rightEye.center.y - lm.leftEye.center.y) * aspect);
  const length = Math.hypot(lm.chin.x - mid(lm.leftEye.center, lm.rightEye.center).x, (lm.chin.y - mid(lm.leftEye.center, lm.rightEye.center).y) * aspect);
  return eyeSpan > 0.004 && length > 0.006 && lm.jaw.length >= 5;
}
