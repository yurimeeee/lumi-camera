import type {
  DateStampPosition,
  DateStampStyle,
  FilmBurnStyle,
  FilmEffects,
  FrameId,
  FrameSettings,
  LightLeakStyle,
} from '@/types/film';

import { colors } from './theme';

export const DEFAULT_FILM_SEED = 1;

export const DEFAULT_FILM: FilmEffects = {
  seed: DEFAULT_FILM_SEED,
  grain: { size: 30, roughness: 40, color: 0 },
  bloom: { intensity: 0, threshold: 70, radius: 50 },
  halation: { intensity: 0, radius: 40, warmth: 40 },
  leak: { style: 'warm', intensity: 0, position: 10, rotation: 0, scale: 50 },
  burn: { style: 'soft', intensity: 0, spread: 40, position: 62 },
  dust: 0,
  scratch: 0,
  fringing: 0,
  softFocus: 0,
  flash: 0,
  drift: 0,
};

/** Effects that draw something (amounts, not shape/style settings). */
export function isNeutralFilm(f: FilmEffects): boolean {
  return (
    f.bloom.intensity === 0 &&
    f.halation.intensity === 0 &&
    f.leak.intensity === 0 &&
    f.burn.intensity === 0 &&
    f.dust === 0 &&
    f.scratch === 0 &&
    f.fringing === 0 &&
    f.softFocus === 0 &&
    f.flash === 0 &&
    f.drift === 0
  );
}

/** Fills fields added later (old edits, recipes, presets) with defaults. */
export function completeFilm(f: Partial<FilmEffects> | null | undefined): FilmEffects {
  if (!f) return DEFAULT_FILM;
  return {
    ...DEFAULT_FILM,
    ...f,
    grain: { ...DEFAULT_FILM.grain, ...f.grain },
    bloom: { ...DEFAULT_FILM.bloom, ...f.bloom },
    halation: { ...DEFAULT_FILM.halation, ...f.halation },
    leak: { ...DEFAULT_FILM.leak, ...f.leak },
    burn: { ...DEFAULT_FILM.burn, ...f.burn },
  };
}

/** A new random seed (stored with the edit, so the pattern stays put). */
export function newFilmSeed(): number {
  return 1 + Math.floor(Math.random() * 9999);
}

export const LEAK_STYLES: readonly { id: LightLeakStyle; label: string; swatch: string }[] = [
  { id: 'warm', label: 'Warm', swatch: '#F7B66A' },
  { id: 'red', label: 'Red', swatch: '#E8504A' },
  { id: 'orange', label: 'Orange', swatch: '#F39233' },
  { id: 'soft', label: 'Soft', swatch: '#F6D6C4' },
  { id: 'rainbow', label: 'Rainbow', swatch: '#B98BE8' },
];

export const BURN_STYLES: readonly { id: FilmBurnStyle; label: string; swatch: string }[] = [
  { id: 'soft', label: 'Soft', swatch: '#F4A35E' },
  { id: 'edge', label: 'Edge', swatch: '#C8452A' },
  { id: 'warm', label: 'Warm', swatch: '#F6C77A' },
];

// ── Frames ──────────────────────────────────────────────────────

export interface FrameStyle {
  id: FrameId;
  label: string;
  /** Defaults applied when the frame is chosen. */
  defaults: Omit<FrameSettings, 'id'>;
}

export const FRAME_STYLES: readonly FrameStyle[] = [
  { id: 'none', label: 'None', defaults: { borderWidth: 0, color: '#FFFFFF', padding: 0, cornerRadius: 0 } },
  { id: 'polaroid', label: 'Polaroid', defaults: { borderWidth: 50, color: '#FBF8F1', padding: 0, cornerRadius: 0 } },
  { id: 'border35', label: '35mm', defaults: { borderWidth: 40, color: '#141210', padding: 0, cornerRadius: 30 } },
  { id: 'filmStrip', label: 'Film Strip', defaults: { borderWidth: 50, color: '#16130F', padding: 0, cornerRadius: 10 } },
  { id: 'white', label: 'White', defaults: { borderWidth: 40, color: '#FFFFFF', padding: 0, cornerRadius: 0 } },
  { id: 'black', label: 'Black', defaults: { borderWidth: 40, color: '#111111', padding: 0, cornerRadius: 0 } },
  { id: 'retroPrint', label: 'Retro Print', defaults: { borderWidth: 45, color: '#F1E7D3', padding: 0, cornerRadius: 20 } },
];

export const NO_FRAME: FrameSettings = { id: 'none', ...FRAME_STYLES[0]!.defaults };

export function frameDefaults(id: FrameId): FrameSettings {
  const style = FRAME_STYLES.find((f) => f.id === id) ?? FRAME_STYLES[0]!;
  return { id: style.id, ...style.defaults };
}

export const FRAME_COLORS: readonly string[] = ['#FFFFFF', '#FBF8F1', '#F1E7D3', '#E9DCCB', '#141210', '#2B2621', '#C9B9A6'];

// ── Date stamp ──────────────────────────────────────────────────

export const DATE_STAMP_COLORS: readonly { color: string; label: string }[] = [
  { color: colors.dateStamp, label: 'Orange' },
  { color: '#F5D547', label: 'Yellow' },
  { color: '#FF5A3C', label: 'Red' },
  { color: '#FFFFFF', label: 'White' },
];

export const DATE_STAMP_POSITIONS: readonly { id: DateStampPosition; label: string }[] = [
  { id: 'bottomRight', label: '오른쪽 아래' },
  { id: 'bottomLeft', label: '왼쪽 아래' },
  { id: 'topRight', label: '오른쪽 위' },
  { id: 'topLeft', label: '왼쪽 위' },
];

export const DEFAULT_STAMP_STYLE: DateStampStyle = {
  format: 'apostrophe',
  position: 'bottomRight',
  color: colors.dateStamp,
  size: 100,
};
