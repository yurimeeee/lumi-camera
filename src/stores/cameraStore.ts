import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { CameraFacing, CaptureRatio, FlashSetting, TimerSetting } from '@/types/settings';
import type { FilterTab } from '@/types/filters';

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
  filterTab: FilterTab;
  /** Most recent capture/import, used for the gallery thumbnail and filter previews. */
  lastPhotoUri: string | null;
}

interface CameraActions {
  toggleFacing: () => void;
  setFlash: (v: FlashSetting) => void;
  setTimer: (v: TimerSetting) => void;
  setGrid: (v: boolean) => void;
  setRatio: (v: CaptureRatio) => void;
  setSkin: (v: number) => void;
  setFilter: (id: string) => void;
  setFilterTab: (tab: FilterTab) => void;
  setLastPhoto: (uri: string) => void;
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
      filterTab: 'all',
      lastPhotoUri: null,
      toggleFacing: () => set((s) => ({ facing: s.facing === 'back' ? 'front' : 'back' })),
      setFlash: (flash) => set({ flash }),
      setTimer: (timer) => set({ timer }),
      setGrid: (grid) => set({ grid }),
      setRatio: (ratio) => set({ ratio }),
      setSkin: (skin) => set({ skin }),
      setFilter: (filterId) => set({ filterId }),
      setFilterTab: (filterTab) => set({ filterTab }),
      setLastPhoto: (lastPhotoUri) => set({ lastPhotoUri }),
    }),
    {
      name: 'lumi.camera',
      version: 1,
      storage: persistStorage,
      partialize: ({ facing, flash, timer, grid, skin }) => ({ facing, flash, timer, grid, skin }),
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
