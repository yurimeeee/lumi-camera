import { AlphaType, ColorType, type SkImage } from '@shopify/react-native-skia';

import { DEFAULT_ADJUSTMENTS } from '@/constants/adjustments';
import { DEFAULT_MASK_ADJUST } from '@/constants/masks';
import { getFilter } from '@/constants/filters';
import { resolveProcessing } from '@/services/imageProcessing';
import type { Geometry } from '@/types/editing';
import type { MaskAdjust, MaskShape, SelectiveMask } from '@/types/phase4';

import type { Pixels } from '../image-engine/canvaskit';

export const NO_GEOMETRY: Geometry = { rotation: 0, flipH: false, flipV: false, crop: null, aspect: 'original' };

export const IDENTITY = () => resolveProcessing({ filter: getFilter('original'), intensity: 0, adjustments: DEFAULT_ADJUSTMENTS });

export function pixelsOf(img: SkImage, alphaType = AlphaType.Unpremul): Pixels {
  const width = img.width();
  const height = img.height();
  const px = img.readPixels(0, 0, { width, height, colorType: ColorType.RGBA_8888, alphaType });
  if (!px) throw new Error('readPixels');
  return { width, height, data: px instanceof Uint8Array ? px : Uint8Array.from(px as ArrayLike<number>) };
}

export function flat(width: number, height: number, rgb: [number, number, number]): Pixels {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = rgb[0];
    data[i * 4 + 1] = rgb[1];
    data[i * 4 + 2] = rgb[2];
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

/** Left half red-ish, right half blue-ish, with a vertical brightness ramp. */
export function twoTone(width: number, height: number): Pixels {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const k = 0.35 + 0.6 * (y / (height - 1));
      const c = x < width / 2 ? [0.85, 0.25, 0.2] : [0.2, 0.35, 0.85];
      const i = (y * width + x) * 4;
      for (let ch = 0; ch < 3; ch++) data[i + ch] = Math.round(c[ch]! * k * 255);
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

export function at(p: Pixels, x: number, y: number): [number, number, number] {
  const i = (Math.round(y) * p.width + Math.round(x)) * 4;
  return [p.data[i]!, p.data[i + 1]!, p.data[i + 2]!];
}

export const lum = (c: readonly number[]) => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;

export function mask(shape: MaskShape, adjust: Partial<MaskAdjust> = {}, extra: Partial<SelectiveMask> = {}): SelectiveMask {
  return { id: `m${Math.random().toString(36).slice(2, 7)}`, name: 'm', visible: true, invert: false, shape, strokes: [], adjust: { ...DEFAULT_MASK_ADJUST, ...adjust }, ...extra };
}

/** Largest luminance step between horizontally / vertically adjacent pixels. */
export function maxStep(p: Pixels): number {
  let worst = 0;
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      const c = lum(at(p, x, y));
      if (x + 1 < p.width) worst = Math.max(worst, Math.abs(lum(at(p, x + 1, y)) - c));
      if (y + 1 < p.height) worst = Math.max(worst, Math.abs(lum(at(p, x, y + 1)) - c));
    }
  }
  return worst;
}
