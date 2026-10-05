import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { DEFAULT_FILTER_INTENSITY, ORIGINAL_FILTER_ID } from '@/constants/filters';
import type { CaptureRatio, DateFormat } from '@/types/settings';

import { persistStorage } from './storage';

export interface SettingsState {
  /** Suppresses Lumi's own feedback sounds. The OS shutter sound is never bypassed. */
  silentMode: boolean;
  mirrorFront: boolean;
  saveLocation: boolean;
  dateStamp: boolean;
  dateFormat: DateFormat;
  saveOriginal: boolean;
  highQuality: boolean;
  defaultFilterId: string;
  defaultIntensity: number;
  defaultRatio: CaptureRatio;
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
  defaultFilterId: ORIGINAL_FILTER_ID,
  defaultIntensity: DEFAULT_FILTER_INTENSITY,
  defaultRatio: '4:3',
};

export const useSettingsStore = create<SettingsState & SettingsActions>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      set: (key, value) => set({ [key]: value } as Pick<SettingsState, typeof key>),
      reset: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: 'lumi.settings',
      version: 1,
      storage: persistStorage,
      partialize: ({ set: _set, reset: _reset, ...state }) => state,
    },
  ),
);
