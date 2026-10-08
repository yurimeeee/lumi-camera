import type { CurveChannel, CurvePoint, CurveSettings } from '@/types/editing';

/**
 * Tone curves → a 256-entry RGB lookup table. Pure math; the shader reads the
 * table as a 256×1 texture (`curveLut`) and interpolates between entries.
 *
 * Interpolation is monotone cubic (Fritsch–Carlson): smooth through every
 * control point, and it never overshoots between points, so a curve can't
 * produce values outside 0…1, ripples or NaN however the points are placed.
 */

export const CURVE_CHANNELS: readonly CurveChannel[] = ['rgb', 'red', 'green', 'blue'];

export const CURVE_LABEL: Record<CurveChannel, string> = { rgb: 'RGB', red: 'Red', green: 'Green', blue: 'Blue' };

export const LINEAR_CURVE: readonly CurvePoint[] = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
];

export const DEFAULT_CURVES: CurveSettings = { rgb: LINEAR_CURVE, red: LINEAR_CURVE, green: LINEAR_CURVE, blue: LINEAR_CURVE };

/** Most control points per channel (including both ends). */
export const MAX_CURVE_POINTS = 12;
/** Closest two points may be on the x axis. */
export const MIN_POINT_GAP = 0.02;

export const LUT_SIZE = 256;

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** Sorted, finite, clamped points with unique x and both end points present. */
export function sanitizeCurve(points: readonly CurvePoint[] | undefined): CurvePoint[] {
  const clean = (points ?? [])
    .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
    .map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) }))
    .sort((a, b) => a.x - b.x);
  const out: CurvePoint[] = [];
  for (const p of clean) {
    const last = out[out.length - 1];
    if (last && p.x - last.x < 1e-4) out[out.length - 1] = p;
    else out.push(p);
  }
  if (!out.length || out[0]!.x > 0) out.unshift({ x: 0, y: out.length ? Math.min(out[0]!.y, 0) : 0 });
  if (out[out.length - 1]!.x < 1) out.push({ x: 1, y: Math.max(out[out.length - 1]!.y, 1) });
  return out;
}

export function isLinearCurve(points: readonly CurvePoint[] | undefined): boolean {
  if (!points) return true;
  return sanitizeCurve(points).every((p) => Math.abs(p.x - p.y) < 1e-4);
}

export function isDefaultCurves(curves: Partial<CurveSettings> | undefined): boolean {
  return !curves || CURVE_CHANNELS.every((c) => isLinearCurve(curves[c]));
}

/** Returns a sampler for the curve through `points` (monotone cubic Hermite). */
export function curveSampler(points: readonly CurvePoint[] | undefined): (x: number) => number {
  const p = sanitizeCurve(points);
  const n = p.length;
  if (n === 2 && p[0]!.x === 0 && p[1]!.x === 1) {
    const [a, b] = p;
    return (x) => clamp01(a!.y + (b!.y - a!.y) * clamp01(x));
  }
  const xs = p.map((q) => q.x);
  const ys = p.map((q) => q.y);
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1]! - ys[i]!) / (xs[i + 1]! - xs[i]!));
  const m: number[] = new Array(n);
  m[0] = d[0]!;
  m[n - 1] = d[n - 2]!;
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1]! * d[i]! <= 0 ? 0 : (d[i - 1]! + d[i]!) / 2;
  // Fritsch–Carlson: limit tangents so each segment stays monotone.
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i]! / d[i]!;
    const b = m[i + 1]! / d[i]!;
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i]!;
      m[i + 1] = t * b * d[i]!;
    }
  }
  return (x0) => {
    const x = clamp01(x0);
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]!) i++;
    const h = xs[i + 1]! - xs[i]!;
    const t = (x - xs[i]!) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    const y =
      (2 * t3 - 3 * t2 + 1) * ys[i]! +
      (t3 - 2 * t2 + t) * h * m[i]! +
      (-2 * t3 + 3 * t2) * ys[i + 1]! +
      (t3 - t2) * h * m[i + 1]!;
    return clamp01(y);
  };
}

export type CurveStack = Partial<Record<CurveChannel, readonly CurvePoint[]>> | undefined;

/**
 * Final per-channel mapping as floats (LUT_SIZE × 3, interleaved RGB):
 * filter curves (blended toward linear by `k`) → user curves. Within each
 * set, the RGB curve applies first, then the colour channel's own curve.
 */
export function buildCurveTable(filterCurves: CurveStack, k: number, user: CurveStack): Float32Array {
  const fr = curveSampler(filterCurves?.rgb);
  const fc = [curveSampler(filterCurves?.red), curveSampler(filterCurves?.green), curveSampler(filterCurves?.blue)];
  const ur = curveSampler(user?.rgb);
  const uc = [curveSampler(user?.red), curveSampler(user?.green), curveSampler(user?.blue)];
  const kk = clamp01(k);
  const blend = (f: (x: number) => number, x: number) => x + (f(x) - x) * kk;
  const out = new Float32Array(LUT_SIZE * 3);
  for (let i = 0; i < LUT_SIZE; i++) {
    const v = i / (LUT_SIZE - 1);
    const afterFilterRgb = blend(fr, v);
    for (let c = 0; c < 3; c++) {
      const afterFilter = blend(fc[c]!, afterFilterRgb);
      out[i * 3 + c] = uc[c]!(ur(afterFilter));
    }
  }
  return out;
}

/** True when the composed curves map every input to itself. */
export function isIdentityTable(table: Float32Array): boolean {
  for (let i = 0; i < LUT_SIZE; i++) {
    const v = i / (LUT_SIZE - 1);
    for (let c = 0; c < 3; c++) if (Math.abs(table[i * 3 + c]! - v) > 1e-5) return false;
  }
  return true;
}

/** RGBA8 bytes of the 256×1 lookup texture. */
export function curveTableBytes(table: Float32Array): Uint8Array {
  const bytes = new Uint8Array(LUT_SIZE * 4);
  for (let i = 0; i < LUT_SIZE; i++) {
    bytes[i * 4] = Math.round(table[i * 3]! * 255);
    bytes[i * 4 + 1] = Math.round(table[i * 3 + 1]! * 255);
    bytes[i * 4 + 2] = Math.round(table[i * 3 + 2]! * 255);
    bytes[i * 4 + 3] = 255;
  }
  return bytes;
}

/** CPU mirror of the shader's lookup: linear interpolation between the byte entries. */
export function lookupCpu(bytes: Uint8Array, v: number, channel: 0 | 1 | 2): number {
  const x = clamp01(v) * (LUT_SIZE - 1);
  const i0 = Math.floor(x);
  const i1 = Math.min(i0 + 1, LUT_SIZE - 1);
  const f = x - i0;
  return (bytes[i0 * 4 + channel]! * (1 - f) + bytes[i1 * 4 + channel]! * f) / 255;
}

/** Points blended toward the diagonal: used to scale a whole look (camera recipe intensity). */
export function scaleCurve(points: readonly CurvePoint[], amount: number): CurvePoint[] {
  const a = clamp01(amount);
  return sanitizeCurve(points).map((p) => ({ x: p.x, y: p.x + (p.y - p.x) * a }));
}

/**
 * Inserts a point at `x` on the current curve (no visible change until it
 * is dragged). Returns the new list and the index of the inserted point, or
 * null when the curve is full or `x` is too close to an existing point.
 */
export function insertCurvePoint(points: readonly CurvePoint[], x: number): { points: CurvePoint[]; index: number } | null {
  const p = sanitizeCurve(points);
  if (p.length >= MAX_CURVE_POINTS) return null;
  const cx = clamp01(x);
  if (p.some((q) => Math.abs(q.x - cx) < MIN_POINT_GAP)) return null;
  const y = curveSampler(p)(cx);
  const next = [...p, { x: cx, y }].sort((a, b) => a.x - b.x);
  return { points: next, index: next.findIndex((q) => q.x === cx) };
}

/**
 * Moves point `index`. End points slide vertically only; inner points stay
 * between their neighbours (they can't swap order).
 */
export function moveCurvePoint(points: readonly CurvePoint[], index: number, x: number, y: number): CurvePoint[] {
  const p = sanitizeCurve(points);
  if (index < 0 || index >= p.length) return p;
  const last = p.length - 1;
  let nx: number;
  if (index === 0) nx = 0;
  else if (index === last) nx = 1;
  else nx = Math.min(p[index + 1]!.x - MIN_POINT_GAP, Math.max(p[index - 1]!.x + MIN_POINT_GAP, clamp01(x)));
  const next = p.slice();
  next[index] = { x: nx, y: clamp01(y) };
  return next;
}

/** Removes an inner point (end points can't be removed). */
export function removeCurvePoint(points: readonly CurvePoint[], index: number): CurvePoint[] {
  const p = sanitizeCurve(points);
  if (index <= 0 || index >= p.length - 1) return p;
  return p.filter((_, i) => i !== index);
}
