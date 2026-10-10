import { AlphaType, ColorType, Skia, type SkImage } from '@shopify/react-native-skia';

import type { RgbaPixels } from '@/services/autoEnhance';

/**
 * A small RGBA8 copy of `image` for analysis (Auto Enhance, filter
 * recommendation, colour picking): drawn into a CPU raster surface, so it
 * works the same on native and web and never touches the GPU canvas.
 */
export function readSmallPixels(image: SkImage, maxSide = 256): RgbaPixels | null {
  const w = image.width();
  const h = image.height();
  const s = Math.min(1, maxSide / Math.max(w, h));
  const width = Math.max(1, Math.round(w * s));
  const height = Math.max(1, Math.round(h * s));
  const surface = Skia.Surface.Make(width, height);
  if (!surface) return null;
  surface.getCanvas().drawImageRectCubic(image, Skia.XYWHRect(0, 0, w, h), Skia.XYWHRect(0, 0, width, height), 1 / 3, 1 / 3);
  surface.flush();
  const snap = surface.makeImageSnapshot();
  const px = snap.readPixels(0, 0, { width, height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul });
  snap.dispose();
  surface.dispose();
  if (!px) return null;
  const data = px instanceof Uint8Array ? px : Uint8Array.from(px as ArrayLike<number>, (v) => Math.round(v * 255));
  return { width, height, data };
}
