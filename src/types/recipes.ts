import type { Adjustments, CurveSettings, HslSettings } from './editing';
import type { DateStampStyle, FilmEffects, FilterMix, FrameSettings } from './film';

/**
 * My Recipe: a user-defined look. Never crop, rotation, retouch, touch edits,
 * the capture date or location — those belong to one photo — so a recipe
 * applies to any photo. Applying copies the values into the edit, so renaming
 * or deleting a recipe never changes an existing edit.
 *
 * Stored documents carry `version`; `migrateRecipe` (stores/recipeStore)
 * upgrades older documents, so a format change never loses user recipes.
 */
export const RECIPE_VERSION = 2;

export interface RecipeColor {
  baseFilterId: string;
  /** 0…100 */
  intensity: number;
  mix: FilterMix | null;
  adjustments: Adjustments;
  hsl: HslSettings;
  curves: CurveSettings;
}

export interface RecipeStamp {
  /** Show the date stamp on photos this recipe is applied to. */
  show: boolean;
  style: DateStampStyle;
}

export interface Recipe {
  version: typeof RECIPE_VERSION;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  favorite: boolean;
  /** Small preview of the photo it was made from (file URI, or a data URL on web). */
  thumbnailUri: string | null;
  color: RecipeColor;
  /** Grain size/roughness/colour, bloom, halation, leak, burn, dust, scratch… (grain amount, vignette, fade: color.adjustments). */
  film: FilmEffects;
  frame: FrameSettings;
  stamp: RecipeStamp;
}

/** Phase 1 recipe (no `version`): colour values only. */
export interface RecipeV1 {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  baseFilterId: string;
  intensity: number;
  adjustments: Adjustments;
  hsl: HslSettings;
  curves: CurveSettings;
  favorite: boolean;
  thumbnailUri: string | null;
}
