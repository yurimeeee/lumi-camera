import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { DEFAULT_STAMP_STYLE, migrateFrameId } from '@/constants/film';
import { DEFAULT_FILM_CAMERA_ID } from '@/constants/filmCameras';
import { DEFAULT_FILTER_INTENSITY, ORIGINAL_FILTER_ID } from '@/constants/filters';
import type { DateStampPosition, FrameId } from '@/types/film';
import type { CaptureRatio, DateFormat, ExportFormat, JpegQuality } from '@/types/settings';

import { persistStorage } from './storage';

export interface SettingsState {
  /** Suppresses Lumi's own feedback sounds. The OS shutter sound is never bypassed. */
  silentMode: boolean;
  mirrorFront: boolean;
  saveLocation: boolean;
  dateStamp: boolean;
  dateFormat: DateFormat;
  saveOriginal: boolean;
  /** Export resolution: up to 4096 px (on) or 2048 px (off) on the long side. */
  highQuality: boolean;
  exportFormat: ExportFormat;
  jpegQuality: JpegQuality;
  defaultFilterId: string;
  defaultIntensity: number;
  defaultRatio: CaptureRatio;
  // ── Film ──
  /** Film camera selected when Film mode opens. */
  defaultFilmCamera: string;
  /** Grain relative to each film camera's own, 0…200 %. */
  filmGrain: number;
  /** Frame for film captures ('camera' = the camera's own, e.g. Polaroid). */
  defaultFrame: FrameId | 'camera';
  /** Overall film effect strength, 0…100. */
  filmIntensity: number;
  /** Date stamp style (format is `dateFormat`). */
  stampPosition: DateStampPosition;
  stampColor: string;
  /** 50…200 % */
  stampSize: number;
}

interface SettingsActions {
  set: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
  reset: () => void;
}

export const DEFAULT_SETTINGS: SettingsState = {
  silentMode: false,
  mirrorFront: true,
  saveLocation: false,
  dateStamp: false,
  dateFormat: 'apostrophe',
  saveOriginal: false,
  highQuality: true,
  exportFormat: 'jpeg',
  jpegQuality: 90,
  defaultFilterId: ORIGINAL_FILTER_ID,
  defaultIntensity: DEFAULT_FILTER_INTENSITY,
  defaultRatio: '4:3',
  defaultFilmCamera: DEFAULT_FILM_CAMERA_ID,
  filmGrain: 100,
  defaultFrame: 'camera',
  filmIntensity: 100,
  stampPosition: DEFAULT_STAMP_STYLE.position,
  stampColor: DEFAULT_STAMP_STYLE.color,
  stampSize: DEFAULT_STAMP_STYLE.size,
};

/** The date stamp style from Settings (format + position + colour + size). */
export function settingsStampStyle(s: SettingsState) {
  return { format: s.dateFormat, position: s.stampPosition, color: s.stampColor, size: s.stampSize };
}

export const useSettingsStore = create<SettingsState & SettingsActions>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      set: (key, value) => set({ [key]: value } as Pick<SettingsState, typeof key>),
      reset: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: 'lumi.settings',
      version: 3,
      storage: persistStorage,
      partialize: ({ set: _set, reset: _reset, ...state }) => state,
      // v1 → v2: film settings added (missing keys take their defaults).
      // v2 → v3: frames are the kit's (old frame ids map to their replacements).
      migrate: (state) => {
        const s = { ...DEFAULT_SETTINGS, ...(state as Partial<SettingsState>) };
        if (s.defaultFrame !== 'camera') s.defaultFrame = migrateFrameId(s.defaultFrame);
        return s as SettingsState & SettingsActions;
      },
    },
  ),
);
