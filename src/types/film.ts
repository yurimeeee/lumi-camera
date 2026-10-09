import type { DateFormat } from './settings';

/**
 * Film effects (Phase 3). Pure data stored with each edit, recipe and camera
 * preset; the Lumi shader turns it into pixels (services/film). All amounts
 * are 0…100 (0 = off) unless noted; every stochastic effect is driven by
 * `seed`, so a saved edit always renders the same grain, dust and scratches.
 *
 * Grain *amount*, vignette and fade stay in `Adjustments` (grain, vignette,
 * fade) so filters, the 효과 sliders and earlier edits keep working; the
 * film-only grain controls (size, roughness, colour) live here.
 */

export type LightLeakStyle = 'warm' | 'red' | 'orange' | 'soft' | 'rainbow';
export type FilmBurnStyle = 'soft' | 'edge' | 'warm';

export interface GrainSettings {
  /** Grain size, 0 = finest (≈ 1/1000 of the short side) … 100 = coarse. */
  size: number;
  /** 0 = smooth, round clumps … 100 = sharp, rough grain. */
  roughness: number;
  /** Colour (chroma) noise, like a digital sensor or fast colour film. */
  color: number;
}

export interface BloomSettings {
  intensity: number;
  /** Brightness above which light blooms (0 = everything, 100 = only near-white). */
  threshold: number;
  radius: number;
}

export interface HalationSettings {
  intensity: number;
  radius: number;
  /** 0 = orange … 100 = deep red halo. */
  warmth: number;
}

export interface LightLeakSettings {
  style: LightLeakStyle;
  intensity: number;
  /** Where on the frame's edge the light enters (0…100 around the perimeter, 0 = top-left going clockwise). */
  position: number;
  /** Streak angle relative to pointing at the centre, −90…90°. */
  rotation: number;
  scale: number;
}

export interface FilmBurnSettings {
  style: FilmBurnStyle;
  intensity: number;
  /** How far into the frame the burn reaches. */
  spread: number;
  /** Edge position, as for light leaks. */
  position: number;
}

export interface FilmEffects {
  /** Seed for grain, dust, scratches and burn edges (integer). */
  seed: number;
  grain: GrainSettings;
  bloom: BloomSettings;
  halation: HalationSettings;
  leak: LightLeakSettings;
  burn: FilmBurnSettings;
  dust: number;
  scratch: number;
  /** Lateral chromatic aberration toward the corners. */
  fringing: number;
  /** Highlight-weighted diffusion (a mist filter), not a blur. */
  softFocus: number;
  /** On-camera direct flash: bright, flat subject, falling off toward the edges. */
  flash: number;
  /** Instant-film colour drift: slow, uneven tint across the frame. */
  drift: number;
}

/** 'none' or a frame kit id (assets/frames/manifest.json, e.g. 'classic_polaroid'). */
export type FrameId = string;

/**
 * The editor's frame: a kit frame built around the photo (the photo keeps its
 * size and aspect; the saved image grows by the border). The paper texture
 * itself is the frame's own (registry default); these are its amounts.
 */
export interface FrameSettings {
  id: FrameId;
  /** Paper colour, #RRGGBB (the kit's editable colour by default). */
  color: string;
  /** Border thickness, % of the kit frame's own borders, 0…200. */
  thickness: number;
  /** Photo corner radius, 0…100. */
  cornerRadius: number;
  /** Paper texture strength, 0…100. */
  texture: number;
  /** Yellowing, darker edges, foxing, 0…100. */
  aging: number;
  /** Chipped, whitened outer edges, 0…100. */
  edgeWear: number;
}

export type DateStampPosition = 'bottomRight' | 'bottomLeft' | 'topRight' | 'topLeft';

/** How the date looks — part of recipes and presets. The date itself never is. */
export interface DateStampStyle {
  format: DateFormat;
  position: DateStampPosition;
  /** #RRGGBB, vintage orange by default. */
  color: string;
  /** 50…200 % of the default size. */
  size: number;
}

/** Filter B of a filter mix, applied after filter A (see services/imageProcessing). */
export interface FilterMix {
  filterId: string;
  /** 0…100 */
  intensity: number;
}
