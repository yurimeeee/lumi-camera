import { AlphaType, ColorType } from '@shopify/react-native-skia';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { loadImageAt } from '@/image-engine/frame/FrameAssetLoader';
import { findTransparentSlot, hasTransparency } from '@/image-engine/frame/FrameMask';
import type { Box } from '@/image-engine/frame/frameGeometry';
import { storeStudioFile } from '@/services/appFiles';
import { EXPORT_MAX_SIDE_HQ } from '@/services/imagePipeline';
import type { PickedImage } from '@/types/library';

import type { ImageRef } from '../types/document';

/**
 * Album images for Frame Studio. Every image is decoded (HEIC, EXIF-rotated
 * JPEG, PNG, WebP), capped at 4096 px and copied into Lumi's studio folder,
 * so a project or template never depends on the user's library file. PNG and
 * WebP stay PNG to keep their alpha channel.
 */

const ALPHA_MIME = /image\/(png|webp)/i;
const ALPHA_EXT = /\.(png|webp)(\?|$)/i;

export function mayHaveAlpha(p: Pick<PickedImage, 'uri' | 'mimeType'>): boolean {
  return (!!p.mimeType && ALPHA_MIME.test(p.mimeType)) || ALPHA_EXT.test(p.uri) || /^data:image\/(png|webp)/i.test(p.uri);
}

export interface ImportedImage {
  ref: ImageRef;
  /** Transparent PNG: the hole the photo goes into (normalised), if one was found. */
  hole: Box | null;
}

/** Alpha analysis on a small copy (full-size alpha scans would be slow and pointless). */
async function analyzeAlpha(ref: ImageRef): Promise<{ hasAlpha: boolean; hole: Box | null }> {
  const small = await loadImageAt(ref, 256);
  const w = small.width();
  const h = small.height();
  const px = small.readPixels(0, 0, { width: w, height: h, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul });
  if (!px) return { hasAlpha: false, hole: null };
  const rgba = px instanceof Uint8Array ? px : Uint8Array.from(px, (v) => Math.round(v * 255));
  if (!hasTransparency(rgba)) return { hasAlpha: false, hole: null };
  return { hasAlpha: true, hole: findTransparentSlot(rgba, w, h) };
}

export async function importImage(picked: Pick<PickedImage, 'uri' | 'mimeType'>, kind: 'photo' | 'asset'): Promise<ImportedImage> {
  const keepAlpha = kind === 'asset' && mayHaveAlpha(picked);
  const decoded = await ImageManipulator.manipulate(picked.uri).renderAsync();
  const long = Math.max(decoded.width, decoded.height);
  const s = long > EXPORT_MAX_SIDE_HQ ? EXPORT_MAX_SIDE_HQ / long : 1;
  const sized =
    s < 1
      ? await ImageManipulator.manipulate(decoded).resize({ width: Math.round(decoded.width * s), height: Math.round(decoded.height * s) }).renderAsync()
      : decoded;
  const saved = await sized.saveAsync(keepAlpha ? { format: SaveFormat.PNG } : { format: SaveFormat.JPEG, compress: 0.95 });
  const uri = await storeStudioFile(saved.uri);
  const ref: ImageRef = { uri, width: saved.width, height: saved.height };
  if (!keepAlpha) return { ref, hole: null };
  const alpha = await analyzeAlpha({ ...ref, hasAlpha: true });
  return { ref: { ...ref, hasAlpha: alpha.hasAlpha }, hole: alpha.hole };
}
