import type { Geometry, NormalizedPoint } from '@/types/editing';

/**
 * Source image ↔ visible frame coordinates (after rotate → flip → crop).
 * Pure math with no native imports, shared by the preview, the export and
 * the face-warp engine (and its tests).
 */

export function rotatedSize(width: number, height: number, rotation: Geometry['rotation']) {
  return rotation % 180 === 0 ? { width, height } : { width: height, height: width };
}

/** Source-normalised point → frame-normalised. */
export function sourceToFrame(pt: NormalizedPoint, g: Geometry): NormalizedPoint {
  let { x, y } = pt;
  // expo-image-manipulator rotates clockwise.
  if (g.rotation === 90) [x, y] = [1 - y, x];
  else if (g.rotation === 180) [x, y] = [1 - x, 1 - y];
  else if (g.rotation === 270) [x, y] = [y, 1 - x];
  if (g.flipH) x = 1 - x;
  if (g.flipV) y = 1 - y;
  const c = g.crop;
  return c ? { x: (x - c.x) / c.width, y: (y - c.y) / c.height } : { x, y };
}

/** Inverse of {@link sourceToFrame}. */
export function frameToSource(pt: NormalizedPoint, g: Geometry): NormalizedPoint {
  let { x, y } = pt;
  const c = g.crop;
  if (c) {
    x = c.x + x * c.width;
    y = c.y + y * c.height;
  }
  if (g.flipH) x = 1 - x;
  if (g.flipV) y = 1 - y;
  if (g.rotation === 90) [x, y] = [y, 1 - x];
  else if (g.rotation === 180) [x, y] = [1 - x, 1 - y];
  else if (g.rotation === 270) [x, y] = [1 - y, x];
  return { x, y };
}

/** Size of the visible frame in source pixels. */
export function frameSize(srcW: number, srcH: number, g: Geometry) {
  const turned = rotatedSize(srcW, srcH, g.rotation);
  return { width: turned.width * (g.crop?.width ?? 1), height: turned.height * (g.crop?.height ?? 1) };
}
