import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { Geometry, NormalizedRect } from '@/types/editing';
import type { CaptureRatio } from '@/types/settings';

import { rotatedSize } from './frameCoords';

/**
 * Geometry & resampling. Everything that changes pixel dimensions goes
 * through expo-image-manipulator (native, off the JS thread); colour work is
 * done by the Skia shader afterwards.
 */

export interface ImageFile {
  uri: string;
  width: number;
  height: number;
}

export const PREVIEW_MAX_SIDE = 1600;
export const THUMB_MAX_SIDE = 220;
export const EXPORT_MAX_SIDE_HQ = 4096;
export const EXPORT_MAX_SIDE_STD = 2048;

function fitWithin(w: number, h: number, maxSide: number): { width: number; height: number } | null {
  const longest = Math.max(w, h);
  if (longest <= maxSide) return null;
  const s = maxSide / longest;
  return { width: Math.round(w * s), height: Math.round(h * s) };
}

/**
 * Decodes any supported input (HEIC, PNG, EXIF-rotated JPEG…) into an
 * upright JPEG no larger than `maxSide`.
 */
export async function normalizeImage(uri: string, maxSide: number, compress = 0.95): Promise<ImageFile> {
  const decoded = await ImageManipulator.manipulate(uri).renderAsync();
  const size = fitWithin(decoded.width, decoded.height, maxSide);
  const ref = size ? await ImageManipulator.manipulate(decoded).resize(size).renderAsync() : decoded;
  const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

/** Pixel rect for a normalised crop inside an image of the given size. */
export function cropToPixels(crop: NormalizedRect, width: number, height: number) {
  const originX = Math.max(0, Math.round(crop.x * width));
  const originY = Math.max(0, Math.round(crop.y * height));
  return {
    originX,
    originY,
    width: Math.max(1, Math.min(width - originX, Math.round(crop.width * width))),
    height: Math.max(1, Math.min(height - originY, Math.round(crop.height * height))),
  };
}

export { rotatedSize } from './frameCoords';

/**
 * Applies rotate → flip → crop, then downsizes to `maxSide`.
 * Returns the input untouched when there is nothing to do.
 */
export async function applyGeometry(
  source: ImageFile,
  geometry: Geometry,
  maxSide: number,
  compress = 0.95,
): Promise<ImageFile> {
  const { rotation, flipH, flipV, crop } = geometry;
  const turned = rotatedSize(source.width, source.height, rotation);
  const cropRect = crop ? cropToPixels(crop, turned.width, turned.height) : null;
  const outW = cropRect?.width ?? turned.width;
  const outH = cropRect?.height ?? turned.height;
  const resize = fitWithin(outW, outH, maxSide);

  if (!rotation && !flipH && !flipV && !cropRect && !resize) return source;

  const ctx = ImageManipulator.manipulate(source.uri);
  if (rotation) ctx.rotate(rotation);
  if (flipH) ctx.flip('horizontal');
  if (flipV) ctx.flip('vertical');
  if (cropRect) ctx.crop(cropRect);
  if (resize) ctx.resize(resize);
  const ref = await ctx.renderAsync();
  const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

/** Aspect (w/h) for a portrait capture at the given ratio, or null for sensor native. */
export function captureAspect(ratio: CaptureRatio): number | null {
  switch (ratio) {
    case '1:1':
      return 1;
    case '4:3':
      return 3 / 4;
    case '16:9':
      return 9 / 16;
    default:
      return null;
  }
}

/** Largest centred rect of `aspect` (w/h) inside a w×h image, normalised. */
export function centeredCrop(width: number, height: number, aspect: number): NormalizedRect {
  const imageAspect = width / height;
  if (Math.abs(imageAspect - aspect) < 0.005) return { x: 0, y: 0, width: 1, height: 1 };
  if (imageAspect > aspect) {
    const w = aspect / imageAspect;
    return { x: (1 - w) / 2, y: 0, width: w, height: 1 };
  }
  const h = imageAspect / aspect;
  return { x: 0, y: (1 - h) / 2, width: 1, height: h };
}
