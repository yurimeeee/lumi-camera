import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistStorage } from './storage';

interface FilterState {
  favorites: string[];
  toggleFavorite: (id: string) => void;
}

export const useFilterStore = create<FilterState>()(
  persist(
    (set) => ({
      favorites: ['mellow', 'linen', 'peachy', 'film-35'],
      toggleFavorite: (id) =>
        set((s) => ({
          favorites: s.favorites.includes(id) ? s.favorites.filter((f) => f !== id) : [...s.favorites, id],
        })),
    }),
    {
      name: 'lumi.filters',
      version: 1,
      storage: persistStorage,
      partialize: ({ favorites }) => ({ favorites }),
    },
  ),
);

/** Subscribes to a single filter's favourite flag only. */
export const useIsFavorite = (id: string) => useFilterStore((s) => s.favorites.includes(id));
