import { AlphaType, ColorType, loadData, Skia, type SkImage, type SkTypeface } from '@shopify/react-native-skia';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { documentImages } from '@/features/frame-studio/model/document';
import type { ImageRef, StudioDocument } from '@/features/frame-studio/types/document';

import type { AssetBank, TextureImage } from './bank';
import { printGeometry, placeInBox } from './FrameRenderer';
import { decorationPresets, texturePresets } from './registry';

/**
 * Loads and caches everything a frame render needs. Kit assets (textures,
 * tapes, caption font) are decoded once per app run; photos are decoded at
 * screen size for the preview and at print size for the export, so neither
 * keeps more pixels in memory than it draws.
 */

const CAPTION_FONT = require('../../../assets/fonts/Inter-Medium.ttf');

export const PREVIEW_IMAGE_SIDE = 1600;

/** Average colour of a texture (its relief is measured around it). */
export function textureMean(image: SkImage): [number, number, number] {
  const surface = Skia.Surface.Make(1, 1);
  if (!surface) return [0.9, 0.86, 0.8];
  // Over white, like the paper shader composites it.
  surface.getCanvas().clear(Skia.Color('#FFFFFF'));
  surface.getCanvas().drawImageRectCubic(image, Skia.XYWHRect(0, 0, image.width(), image.height()), Skia.XYWHRect(0, 0, 1, 1), 1 / 3, 1 / 3);
  surface.flush();
  const px = surface.makeImageSnapshot().readPixels(0, 0, { width: 1, height: 1, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul });
  surface.dispose();
  if (!px) return [0.9, 0.86, 0.8];
  return [Number(px[0]) / 255, Number(px[1]) / 255, Number(px[2]) / 255];
}

interface Kit {
  textures: Map<string, TextureImage>;
  decorations: Map<string, SkImage>;
  typeface: SkTypeface | null;
}

let kitPromise: Promise<Kit> | null = null;

/** Kit textures, tape bitmaps and the caption font (decoded once). */
export function loadKit(): Promise<Kit> {
  if (!kitPromise) {
    kitPromise = (async () => {
      const textures = new Map<string, TextureImage>();
      const decorations = new Map<string, SkImage>();
      await Promise.all([
        ...texturePresets().map(async (t) => {
          const image = await loadData(t.source, (d) => Skia.Image.MakeImageFromEncoded(d));
          if (image) textures.set(t.id, { image, mean: textureMean(image) });
        }),
        ...decorationPresets().map(async (d) => {
          if (d.type !== 'image') return;
          const image = await loadData(d.source, (data) => Skia.Image.MakeImageFromEncoded(data));
          if (image) decorations.set(d.id, image);
        }),
      ]);
      const typeface = await loadData(CAPTION_FONT, (d) => Skia.Typeface.MakeFreeTypeFaceFromData(d)).catch(() => null);
      return { textures, decorations, typeface };
    })().catch((e) => {
      kitPromise = null;
      throw e;
    });
  }
  return kitPromise;
}

async function decode(uri: string): Promise<SkImage> {
  const data = await Skia.Data.fromURI(uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) throw new Error('이미지를 열 수 없어요.');
  return image;
}

/**
 * `ref` decoded with its long side at most `maxSide` (resampled natively;
 * images with alpha stay PNG so transparency survives).
 */
export async function loadImageAt(ref: ImageRef, maxSide: number | null): Promise<SkImage> {
  const long = Math.max(ref.width, ref.height);
  if (!maxSide || maxSide >= long * 0.95) return decode(ref.uri);
  const s = maxSide / long;
  const out = await ImageManipulator.manipulate(ref.uri)
    .resize({ width: Math.max(1, Math.round(ref.width * s)), height: Math.max(1, Math.round(ref.height * s)) })
    .renderAsync();
  const saved = await out.saveAsync(ref.hasAlpha ? { format: SaveFormat.PNG } : { format: SaveFormat.JPEG, compress: 0.92 });
  return decode(saved.uri);
}

// Preview copies: small LRU by uri.
const previewCache = new Map<string, Promise<SkImage | null>>();
const PREVIEW_CACHE = 24;

export function previewImage(ref: ImageRef): Promise<SkImage | null> {
  let p = previewCache.get(ref.uri);
  if (p) {
    previewCache.delete(ref.uri);
    previewCache.set(ref.uri, p);
    return p;
  }
  p = loadImageAt(ref, PREVIEW_IMAGE_SIDE).catch(() => null);
  previewCache.set(ref.uri, p);
  while (previewCache.size > PREVIEW_CACHE) previewCache.delete(previewCache.keys().next().value!);
  return p;
}

async function withKit(images: Map<string, SkImage>, doc: StudioDocument, imported: (ref: ImageRef) => Promise<SkImage | null>): Promise<AssetBank> {
  const kit = await loadKit();
  const textures = new Map(kit.textures);
  // Imported paper textures.
  await Promise.all(
    Object.entries(doc.imports).map(async ([id, ref]) => {
      const image = await imported(ref);
      if (image) textures.set(id, { image, mean: textureMean(image) });
    }),
  );
  return { textures, decorations: kit.decorations, images, typeface: kit.typeface };
}

/** Everything the on-screen preview of `doc` needs, at screen resolution. */
export async function loadPreviewBank(doc: StudioDocument): Promise<AssetBank> {
  const images = new Map<string, SkImage>();
  await Promise.all(
    documentImages(doc).map(async (ref) => {
      const img = await previewImage(ref);
      if (img) images.set(ref.uri, img);
    }),
  );
  return withKit(images, doc, previewImage);
}

/** Long side (px) each image is printed at when `doc` is rendered `scale` px per unit. */
export function exportImageSides(doc: StudioDocument, scale: number): Map<string, number> {
  const need = new Map<string, number>();
  const bump = (uri: string, px: number) => need.set(uri, Math.max(need.get(uri) ?? 0, Math.ceil(px)));
  for (const l of doc.layers) {
    if (l.kind !== 'photo' || !l.visible) continue;
    const g = printGeometry(l);
    if (l.photo) {
      const pl = placeInBox(l.photo.width, l.photo.height, g.windowBox, l.content);
      bump(l.photo.uri, Math.max(pl.width, pl.height) * scale);
    }
    if (l.frame.custom) {
      const c = l.frame.custom;
      const pl = placeInBox(c.image.width, c.image.height, { x: 0, y: 0, width: l.width, height: l.height }, c.transform);
      bump(c.image.uri, Math.max(pl.width, pl.height) * scale);
    }
  }
  const fill = doc.background.fill;
  if (fill.kind === 'image') bump(fill.image.uri, Math.max(doc.width, doc.height) * scale * Math.max(1, doc.background.adjust.scale / 100) * 1.5);
  return need;
}

/** Export bank: every image decoded at the size it is printed at (originals when larger is needed). */
export async function loadExportBank(doc: StudioDocument, scale: number): Promise<AssetBank> {
  const need = exportImageSides(doc, scale);
  const images = new Map<string, SkImage>();
  // One at a time: peak memory stays at one full-size decode plus the canvas.
  for (const ref of documentImages(doc)) {
    images.set(ref.uri, await loadImageAt(ref, need.get(ref.uri) ?? null));
  }
  return withKit(images, doc, (ref) => loadImageAt(ref, 1024));
}
