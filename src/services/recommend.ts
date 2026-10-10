import { FILTERS, ORIGINAL_FILTER_ID } from '@/constants/filters';
import type { FilterDefinition } from '@/types/filters';
import type { ImageStats } from '@/types/phase4';

/**
 * Smart filter recommendation (rule-based). The photo is described by its
 * measured statistics (services/autoEnhance.measureImage) — brightness,
 * colour temperature, saturation, contrast, highlight share, hue families —
 * plus whether face detection found people; every Lumi filter is described by what its
 * parameters do (warmer / cooler, lift, contrast, saturation, softness).
 * Rules score each filter against the photo; ties keep catalogue order, so
 * the same photo always gets the same list. No randomness, no network.
 */

export type PhotoMood = 'warmPortrait' | 'portrait' | 'coolLandscape' | 'landscape' | 'night' | 'bright' | 'muted' | 'vivid' | 'everyday';

export interface PhotoProfile {
  mood: PhotoMood;
  people: boolean;
  dark: boolean;
  bright: boolean;
  warm: boolean;
  cool: boolean;
  lowSaturation: boolean;
  highSaturation: boolean;
  lowContrast: boolean;
  highContrast: boolean;
  /** Share of sky / foliage / water hues. */
  nature: number;
}

export interface Recommendation {
  filterId: string;
  score: number;
}

export const MOOD_LABEL: Record<PhotoMood, string> = {
  warmPortrait: '따뜻한 인물 사진',
  portrait: '인물 사진',
  coolLandscape: '차가운 풍경',
  landscape: '풍경',
  night: '어두운 · 야간 사진',
  bright: '밝은 사진',
  muted: '차분한 색감의 사진',
  vivid: '색이 진한 사진',
  everyday: '일상 사진',
};

/** Hue family shares: 0 red, 1 orange, 2 yellow, 3 green, 4 cyan, 5 blue, 6 purple, 7 magenta. */
export function profileOf(stats: ImageStats, hasFaces: boolean): PhotoProfile {
  const h = stats.hues;
  const nature = (h[3] ?? 0) + (h[4] ?? 0) + (h[5] ?? 0);
  // People only from face detection: skin-coloured hues alone also match cats, wood, sunsets.
  const people = hasFaces;
  const dark = stats.p50 < 0.2;
  const bright = stats.p50 > 0.62 || stats.clipHigh > 0.12;
  const warm = stats.warmth > 0.08;
  const cool = stats.warmth < -0.03 || ((h[4] ?? 0) + (h[5] ?? 0) > 0.3 && stats.warmth < 0.05);
  const lowSaturation = stats.saturation < 0.18;
  const highSaturation = stats.saturation > 0.45;
  const lowContrast = stats.contrast < 0.16;
  const highContrast = stats.contrast > 0.3;
  const mood: PhotoMood = dark
    ? 'night'
    : people
      ? warm
        ? 'warmPortrait'
        : 'portrait'
      : nature > 0.3
        ? cool
          ? 'coolLandscape'
          : 'landscape'
        : bright
          ? 'bright'
          : lowSaturation
            ? 'muted'
            : highSaturation
              ? 'vivid'
              : 'everyday';
  return { mood, people, dark, bright, warm, cool, lowSaturation, highSaturation, lowContrast, highContrast, nature };
}

interface FilterTraits {
  warmth: number;
  lift: number;
  contrast: number;
  saturation: number;
  softness: number;
  grain: number;
  mono: boolean;
}

export function traitsOf(f: FilterDefinition): FilterTraits {
  const p = f.params;
  const v = (k: keyof typeof p) => p[k] ?? 0;
  const mono = f.category === 'bw';
  return {
    warmth: v('temperature') + v('warmth') * 0.6 + (f.splitTone ? (f.splitTone.highlights[0] - f.splitTone.highlights[2]) * 40 : 0),
    lift: v('brightness') + v('exposure') + v('shadows') * 0.4 + v('fade') * 0.3,
    contrast: v('contrast') - v('fade') * 0.3,
    saturation: mono ? -100 : v('saturation') + v('vibrance') * 0.5,
    softness: v('fade') + v('glow') - v('contrast') * 0.5,
    grain: v('grain'),
    mono,
  };
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
/** Rewards `x` in the wanted direction, saturating at `full`. */
const want = (x: number, full: number) => clamp(x / full, -1, 1);

/** Score of one filter for a photo (higher = better match). */
export function scoreFilter(f: FilterDefinition, p: PhotoProfile): number {
  const t = traitsOf(f);
  let s = 0;
  if (p.mood === 'night') {
    // Night: keep it deep and filmic — contrast, grain, mono; no washed-out lifts.
    s += f.category === 'film' ? 1.5 : 0;
    s += t.mono ? 1.2 : 0;
    s += want(t.contrast, 15) * 0.8 + want(t.grain, 25) * 0.6;
    s -= want(t.lift, 20) * 0.8;
    s -= f.category === 'soft' ? 1 : 0;
  } else if (p.people) {
    // Portraits: skin-friendly warmth, gentle contrast, never mono by default.
    s += f.category === 'warm' ? 1.5 : f.category === 'soft' ? 1 : 0;
    s += want(t.warmth, 15) * (p.warm ? 1 : 0.6);
    s -= want(t.contrast, 15) * 0.6;
    s -= t.mono ? 1.5 : 0;
    s -= t.grain > 30 ? 0.8 : 0;
  } else if (p.nature > 0.3) {
    // Landscapes: follow the scene's temperature, keep colour.
    s += p.cool ? (f.category === 'cool' ? 2 : 0) - want(t.warmth, 15) : want(t.warmth, 15) * 0.8 + (f.category === 'film' ? 0.5 : 0);
    s += want(t.saturation, 15) * 0.4;
    s -= t.mono ? 1 : 0;
  } else {
    s += f.category === 'film' ? 0.6 : 0;
  }
  // Tone corrections a look can bring.
  if (p.bright) s += want(t.softness, 25) * 0.6 - want(t.lift, 15) * 0.6;
  if (p.dark && p.mood !== 'night') s += want(t.lift, 15) * 0.6;
  if (p.lowContrast) s += want(t.contrast, 12) * 0.5;
  if (p.highContrast) s += want(-t.contrast, 12) * 0.5;
  if (p.lowSaturation && !t.mono) s += want(t.saturation, 10) * 0.4;
  if (p.highSaturation) s += want(-t.saturation, 20) * 0.5;
  return s;
}

/**
 * The best filters for a photo: highest scores first, at most `perCategory`
 * from one category so the list isn't six versions of the same look.
 */
export function recommendFilters(stats: ImageStats, hasFaces: boolean, count = 8, perCategory = 3): { profile: PhotoProfile; items: Recommendation[] } {
  const profile = profileOf(stats, hasFaces);
  const scored = FILTERS.filter((f) => f.id !== ORIGINAL_FILTER_ID)
    .map((f, i) => ({ f, i, score: scoreFilter(f, profile) }))
    .sort((a, b) => b.score - a.score || a.i - b.i);
  const used = new Map<string, number>();
  const items: Recommendation[] = [];
  for (const { f, score } of scored) {
    const n = used.get(f.category) ?? 0;
    if (n >= perCategory) continue;
    used.set(f.category, n + 1);
    items.push({ filterId: f.id, score });
    if (items.length >= count) break;
  }
  return { profile, items };
}
