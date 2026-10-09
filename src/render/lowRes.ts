import { Skia, type SkImage } from '@shopify/react-native-skia';

/**
 * A small copy of a photo for the shader's `lowRes` child: bloom, halation
 * and soft focus average light over large radii, and reading a pre-shrunk
 * image keeps that smooth with a handful of samples. Sized relative to the
 * photo, so preview and export see the same (relative) detail.
 */
export const LOWRES_LONG_SIDE = 384;

const cache = new WeakMap<SkImage, SkImage>();

export function lowResOf(image: SkImage): SkImage {
  const hit = cache.get(image);
  if (hit) return hit;
  const w = image.width();
  const h = image.height();
  const s = LOWRES_LONG_SIDE / Math.max(w, h);
  if (s >= 1) return image;
  const lw = Math.max(1, Math.round(w * s));
  const lh = Math.max(1, Math.round(h * s));
  // CPU raster surface: tiny, and works the same on native and web.
  const surface = Skia.Surface.Make(lw, lh);
  if (!surface) return image;
  surface.getCanvas().drawImageRectCubic(image, Skia.XYWHRect(0, 0, w, h), Skia.XYWHRect(0, 0, lw, lh), 1 / 3, 1 / 3);
  surface.flush();
  const out = surface.makeImageSnapshot();
  surface.dispose();
  cache.set(image, out);
  return out;
}
