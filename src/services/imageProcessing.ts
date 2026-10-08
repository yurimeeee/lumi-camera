import type { Uniforms } from '@shopify/react-native-skia';

import { DEFAULT_ADJUSTMENTS, DEFAULT_RETOUCH } from '@/constants/adjustments';
import { getFilter } from '@/constants/filters';
import type { Adjustments, CurveSettings, HslAdjust, HslColor, RGB, Retouch, ToneKey, ToneParams } from '@/types/editing';

import { NO_SPOTS, type SpotUniforms } from './blemish';
import { buildCurveTable, isIdentityTable } from './color/curves';
import { composeHsl } from './color/hsl';
import { NO_FACE_WARP, type FaceWarpUniforms } from './faceWarp/FaceWarpEngine';
import type { FilterDefinition } from '@/types/filters';

/**
 * Pure, UI-independent processing math. Converts "what the user chose"
 * (filter + intensity + adjustments + retouch) into shader uniforms.
 */

export interface ProcessingInput {
  filter: FilterDefinition;
  /** 0…100 */
  intensity: number;
  adjustments?: Partial<Adjustments>;
  retouch?: Partial<Retouch>;
  hsl?: Partial<Record<HslColor, Partial<HslAdjust>>>;
  curves?: Partial<CurveSettings>;
}

export interface ResolvedProcessing {
  tone: Required<ToneParams>;
  split: { shadows: RGB; highlights: RGB; amount: number };
  /** `uHsl`: 8 bands × (hue, saturation, luminance), -1…1. */
  hsl: number[];
  /** Composed curves (LUT_SIZE × RGB floats), or null when they are linear. */
  curves: Float32Array | null;
}

const NEUTRAL: RGB = [0.5, 0.5, 0.5];

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const TONE_KEYS = [
  ...(Object.keys(DEFAULT_ADJUSTMENTS) as (keyof Adjustments)[]),
  ...(Object.keys(DEFAULT_RETOUCH) as (keyof Retouch)[]),
] as ToneKey[];

/** Linear composition: filter × intensity, then user values on top. */
export function resolveProcessing({ filter, intensity, adjustments, retouch, hsl, curves }: ProcessingInput): ResolvedProcessing {
  const k = clamp(intensity, 0, 100) / 100;
  const tone = {} as Required<ToneParams>;
  // Black & white looks stay monochrome at any intensity; intensity only
  // scales their tonal character.
  const mono = filter.category === 'bw';
  for (const key of TONE_KEYS) {
    const fromFilter = (filter.params[key] ?? 0) * (mono && key === 'saturation' ? Math.min(1, k * 4) : k);
    const fromUser =
      (adjustments?.[key as keyof Adjustments] ?? 0) + (retouch?.[key as keyof Retouch] ?? 0);
    tone[key] = clamp(fromFilter + fromUser, -100, 100);
  }
  const split = filter.splitTone
    ? { shadows: filter.splitTone.shadows, highlights: filter.splitTone.highlights, amount: filter.splitTone.amount * k }
    : { shadows: NEUTRAL, highlights: NEUTRAL, amount: 0 };
  const table = buildCurveTable(filter.curves, k, curves);
  return { tone, split, hsl: composeHsl(filter.hsl, k, hsl), curves: isIdentityTable(table) ? null : table };
}

export function isIdentity(p: ResolvedProcessing): boolean {
  return (
    p.split.amount === 0 &&
    TONE_KEYS.every((key) => p.tone[key] === 0) &&
    p.hsl.every((v) => v === 0) &&
    p.curves === null
  );
}

/**
 * @param width  render target width in canvas units
 * @param height render target height in canvas units
 * @param faceWarp face retouch warp for this render target (see services/faceWarp)
 * @param spots  잡티 제거 spots for this render target (see spotUniforms)
 * @param grainSeed stable seed so grain doesn't "boil" while editing
 */
export function buildUniforms(
  p: ResolvedProcessing,
  width: number,
  height: number,
  faceWarp: FaceWarpUniforms = NO_FACE_WARP,
  spots: SpotUniforms = NO_SPOTS,
  grainSeed = 13.7,
): Uniforms {
  const t = p.tone;
  const n = (v: number) => v / 100;
  return {
    uResolution: [width, height],
    uPixel: Math.min(width, height) / 1000,
    uExposure: n(t.exposure) * 1.2,
    uBrightness: n(t.brightness),
    uContrast: n(t.contrast),
    uHighlights: n(t.highlights),
    uShadows: n(t.shadows),
    uSaturation: n(t.saturation),
    uVibrance: n(t.vibrance),
    uWarmth: n(t.warmth),
    uTemperature: n(t.temperature),
    uTint: n(t.tint),
    uSharpness: Math.max(0, n(t.sharpness)),
    uDefinition: n(t.definition),
    uFade: Math.max(0, n(t.fade)),
    uVignette: n(t.vignette),
    uGrain: Math.max(0, n(t.grain)),
    uGrainSeed: grainSeed,
    uSkin: Math.max(0, n(t.skin)),
    uSmooth: Math.max(0, n(t.smooth)),
    uTone: n(t.tone),
    uGlow: Math.max(0, n(t.glow)),
    uDetail: Math.max(0, n(t.detail)),
    ...faceWarp,
    ...spots,
    uShadowTint: [...p.split.shadows],
    uHighlightTint: [...p.split.highlights],
    uSplit: n(p.split.amount),
    uHsl: p.hsl,
    uHslOn: p.hsl.some((v) => v !== 0) ? 1 : 0,
    uCurvesOn: p.curves ? 1 : 0,
  };
}

/**
 * A colour look without a photo: a filter at some intensity, optionally with
 * adjustments, HSL and curves on top. Filters, My Recipes and the camera's
 * live preview are all looks, rendered by the same shader as edits.
 */
export interface Look {
  filterId: string;
  /** 0…100 */
  intensity: number;
  adjustments?: Partial<Adjustments>;
  hsl?: Partial<Record<HslColor, Partial<HslAdjust>>>;
  curves?: Partial<CurveSettings>;
}

export function resolveLook(look: Look, retouch?: Partial<Retouch>): ResolvedProcessing {
  return resolveProcessing({ ...look, filter: getFilter(look.filterId), retouch });
}

/** Uniforms + curve table for a look rendered at width×height (null uniforms = untouched image). */
export function lookRender(look: Look, width: number, height: number): { uniforms: Uniforms | null; curves: Float32Array | null } {
  const p = resolveLook(look);
  if (isIdentity(p)) return { uniforms: null, curves: null };
  return { uniforms: buildUniforms(p, width, height), curves: p.curves };
}
