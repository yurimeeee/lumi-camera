import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { BUILTIN_PRESETS } from '@/constants/cameraPresets';
import type { CameraPreset } from '@/types/presets';

import { persistStorage } from './storage';

export const PRESET_LIMIT = 30;

let seq = 0;
const newId = () => `p${Date.now().toString(36)}${(seq++).toString(36)}`;

interface PresetState {
  /** User presets (built-ins live in constants/cameraPresets). */
  presets: CameraPreset[];
  add: (preset: Omit<CameraPreset, 'id' | 'builtIn'>) => string;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
}

export const usePresetStore = create<PresetState>()(
  persist(
    (set) => ({
      presets: [],
      add: (preset) => {
        const id = newId();
        set((s) => ({ presets: [{ ...preset, id }, ...s.presets].slice(0, PRESET_LIMIT) }));
        return id;
      },
      rename: (id, name) => set((s) => ({ presets: s.presets.map((p) => (p.id === id ? { ...p, name } : p)) })),
      remove: (id) => set((s) => ({ presets: s.presets.filter((p) => p.id !== id) })),
    }),
    { name: 'lumi.presets', version: 1, storage: persistStorage, partialize: ({ presets }) => ({ presets }) },
  ),
);

/** Built-in presets first, then the user's. */
export function allPresets(user: readonly CameraPreset[]): CameraPreset[] {
  return [...BUILTIN_PRESETS, ...user];
}
