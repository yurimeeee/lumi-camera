import type { DateStampStyle, FilmEffects } from './film';
import type { CameraMode, CaptureRatio, FlashSetting } from './settings';

/**
 * A saved camera setup. Switching presets only changes the look and a few
 * capture options; the camera session keeps running (no restart).
 */
export interface CameraPreset {
  id: string;
  name: string;
  /** Built-in presets can't be renamed or deleted. */
  builtIn?: boolean;
  mode: CameraMode;
  /** Film mode: FILM_CAMERAS id. */
  filmCameraId: string | null;
  /** Photo mode: filter id or recipe:<id>. */
  lookId: string;
  /** Filter / recipe / film camera strength, 0…100. */
  intensity: number;
  /** Photo mode: film effects on top of the filter (null = none). */
  film: FilmEffects | null;
  /** Grain amount 0…100 (null = the filter's / camera's own). */
  grain: number | null;
  dateStamp: boolean;
  stamp: DateStampStyle;
  ratio: CaptureRatio;
  /** Flash to switch to (absent = leave as is). */
  flash?: FlashSetting;
}
