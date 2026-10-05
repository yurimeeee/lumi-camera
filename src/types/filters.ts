import type { SplitTone, ToneParams } from './editing';

export type FilterCategory = 'original' | 'warm' | 'cool' | 'film' | 'soft' | 'bw';

export type FilterTab = 'all' | 'favorites' | Exclude<FilterCategory, 'original'>;

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
  preview: LivePreviewLayer[];
}
