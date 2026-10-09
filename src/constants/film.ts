import type {
  DateStampPosition,
  DateStampStyle,
  FilmBurnStyle,
  FilmEffects,
  FrameId,
  FrameSettings,
  LightLeakStyle,
} from '@/types/film';

import { defaultCornerRadius } from '@/image-engine/frame/frameGeometry';
import { getFramePreset } from '@/image-engine/frame/registry';

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

export const NO_FRAME: FrameSettings = { id: 'none', color: '#FFFFFF', thickness: 100, cornerRadius: 0, texture: 0, aging: 0, edgeWear: 0 };

/** Paper texture a frame uses for its 질감 slider (its own, or warm paper for clean ones). */
export function frameTextureId(id: FrameId): string {
  return getFramePreset(id)?.paper.texture ?? 'warm_paper';
}

/** A kit frame with its vintage defaults (colour, corners, paper). Unknown ids → no frame. */
export function frameDefaults(id: FrameId): FrameSettings {
  const preset = id === 'none' ? null : getFramePreset(id);
  if (!preset) return NO_FRAME;
  return {
    id,
    color: preset.defaultColor,
    thickness: 100,
    cornerRadius: defaultCornerRadius(preset.spec),
    texture: preset.paper.texture ? preset.paper.textureIntensity : 0,
    aging: preset.paper.aging,
    edgeWear: preset.paper.edgeWear,
  };
}

export function frameLabel(id: FrameId): string {
  return id === 'none' ? 'None' : (getFramePreset(id)?.name ?? '프레임');
}

/** Frames before the kit (v1 edits, recipes, settings) → the kit frame that replaced them. */
const LEGACY_FRAMES: Record<string, { id: string; color?: string }> = {
  polaroid: { id: 'classic_polaroid' },
  border35: { id: 'negative_35mm' },
  filmStrip: { id: 'film_strip' },
  white: { id: 'thin_border', color: '#FFFFFF' },
  black: { id: 'thin_border', color: '#111111' },
  retroPrint: { id: 'rounded_print' },
};

/** Legacy or kit frame id → a kit id ('none' when unknown). */
export function migrateFrameId(id: unknown): FrameId {
  if (typeof id !== 'string' || id === 'none') return 'none';
  if (LEGACY_FRAMES[id]) return LEGACY_FRAMES[id].id;
  return getFramePreset(id) ? id : 'none';
}

/** Any stored frame (older formats, partial documents) → current settings. */
export function completeFrame(raw: unknown): FrameSettings {
  if (typeof raw !== 'object' || raw === null) return NO_FRAME;
  const r = raw as Partial<FrameSettings> & { id?: unknown };
  const legacy = typeof r.id === 'string' ? LEGACY_FRAMES[r.id] : undefined;
  const id = migrateFrameId(r.id);
  const base = frameDefaults(id);
  if (id === 'none') return base;
  // A legacy frame starts from the kit frame's defaults; only its colour choice carries over.
  if (legacy) return { ...base, color: legacy.color ?? base.color };
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  return {
    id,
    color: typeof r.color === 'string' ? r.color : base.color,
    thickness: num(r.thickness, base.thickness),
    cornerRadius: num(r.cornerRadius, base.cornerRadius),
    texture: num(r.texture, base.texture),
    aging: num(r.aging, base.aging),
    edgeWear: num(r.edgeWear, base.edgeWear),
  };
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
