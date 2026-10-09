import { DEFAULT_ADJUSTMENTS } from '@/constants/adjustments';
import { completeFilm, DEFAULT_FILM, DEFAULT_STAMP_STYLE, frameDefaults, NO_FRAME } from '@/constants/film';
import type { FilmCamera } from '@/constants/filmCameras';
import { DEFAULT_CURVES } from '@/services/color/curves';
import { DEFAULT_HSL } from '@/services/color/hsl';
import type { ColorLook, Look } from '@/stores/editorStore';
import type { DateStampStyle, FilmEffects, FrameId } from '@/types/film';

/**
 * Looks with film effects: film cameras → Look, and scaling a look by a
 * strength (camera intensity / "film effect intensity" settings).
 */

/** Effect amounts × a (0…1). Shapes (size, radius, position, style, seed) stay. */
export function scaleFilm(f: FilmEffects, a: number): FilmEffects {
  const k = Math.min(1, Math.max(0, a));
  if (k === 1) return f;
  const s = (v: number) => Math.round(v * k);
  return {
    ...f,
    grain: { ...f.grain, color: s(f.grain.color) },
    bloom: { ...f.bloom, intensity: s(f.bloom.intensity) },
    halation: { ...f.halation, intensity: s(f.halation.intensity) },
    leak: { ...f.leak, intensity: s(f.leak.intensity) },
    burn: { ...f.burn, intensity: s(f.burn.intensity) },
    dust: s(f.dust),
    scratch: s(f.scratch),
    fringing: s(f.fringing),
    softFocus: s(f.softFocus),
    flash: s(f.flash),
    drift: s(f.drift),
  };
}

export interface FilmCameraOptions {
  /** Overall strength of the camera's look, 0…100 (settings: 필름 효과 강도). */
  intensity: number;
  /** Grain relative to the camera's own, 0…200 % (settings: 기본 그레인). */
  grainScale: number;
  /** Frame override ('camera' = the camera's own frame). */
  frame: FrameId | 'camera';
  dateStamp: boolean;
  stamp: DateStampStyle;
  seed: number;
}

/** A film camera as a complete look: stock colour + camera effects + frame + stamp. */
export function filmCameraLook(camera: FilmCamera, o: FilmCameraOptions): Look {
  const k = Math.min(1, Math.max(0, o.intensity / 100));
  const film = completeFilm({
    ...DEFAULT_FILM,
    ...camera.film,
    seed: o.seed,
    grain: { ...DEFAULT_FILM.grain, ...camera.film.grain },
    bloom: { ...DEFAULT_FILM.bloom, ...camera.film.bloom },
    halation: { ...DEFAULT_FILM.halation, ...camera.film.halation },
  });
  const adj = camera.adjustments;
  return {
    filterId: camera.colorPresetId,
    intensity: Math.round(100 * k),
    mix: null,
    adjustments: {
      ...DEFAULT_ADJUSTMENTS,
      grain: Math.round((adj.grain ?? 0) * k * (o.grainScale / 100)),
      vignette: Math.round((adj.vignette ?? 0) * k),
      fade: Math.round((adj.fade ?? 0) * k),
      sharpness: Math.round((adj.sharpness ?? 0) * k),
    },
    hsl: DEFAULT_HSL,
    curves: DEFAULT_CURVES,
    film: scaleFilm(film, k),
    frame: o.frame === 'camera' ? frameDefaults(camera.frameId) : frameDefaults(o.frame),
    dateStamp: o.dateStamp,
    stamp: o.stamp,
  };
}

/** Colour-only look → full look with no film effects, frame or stamp. */
export function plainLook(color: ColorLook, dateStamp = false, stamp: DateStampStyle = DEFAULT_STAMP_STYLE): Look {
  return { ...color, film: DEFAULT_FILM, frame: NO_FRAME, dateStamp, stamp };
}
