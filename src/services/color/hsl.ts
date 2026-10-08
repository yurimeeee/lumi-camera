import type { HslAdjust, HslColor, HslSettings } from '@/types/editing';

/**
 * HSL (per-colour) adjustments. Pure data + math; the per-pixel work is in
 * lumiShader (`applyHsl`), which this file mirrors for tests.
 *
 * Each band has a hue centre. A pixel's weight for a band falls off smoothly
 * (smoothstep) to zero at the neighbouring centres, so neighbouring weights
 * always sum to 1 — no seams between bands. Weights are also faded out for
 * near-grey pixels so greys, whites and blacks never shift.
 */

export const HSL_COLORS: readonly HslColor[] = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'];

/** Band centres in degrees. Keep in sync with HSL_SKSL. */
export const HSL_CENTERS: Record<HslColor, number> = {
  red: 0,
  orange: 30,
  yellow: 60,
  green: 120,
  aqua: 180,
  blue: 225,
  purple: 270,
  magenta: 315,
};

/** Swatch colours for the HSL band picker. */
export const HSL_SWATCH: Record<HslColor, string> = {
  red: '#E0604F',
  orange: '#EE9A4D',
  yellow: '#EBCB55',
  green: '#7DB36A',
  aqua: '#5DBDBF',
  blue: '#5B83D6',
  purple: '#9068C9',
  magenta: '#D163A8',
};

export const HSL_LABEL: Record<HslColor, string> = {
  red: 'Red',
  orange: 'Orange',
  yellow: 'Yellow',
  green: 'Green',
  aqua: 'Aqua',
  blue: 'Blue',
  purple: 'Purple',
  magenta: 'Magenta',
};

/** Largest hue rotation (degrees) at ±100. */
export const HSL_MAX_HUE_SHIFT = 30;

const NEUTRAL: HslAdjust = { hue: 0, saturation: 0, luminance: 0 };

export const DEFAULT_HSL: HslSettings = Object.fromEntries(HSL_COLORS.map((c) => [c, NEUTRAL])) as HslSettings;

export function isNeutralAdjust(a: HslAdjust | undefined): boolean {
  return !a || (a.hue === 0 && a.saturation === 0 && a.luminance === 0);
}

export function isNeutralHsl(hsl: Partial<Record<HslColor, Partial<HslAdjust>>> | undefined): boolean {
  if (!hsl) return true;
  return HSL_COLORS.every((c) => {
    const a = hsl[c];
    return !a || ((a.hue ?? 0) === 0 && (a.saturation ?? 0) === 0 && (a.luminance ?? 0) === 0);
  });
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : 0));

/**
 * Filter HSL × intensity + user HSL, as the shader's `uHsl` array:
 * 8 × (hue, saturation, luminance), each -1…1.
 */
export function composeHsl(
  filterHsl: Partial<Record<HslColor, Partial<HslAdjust>>> | undefined,
  k: number,
  user: Partial<Record<HslColor, Partial<HslAdjust>>> | undefined,
): number[] {
  const out: number[] = [];
  for (const c of HSL_COLORS) {
    const f = filterHsl?.[c];
    const u = user?.[c];
    for (const key of ['hue', 'saturation', 'luminance'] as const) {
      out.push(clamp((f?.[key] ?? 0) * k + (u?.[key] ?? 0), -100, 100) / 100);
    }
  }
  return out;
}

/** Signed hue difference a − b in (-180, 180]. */
function hueDelta(a: number, b: number): number {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Weight of each band for a hue in degrees (sums to 1). */
export function hslWeights(hue: number): number[] {
  return HSL_COLORS.map((c, i) => {
    const centre = HSL_CENTERS[c];
    const prev = HSL_CENTERS[HSL_COLORS[(i + 7) % 8]!];
    const next = HSL_CENTERS[HSL_COLORS[(i + 1) % 8]!];
    const left = (centre - prev + 360) % 360;
    const right = (next - centre + 360) % 360;
    const d = hueDelta(hue, centre);
    return d < 0 ? 1 - smoothstep(0, left, -d) : 1 - smoothstep(0, right, d);
  });
}

// ── CPU mirror of the shader (tests) ───────────────────────────

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d < 1e-6) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1) + 1e-6);
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [((h * 60) % 360 + 360) % 360, s, l];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [r + m, g + m, b + m];
}

/** Applies `uHsl` (see composeHsl) to one colour; mirrors `applyHsl` in the shader. */
export function applyHslCpu(rgb: readonly [number, number, number], u: readonly number[]): [number, number, number] {
  const [r, g, b] = rgb;
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  const gate = smoothstep(0.02, 0.18, chroma);
  if (gate <= 0) return [r, g, b];
  const [h, s, l] = rgbToHsl(r, g, b);
  const w = hslWeights(h);
  let dh = 0;
  let ds = 0;
  let dl = 0;
  for (let i = 0; i < 8; i++) {
    dh += w[i]! * u[i * 3]!;
    ds += w[i]! * u[i * 3 + 1]!;
    dl += w[i]! * u[i * 3 + 2]!;
  }
  const s2 = clamp(s * (1 + ds * gate), 0, 1);
  let out = hslToRgb(h + dh * gate * HSL_MAX_HUE_SHIFT, s2, l);
  const a = dl * gate * 0.35;
  out = out.map((v) => (a > 0 ? v + (1 - v) * a : v * (1 + a))) as [number, number, number];
  return out;
}
