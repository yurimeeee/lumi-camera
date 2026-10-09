import { useMemo } from 'react';

import { DEFAULT_ADJUSTMENTS } from '@/constants/adjustments';
import { completeFilm, DEFAULT_FILM } from '@/constants/film';
import { getFilmCamera } from '@/constants/filmCameras';
import { DEFAULT_CURVES } from '@/services/color/curves';
import { DEFAULT_HSL } from '@/services/color/hsl';
import { filmCameraLook, plainLook, scaleFilm } from '@/services/film/looks';
import { resolveLook, type ResolvedProcessing } from '@/services/imageProcessing';
import { useCameraFilterId, useCameraIntensity, useCameraStore } from '@/stores/cameraStore';
import type { Look } from '@/stores/editorStore';
import { recipeLookId, recipeToLook, scaleLook, useRecipe } from '@/stores/recipeStore';
import { settingsStampStyle, useSettingsStore } from '@/stores/settingsStore';
import type { CameraMode } from '@/types/settings';

export interface CameraLook {
  mode: CameraMode;
  /** Carousel id: filter id, recipe:<id> or (film mode) the film camera id. */
  lookId: string;
  /** Name shown over the preview. */
  name: string | null;
  recipeId: string | null;
  intensity: number;
  /** Everything copied into the capture's edit (colour, film effects, frame, stamp). */
  look: Look;
  /** Shader input for the live preview (includes the skin retouch). */
  processing: ResolvedProcessing;
}

/**
 * The camera's current look. Photo mode: a filter at the camera intensity or
 * a My Recipe scaled by it, plus film effects from a preset. Film mode: the
 * selected film camera (stock colour + its effects + frame + stamp) at the
 * film intensity. The live preview and the captured photo use the same
 * values, including the grain/dust seed.
 */
export function useCameraLook(filterName: (id: string) => string): CameraLook {
  const mode = useCameraStore((s) => s.mode);
  const filterId = useCameraFilterId();
  const recipeId = useCameraStore((s) => s.recipeId);
  const skin = useCameraStore((s) => s.skin);
  const presetFilm = useCameraStore((s) => s.presetFilm);
  const grainOverride = useCameraStore((s) => s.grainOverride);
  const dateOverride = useCameraStore((s) => s.dateStampOverride);
  const seed = useCameraStore((s) => s.filmSeed);
  const filmCameraId = useCameraStore((s) => s.filmCameraId);
  const filmIntensityS = useCameraStore((s) => s.filmIntensity);
  const recipe = useRecipe(recipeId);
  const intensity = useCameraIntensity();
  const settings = useSettingsStore();

  const stamp = useMemo(
    () => settingsStampStyle(settings),
    // Only the stamp fields matter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings.dateFormat, settings.stampPosition, settings.stampColor, settings.stampSize],
  );

  return useMemo(() => {
    if (mode === 'film') {
      const camera = getFilmCamera(filmCameraId ?? settings.defaultFilmCamera);
      const k = filmIntensityS ?? settings.filmIntensity;
      const base = filmCameraLook(camera, {
        intensity: k,
        grainScale: settings.filmGrain,
        frame: settings.defaultFrame,
        dateStamp: dateOverride ?? (camera.dateStamp || settings.dateStamp),
        stamp,
        seed,
      });
      const look: Look = {
        ...base,
        film: presetFilm ? scaleFilm(completeFilm({ ...presetFilm, seed }), k / 100) : base.film,
        adjustments: grainOverride === null ? base.adjustments : { ...base.adjustments, grain: grainOverride },
      };
      return { mode, lookId: camera.id, name: camera.name, recipeId: null, intensity: k, look, processing: resolveLook(look, { skin }) };
    }

    const dateStamp = dateOverride ?? settings.dateStamp;
    let look: Look;
    if (recipe) {
      const r = scaleLook(recipeToLook(recipe), intensity / 100);
      look = { ...r, film: { ...r.film, seed }, dateStamp: dateOverride ?? (r.dateStamp || settings.dateStamp) };
    } else {
      look = plainLook(
        { filterId, intensity, mix: null, adjustments: DEFAULT_ADJUSTMENTS, hsl: DEFAULT_HSL, curves: DEFAULT_CURVES },
        dateStamp,
        stamp,
      );
      look.film = presetFilm ? completeFilm({ ...presetFilm, seed }) : { ...DEFAULT_FILM, seed };
    }
    if (grainOverride !== null) look = { ...look, adjustments: { ...look.adjustments, grain: grainOverride } };
    return {
      mode,
      lookId: recipe ? recipeLookId(recipe.id) : filterId,
      name: recipe ? recipe.name : filterId === 'original' ? null : filterName(filterId),
      recipeId: recipe?.id ?? null,
      intensity,
      look,
      processing: resolveLook(look, { skin }),
    };
  }, [
    mode,
    filmCameraId,
    filmIntensityS,
    settings.defaultFilmCamera,
    settings.filmIntensity,
    settings.filmGrain,
    settings.defaultFrame,
    settings.dateStamp,
    stamp,
    seed,
    presetFilm,
    grainOverride,
    dateOverride,
    recipe,
    filterId,
    intensity,
    skin,
    filterName,
  ]);
}
