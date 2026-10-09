import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { newFilmSeed } from '@/constants/film';
import type { FilmEffects } from '@/types/film';
import type { LookTab } from '@/types/filters';
import type { CameraPreset } from '@/types/presets';
import type { CameraFacing, CameraMode, CaptureRatio, FlashSetting, TimerSetting } from '@/types/settings';

import { useSettingsStore } from './settingsStore';
import { persistStorage } from './storage';

interface CameraState {
  facing: CameraFacing;
  flash: FlashSetting;
  timer: TimerSetting;
  grid: boolean;
  /** Session value — starts from the "default ratio" setting on launch. */
  ratio: CaptureRatio | null;
  /** Skin retouch strength applied to captured photos, 0…100. */
  skin: number;
  /** Session value — starts from the "default filter" setting on launch. */
  filterId: string | null;
  /** My Recipe used instead of `filterId` when set. */
  recipeId: string | null;
  /** Session filter/recipe strength 0…100 — starts from the "default intensity" setting. */
  intensity: number | null;
  /** Exposure bias in EV (live camera only), reset when the camera restarts. */
  exposureBias: number;
  filterTab: LookTab;
  /** Most recent capture/import, used for the gallery thumbnail and filter previews. */
  lastPhotoUri: string | null;

  // ── Film mode / presets ──
  mode: CameraMode;
  /** Session film camera (null = the default from Settings). */
  filmCameraId: string | null;
  /** Session film camera strength 0…100 (null = Settings' 필름 효과 강도). */
  filmIntensity: number | null;
  /** Film effects from a preset (photo mode extras, or a film camera's replacement). */
  presetFilm: FilmEffects | null;
  /** Grain amount from a preset (null = the filter's / camera's own). */
  grainOverride: number | null;
  /** Session date stamp toggle (null = Settings / the film camera's default). */
  dateStampOverride: boolean | null;
  /** Preset the current setup came from (highlight only). */
  presetId: string | null;
  /**
   * Seed for grain/dust/scratches in the preview and the next capture (so the
   * capture renders what the preview showed); a new one after each shot.
   */
  filmSeed: number;
}

interface CameraActions {
  toggleFacing: () => void;
  setFlash: (v: FlashSetting) => void;
  setTimer: (v: TimerSetting) => void;
  setGrid: (v: boolean) => void;
  setRatio: (v: CaptureRatio) => void;
  setSkin: (v: number) => void;
  setFilter: (id: string) => void;
  setRecipe: (id: string) => void;
  setIntensity: (v: number) => void;
  setExposureBias: (v: number) => void;
  setFilterTab: (tab: LookTab) => void;
  setLastPhoto: (uri: string) => void;
  setMode: (mode: CameraMode) => void;
  setFilmCamera: (id: string) => void;
  setFilmIntensity: (v: number) => void;
  setDateStampOverride: (v: boolean) => void;
  /** Applies a preset in one update (no camera restart: only look/options change). */
  applyPreset: (p: CameraPreset) => void;
  rerollSeed: () => void;
}

export const useCameraStore = create<CameraState & CameraActions>()(
  persist(
    (set) => ({
      facing: 'back',
      flash: 'off',
      timer: 0,
      grid: true,
      ratio: null,
      skin: 20,
      filterId: null,
      recipeId: null,
      intensity: null,
      exposureBias: 0,
      filterTab: 'all',
      lastPhotoUri: null,
      mode: 'photo',
      filmCameraId: null,
      filmIntensity: null,
      presetFilm: null,
      grainOverride: null,
      dateStampOverride: null,
      presetId: null,
      filmSeed: newFilmSeed(),
      toggleFacing: () => set((s) => ({ facing: s.facing === 'back' ? 'front' : 'back' })),
      setFlash: (flash) => set({ flash }),
      setTimer: (timer) => set({ timer }),
      setGrid: (grid) => set({ grid }),
      setRatio: (ratio) => set({ ratio }),
      setSkin: (skin) => set({ skin }),
      setFilter: (filterId) => set({ filterId, recipeId: null, presetId: null }),
      setRecipe: (recipeId) => set({ recipeId, presetId: null }),
      setIntensity: (intensity) => set({ intensity }),
      setExposureBias: (exposureBias) => set({ exposureBias }),
      setFilterTab: (filterTab) => set({ filterTab }),
      setLastPhoto: (lastPhotoUri) => set({ lastPhotoUri }),
      setMode: (mode) => set({ mode }),
      // A different camera brings its own effects: drop preset replacements.
      setFilmCamera: (filmCameraId) => set({ filmCameraId, presetFilm: null, grainOverride: null, presetId: null }),
      setFilmIntensity: (filmIntensity) => set({ filmIntensity }),
      setDateStampOverride: (dateStampOverride) => set({ dateStampOverride }),
      applyPreset: (p) =>
        set((s) => ({
          mode: p.mode,
          ...(p.mode === 'film'
            ? { filmCameraId: p.filmCameraId, filmIntensity: p.intensity }
            : p.lookId.startsWith('recipe:')
              ? { recipeId: p.lookId.slice(7), intensity: p.intensity }
              : { filterId: p.lookId, recipeId: null, intensity: p.intensity }),
          presetFilm: p.film,
          grainOverride: p.grain,
          dateStampOverride: p.dateStamp,
          ratio: p.ratio,
          flash: p.flash ?? s.flash,
          presetId: p.id,
        })),
      rerollSeed: () => set({ filmSeed: newFilmSeed() }),
    }),
    {
      name: 'lumi.camera',
      version: 1,
      storage: persistStorage,
      partialize: ({ facing, flash, timer, grid, skin, mode }) => ({ facing, flash, timer, grid, skin, mode }),
    },
  ),
);

/** Effective ratio: the session choice, falling back to the default from Settings. */
export function useCaptureRatio(): CaptureRatio {
  const ratio = useCameraStore((s) => s.ratio);
  const fallback = useSettingsStore((s) => s.defaultRatio);
  return ratio ?? fallback;
}

/** Effective camera filter: the session choice, falling back to the default from Settings. */
export function useCameraFilterId(): string {
  const id = useCameraStore((s) => s.filterId);
  const fallback = useSettingsStore((s) => s.defaultFilterId);
  return id ?? fallback;
}

/** Effective camera intensity (0…100). */
export function useCameraIntensity(): number {
  const v = useCameraStore((s) => s.intensity);
  const fallback = useSettingsStore((s) => s.defaultIntensity);
  return v ?? fallback;
}
