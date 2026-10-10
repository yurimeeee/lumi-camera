import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { parseCopied, type CopiedEdits, type PasteCategory } from '@/services/editClipboard';

import { persistStorage } from './storage';

interface ClipboardState {
  copied: CopiedEdits | null;
  /** Categories ticked last time (kept as the default). */
  categories: PasteCategory[];
  copy: (c: CopiedEdits) => void;
  setCategories: (c: PasteCategory[]) => void;
}

/** 편집 복사: kept across photos and app restarts. */
export const useClipboardStore = create<ClipboardState>()(
  persist(
    (set) => ({
      copied: null,
      categories: ['filter', 'adjust', 'hsl', 'curves', 'film'],
      copy: (copied) => set({ copied }),
      setCategories: (categories) => set({ categories }),
    }),
    {
      name: 'lumi.clipboard',
      version: 1,
      storage: persistStorage,
      partialize: ({ copied, categories }) => ({ copied, categories }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ClipboardState>;
        return { ...current, copied: parseCopied(p.copied), categories: Array.isArray(p.categories) ? p.categories : current.categories };
      },
    },
  ),
);
