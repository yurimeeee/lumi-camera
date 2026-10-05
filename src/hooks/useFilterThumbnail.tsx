import { ImageFormat, type SkImage } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { PixelRatio } from 'react-native';

import { LumiLayer } from '@/render/LumiLayer';
import { renderOffscreen } from '@/render/offscreen';
import { uniformsFor } from '@/services/imageProcessing';

/**
 * Filter thumbnails are rendered once, offscreen, and shown as plain images.
 * This keeps lists of 20+ previews cheap (no live GPU surface per cell) and
 * avoids the browser's cap on simultaneous WebGL contexts on web.
 */

const cache = new WeakMap<SkImage, Map<string, Promise<string | null>>>();

// Serialise renders so a long list doesn't spike GPU/memory all at once.
let queue: Promise<unknown> = Promise.resolve();

function render(image: SkImage, filterId: string, width: number, height: number): Promise<string | null> {
  const scale = Math.min(3, PixelRatio.get());
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const uniforms = filterId === 'original' ? null : uniformsFor(filterId, 100, w, h);
  const job = queue.then(async () => {
    const out = await renderOffscreen(
      <LumiLayer image={image} width={w} height={h} fit="cover" uniforms={uniforms} />,
      w,
      h,
    );
    return out ? `data:image/jpeg;base64,${out.encodeToBase64(ImageFormat.JPEG, 88)}` : null;
  });
  queue = job.catch(() => null);
  return job.catch(() => null);
}

export function useFilterThumbnail(image: SkImage | null, filterId: string, width: number, height: number) {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    if (!image) return;
    let alive = true;
    let byImage = cache.get(image);
    if (!byImage) {
      byImage = new Map();
      cache.set(image, byImage);
    }
    const key = `${filterId}@${width}x${height}`;
    let p = byImage.get(key);
    if (!p) {
      p = render(image, filterId, width, height);
      byImage.set(key, p);
    }
    p.then((u) => alive && setUri(u));
    return () => {
      alive = false;
    };
  }, [image, filterId, width, height]);

  return uri;
}
