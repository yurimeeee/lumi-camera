import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Look } from './editorStore';
import { persistStorage } from './storage';

/** The look of the most recent edit — offered as "현재 보정 설정" for batch edits. */
interface LastLookState {
  look: Look | null;
  at: number;
  set: (look: Look) => void;
}

export const useLastLookStore = create<LastLookState>()(
  persist(
    (set) => ({
      look: null,
      at: 0,
      set: (look) => set({ look, at: Date.now() }),
    }),
    { name: 'lumi.lastLook', version: 1, storage: persistStorage, partialize: ({ look, at }) => ({ look, at }) },
  ),
);
