import type { SkImage } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';

import { loadSkImage } from '@/services/exportImage';
import { applyGeometry, PREVIEW_MAX_SIDE } from '@/services/imagePipeline';
import type { Geometry, SourceImage } from '@/types/editing';

export interface WorkingImage {
  /** Encoded file of `image` (used for face detection). */
  uri: string;
  image: SkImage;
  width: number;
  height: number;
}

/**
 * Preview-resolution image with geometry baked in. Geometry only changes on
 * discrete actions (rotate/flip/crop), so this re-renders rarely; colour
 * work stays in the shader and never touches this image.
 */
const cache = new Map<string, Promise<WorkingImage>>();
const CACHE_LIMIT = 6;

function keyOf(source: SourceImage, g: Geometry) {
  const c = g.crop;
  return [source.uri, g.rotation, g.flipH ? 1 : 0, g.flipV ? 1 : 0, c ? [c.x, c.y, c.width, c.height].map((n) => n.toFixed(4)).join(',') : '-'].join('|');
}

async function build(source: SourceImage, geometry: Geometry): Promise<WorkingImage> {
  const file = await applyGeometry(source, geometry, PREVIEW_MAX_SIDE, 0.92);
  const image = await loadSkImage(file.uri);
  return { uri: file.uri, image, width: image.width(), height: image.height() };
}

export function useWorkingImage(source: SourceImage | null, geometry: Geometry): WorkingImage | null {
  const [state, setState] = useState<{ key: string; value: WorkingImage } | null>(null);
  const key = source ? keyOf(source, geometry) : '';

  useEffect(() => {
    if (!source) return;
    let alive = true;
    let p = cache.get(key);
    if (!p) {
      p = build(source, geometry);
      cache.set(key, p);
      p.catch(() => cache.delete(key));
      if (cache.size > CACHE_LIMIT) {
        const first = cache.keys().next().value;
        if (first) cache.delete(first);
      }
    }
    p.then((value) => alive && setState({ key, value })).catch(() => undefined);
    return () => {
      alive = false;
    };
    // `key` fully describes source+geometry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Keep showing the previous image while the next geometry renders.
  return state?.value ?? null;
}
