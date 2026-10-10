import type { Adjustments } from '@/types/editing';
import type { AutoKey, AutoValues, ImageStats } from '@/types/phase4';

/**
 * Auto Enhance: measures the photo and solves for adjustment values that
 * bring it to well-exposed, neutral, lively targets. Every value is solved
 * against a CPU copy of the Lumi shader's tone stage (lookStage in
 * shaders/lumiShader.ts), so the suggestion is what the sliders will
 * actually do to *this* photo — not a fixed preset. Pure: runs in the app
 * and in the tests on the same pixels.
 */

/** RGBA8 pixels (unpremultiplied). */
export interface RgbaPixels {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

const LUMA = [0.2126, 0.7152, 0.0722] as const;
const luma = (r: number, g: number, b: number) => r * LUMA[0] + g * LUMA[1] + b * LUMA[2];
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Pixel samples (0…1 RGB triples), at most ~`max` evenly spread. */
export function samplePixels(p: RgbaPixels, max = 6000): Float32Array {
  const n = p.width * p.height;
  const step = Math.max(1, Math.sqrt(n / max));
  const out: number[] = [];
  for (let y = step / 2; y < p.height; y += step) {
    for (let x = step / 2; x < p.width; x += step) {
      const i = (Math.floor(y) * p.width + Math.floor(x)) * 4;
      out.push(p.data[i]! / 255, p.data[i + 1]! / 255, p.data[i + 2]! / 255);
    }
  }
  return Float32Array.from(out);
}

function percentile(sorted: Float32Array, q: number) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))]!;
}

/** Hue family (0…7) of an RGB colour: red, orange, yellow, green, cyan, blue, purple, magenta. */
function hueFamily(r: number, g: number, b: number): number {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h: number;
  if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (mx === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  // Band edges in degrees (same order as the HSL panel's colours).
  const edges = [15, 45, 70, 160, 200, 260, 290, 335];
  for (let i = 0; i < edges.length; i++) if (h < edges[i]!) return i;
  return 0;
}

/** Tone and colour statistics of `samples` (see samplePixels). */
export function measureSamples(s: Float32Array): ImageStats {
  const n = s.length / 3;
  const lum = new Float32Array(n);
  let sum = 0;
  let sat = 0;
  let sumSq = 0;
  let clipLow = 0;
  let clipHigh = 0;
  const mid = [0, 0, 0];
  let midN = 0;
  const hues = new Array<number>(8).fill(0);
  for (let i = 0; i < n; i++) {
    const r = s[i * 3]!;
    const g = s[i * 3 + 1]!;
    const b = s[i * 3 + 2]!;
    const l = luma(r, g, b);
    lum[i] = l;
    sum += l;
    sumSq += l * l;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const chroma = mx - mn;
    sat += mx > 0 ? chroma / mx : 0;
    if (l < 0.02) clipLow++;
    if (mx > 0.985) clipHigh++;
    // Grey-world over unsaturated mid-tones: coloured objects don't count as a cast.
    if (l > 0.12 && l < 0.9 && chroma < 0.3) {
      mid[0] += r;
      mid[1] += g;
      mid[2] += b;
      midN++;
    }
    if (chroma > 0.08 && mx > 0.08) hues[hueFamily(r, g, b)]++;
  }
  const sorted = lum.slice().sort();
  const mean = n ? sum / n : 0;
  const midRgb: [number, number, number] = midN > n * 0.02 ? [mid[0] / midN, mid[1] / midN, mid[2] / midN] : [mean, mean, mean];
  const g = Math.max(1e-4, midRgb[1]);
  return {
    mean,
    p01: percentile(sorted, 0.01),
    p05: percentile(sorted, 0.05),
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    clipLow: n ? clipLow / n : 0,
    clipHigh: n ? clipHigh / n : 0,
    saturation: n ? sat / n : 0,
    midRgb,
    // Red-vs-blue balance (warm +) and green-vs-magenta (magenta +), relative to green.
    warmth: (midRgb[0] - midRgb[2]) / g,
    tintCast: ((midRgb[0] + midRgb[2]) / 2 - midRgb[1]) / g,
    contrast: n ? Math.sqrt(Math.max(0, sumSq / n - mean * mean)) : 0,
    hues: hues.map((h) => (n ? h / n : 0)),
  };
}

export function measureImage(p: RgbaPixels): ImageStats {
  return measureSamples(samplePixels(p));
}

// ── CPU tone model (mirror of lookStage's tone part) ────────────

export type ToneValues = Partial<Record<AutoKey | 'warmth', number>>;

/** Applies `v` (slider units) to samples, like the shader's look A stage without filter, HSL, split or curves. */
export function applyTone(s: Float32Array, v: ToneValues): Float32Array {
  const n = (k: keyof ToneValues) => (v[k] ?? 0) / 100;
  const E = n('exposure') * 1.2;
  const B = n('brightness');
  const C = n('contrast');
  const H = n('highlights');
  const S = n('shadows');
  const sat = n('saturation');
  const vib = n('vibrance');
  const warm = n('warmth');
  const T = n('temperature');
  const Ti = n('tint');
  const ex = 2 ** E;
  const gamma = 2 ** (-B * 0.7);
  const wr = 1 + T * 0.1 + Ti * 0.02;
  const wg = 1 + T * 0.02 - Ti * 0.07;
  const wb = 1 - T * 0.12 + Ti * 0.02;
  const out = new Float32Array(s.length);
  for (let i = 0; i < s.length; i += 3) {
    let r = Math.pow(Math.max(0, s[i]! * ex), gamma) * wr;
    let g = Math.pow(Math.max(0, s[i + 1]! * ex), gamma) * wg;
    let b = Math.pow(Math.max(0, s[i + 2]! * ex), gamma) * wb;
    let l = luma(r, g, b);
    if (warm) {
      const k = warm * clamp(4 * l * (1 - l), 0, 1);
      r += 0.06 * k;
      g += 0.02 * k;
      b -= 0.06 * k;
    }
    l = luma(r, g, b);
    const add = S * 0.28 * (1 - smoothstep(0, 0.55, l)) + H * 0.28 * smoothstep(0.45, 1, l);
    r = (r + add - 0.5) * (1 + C * 0.6) + 0.5;
    g = (g + add - 0.5) * (1 + C * 0.6) + 0.5;
    b = (b + add - 0.5) * (1 + C * 0.6) + 0.5;
    l = luma(r, g, b);
    r = l + (r - l) * (1 + sat);
    g = l + (g - l) * (1 + sat);
    b = l + (b - l) * (1 + sat);
    if (vib) {
      const ch = Math.max(r, g, b) - Math.min(r, g, b);
      l = luma(r, g, b);
      const k = 1 + vib * (1 - smoothstep(0, 0.6, ch));
      r = l + (r - l) * k;
      g = l + (g - l) * k;
      b = l + (b - l) * k;
    }
    out[i] = clamp(r, 0, 1);
    out[i + 1] = clamp(g, 0, 1);
    out[i + 2] = clamp(b, 0, 1);
  }
  return out;
}

/** Bisection for a monotonic `f` on [lo, hi] (slider units), returning the value closest to `target`. */
function solve(f: (x: number) => number, target: number, lo: number, hi: number, increasing = true): number {
  let a = lo;
  let b = hi;
  for (let i = 0; i < 18; i++) {
    const m = (a + b) / 2;
    const above = f(m) > target;
    if (above === increasing) b = m;
    else a = m;
  }
  return (a + b) / 2;
}

/**
 * Near-neutral samples (white-balance reference). Starts from grey-world over
 * every usable pixel, then repeatedly keeps the pixels that are close to
 * grey *after* removing the current cast estimate, so a strong cast doesn't
 * hide the greys and saturated subjects (skin, foliage, sky) don't vote.
 * The luminance floor follows the photo, so dark low-key shots still count
 * their shadows.
 */
function neutralSamples(s: Float32Array, stats: ImageStats): Float32Array {
  const lo = Math.max(0.02, stats.p05 * 0.8);
  const usable: number[] = [];
  for (let i = 0; i < s.length; i += 3) {
    const l = luma(s[i]!, s[i + 1]!, s[i + 2]!);
    if (l > lo && l < 0.94) usable.push(s[i]!, s[i + 1]!, s[i + 2]!);
  }
  let picked = Float32Array.from(usable);
  const total = usable.length / 3;
  for (let pass = 0; pass < 4 && picked.length >= 3; pass++) {
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < picked.length; i += 3) {
      r += picked[i]!;
      g += picked[i + 1]!;
      b += picked[i + 2]!;
    }
    const gr = g / Math.max(1e-6, r);
    const gb = g / Math.max(1e-6, b);
    const next: number[] = [];
    for (let i = 0; i < usable.length; i += 3) {
      const cr = usable[i]! * gr;
      const cg = usable[i + 1]!;
      const cb = usable[i + 2]! * gb;
      const mx = Math.max(cr, cg, cb);
      if (mx > 0 && (mx - Math.min(cr, cg, cb)) / mx < 0.16) next.push(usable[i]!, usable[i + 1]!, usable[i + 2]!);
    }
    if (next.length / 3 < total * 0.04) break;
    picked = Float32Array.from(next);
  }
  return picked.length / 3 >= Math.max(30, total * 0.04) ? picked : new Float32Array(0);
}

// ── Targets ─────────────────────────────────────────────────────

/** Mid-tone brightness Lumi aims for (sRGB-encoded luminance median). */
const TARGET_MEDIAN = 0.47;
/** Tone spread (p95 − p05) of a lively, not harsh image. */
const TARGET_SPREAD = 0.74;
const TARGET_SATURATION = 0.3;
/** Share of a measured colour cast that is removed (some ambience stays). */
const CAST_CORRECTION = 0.7;

const round = (v: number) => Math.round(clamp(v, -100, 100));

/**
 * Suggested values for these samples. Solved in order — white balance,
 * exposure, highlights / shadows recovery, contrast, colour — each step on
 * the result of the previous ones, through the shader's own tone math.
 */
export function suggestAuto(samples: Float32Array): { values: AutoValues; stats: ImageStats } {
  const stats = measureSamples(samples);
  const v: Record<AutoKey, number> = {
    exposure: 0,
    brightness: 0,
    contrast: 0,
    highlights: 0,
    shadows: 0,
    saturation: 0,
    vibrance: 0,
    temperature: 0,
    tint: 0,
  };

  // White balance: neutralise most of the mid-tone cast, solved on the
  // near-neutral samples through the shader's own math with every other
  // value in place (contrast and saturation scale a residual cast too).
  const greys = neutralSamples(samples, stats);
  const castOf = (x: ToneValues) => {
    const o = applyTone(greys, x);
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < o.length; i += 3) {
      r += o[i]!;
      g += o[i + 1]!;
      b += o[i + 2]!;
    }
    return { rb: Math.log((r + 1e-3) / (b + 1e-3)), gm: Math.log((r + b) / 2 / (g + 1e-3) + 1e-6) };
  };
  // Casts measured on very dark references are mostly noise and JPEG
  // rounding: trust them less the darker the neutral pixels are.
  let greyLuma = 0;
  for (let i = 0; i < greys.length; i += 3) greyLuma += luma(greys[i]!, greys[i + 1]!, greys[i + 2]!);
  const keep = 1 - CAST_CORRECTION * smoothstep(0.05, 0.2, greyLuma / Math.max(1, greys.length / 3));
  const solveWhiteBalance = () => {
    if (!greys.length) return;
    // The cast as it would look with the other values but no correction.
    const cast0 = castOf({ ...v, temperature: 0, tint: 0 });
    let t = v.temperature;
    let ti = v.tint;
    for (let pass = 0; pass < 3; pass++) {
      t = solve((x) => castOf({ ...v, temperature: x, tint: ti }).rb, cast0.rb * keep, -100, 100);
      ti = solve((x) => castOf({ ...v, temperature: t, tint: x }).gm, cast0.gm * keep, -100, 100);
    }
    v.temperature = Math.abs(t) < 3 ? 0 : round(clamp(t, -70, 70));
    v.tint = Math.abs(ti) < 3 ? 0 : round(clamp(ti, -70, 70));
  };
  solveWhiteBalance();

  const medianOf = (x: ToneValues) => {
    const t = applyTone(samples, x);
    const l = new Float32Array(t.length / 3);
    for (let i = 0; i < l.length; i++) l[i] = luma(t[i * 3]!, t[i * 3 + 1]!, t[i * 3 + 2]!);
    return l.sort();
  };

  // Exposure: bring the median to the target. Low-key and high-key scenes
  // (a lot of deliberate dark / bright) are only nudged halfway.
  const lum0 = medianOf(v);
  const med0 = percentile(lum0, 0.5);
  // Low-key (mostly dark by design) and high-key photos are moved halfway.
  const lowKey = stats.p50 < 0.12 || (stats.p95 < 0.55 && stats.contrast > 0.18);
  const highKey = stats.p50 > 0.75;
  const target = lowKey || highKey ? (med0 + TARGET_MEDIAN) / 2 : TARGET_MEDIAN;
  // Exposure first (it keeps the tonal shape); when it runs out of range,
  // brightness (a mid-tone gamma) takes the rest.
  const EXPOSURE_LIMIT = 70;
  const solveExposure = () => {
    if (Math.abs(percentile(medianOf(v), 0.5) - target) <= 0.015) return;
    v.brightness = 0;
    v.exposure = round(solve((e) => percentile(medianOf({ ...v, exposure: e }), 0.5), target, -EXPOSURE_LIMIT, EXPOSURE_LIMIT));
    if (Math.abs(v.exposure) >= EXPOSURE_LIMIT - 1 && Math.abs(percentile(medianOf(v), 0.5) - target) > 0.015) {
      v.brightness = round(solve((b) => percentile(medianOf({ ...v, brightness: b }), 0.5), target, -60, 60));
    }
  };
  solveExposure();

  // Highlights / shadows: recover clipping the exposure produced or the photo had.
  let lum = medianOf(v);
  const p99 = percentile(lum, 0.99);
  const p02 = percentile(lum, 0.02);
  if (p99 > 0.95) v.highlights = round(-clamp((p99 - 0.9) * 600, 0, 60));
  if (p02 < 0.035) v.shadows = round(clamp((0.06 - p02) * 600, 0, 50));

  // Contrast: towards a lively tonal spread, gently.
  lum = medianOf(v);
  const spread = percentile(lum, 0.95) - percentile(lum, 0.05);
  // (Contrast pivots on mid-grey, so a photo still far from it — a lifted
  // low-key shot — would only be pushed back down; leave those alone.)
  const median = percentile(lum, 0.5);
  if (Math.abs(spread - TARGET_SPREAD) > 0.05 && median > 0.3 && median < 0.68) {
    const goal = spread + (TARGET_SPREAD - spread) * 0.7;
    v.contrast = round(
      clamp(
        solve(
          (c) => {
            const l = medianOf({ ...v, contrast: c });
            return percentile(l, 0.95) - percentile(l, 0.05);
          },
          goal,
          -40,
          45,
        ),
        -30,
        35,
      ),
    );
  }

  // Contrast scales a residual cast and recovery / contrast move the
  // median: settle white balance and exposure again.
  solveWhiteBalance();
  solveExposure();

  // Colour: vibrance lifts muted colours most; saturation only for very flat photos.
  const satGap = TARGET_SATURATION - stats.saturation;
  if (satGap > 0.03) {
    v.vibrance = round(clamp(satGap * 160, 0, 35));
    if (satGap > 0.15) v.saturation = round(clamp((satGap - 0.15) * 80, 0, 12));
  } else if (satGap < -0.12) {
    v.saturation = round(clamp(satGap * 60, -15, 0));
  }

  const values: AutoValues = {};
  for (const k of Object.keys(v) as AutoKey[]) if (v[k] !== 0) values[k] = v[k];
  return { values, stats };
}

// ── Applying (strength) ─────────────────────────────────────────

/**
 * Adds `suggested × strength` to the adjustments in place of whatever Auto
 * added before (`prevApplied`), so manual edits made since stay untouched.
 * Returns the new adjustments and what was actually added (after clamping).
 */
export function applyAutoShare(
  adjustments: Adjustments,
  prevApplied: AutoValues,
  suggested: AutoValues,
  strength: number,
): { adjustments: Adjustments; applied: AutoValues } {
  const next = { ...adjustments };
  const applied: AutoValues = {};
  const keys = new Set([...Object.keys(prevApplied), ...Object.keys(suggested)] as AutoKey[]);
  const k = clamp(strength, 0, 100) / 100;
  for (const key of keys) {
    const base = adjustments[key] - (prevApplied[key] ?? 0);
    const value = Math.round(clamp(base + (suggested[key] ?? 0) * k, -100, 100));
    next[key] = value;
    if (value !== base) applied[key] = value - base;
  }
  return { adjustments: next, applied };
}
