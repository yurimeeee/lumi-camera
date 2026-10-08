import type { Adjustments, CurveSettings, HslSettings } from './editing';

/**
 * My Recipe: a user-defined filter. Colour values only — never crop,
 * rotation, retouch or touch edits, which belong to a specific photo — so a
 * recipe applies to any photo. Applying copies the values into the edit, so
 * renaming or deleting a recipe never changes an existing edit.
 */
export interface Recipe {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  baseFilterId: string;
  /** 0…100 */
  intensity: number;
  adjustments: Adjustments;
  hsl: HslSettings;
  curves: CurveSettings;
  favorite: boolean;
  /** Small preview of the photo it was made from (file URI, or a data URL on web). */
  thumbnailUri: string | null;
}
