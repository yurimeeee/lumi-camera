import { Skia, type SkImage } from '@shopify/react-native-skia';

import type { BackgroundEdit, MaskImageRef, SelectiveMask } from '@/types/phase4';

import { maskRasterKey, MASK_TILE_SIDE, packAtlas, rasterizeMask, SUBJECT_CHANNEL, tileSize, type MaskAtlas, type MaskRasterContext } from './maskRaster';

/**
 * Builds the mask atlas for one render target from the edit document. The
 * editor preview and the export both call `buildMaskAtlas` with the same
 * masks and geometry; only the cache differs (the preview keeps planes
 * between frames so a slider drag or a brush stroke only redraws what
 * changed).
 */

export class MaskPlaneCache {
  private planes = new Map<string, Uint8Array>();
  constructor(private readonly limit = 12) {}

  get(key: string, make: () => Uint8Array): Uint8Array {
    const hit = this.planes.get(key);
    if (hit) {
      // Most recently used last.
      this.planes.delete(key);
      this.planes.set(key, hit);
      return hit;
    }
    const plane = make();
    this.planes.set(key, plane);
    while (this.planes.size > this.limit) this.planes.delete(this.planes.keys().next().value!);
    return plane;
  }
}

/** The subject mask as a mask document (drawn exactly like an AI selective mask). */
export function subjectAsMask(image: MaskImageRef): SelectiveMask {
  return {
    id: '__subject',
    name: 'subject',
    visible: true,
    invert: false,
    shape: { kind: 'ai', target: 'subject', image },
    strokes: [],
    adjust: {} as SelectiveMask['adjust'],
  };
}

/**
 * Atlas with `slots` in channels 0…n−1 and, when the background stage is on,
 * the subject mask in SUBJECT_CHANNEL. Null when there is nothing to draw.
 */
export function buildMaskAtlas(
  slots: readonly SelectiveMask[],
  background: BackgroundEdit | null,
  ctx: MaskRasterContext,
  cache: MaskPlaneCache | null = null,
  side = MASK_TILE_SIDE,
): MaskAtlas | null {
  const { width, height } = tileSize(ctx, side);
  const planes = new Map<number, Uint8Array>();
  const plane = (m: SelectiveMask) => {
    const make = () => rasterizeMask(m, ctx, width, height);
    // An AI mask whose image hasn't loaded yet draws empty: never cache that.
    const missing = m.shape.kind === 'ai' && !ctx.images.has(m.shape.image.uri);
    return cache && !missing ? cache.get(maskRasterKey(m, ctx, width, height), make) : make();
  };
  slots.forEach((m, i) => planes.set(i, plane(m)));
  if (background?.subject) planes.set(SUBJECT_CHANNEL, plane(subjectAsMask(background.subject)));
  return packAtlas(planes, width, height);
}

/** Every mask image the document's masks and background reference. */
export function maskImageUris(masks: readonly SelectiveMask[], background: BackgroundEdit | null): string[] {
  const uris = new Set<string>();
  for (const m of masks) if (m.shape.kind === 'ai') uris.add(m.shape.image.uri);
  if (background?.subject) uris.add(background.subject.uri);
  return [...uris];
}

const imageCache = new Map<string, Promise<SkImage>>();

/** Loads (and caches) mask images by uri. */
export async function loadMaskImages(uris: readonly string[]): Promise<Map<string, SkImage>> {
  const out = new Map<string, SkImage>();
  await Promise.all(
    uris.map(async (uri) => {
      let p = imageCache.get(uri);
      if (!p) {
        p = (async () => {
          const data = await Skia.Data.fromURI(uri);
          const img = Skia.Image.MakeImageFromEncoded(data);
          if (!img) throw new Error('마스크 이미지를 열 수 없어요.');
          return img.makeNonTextureImage() ?? img;
        })();
        imageCache.set(uri, p);
        p.catch(() => imageCache.delete(uri));
        if (imageCache.size > 16) imageCache.delete(imageCache.keys().next().value!);
      }
      try {
        out.set(uri, await p);
      } catch {
        // A missing mask file draws as an empty mask instead of failing the render.
      }
    }),
  );
  return out;
}
