import type { Uniforms } from '@shopify/react-native-skia';

import { DEFAULT_ADJUSTMENTS, DEFAULT_RETOUCH } from '@/constants/adjustments';
import { completeFilm, isNeutralFilm } from '@/constants/film';
import { getFilter } from '@/constants/filters';
import type { Adjustments, AdjustmentKey, CurveSettings, HslAdjust, HslColor, RGB, Retouch, ToneKey, ToneParams } from '@/types/editing';
import type { FilmEffects, FilterMix } from '@/types/film';
import type { FilterDefinition } from '@/types/filters';

import { NO_SPOTS, type SpotUniforms } from './blemish';
import { buildCurveTable, isIdentityTable } from './color/curves';
import { composeHsl } from './color/hsl';
import { NO_FACE_WARP, type FaceWarpUniforms } from './faceWarp/FaceWarpEngine';
import { NO_REGIONS, type RegionUniforms } from './faceWarp/regions';
import { filmUniforms } from './film/uniforms';
import { NO_MASKS, type MaskUniforms } from './masks/shader';

/**
 * Pure, UI-independent processing math. Converts "what the user chose"
 * (filter + intensity + mix + adjustments + retouch + film effects) into
 * shader uniforms.
 *
 * Filter mix model (sequential): look A = filter A × intensity A plus the
 * user's adjustments, HSL and curves; look B = filter B × intensity B, run as
 * a second, complete colour stage on A's result (its own tone, split tone,
 * HSL and curve LUT row). B's curves and colour transforms therefore act on
 * A's output — not an average of parameters — and the order is always
 * A then B. B's spatial values (grain, vignette, fade, glow, sharpness,
 * definition) are not colour transforms; they add to the shared effects.
 */

export interface ProcessingInput {
  filter: FilterDefinition;
  /** 0…100 */
  intensity: number;
  /** Filter B (applied after A). */
  mix?: FilterMix | null;
  adjustments?: Partial<Adjustments>;
  retouch?: Partial<Retouch>;
  hsl?: Partial<Record<HslColor, Partial<HslAdjust>>>;
  curves?: Partial<CurveSettings>;
  film?: FilmEffects | null;
}

/** Colour keys a look stage applies (everything else is a shared effect). */
export const STAGE_KEYS = [
  'exposure',
  'brightness',
  'contrast',
  'highlights',
  'shadows',
  'saturation',
  'vibrance',
  'warmth',
  'temperature',
  'tint',
] as const satisfies readonly AdjustmentKey[];
type StageKey = (typeof STAGE_KEYS)[number];

export interface MixStage {
  tone: Record<StageKey, number>;
  split: { shadows: RGB; highlights: RGB; amount: number };
  hsl: number[];
  curves: Float32Array | null;
}

export interface ResolvedProcessing {
  tone: Required<ToneParams>;
  split: { shadows: RGB; highlights: RGB; amount: number };
  /** `uHsl`: 8 bands × (hue, saturation, luminance), -1…1. */
  hsl: number[];
  /** Composed curves (LUT_SIZE × RGB floats), or null when they are linear. */
  curves: Float32Array | null;
  /** Look B (filter mix), or null. */
  mix: MixStage | null;
  /** Film effects (null = none; grain amount itself is `tone.grain`). */
  film: FilmEffects | null;
}

const NEUTRAL: RGB = [0.5, 0.5, 0.5];

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const TONE_KEYS = [
  ...(Object.keys(DEFAULT_ADJUSTMENTS) as (keyof Adjustments)[]),
  ...(Object.keys(DEFAULT_RETOUCH) as (keyof Retouch)[]),
] as ToneKey[];

const isStageKey = (k: ToneKey): k is StageKey => (STAGE_KEYS as readonly string[]).includes(k);

/** A filter's value for `key` at strength k (B&W looks stay monochrome at any strength). */
function filterValue(filter: FilterDefinition, key: ToneKey, k: number): number {
  const mono = filter.category === 'bw';
  return (filter.params[key] ?? 0) * (mono && key === 'saturation' ? Math.min(1, k * 4) : k);
}

function resolveMix(mix: FilterMix | null | undefined): { stage: MixStage | null; spatial: Partial<Record<ToneKey, number>> } {
  if (!mix) return { stage: null, spatial: {} };
  const filter = getFilter(mix.filterId);
  const k = clamp(mix.intensity, 0, 100) / 100;
  if (k === 0 || filter.id === 'original') return { stage: null, spatial: {} };
  const tone = {} as Record<StageKey, number>;
  const spatial: Partial<Record<ToneKey, number>> = {};
  for (const key of TONE_KEYS) {
    const v = filterValue(filter, key, k);
    if (isStageKey(key)) tone[key] = clamp(v, -100, 100);
    else if (v) spatial[key] = v;
  }
  const table = buildCurveTable(filter.curves, k, undefined);
  const stage: MixStage = {
    tone,
    split: filter.splitTone
      ? { shadows: filter.splitTone.shadows, highlights: filter.splitTone.highlights, amount: filter.splitTone.amount * k }
      : { shadows: NEUTRAL, highlights: NEUTRAL, amount: 0 },
    hsl: composeHsl(filter.hsl, k, undefined),
    curves: isIdentityTable(table) ? null : table,
  };
  const identity = STAGE_KEYS.every((key) => tone[key] === 0) && stage.split.amount === 0 && stage.hsl.every((v) => v === 0) && !stage.curves;
  return { stage: identity ? null : stage, spatial };
}

/** Linear composition: filter × intensity, then user values on top; filter B as a second stage. */
export function resolveProcessing({ filter, intensity, mix, adjustments, retouch, hsl, curves, film }: ProcessingInput): ResolvedProcessing {
  const k = clamp(intensity, 0, 100) / 100;
  const { stage, spatial } = resolveMix(mix);
  const tone = {} as Required<ToneParams>;
  for (const key of TONE_KEYS) {
    const fromUser = (adjustments?.[key as keyof Adjustments] ?? 0) + (retouch?.[key as keyof Retouch] ?? 0);
    tone[key] = clamp(filterValue(filter, key, k) + fromUser + (spatial[key] ?? 0), -100, 100);
  }
  const split = filter.splitTone
    ? { shadows: filter.splitTone.shadows, highlights: filter.splitTone.highlights, amount: filter.splitTone.amount * k }
    : { shadows: NEUTRAL, highlights: NEUTRAL, amount: 0 };
  const table = buildCurveTable(filter.curves, k, curves);
  return {
    tone,
    split,
    hsl: composeHsl(filter.hsl, k, hsl),
    curves: isIdentityTable(table) ? null : table,
    mix: stage,
    film: film ? completeFilm(film) : null,
  };
}

export function isIdentity(p: ResolvedProcessing): boolean {
  return (
    p.split.amount === 0 &&
    TONE_KEYS.every((key) => p.tone[key] === 0) &&
    p.hsl.every((v) => v === 0) &&
    p.curves === null &&
    p.mix === null &&
    (p.film === null || isNeutralFilm(p.film))
  );
}

function mixUniforms(m: MixStage | null) {
  if (!m) {
    return {
      uMixOn: 0,
      uMix: new Array<number>(16).fill(0),
      uMixShadow: [...NEUTRAL],
      uMixHighlight: [...NEUTRAL],
      uHsl2: new Array<number>(24).fill(0),
    };
  }
  const n = (v: number) => v / 100;
  const t = m.tone;
  return {
    uMixOn: 1,
    uMix: [
      n(t.exposure) * 1.2, n(t.brightness), n(t.contrast), n(t.highlights),
      n(t.shadows), n(t.saturation), n(t.vibrance), n(t.warmth),
      n(t.temperature), n(t.tint), n(m.split.amount), m.hsl.some((v) => v !== 0) ? 1 : 0,
      m.curves ? 1 : 0, 0, 0, 0,
    ],
    uMixShadow: [...m.split.shadows],
    uMixHighlight: [...m.split.highlights],
    uHsl2: m.hsl,
  };
}

/**
 * @param width  render target width in canvas units
 * @param height render target height in canvas units
 * @param faceWarp face retouch warp for this render target (see services/faceWarp)
 * @param spots  잡티 제거 spots for this render target (see spotUniforms)
 * @param regions face regions for skin tools (see services/faceWarp/regions)
 * @param masks  selective masks + background stage (see services/masks)
 */
export function buildUniforms(
  p: ResolvedProcessing,
  width: number,
  height: number,
  faceWarp: FaceWarpUniforms = NO_FACE_WARP,
  spots: SpotUniforms = NO_SPOTS,
  regions: RegionUniforms = NO_REGIONS,
  masks: MaskUniforms = NO_MASKS,
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
    uSkin: Math.max(0, n(t.skin)),
    uSmooth: Math.max(0, n(t.smooth)),
    uTexture: n(t.texture),
    uTone: n(t.tone),
    uGlow: Math.max(0, n(t.glow)),
    uDetail: Math.max(0, n(t.detail)),
    ...faceWarp,
    ...spots,
    ...regions,
    uShadowTint: [...p.split.shadows],
    uHighlightTint: [...p.split.highlights],
    uSplit: n(p.split.amount),
    uHsl: p.hsl,
    uHslOn: p.hsl.some((v) => v !== 0) ? 1 : 0,
    uCurvesOn: p.curves ? 1 : 0,
    ...mixUniforms(p.mix),
    ...filmUniforms(p.film),
    ...masks,
  };
}

/**
 * A look without a photo: a filter at some intensity, optionally mixed with
 * filter B, with adjustments, HSL, curves and film effects on top. Filters,
 * My Recipes, film cameras and the camera's live preview are all looks,
 * rendered by the same shader as edits.
 */
export interface ShaderLook {
  filterId: string;
  /** 0…100 */
  intensity: number;
  mix?: FilterMix | null;
  adjustments?: Partial<Adjustments>;
  hsl?: Partial<Record<HslColor, Partial<HslAdjust>>>;
  curves?: Partial<CurveSettings>;
  film?: FilmEffects | null;
}

export function resolveLook(look: ShaderLook, retouch?: Partial<Retouch>): ResolvedProcessing {
  return resolveProcessing({ ...look, filter: getFilter(look.filterId), retouch });
}

export interface LookRender {
  /** null = draw the untouched image. */
  uniforms: Uniforms | null;
  curves: Float32Array | null;
  mixCurves: Float32Array | null;
}

/** Uniforms + curve tables for a look rendered at width×height. */
export function lookRender(look: ShaderLook, width: number, height: number): LookRender {
  const p = resolveLook(look);
  if (isIdentity(p)) return { uniforms: null, curves: null, mixCurves: null };
  return { uniforms: buildUniforms(p, width, height), curves: p.curves, mixCurves: p.mix?.curves ?? null };
}
