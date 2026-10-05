import type { Uniforms } from '@shopify/react-native-skia';

import { DEFAULT_ADJUSTMENTS, DEFAULT_RETOUCH } from '@/constants/adjustments';
import { getFilter } from '@/constants/filters';
import type { Adjustments, RGB, Retouch, ToneKey, ToneParams } from '@/types/editing';
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
}

export interface ResolvedProcessing {
  tone: Required<ToneParams>;
  split: { shadows: RGB; highlights: RGB; amount: number };
}

const NEUTRAL: RGB = [0.5, 0.5, 0.5];

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const TONE_KEYS = [
  ...(Object.keys(DEFAULT_ADJUSTMENTS) as (keyof Adjustments)[]),
  ...(Object.keys(DEFAULT_RETOUCH) as (keyof Retouch)[]),
] as ToneKey[];

/** Linear composition: filter × intensity, then user values on top. */
export function resolveProcessing({ filter, intensity, adjustments, retouch }: ProcessingInput): ResolvedProcessing {
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
  return { tone, split };
}

export function isIdentity(p: ResolvedProcessing): boolean {
  return p.split.amount === 0 && TONE_KEYS.every((key) => p.tone[key] === 0);
}

/**
 * @param width  render target width in canvas units
 * @param height render target height in canvas units
 * @param grainSeed stable seed so grain doesn't "boil" while editing
 */
export function buildUniforms(p: ResolvedProcessing, width: number, height: number, grainSeed = 13.7): Uniforms {
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
    uShadowTint: [...p.split.shadows],
    uHighlightTint: [...p.split.highlights],
    uSplit: n(p.split.amount),
  };
}

export function uniformsFor(
  filterId: string,
  intensity: number,
  width: number,
  height: number,
  adjustments?: Partial<Adjustments>,
  retouch?: Partial<Retouch>,
): Uniforms {
  return buildUniforms(resolveProcessing({ filter: getFilter(filterId), intensity, adjustments, retouch }), width, height);
}
