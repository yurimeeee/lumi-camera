import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { DEFAULT_ADJUSTMENTS } from '@/constants/adjustments';
import { completeFilm, DEFAULT_FILM, DEFAULT_STAMP_STYLE, NO_FRAME } from '@/constants/film';
import { DEFAULT_CURVES, sanitizeCurve, scaleCurve } from '@/services/color/curves';
import { DEFAULT_HSL, HSL_COLORS } from '@/services/color/hsl';
import { scaleFilm } from '@/services/film/looks';
import type { Adjustments, CurveSettings, HslSettings } from '@/types/editing';
import { RECIPE_VERSION, type Recipe, type RecipeV1 } from '@/types/recipes';

import type { ColorLook, Look } from './editorStore';
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
function snapshot(look: Look): Pick<Recipe, 'color' | 'film' | 'frame' | 'stamp'> {
  return {
    color: {
      baseFilterId: look.filterId,
      intensity: look.intensity,
      mix: look.mix ? { ...look.mix } : null,
      adjustments: { ...DEFAULT_ADJUSTMENTS, ...look.adjustments },
      hsl: { ...DEFAULT_HSL, ...look.hsl },
      curves: { ...DEFAULT_CURVES, ...look.curves },
    },
    film: completeFilm(look.film),
    frame: { ...NO_FRAME, ...look.frame },
    stamp: { show: look.dateStamp, style: { ...DEFAULT_STAMP_STYLE, ...look.stamp } },
  };
}

export function recipeToColorLook(r: Recipe): ColorLook {
  const c = r.color;
  return { filterId: c.baseFilterId, intensity: c.intensity, mix: c.mix, adjustments: c.adjustments, hsl: c.hsl, curves: c.curves };
}

export function recipeToLook(r: Recipe): Look {
  return { ...recipeToColorLook(r), film: r.film, frame: r.frame, dateStamp: r.stamp.show, stamp: r.stamp.style };
}

// ── Versioning ──────────────────────────────────────────────────

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/**
 * Any stored recipe document → the current format (null when unreadable).
 * v1 (Phase 1, no `version`): colour values at the top level → `color`, no
 * film effects, no frame, no stamp. v2: fields added later get defaults.
 */
export function migrateRecipe(raw: unknown): Recipe | null {
  if (!isObject(raw) || typeof raw.id !== 'string') return null;
  const base = {
    id: raw.id,
    name: typeof raw.name === 'string' && raw.name ? raw.name : 'My Recipe',
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
    favorite: raw.favorite === true,
    thumbnailUri: typeof raw.thumbnailUri === 'string' ? raw.thumbnailUri : null,
  };
  if (raw.version === undefined || raw.version === 1) {
    const v1 = raw as unknown as Partial<RecipeV1>;
    return {
      version: RECIPE_VERSION,
      ...base,
      color: {
        baseFilterId: v1.baseFilterId ?? 'original',
        intensity: v1.intensity ?? 100,
        mix: null,
        adjustments: { ...DEFAULT_ADJUSTMENTS, ...v1.adjustments },
        hsl: { ...DEFAULT_HSL, ...v1.hsl },
        curves: { ...DEFAULT_CURVES, ...v1.curves },
      },
      film: DEFAULT_FILM,
      frame: NO_FRAME,
      stamp: { show: false, style: DEFAULT_STAMP_STYLE },
    };
  }
  if (raw.version === 2) {
    const r = raw as unknown as Partial<Recipe>;
    const c: Partial<Recipe['color']> = r.color ?? {};
    return {
      version: RECIPE_VERSION,
      ...base,
      color: {
        baseFilterId: c.baseFilterId ?? 'original',
        intensity: c.intensity ?? 100,
        mix: c.mix ?? null,
        adjustments: { ...DEFAULT_ADJUSTMENTS, ...c.adjustments },
        hsl: { ...DEFAULT_HSL, ...c.hsl },
        curves: { ...DEFAULT_CURVES, ...c.curves },
      },
      film: completeFilm(r.film),
      frame: { ...NO_FRAME, ...r.frame },
      stamp: { show: r.stamp?.show ?? false, style: { ...DEFAULT_STAMP_STYLE, ...r.stamp?.style } },
    };
  }
  // A newer app wrote it; don't guess.
  return null;
}

export function serializeRecipe(r: Recipe): string {
  return JSON.stringify(r);
}

export function parseRecipe(json: string): Recipe | null {
  try {
    return migrateRecipe(JSON.parse(json));
  } catch {
    return null;
  }
}

// ── Scaling (camera intensity) ──────────────────────────────────

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
  return {
    filterId: look.filterId,
    intensity: Math.round(look.intensity * a),
    mix: look.mix ? { ...look.mix, intensity: Math.round(look.mix.intensity * a) } : null,
    adjustments,
    hsl,
    curves,
  };
}

/** Full look at `amount`: colour as scaleColorLook, film effect amounts scaled too. */
export function scaleLook(look: Look, amount: number): Look {
  return { ...look, ...scaleColorLook(look, amount), film: scaleFilm(look.film, amount) };
}

// ── Store ───────────────────────────────────────────────────────

let seq = 0;
const newId = () => `${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

interface RecipeState {
  recipes: Recipe[];
  /** Adds a recipe from a look; returns its id. */
  add: (name: string, look: Look, thumbnailUri?: string | null) => string;
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
          version: RECIPE_VERSION,
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
      // Store version 2: recipes are RecipeDocument v2 (see migrateRecipe).
      version: 2,
      storage: persistStorage,
      partialize: ({ recipes }) => ({ recipes }),
      migrate: (state) => {
        const raw = isObject(state) && Array.isArray(state.recipes) ? state.recipes : [];
        return { recipes: raw.map(migrateRecipe).filter((r): r is Recipe => r !== null) } as unknown as RecipeState;
      },
    },
  ),
);

export function getRecipe(id: string | null | undefined): Recipe | null {
  if (!id) return null;
  return useRecipeStore.getState().recipes.find((r) => r.id === id) ?? null;
}

export const useRecipe = (id: string | null | undefined) =>
  useRecipeStore((s) => (id ? (s.recipes.find((r) => r.id === id) ?? null) : null));
