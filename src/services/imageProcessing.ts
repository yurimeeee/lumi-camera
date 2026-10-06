import type { Uniforms } from '@shopify/react-native-skia';

import { DEFAULT_ADJUSTMENTS, DEFAULT_RETOUCH } from '@/constants/adjustments';
import { getFilter } from '@/constants/filters';
import type { Adjustments, FaceGeometry, RGB, Retouch, ToneKey, ToneParams } from '@/types/editing';
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

/** Face landmarks in render-target pixels; all zero (warp off) without a face. */
function faceUniforms(face: FaceGeometry | null, width: number, height: number) {
  if (!face) {
    return {
      uEyeL: [0, 0, 0],
      uEyeR: [0, 0, 0],
      uFaceWidth: 0,
      uJaw0: [0, 0, 0, 0],
      uJaw1: [0, 0, 0, 0],
      uJaw2: [0, 0, 0, 0],
      uJaw3: [0, 0, 0, 0],
      uJaw4: [0, 0, 0, 0],
      uJaw5: [0, 0, 0, 0],
    };
  }
  const at = (pt: { x: number; y: number }): [number, number] => [pt.x * width, pt.y * height];
  // Each jaw point is pushed straight toward the face's midline (perpendicular
  // to forehead→chin), so a tilted face slims along its own axis.
  const [top, chin] = [at(face.axis[0]), at(face.axis[1])];
  const len = Math.hypot(chin[0] - top[0], chin[1] - top[1]) || 1;
  const ux = (chin[0] - top[0]) / len;
  const uy = (chin[1] - top[1]) / len;
  const JAW_WEIGHT = [0.7, 1, 0.8];
  const jaw = (i: number): [number, number, number, number] => {
    const pt = face.jaw[i];
    if (!pt) return [0, 0, 0, 0];
    const [ax, ay] = at(pt);
    const t = (ax - top[0]) * ux + (ay - top[1]) * uy;
    const dx = top[0] + ux * t - ax;
    const dy = top[1] + uy * t - ay;
    const d = Math.hypot(dx, dy) || 1;
    const w = JAW_WEIGHT[i % 3]!;
    return [ax, ay, (dx / d) * w, (dy / d) * w];
  };
  // The eye disc reaches past the lids so the bulge fades out on the skin.
  const eye = (i: 0 | 1): [number, number, number] => [...at(face.eyes[i]), face.eyeWidths[i] * width * 0.9];
  return {
    uEyeL: eye(0),
    uEyeR: eye(1),
    uFaceWidth: face.width * width,
    uJaw0: jaw(0),
    uJaw1: jaw(1),
    uJaw2: jaw(2),
    uJaw3: jaw(3),
    uJaw4: jaw(4),
    uJaw5: jaw(5),
  };
}

/**
 * @param width  render target width in canvas units
 * @param height render target height in canvas units
 * @param face   landmarks for the face warp (눈 크게 / 얼굴 갸름), if detected
 * @param grainSeed stable seed so grain doesn't "boil" while editing
 */
export function buildUniforms(
  p: ResolvedProcessing,
  width: number,
  height: number,
  face: FaceGeometry | null = null,
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
    uEyes: face ? Math.max(0, n(t.eyes)) : 0,
    uSlim: face ? Math.max(0, n(t.slim)) : 0,
    ...faceUniforms(face, width, height),
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
