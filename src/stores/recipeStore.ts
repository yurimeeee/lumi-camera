import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { DEFAULT_ADJUSTMENTS } from '@/constants/adjustments';
import { DEFAULT_CURVES, sanitizeCurve, scaleCurve } from '@/services/color/curves';
import { DEFAULT_HSL, HSL_COLORS } from '@/services/color/hsl';
import type { Adjustments, CurveSettings, HslSettings } from '@/types/editing';
import type { Recipe } from '@/types/recipes';

import type { ColorLook } from './editorStore';
import { persistStorage } from './storage';

export const RECIPE_NAME_MAX = 24;
export const RECIPE_LIMIT = 60;

/** Carousel id of a recipe (filters use their own id). */
export const recipeLookId = (id: string) => `recipe:${id}`;
export const parseRecipeLookId = (lookId: string): string | null => (lookId.startsWith('recipe:') ? lookId.slice(7) : null);

export function normalizeRecipeName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, RECIPE_NAME_MAX);
}

/** Copies, so later edits to the source can't reach the recipe (and vice versa). */
function snapshot(look: ColorLook): Pick<Recipe, 'baseFilterId' | 'intensity' | 'adjustments' | 'hsl' | 'curves'> {
  return {
    baseFilterId: look.filterId,
    intensity: look.intensity,
    adjustments: { ...DEFAULT_ADJUSTMENTS, ...look.adjustments },
    hsl: { ...DEFAULT_HSL, ...look.hsl },
    curves: { ...DEFAULT_CURVES, ...look.curves },
  };
}

export function recipeToColorLook(r: Recipe): ColorLook {
  return { filterId: r.baseFilterId, intensity: r.intensity, adjustments: r.adjustments, hsl: r.hsl, curves: r.curves };
}

/**
 * A recipe at `amount` (0…1): every value is blended toward neutral, so 0 is
 * the original photo and 1 is the recipe exactly. Used for the camera's
 * intensity slider; the same scaled look is applied to the capture.
 */
export function scaleColorLook(look: ColorLook, amount: number): ColorLook {
  const a = Math.min(1, Math.max(0, amount));
  if (a === 1) return look;
  const adjustments = {} as Adjustments;
  for (const k of Object.keys(DEFAULT_ADJUSTMENTS) as (keyof Adjustments)[]) {
    adjustments[k] = Math.round((look.adjustments[k] ?? 0) * a);
  }
  const hsl = {} as HslSettings;
  for (const c of HSL_COLORS) {
    const v = look.hsl[c] ?? DEFAULT_HSL[c];
    hsl[c] = { hue: Math.round(v.hue * a), saturation: Math.round(v.saturation * a), luminance: Math.round(v.luminance * a) };
  }
  const curves = {} as CurveSettings;
  for (const ch of Object.keys(DEFAULT_CURVES) as (keyof CurveSettings)[]) {
    curves[ch] = scaleCurve(sanitizeCurve(look.curves[ch]), a);
  }
  return { filterId: look.filterId, intensity: Math.round(look.intensity * a), adjustments, hsl, curves };
}


let seq = 0;
const newId = () => `${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

interface RecipeState {
  recipes: Recipe[];
  /** Adds a recipe from the current colour look; returns its id. */
  add: (name: string, look: ColorLook, thumbnailUri?: string | null) => string;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  toggleFavorite: (id: string) => void;
  setThumbnail: (id: string, uri: string | null) => void;
}

export const useRecipeStore = create<RecipeState>()(
  persist(
    (set) => ({
      recipes: [],
      add: (name, look, thumbnailUri = null) => {
        const id = newId();
        const now = Date.now();
        const recipe: Recipe = {
          id,
          name: normalizeRecipeName(name) || 'My Recipe',
          createdAt: now,
          updatedAt: now,
          favorite: false,
          thumbnailUri,
          ...snapshot(look),
        };
        set((s) => ({ recipes: [recipe, ...s.recipes].slice(0, RECIPE_LIMIT) }));
        return id;
      },
      rename: (id, name) => {
        const clean = normalizeRecipeName(name);
        if (!clean) return;
        set((s) => ({ recipes: s.recipes.map((r) => (r.id === id ? { ...r, name: clean, updatedAt: Date.now() } : r)) }));
      },
      remove: (id) => set((s) => ({ recipes: s.recipes.filter((r) => r.id !== id) })),
      toggleFavorite: (id) =>
        set((s) => ({ recipes: s.recipes.map((r) => (r.id === id ? { ...r, favorite: !r.favorite } : r)) })),
      setThumbnail: (id, uri) =>
        set((s) => ({ recipes: s.recipes.map((r) => (r.id === id ? { ...r, thumbnailUri: uri } : r)) })),
    }),
    {
      name: 'lumi.recipes',
      version: 1,
      storage: persistStorage,
      partialize: ({ recipes }) => ({ recipes }),
    },
  ),
);

export function getRecipe(id: string | null | undefined): Recipe | null {
  if (!id) return null;
  return useRecipeStore.getState().recipes.find((r) => r.id === id) ?? null;
}

export const useRecipe = (id: string | null | undefined) =>
  useRecipeStore((s) => (id ? (s.recipes.find((r) => r.id === id) ?? null) : null));
