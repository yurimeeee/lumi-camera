import { useMemo } from 'react';

import { DEFAULT_ADJUSTMENTS } from '@/constants/adjustments';
import { DEFAULT_CURVES } from '@/services/color/curves';
import { DEFAULT_HSL } from '@/services/color/hsl';
import { resolveLook, type ResolvedProcessing } from '@/services/imageProcessing';
import { useCameraFilterId, useCameraIntensity, useCameraStore } from '@/stores/cameraStore';
import type { ColorLook } from '@/stores/editorStore';
import { recipeLookId, recipeToColorLook, scaleColorLook, useRecipe } from '@/stores/recipeStore';

export interface CameraLook {
  /** Carousel id: filter id or recipe:<id>. */
  lookId: string;
  /** Name shown over the preview. */
  name: string | null;
  recipeId: string | null;
  intensity: number;
  /** Colour values applied to the live preview and copied into the capture's edit. */
  color: ColorLook;
  /** Shader input for the live preview (includes the skin retouch). */
  processing: ResolvedProcessing;
}

/**
 * The camera's current look: a filter at the camera intensity, or a My Recipe
 * scaled by it. The live preview and the captured photo use the same values.
 */
export function useCameraLook(filterName: (id: string) => string): CameraLook {
  const filterId = useCameraFilterId();
  const recipeId = useCameraStore((s) => s.recipeId);
  const skin = useCameraStore((s) => s.skin);
  const recipe = useRecipe(recipeId);
  const intensity = useCameraIntensity();

  return useMemo(() => {
    const color: ColorLook = recipe
      ? scaleColorLook(recipeToColorLook(recipe), intensity / 100)
      : { filterId, intensity, adjustments: DEFAULT_ADJUSTMENTS, hsl: DEFAULT_HSL, curves: DEFAULT_CURVES };
    return {
      lookId: recipe ? recipeLookId(recipe.id) : filterId,
      name: recipe ? recipe.name : filterId === 'original' ? null : filterName(filterId),
      recipeId: recipe?.id ?? null,
      intensity,
      color,
      processing: resolveLook(color, { skin }),
    };
  }, [recipe, filterId, intensity, skin, filterName]);
}
