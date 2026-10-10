import type { BackgroundAdjust, BackgroundFill } from '@/features/frame-studio/types/document';

import type { AdjustmentKey, NormalizedPoint } from './editing';

/**
 * Phase 4 edit data: auto enhance, selective (masked) adjustments, object
 * removal and background editing. Everything is stored with the edit
 * (EditState) in source-image coordinates, so it follows later rotate / flip /
 * crop and the preview and the export render it the same way. Pixel results
 * that cannot be recomputed cheaply (AI masks, inpainted patches) live in
 * app-owned files; the document only references them.
 */

// ── Auto enhance ────────────────────────────────────────────────

/** Adjustments Auto Enhance may set. */
export type AutoKey = Extract<
  AdjustmentKey,
  'exposure' | 'brightness' | 'contrast' | 'highlights' | 'shadows' | 'saturation' | 'vibrance' | 'temperature' | 'tint'
>;

export type AutoValues = Partial<Record<AutoKey, number>>;

/**
 * Auto Enhance writes into the ordinary adjustments (so every value stays a
 * normal, editable slider). This records what it suggested and what it added,
 * so the strength slider can scale its share without touching manual edits.
 */
export interface AutoEnhanceState {
  /** Values the analysis suggested at strength 100. */
  suggested: AutoValues;
  /** What is currently added to the adjustments (after clamping). */
  applied: AutoValues;
  /** 0…100 */
  strength: number;
  /** Measurements the suggestion came from (shown in the UI, used by tests). */
  stats: ImageStats;
}

/** Colour / tone statistics of a photo (0…1 unless noted). */
export interface ImageStats {
  /** Mean luminance. */
  mean: number;
  /** Luminance percentiles. */
  p01: number;
  p05: number;
  p50: number;
  p95: number;
  p99: number;
  /** Share of pixels near black / white. */
  clipLow: number;
  clipHigh: number;
  /** Mean saturation (HSV-style chroma / max). */
  saturation: number;
  /** Mean of mid-tone pixels per channel (white balance). */
  midRgb: [number, number, number];
  /** Warm (+) / cool (−) cast of mid-tones, roughly −1…1. */
  warmth: number;
  /** Magenta (+) / green (−) cast of mid-tones, roughly −1…1. */
  tintCast: number;
  /** RMS contrast of luminance. */
  contrast: number;
  /** Share of pixels per coarse hue family (red/orange/yellow/green/cyan/blue/purple/magenta). */
  hues: number[];
}

// ── Selective adjustments ───────────────────────────────────────

export type MaskAdjustKey =
  | 'exposure'
  | 'brightness'
  | 'contrast'
  | 'highlights'
  | 'shadows'
  | 'saturation'
  | 'temperature'
  | 'tint'
  | 'clarity'
  | 'sharpness';

/** −100…100 (sharpness 0…100). */
export type MaskAdjust = Record<MaskAdjustKey, number>;

/**
 * One brush stroke on a mask. Points are source-normalised; the radius is a
 * share of the source's short side. `add` paints the area in, `erase` takes
 * it out (on any mask kind, as a refinement).
 */
export interface MaskStroke {
  id: number;
  mode: 'add' | 'erase';
  radius: number;
  /** Soft edge, 0…100 (share of the radius that fades). */
  feather: number;
  /** Per-dab build-up, 0…100. */
  flow: number;
  /** Most the stroke can reach, 0…100. */
  opacity: number;
  points: readonly NormalizedPoint[];
}

/** AI masks Lumi can generate (availability depends on the platform's models). */
export type AiMaskTarget = 'subject' | 'background' | 'sky' | 'person' | 'skin';

/** A greyscale mask image in source orientation (white = selected), stored as a file. */
export interface MaskImageRef {
  uri: string;
  width: number;
  height: number;
  /** Model that produced it (e.g. `vision-foreground`, `mediapipe-multiclass`). */
  model: string;
}

export type MaskShape =
  | { kind: 'brush' }
  | {
      kind: 'radial';
      /** Centre, source-normalised. */
      cx: number;
      cy: number;
      /** Half axes as shares of the source's short side. */
      rx: number;
      ry: number;
      /** Degrees, in source space. */
      angle: number;
      /** 0…100 */
      feather: number;
    }
  | {
      kind: 'linear';
      /** Full effect at (x0, y0) fading to none at (x1, y1), source-normalised. */
      x0: number;
      y0: number;
      x1: number;
      y1: number;
    }
  | {
      kind: 'color';
      /** Picked colour (sRGB 0…1) and where it was picked. */
      color: readonly [number, number, number];
      at: NormalizedPoint;
      /** Tolerance 0…100. */
      range: number;
    }
  | {
      kind: 'luminance';
      /** Selected brightness range 0…100 and its soft edge. */
      min: number;
      max: number;
      feather: number;
    }
  | { kind: 'ai'; target: AiMaskTarget; image: MaskImageRef };

export type MaskKind = MaskShape['kind'];

export interface SelectiveMask {
  id: string;
  name: string;
  visible: boolean;
  /** Selects everything the shape does not. */
  invert: boolean;
  shape: MaskShape;
  /** Brush strokes: the mask itself for `brush`, refinements for the others. */
  strokes: readonly MaskStroke[];
  adjust: MaskAdjust;
}

// ── Object removal ──────────────────────────────────────────────

export type InpaintEngine = 'patchmatch' | 'migan';

/**
 * One 객체 제거: the filled pixels are an RGBA patch (alpha = feathered
 * selection) placed over the source at `rect` (source-normalised), so the
 * source file is never modified and undo just drops the entry.
 */
export interface ObjectRemoval {
  id: string;
  engine: InpaintEngine;
  rect: { x: number; y: number; width: number; height: number };
  patch: { uri: string; width: number; height: number };
  /** The selection the user drew (kept for the record / re-runs). */
  selection: { kind: 'brush'; strokes: readonly MaskStroke[] } | { kind: 'lasso'; points: readonly NormalizedPoint[] } | { kind: 'tap'; image: MaskImageRef };
  createdAt: number;
}

// ── Background (subject segmentation) ───────────────────────────

export type BackgroundMode = 'none' | 'blur' | 'replace';

export interface BackgroundEdit {
  mode: BackgroundMode;
  /** Subject mask (source orientation). Null until segmentation ran. */
  subject: MaskImageRef | null;
  /** Blur: amount 0…100 and size 0…100 (the edge is `edge`). */
  blur: { strength: number; radius: number };
  /** Replacement: the same fills and adjustments as Frame Studio's canvas background. */
  replace: { fill: BackgroundFill; adjust: BackgroundAdjust };
  /** Applied to whatever is behind the subject (original, blurred or replaced), −100…100. */
  brightness: number;
  saturation: number;
  /** Subject edge softness (Edge Feather) for every mode, 0…100. */
  edge: number;
}

// ── Versions ────────────────────────────────────────────────────

/** A named snapshot of the edit (photo original is never copied). */
export interface EditVersion<D = unknown> {
  id: string;
  name: string;
  createdAt: number;
  document: D;
}
