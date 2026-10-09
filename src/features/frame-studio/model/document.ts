import { ORIGINAL_FILTER_ID } from '@/constants/filters';
import { containBox, defaultCornerRadius, type Box } from '@/image-engine/frame/frameGeometry';
import { getDecoration, getFramePreset } from '@/image-engine/frame/registry';

import { FRAME_LAYOUT_ID, FREE_LAYOUT_ID, getLayout } from '../presets/layouts';
import type {
  BackgroundAdjust,
  CustomFrame,
  DecorationLayer,
  FrameStyle,
  ImageRef,
  ImageTransform,
  PhotoLayer,
  StudioDocument,
  StudioLayer,
  StudioTemplate,
  TextLayer,
} from '../types/document';

/**
 * Pure document operations. The store wraps them with undo/redo; tests call
 * them directly. Every operation returns a new document (never mutates).
 */

/** Canvas width in units; height follows the aspect. */
export const CANVAS_W = 1000;

let counter = 0;
export function newId(prefix = 'l'): string {
  counter = (counter + 1) % 1e6;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export const IDENTITY_TRANSFORM: ImageTransform = { scale: 1, x: 0, y: 0, rotation: 0, opacity: 100 };

export const DEFAULT_BG_ADJUST: BackgroundAdjust = { scale: 100, x: 0, y: 0, blur: 0, opacity: 100, brightness: 0, saturation: 0 };

export const NO_FRAME_STYLE: FrameStyle = {
  presetId: 'none',
  color: '#FFFFFF',
  thickness: 100,
  top: 100,
  side: 100,
  bottom: 100,
  cornerRadius: 0,
  texture: null,
  textureIntensity: 0,
  aging: 0,
  edgeWear: 0,
  photoFade: 0,
  shadow: 0,
  custom: null,
};

/** A preset's style with its kit defaults (colour, proportions, paper). */
export function presetFrameStyle(presetId: string): FrameStyle {
  const preset = getFramePreset(presetId);
  if (!preset) return { ...NO_FRAME_STYLE };
  return {
    ...NO_FRAME_STYLE,
    presetId,
    color: preset.defaultColor,
    cornerRadius: defaultCornerRadius(preset.spec),
    ...preset.paper,
  };
}

export function customFrameStyle(custom: CustomFrame): FrameStyle {
  return { ...NO_FRAME_STYLE, presetId: 'custom', custom };
}

/** Aspect (w/h) a layer's print has, or null when it follows its box (bare photo). */
export function printAspect(layer: Pick<PhotoLayer, 'frame' | 'photo'>): number | null {
  const { frame } = layer;
  if (frame.presetId === 'custom' && frame.custom) return frame.custom.image.width / frame.custom.image.height;
  const preset = frame.presetId === 'none' ? null : getFramePreset(frame.presetId);
  return preset ? preset.canvasRatio : null;
}

function photoAspect(photo: ImageRef | null): number {
  return photo ? photo.width / photo.height : 4 / 5;
}

export function newPhotoLayer(box: Box, photo: ImageRef | null, frame: FrameStyle = NO_FRAME_STYLE, slot: number | null = null): PhotoLayer {
  return {
    id: newId(),
    kind: 'photo',
    ...box,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    photo,
    content: { ...IDENTITY_TRANSFORM },
    look: { filterId: ORIGINAL_FILTER_ID, intensity: 100 },
    frame,
    slot,
  };
}

export function createDocument(photos: readonly ImageRef[], presetId = 'none'): StudioDocument {
  const doc: StudioDocument = {
    version: 1,
    width: CANVAS_W,
    height: CANVAS_W,
    layoutId: FRAME_LAYOUT_ID,
    ratio: null,
    margin: 0,
    background: { fill: { kind: 'color', color: '#F7F4EF' }, adjust: { ...DEFAULT_BG_ADJUST } },
    layers: [newPhotoLayer({ x: 0, y: 0, width: CANVAS_W, height: CANVAS_W }, photos[0] ?? null, presetFrameStyle(presetId), 0)],
    pool: [...photos],
    imports: {},
  };
  return photos.length > 1 ? applyLayout(doc, 'grid_2x2') : fitFrameLayout(doc);
}

export const photoLayers = (doc: StudioDocument) => doc.layers.filter((l): l is PhotoLayer => l.kind === 'photo');

/** Frame layout: the canvas wraps the single print (+ margin). */
function fitFrameLayout(doc: StudioDocument): StudioDocument {
  const print = photoLayers(doc)[0];
  if (!print) return doc;
  const aspect = printAspect(print) ?? photoAspect(print.photo);
  const m = Math.max(0, doc.margin) / 100;
  const w = CANVAS_W / (1 + 2 * m);
  const h = w / aspect;
  const height = Math.round(h + 2 * m * w);
  const layers = doc.layers.map((l) => {
    if (l.id === print.id) return { ...l, x: m * w, y: m * w, width: w, height: h, rotation: l.rotation };
    // Keep decorations where they were, relative to the canvas.
    return rescale(l, CANVAS_W / doc.width, height / doc.height);
  });
  return { ...doc, width: CANVAS_W, height, layers };
}

function rescale<L extends StudioLayer>(l: L, sx: number, sy: number): L {
  if (sx === 1 && sy === 1) return l;
  const cx = (l.x + l.width / 2) * sx;
  const cy = (l.y + l.height / 2) * sy;
  const width = l.width * sx;
  const height = l.height * sx;
  return { ...l, x: cx - width / 2, y: cy - height / 2, width, height, ...(l.kind === 'text' ? { fontSize: (l as TextLayer).fontSize * sx } : null) };
}

function slotBoxes(layoutId: string, W: number, H: number): Box[] {
  return getLayout(layoutId).slots.map((s) => ({ x: s.x * W, y: s.y * H, width: s.width * W, height: s.height * H }));
}

/** Box a print takes inside a slot: its own proportions, centred (bare photos fill the slot). */
function fitToSlot(layer: Pick<PhotoLayer, 'frame' | 'photo'>, slot: Box): Box {
  const aspect = printAspect(layer);
  return aspect ? containBox(aspect, slot) : slot;
}

/**
 * Switches layout. Photos stay in their slot index where possible; new slots
 * are filled from the photo pool; photos without a slot leave the canvas but
 * stay in the pool. Prints keep their frame; decorations and text keep their
 * place relative to the canvas.
 */
export function applyLayout(doc: StudioDocument, layoutId: string, ratio?: number): StudioDocument {
  const layout = getLayout(layoutId);
  const old = photoLayers(doc);
  const others = doc.layers.filter((l) => l.kind !== 'photo');
  if (layout.id === FRAME_LAYOUT_ID) {
    const first = [...old].sort(slotOrder)[0] ?? newPhotoLayer({ x: 0, y: 0, width: 1, height: 1 }, doc.pool[0] ?? null);
    return fitFrameLayout({ ...doc, layoutId: layout.id, ratio: null, layers: [{ ...first, slot: 0, rotation: 0 }, ...others] });
  }
  const r = ratio ?? (doc.layoutId === layoutId && doc.ratio ? doc.ratio : layout.ratio ?? 4 / 5);
  const W = CANVAS_W;
  const H = Math.round(W / r);
  const scaled = others.map((l) => rescale(l, W / doc.width, H / doc.height));
  if (layout.id === FREE_LAYOUT_ID) {
    const kept = old.map((l) => ({ ...rescale(l, W / doc.width, H / doc.height), slot: null }));
    return { ...doc, layoutId: layout.id, ratio: r, width: W, height: H, layers: [...kept, ...scaled] };
  }
  const sorted = [...old].sort(slotOrder);
  const used = new Set(sorted.map((l) => l.photo?.uri).filter(Boolean));
  const spare = doc.pool.filter((p) => !used.has(p.uri));
  const template = sorted[0]?.frame ?? NO_FRAME_STYLE;
  const boxes = slotBoxes(layout.id, W, H);
  const prints = boxes.map((box, i) => {
    const prev = sorted[i];
    const photo = prev ? prev.photo ?? spare.shift() ?? null : spare.shift() ?? null;
    const base = prev ?? newPhotoLayer(box, photo, template, i);
    const layer: PhotoLayer = { ...base, photo, slot: i, rotation: layout.rotations?.[i] ?? 0 };
    return { ...layer, ...fitToSlot(layer, box) };
  });
  return { ...doc, layoutId: layout.id, ratio: r, width: W, height: H, layers: [...prints, ...scaled] };
}

function slotOrder(a: PhotoLayer, b: PhotoLayer) {
  return (a.slot ?? 1e6) - (b.slot ?? 1e6);
}

export function setCanvasRatio(doc: StudioDocument, ratio: number): StudioDocument {
  if (doc.layoutId === FRAME_LAYOUT_ID) return applyLayout({ ...doc, layoutId: FREE_LAYOUT_ID }, FREE_LAYOUT_ID, ratio);
  return applyLayout(doc, doc.layoutId, ratio);
}

export function setMargin(doc: StudioDocument, margin: number): StudioDocument {
  return doc.layoutId === FRAME_LAYOUT_ID ? fitFrameLayout({ ...doc, margin }) : { ...doc, margin };
}

/** Re-fits a print after its frame changed (slot prints refit the slot, free prints keep centre and area). */
function refit(doc: StudioDocument, layer: PhotoLayer): PhotoLayer {
  if (doc.layoutId !== FREE_LAYOUT_ID && doc.layoutId !== FRAME_LAYOUT_ID && layer.slot !== null) {
    const box = slotBoxes(doc.layoutId, doc.width, doc.height)[layer.slot];
    if (box) return { ...layer, ...fitToSlot(layer, box) };
  }
  const aspect = printAspect(layer) ?? photoAspect(layer.photo);
  const area = layer.width * layer.height;
  const width = Math.sqrt(area * aspect);
  const height = width / aspect;
  const cx = layer.x + layer.width / 2;
  const cy = layer.y + layer.height / 2;
  return { ...layer, x: cx - width / 2, y: cy - height / 2, width, height };
}

/** Puts a frame on the given prints (all prints when `ids` is empty). */
export function applyFrame(doc: StudioDocument, frame: FrameStyle, ids: readonly string[] = []): StudioDocument {
  const target = (l: StudioLayer) => l.kind === 'photo' && (ids.length === 0 || ids.includes(l.id));
  const layers = doc.layers.map((l) => (target(l) ? refit(doc, { ...(l as PhotoLayer), frame }) : l));
  const next = { ...doc, layers };
  return doc.layoutId === FRAME_LAYOUT_ID ? fitFrameLayout(next) : next;
}

/** Edits frame settings (colour, borders, paper…) without changing the print's box. */
export function updateFrame(doc: StudioDocument, ids: readonly string[], patch: Partial<FrameStyle>): StudioDocument {
  const layers = doc.layers.map((l) =>
    l.kind === 'photo' && (ids.length === 0 || ids.includes(l.id)) ? { ...l, frame: { ...l.frame, ...patch } } : l,
  );
  return { ...doc, layers };
}

export function updateLayer(doc: StudioDocument, id: string, patch: Partial<StudioLayer>): StudioDocument {
  return { ...doc, layers: doc.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as StudioLayer) : l)) };
}

/** Adds photos to the pool; fills empty slots first, then drops new prints on the canvas. */
export function addPhotos(doc: StudioDocument, photos: readonly ImageRef[]): StudioDocument {
  let layers = [...doc.layers];
  const queue = [...photos];
  layers = layers.map((l) => (l.kind === 'photo' && !l.photo && queue.length ? refit(doc, { ...l, photo: queue.shift()! }) : l));
  const prints = layers.filter((l): l is PhotoLayer => l.kind === 'photo');
  const template = prints[0]?.frame ?? NO_FRAME_STYLE;
  const firstOther = layers.findIndex((l) => l.kind !== 'photo');
  const at = firstOther < 0 ? layers.length : firstOther;
  const added = queue.map((photo, i) => {
    const size = Math.min(doc.width, doc.height) * 0.46;
    const n = prints.length + i;
    const cx = doc.width / 2 + ((n % 3) - 1) * doc.width * 0.18;
    const cy = doc.height / 2 + (((n + 1) % 3) - 1) * doc.height * 0.12;
    const layer = newPhotoLayer({ x: cx - size / 2, y: cy - size / 2, width: size, height: size }, photo, template, null);
    return { ...refit({ ...doc, layoutId: FREE_LAYOUT_ID }, layer), rotation: ((n % 3) - 1) * 5 };
  });
  layers.splice(at, 0, ...added);
  const next = { ...doc, layers, pool: [...doc.pool, ...photos] };
  // A second photo turns a single-print canvas into free placement.
  return added.length && doc.layoutId === FRAME_LAYOUT_ID ? { ...next, layoutId: FREE_LAYOUT_ID, ratio: doc.width / doc.height } : next;
}

export function replacePhoto(doc: StudioDocument, id: string, photo: ImageRef): StudioDocument {
  const pool = doc.pool.some((p) => p.uri === photo.uri) ? doc.pool : [...doc.pool, photo];
  const layers = doc.layers.map((l) => (l.id === id && l.kind === 'photo' ? refit(doc, { ...l, photo, content: { ...IDENTITY_TRANSFORM } }) : l));
  const next = { ...doc, layers, pool };
  return doc.layoutId === FRAME_LAYOUT_ID ? fitFrameLayout(next) : next;
}

export function addDecoration(doc: StudioDocument, assetId: string): StudioDocument {
  const deco = getDecoration(assetId);
  if (!deco) return doc;
  const width = doc.width * deco.size;
  const height = width / deco.aspect;
  const n = doc.layers.filter((l) => l.kind === 'decoration').length;
  const layer: DecorationLayer = {
    id: newId('d'),
    kind: 'decoration',
    assetId,
    tint: null,
    x: doc.width / 2 - width / 2 + ((n % 3) - 1) * doc.width * 0.08,
    y: doc.height * (0.18 + 0.1 * (n % 4)) - height / 2,
    width,
    height,
    rotation: deco.type === 'image' ? (n % 2 ? 8 : -6) : 0,
    opacity: 1,
    visible: true,
    locked: false,
  };
  return { ...doc, layers: [...doc.layers, layer] };
}

export function addText(doc: StudioDocument, text: string, color: string, measuredWidth: (fontSize: number) => number): StudioDocument {
  const fontSize = doc.width * 0.05;
  const width = Math.max(fontSize * 2, measuredWidth(fontSize) + fontSize);
  const height = fontSize * 1.6;
  const layer: TextLayer = {
    id: newId('t'),
    kind: 'text',
    text,
    color,
    fontSize,
    x: doc.width / 2 - width / 2,
    y: doc.height * 0.86 - height / 2,
    width,
    height,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
  };
  return { ...doc, layers: [...doc.layers, layer] };
}

export function duplicateLayer(doc: StudioDocument, id: string): { doc: StudioDocument; id: string | null } {
  const i = doc.layers.findIndex((l) => l.id === id);
  const src = doc.layers[i];
  if (!src) return { doc, id: null };
  const off = doc.width * 0.03;
  const copy = { ...src, id: newId(src.kind[0]), x: src.x + off, y: src.y + off, ...(src.kind === 'photo' ? { slot: null } : null) } as StudioLayer;
  const layers = [...doc.layers];
  layers.splice(i + 1, 0, copy);
  return { doc: { ...doc, layers }, id: copy.id };
}

export function deleteLayer(doc: StudioDocument, id: string): StudioDocument {
  return { ...doc, layers: doc.layers.filter((l) => l.id !== id) };
}

export type Reorder = 'forward' | 'backward' | 'front' | 'back';

/** Moves a layer in the z-order (array order = drawing order). */
export function reorderLayer(doc: StudioDocument, id: string, how: Reorder): StudioDocument {
  const i = doc.layers.findIndex((l) => l.id === id);
  if (i < 0) return doc;
  const layers = [...doc.layers];
  const [layer] = layers.splice(i, 1);
  const to = how === 'front' ? layers.length : how === 'back' ? 0 : how === 'forward' ? Math.min(layers.length, i + 1) : Math.max(0, i - 1);
  layers.splice(to, 0, layer!);
  return { ...doc, layers };
}

/** z-index of a layer (0 = bottom), -1 when absent. */
export const zIndexOf = (doc: StudioDocument, id: string) => doc.layers.findIndex((l) => l.id === id);

// ── Geometry ────────────────────────────────────────────────────

/** Canvas point → the layer's unrotated local space (0,0 = top-left). */
export function toLayerSpace(layer: Pick<StudioLayer, 'x' | 'y' | 'width' | 'height' | 'rotation'>, x: number, y: number) {
  const cx = layer.x + layer.width / 2;
  const cy = layer.y + layer.height / 2;
  const a = (-layer.rotation * Math.PI) / 180;
  const dx = x - cx;
  const dy = y - cy;
  return { x: dx * Math.cos(a) - dy * Math.sin(a) + layer.width / 2, y: dx * Math.sin(a) + dy * Math.cos(a) + layer.height / 2 };
}

/** Topmost visible layer under a canvas point (`slop` widens thin layers). */
export function hitTest(doc: StudioDocument, x: number, y: number, slop = 0): StudioLayer | null {
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const l = doc.layers[i]!;
    if (!l.visible) continue;
    const p = toLayerSpace(l, x, y);
    if (p.x >= -slop && p.y >= -slop && p.x <= l.width + slop && p.y <= l.height + slop) return l;
  }
  return null;
}

/** Scales a layer around its centre. */
export function scaleLayer<L extends StudioLayer>(l: L, k: number): L {
  const cx = l.x + l.width / 2;
  const cy = l.y + l.height / 2;
  const width = Math.max(8, l.width * k);
  const height = (width / l.width) * l.height;
  return { ...l, x: cx - width / 2, y: cy - height / 2, width, height, ...(l.kind === 'text' ? { fontSize: (l as TextLayer).fontSize * (width / l.width) } : null) };
}

// ── Templates ───────────────────────────────────────────────────

/** A reusable template: the document with every photo taken out. */
export function toTemplate(doc: StudioDocument, name: string): StudioTemplate {
  const layers = doc.layers.map((l) => (l.kind === 'photo' ? { ...l, photo: null, content: { ...IDENTITY_TRANSFORM } } : l));
  // Album backgrounds and frames are part of the design; photos never are.
  return { id: newId('tpl'), name, createdAt: Date.now(), doc: { ...doc, layers, pool: [] } };
}

/** A new document from a template, filled with `photos` in slot order. */
export function applyTemplate(template: StudioTemplate, photos: readonly ImageRef[]): StudioDocument {
  const queue = [...photos];
  const order = photoLayers(template.doc).sort(slotOrder).map((l) => l.id);
  const fill = new Map(order.map((id) => [id, queue.shift() ?? null]));
  const layers = template.doc.layers.map((l) => ({
    ...l,
    id: newId(l.kind[0]),
    ...(l.kind === 'photo' ? { photo: fill.get(l.id) ?? null } : null),
  })) as StudioLayer[];
  const doc: StudioDocument = { ...template.doc, layers, pool: [...photos] };
  // Extra photos land as free prints; the frame layout re-fits to the photo.
  const withExtra = queue.length ? addPhotos(doc, queue).layers : doc.layers;
  const next = { ...doc, layers: withExtra, pool: [...photos] };
  return doc.layoutId === FRAME_LAYOUT_ID ? fitFrameLayout(next) : next;
}

/** Every image URI a document draws (for loading and housekeeping). */
export function documentImages(doc: StudioDocument): ImageRef[] {
  const out = new Map<string, ImageRef>();
  for (const l of doc.layers) {
    if (l.kind !== 'photo') continue;
    if (l.photo) out.set(l.photo.uri, l.photo);
    if (l.frame.custom) out.set(l.frame.custom.image.uri, l.frame.custom.image);
  }
  if (doc.background.fill.kind === 'image') out.set(doc.background.fill.image.uri, doc.background.fill.image);
  return [...out.values()];
}
