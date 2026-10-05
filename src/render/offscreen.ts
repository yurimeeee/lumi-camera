import { drawAsImage, drawAsPicture, Skia, type SkImage } from '@shopify/react-native-skia';
import type { ReactElement } from 'react';
import { Platform } from 'react-native';

/**
 * Renders Skia nodes to an image without a visible canvas.
 *
 * Native: GPU offscreen surface (fast, also for full-resolution export).
 * Web: CPU raster surface. Each GPU offscreen render on web creates a new
 * WebGL context and browsers only keep ~16 alive, so GPU renders for
 * thumbnails would eventually kill the editor's on-screen canvas.
 */
export async function renderOffscreen(element: ReactElement, width: number, height: number): Promise<SkImage | null> {
  if (Platform.OS !== 'web') return drawAsImage(element, { width, height });
  const picture = await drawAsPicture(element, { x: 0, y: 0, width, height });
  const surface = Skia.Surface.Make(width, height);
  if (!surface) return null;
  surface.getCanvas().drawPicture(picture);
  surface.flush();
  const image = surface.makeImageSnapshot();
  surface.dispose();
  return image;
}
