import { ImageFormat, type SkImage } from '@shopify/react-native-skia';
import { useEffect, useRef, useState } from 'react';
import { PixelRatio } from 'react-native';

import { LumiLayer } from '@/render/LumiLayer';
import { renderOffscreen } from '@/render/offscreen';
import { lookRender, type Look } from '@/services/imageProcessing';

/**
 * Filter thumbnails are rendered once, offscreen, and shown as plain images.
 * This keeps lists of 20+ previews cheap (no live GPU surface per cell) and
 * avoids the browser's cap on simultaneous WebGL contexts on web.
 */

const cache = new WeakMap<SkImage, Map<string, Promise<string | null>>>();

// Serialise renders so a long list doesn't spike GPU/memory all at once.
let queue: Promise<unknown> = Promise.resolve();

function render(image: SkImage, look: Look, width: number, height: number): Promise<string | null> {
  const scale = Math.min(3, PixelRatio.get());
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const { uniforms, curves } = lookRender(look, w, h);
  const job = queue.then(async () => {
    const out = await renderOffscreen(
      <LumiLayer image={image} width={w} height={h} fit="cover" uniforms={uniforms} curves={curves} />,
      w,
      h,
    );
    return out ? `data:image/jpeg;base64,${out.encodeToBase64(ImageFormat.JPEG, 88)}` : null;
  });
  queue = job.catch(() => null);
  return job.catch(() => null);
}

export function useFilterThumbnail(image: SkImage | null, filterId: string, width: number, height: number) {
  return useLookThumbnail(image, filterId, null, width, height);
}

/**
 * Thumbnail of any look (filter at 100, or a My Recipe). `key` identifies the
 * look's content — change it whenever the look changes (e.g. recipe updatedAt).
 */
export function useLookThumbnail(image: SkImage | null, key: string, look: Look | null, width: number, height: number) {
  const [uri, setUri] = useState<string | null>(null);
  // The look is identified by `key`; read the latest one when rendering.
  const lookRef = useRef(look);
  useEffect(() => {
    lookRef.current = look;
  }, [look]);

  useEffect(() => {
    if (!image) return;
    let alive = true;
    let byImage = cache.get(image);
    if (!byImage) {
      byImage = new Map();
      cache.set(image, byImage);
    }
    const cacheKey = `${key}@${width}x${height}`;
    let p = byImage.get(cacheKey);
    if (!p) {
      p = render(image, lookRef.current ?? { filterId: key, intensity: 100 }, width, height);
      byImage.set(cacheKey, p);
    }
    p.then((u) => alive && setUri(u));
    return () => {
      alive = false;
    };
  }, [image, key, width, height]);

  return uri;
}
