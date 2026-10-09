import { AlphaType, ColorType, Skia, type SkImage } from '@shopify/react-native-skia';

import { curveTableBytes, LUT_SIZE } from './curves';

/**
 * 256×2 RGBA lookup textures for the shader's `curveLut` child: row 0 is
 * look A (filter + user curves), row 1 look B (filter mix). Small (2 KB) and
 * keyed by content, so preview, thumbnails and export share them and a slider
 * drag that doesn't change the curves never re-uploads anything.
 */

const cache = new Map<string, SkImage>();
const CACHE_LIMIT = 48;

function keyOf(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 4) s += String.fromCharCode(bytes[i]!, bytes[i + 1]!, bytes[i + 2]!);
  return s;
}

export const LUT_ROWS = 2;

function make(bytes: Uint8Array): SkImage | null {
  return Skia.Image.MakeImage(
    { width: LUT_SIZE, height: LUT_ROWS, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Opaque },
    Skia.Data.fromBytes(bytes),
    LUT_SIZE * 4,
  );
}

function identityTable(): Float32Array {
  const t = new Float32Array(LUT_SIZE * 3);
  for (let i = 0; i < LUT_SIZE; i++) t[i * 3] = t[i * 3 + 1] = t[i * 3 + 2] = i / (LUT_SIZE - 1);
  return t;
}

/** Both rows as bytes (a missing table is linear). */
export function curveLutBytes(a: Float32Array | null, b: Float32Array | null): Uint8Array {
  const id = identityTable();
  const bytes = new Uint8Array(LUT_SIZE * 4 * LUT_ROWS);
  bytes.set(curveTableBytes(a ?? id), 0);
  bytes.set(curveTableBytes(b ?? id), LUT_SIZE * 4);
  return bytes;
}

export function curveTexture(table: Float32Array | null, mixTable: Float32Array | null = null): SkImage | null {
  const bytes = curveLutBytes(table, mixTable);
  const key = keyOf(bytes);
  const hit = cache.get(key);
  if (hit) {
    // Refresh recency.
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const image = make(bytes);
  if (!image) return null;
  cache.set(key, image);
  // Evict the oldest. Images may still be referenced by a canvas, so they are
  // left to GC instead of being disposed here.
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return image;
}

let identity: SkImage | null = null;

/** Linear LUT, bound when an edit has no curves. */
export function identityCurveTexture(): SkImage {
  if (!identity) identity = make(curveLutBytes(null, null))!;
  return identity;
}
