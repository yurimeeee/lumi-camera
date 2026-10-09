import { isNeutralFilm } from '@/constants/film';
import type { FilmBurnStyle, FilmEffects, LightLeakStyle } from '@/types/film';

/**
 * Film effects → shader uniforms. Everything spatial is expressed in uPixel
 * units (1/1000 of the render's short side) or as shares of the frame, so the
 * preview and a full-resolution export draw the same effect at their own size.
 *
 * Layout of `uFilm` (float4 × 8, see FILM_SKSL):
 *  [0] grain size (uPixel), roughness, colour, seed
 *  [1] bloom intensity, bloom threshold (luma), bloom radius (uPixel), halation intensity
 *  [2] halation radius (uPixel), halation warmth, soft focus, fringing
 *  [3] leak intensity, leak style, leak position (0…1 around the edge), leak rotation (rad)
 *  [4] leak scale, burn intensity, burn style, burn spread
 *  [5] burn position, dust, scratch, flash
 *  [6] drift, any effect on (0/1), —, —
 *  [7] —
 */

export const FILM_SLOTS = 8;

export type FilmUniforms = { uFilm: number[] };

export const LEAK_STYLE_INDEX: Record<LightLeakStyle, number> = { warm: 0, red: 1, orange: 2, soft: 3, rainbow: 4 };
export const BURN_STYLE_INDEX: Record<FilmBurnStyle, number> = { soft: 0, edge: 1, warm: 2 };

/** Grain cell size in uPixel units for a 0…100 size slider (≈ 0.9…3.5 / 1000 of the short side). */
export const grainCell = (size: number) => 0.9 + (2.6 * Math.min(100, Math.max(0, size))) / 100;

const n = (v: number) => Math.min(1, Math.max(0, v / 100));

export function filmUniforms(f: FilmEffects | null | undefined): FilmUniforms {
  const u = new Array<number>(FILM_SLOTS * 4).fill(0);
  if (!f) {
    u[0] = grainCell(30);
    u[3] = 1;
    return { uFilm: u };
  }
  const on = isNeutralFilm(f) ? 0 : 1;
  u.splice(0, 4, grainCell(f.grain.size), n(f.grain.roughness), n(f.grain.color), f.seed);
  u.splice(4, 4, n(f.bloom.intensity), 0.35 + 0.6 * n(f.bloom.threshold), 8 + 72 * n(f.bloom.radius), n(f.halation.intensity));
  u.splice(8, 4, 3 + 27 * n(f.halation.radius), n(f.halation.warmth), n(f.softFocus), n(f.fringing));
  u.splice(12, 4, n(f.leak.intensity), LEAK_STYLE_INDEX[f.leak.style], n(f.leak.position), (Math.max(-90, Math.min(90, f.leak.rotation)) * Math.PI) / 180);
  u.splice(16, 4, n(f.leak.scale), n(f.burn.intensity), BURN_STYLE_INDEX[f.burn.style], n(f.burn.spread));
  u.splice(20, 4, n(f.burn.position), n(f.dust), n(f.scratch), n(f.flash));
  u.splice(24, 4, n(f.drift), on, 0, 0);
  return { uFilm: u };
}
