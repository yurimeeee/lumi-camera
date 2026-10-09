import manifestJson from '../../../assets/frames/manifest.json';

import { DECORATION_PNG_SOURCES, DECORATION_SVG, FRAME_SVG, LAYOUT_JSON, TEXTURE_SOURCES } from './assets.generated';
import type { FrameManifest, LayoutJson, ManifestFrame, NormalizedBox } from './registryTypes';
import { parseDecorationSvg, parseFrameSvg, type DecorationSpec, type FrameSpec } from './svgFrame';

/**
 * Frame Asset Registry: assets/frames/manifest.json + the generated static
 * asset map, adapted into the presets the studio shows. Names, categories and
 * vintage defaults are Lumi's; geometry (canvas, photo slot, paper colour,
 * layer order) always comes from the kit.
 */

export const MANIFEST = manifestJson as FrameManifest;

export type FrameCategory = 'instant' | 'film' | 'paper' | 'scrapbook' | 'minimal' | 'custom';

export const FRAME_CATEGORIES: readonly { id: FrameCategory; label: string }[] = [
  { id: 'instant', label: 'Instant Film' },
  { id: 'film', label: 'Film' },
  { id: 'paper', label: 'Paper' },
  { id: 'scrapbook', label: 'Scrapbook' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'custom', label: 'Custom' },
];

/** Paper defaults a preset starts with (all 0 = the clean SVG). */
export interface PaperDefaults {
  texture: string | null;
  textureIntensity: number;
  aging: number;
  edgeWear: number;
  photoFade: number;
  shadow: number;
}

export interface PhotoSlot extends NormalizedBox {
  /** Corner radius in frame pixels (from the SVG hole). */
  rx: number;
}

export interface FramePreset {
  id: string;
  name: string;
  category: FrameCategory;
  /** Manifest asset path (frames/<id>.svg in the kit). */
  assetId: string;
  /** Frame pixel size from the manifest. */
  canvas: { width: number; height: number };
  /** width / height */
  canvasRatio: number;
  photoSlots: PhotoSlot[];
  /** Draw order of the photo and the frame (manifest `layerOrder`). */
  layerOrder: ('photo' | 'frame')[];
  /** The frame's editable colour (manifest `editableColor`, = the SVG paper fill). */
  defaultColor: string;
  paper: PaperDefaults;
  customizable: { color: boolean; texture: boolean; thickness: boolean; shadow: boolean };
  /** Parsed SVG. */
  spec: FrameSpec;
}

interface PresetMeta {
  name: string;
  category: Exclude<FrameCategory, 'custom'>;
  paper?: Partial<PaperDefaults>;
}

const CLEAN: PaperDefaults = { texture: null, textureIntensity: 0, aging: 0, edgeWear: 0, photoFade: 0, shadow: 0 };

/** Lumi's names / categories for the kit's frames. Every manifest frame must be listed (registry test). */
const META: Record<string, PresetMeta> = {
  classic_polaroid: { name: 'Classic Polaroid', category: 'instant', paper: { texture: 'warm_paper', textureIntensity: 20, shadow: 30 } },
  vintage_polaroid: {
    name: 'Vintage Polaroid',
    category: 'instant',
    paper: { texture: 'aged_paper', textureIntensity: 40, aging: 30, edgeWear: 15, photoFade: 25, shadow: 35 },
  },
  faded_instant: { name: 'Faded Instant', category: 'instant', paper: { texture: 'warm_paper', textureIntensity: 30, aging: 15, photoFade: 40, shadow: 30 } },
  cream_instant: { name: 'Cream Instant', category: 'instant', paper: { texture: 'cream_canvas', textureIntensity: 25, shadow: 30 } },
  wide_instant: { name: 'Wide Instant', category: 'instant', paper: { texture: 'warm_paper', textureIntensity: 25, aging: 10, shadow: 30 } },
  mini_instant: { name: 'Mini Instant', category: 'instant', paper: { texture: 'warm_paper', textureIntensity: 20, shadow: 30 } },
  negative_35mm: { name: '35mm Negative', category: 'film' },
  film_strip: { name: 'Film Strip', category: 'film' },
  slide_mount: { name: 'Slide Mount', category: 'film', paper: { texture: 'cream_canvas', textureIntensity: 30, shadow: 25 } },
  contact_sheet: { name: 'Contact Sheet', category: 'film' },
  vintage_film_border: { name: 'Vintage Film', category: 'film', paper: { texture: 'aged_paper', textureIntensity: 30, aging: 20, photoFade: 20 } },
  old_paper: { name: 'Old Paper', category: 'paper', paper: { texture: 'aged_paper', textureIntensity: 60, aging: 45, edgeWear: 25, photoFade: 20, shadow: 25 } },
  torn_paper: { name: 'Torn Paper', category: 'paper', paper: { texture: 'handmade_paper', textureIntensity: 50, aging: 15, edgeWear: 60, shadow: 25 } },
  handmade_paper: { name: 'Handmade', category: 'paper', paper: { texture: 'handmade_paper', textureIntensity: 70, shadow: 20 } },
  textured_card: { name: 'Textured Card', category: 'paper', paper: { texture: 'linen', textureIntensity: 60, shadow: 20 } },
  postcard: { name: 'Postcard', category: 'paper', paper: { texture: 'warm_paper', textureIntensity: 35, aging: 15, shadow: 20 } },
  layered_paper: { name: 'Kraft Layer', category: 'paper', paper: { texture: 'kraft_paper', textureIntensity: 45, shadow: 30 } },
  tape_frame: { name: 'Taped Print', category: 'scrapbook', paper: { texture: 'warm_paper', textureIntensity: 30, shadow: 30 } },
  notebook_frame: { name: 'Notebook', category: 'scrapbook', paper: { texture: 'warm_paper', textureIntensity: 25, shadow: 20 } },
  journal_page: { name: 'Journal Page', category: 'scrapbook', paper: { texture: 'aged_paper', textureIntensity: 35, aging: 20, shadow: 20 } },
  vintage_collage: { name: 'Vintage Collage', category: 'scrapbook', paper: { texture: 'aged_paper', textureIntensity: 50, aging: 35, edgeWear: 20, shadow: 30 } },
  photo_print: { name: 'Photo Print', category: 'minimal', paper: { shadow: 20 } },
  thin_border: { name: 'Thin Border', category: 'minimal' },
  wide_border: { name: 'Wide Border', category: 'minimal' },
  rounded_print: { name: 'Rounded Print', category: 'minimal', paper: { shadow: 20 } },
  gallery_frame: { name: 'Gallery', category: 'minimal', paper: { shadow: 25 } },
  clean_editorial: { name: 'Editorial', category: 'minimal' },
};

function adapt(f: ManifestFrame): FramePreset {
  const meta = META[f.id];
  if (!meta) throw new Error(`frame registry: no metadata for manifest frame "${f.id}"`);
  const svg = FRAME_SVG[f.id];
  if (!svg) throw new Error(`frame registry: no SVG bundled for "${f.id}"`);
  const spec = parseFrameSvg(svg);
  const order = f.layerOrder.filter((l): l is 'photo' | 'frame' => l === 'photo' || l === 'frame');
  return {
    id: f.id,
    name: meta.name,
    category: meta.category,
    assetId: f.asset,
    canvas: f.canvas,
    canvasRatio: f.canvas.width / f.canvas.height,
    // The manifest's slot is authoritative; the SVG's hole only adds the corner radius.
    photoSlots: [{ ...f.photoSlot, rx: spec.hole.rx }],
    layerOrder: order.length === 2 ? order : ['photo', 'frame'],
    defaultColor: f.editableColor,
    paper: { ...CLEAN, ...meta.paper },
    customizable: { color: true, texture: true, thickness: true, shadow: true },
    spec,
  };
}

let presets: FramePreset[] | null = null;
let byId: Map<string, FramePreset> | null = null;

export function framePresets(): FramePreset[] {
  if (!presets) {
    presets = MANIFEST.frames.map(adapt);
    byId = new Map(presets.map((p) => [p.id, p]));
  }
  return presets;
}

export function getFramePreset(id: string): FramePreset | null {
  framePresets();
  return byId!.get(id) ?? null;
}

// ── Textures ────────────────────────────────────────────────────

export interface TexturePreset {
  id: string;
  name: string;
  /** Metro asset module. */
  source: number;
  /** Plain paper vs coloured / woven stock (Background → Paper / Texture). */
  group: 'paper' | 'texture';
}

const TEXTURE_META: Record<string, { name: string; group: 'paper' | 'texture' }> = {
  warm_paper: { name: 'Warm Paper', group: 'paper' },
  aged_paper: { name: 'Aged Paper', group: 'paper' },
  cream_canvas: { name: 'Cream Canvas', group: 'paper' },
  handmade_paper: { name: 'Handmade', group: 'paper' },
  kraft_paper: { name: 'Kraft', group: 'paper' },
  linen: { name: 'Linen', group: 'texture' },
  dusty_pink: { name: 'Dusty Pink', group: 'texture' },
  faded_blue: { name: 'Faded Blue', group: 'texture' },
};

export function texturePresets(): TexturePreset[] {
  return MANIFEST.textures.map((file) => {
    const id = file.replace(/\.png$/, '');
    const source = TEXTURE_SOURCES[id];
    if (source === undefined) throw new Error(`frame registry: texture "${id}" not bundled`);
    const meta = TEXTURE_META[id] ?? { name: id, group: 'texture' as const };
    return { id, source, ...meta };
  });
}

// ── Decorations ─────────────────────────────────────────────────

export type DecorationPreset =
  | { id: string; name: string; type: 'image'; source: number; /** Default size, canvas-width fraction. */ size: number; aspect: number }
  | { id: string; name: string; type: 'vector'; spec: DecorationSpec; size: number; aspect: number };

const DECORATION_NAMES: Record<string, string> = {
  clear_tape: 'Clear Tape',
  pink_tape: 'Pink Tape',
  sage_tape: 'Sage Tape',
  washi_tape: 'Washi Tape',
  heart_doodle: 'Heart',
  star_doodle: 'Star',
  sparkle: 'Sparkle',
};

/** Tape PNGs are 620×160. */
const TAPE_ASPECT = 620 / 160;

export function decorationPresets(): DecorationPreset[] {
  return MANIFEST.decorations.map((file): DecorationPreset => {
    const id = file.replace(/\.(png|svg)$/, '');
    const name = DECORATION_NAMES[id] ?? id;
    if (file.endsWith('.png')) {
      const source = DECORATION_PNG_SOURCES[id];
      if (source === undefined) throw new Error(`frame registry: decoration "${id}" not bundled`);
      return { id, name, type: 'image', source, size: 0.34, aspect: TAPE_ASPECT };
    }
    const svg = DECORATION_SVG[id];
    if (!svg) throw new Error(`frame registry: decoration "${id}" not bundled`);
    const spec = parseDecorationSvg(svg);
    return { id, name, type: 'vector', spec, size: 0.14, aspect: spec.viewBox.width / spec.viewBox.height };
  });
}

let decorationMap: Map<string, DecorationPreset> | null = null;
export function getDecoration(id: string): DecorationPreset | null {
  if (!decorationMap) decorationMap = new Map(decorationPresets().map((d) => [d.id, d]));
  return decorationMap.get(id) ?? null;
}

// ── Layouts ─────────────────────────────────────────────────────

export function layoutJson(id: string): LayoutJson | null {
  return LAYOUT_JSON[id] ?? null;
}
