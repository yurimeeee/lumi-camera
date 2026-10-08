import type { CurveChannel, CurvePoint, HslAdjust, HslColor, SplitTone, ToneParams } from './editing';

export type FilterCategory = 'original' | 'warm' | 'cool' | 'film' | 'soft' | 'bw';

export type FilterTab = 'all' | 'favorites' | Exclude<FilterCategory, 'original'>;

/** Carousel tabs: filter tabs plus My Recipes. */
export type LookTab = FilterTab | 'my';

/** React Native `mixBlendMode` values used for the live camera approximation. */
export type PreviewBlend =
  | 'soft-light'
  | 'overlay'
  | 'multiply'
  | 'screen'
  | 'color'
  | 'saturation'
  | 'luminosity';

/**
 * Lightweight approximation drawn on top of the native camera preview.
 * The captured photo itself always goes through the full Skia pipeline.
 */
export interface LivePreviewLayer {
  color: string;
  blend: PreviewBlend;
  opacity: number;
}

export interface FilterDefinition {
  id: string;
  name: string;
  category: FilterCategory;
  /** One-line Korean mood description. */
  description: string;
  params: ToneParams;
  splitTone?: SplitTone;
  /** Per-colour HSL shifts at intensity 100. */
  hsl?: Partial<Record<HslColor, Partial<HslAdjust>>>;
  /** Tone curves at intensity 100 (channels left out stay linear). */
  curves?: Partial<Record<CurveChannel, readonly CurvePoint[]>>;
  /**
   * Blend-mode approximation drawn over the native preview, used only where
   * frames can't be processed (Expo Go, web). See components/camera/LiveCamera.
   */
  preview: LivePreviewLayer[];
}
