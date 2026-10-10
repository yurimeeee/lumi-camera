import type { SkImage } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';

import { composeRemovals } from '@/services/inpaint/objectRemoval';
import { loadMaskImages } from '@/services/masks/maskRender';
import { sourceToOutput } from '@/services/masks/maskRaster';
import type { Geometry, SourceImage } from '@/types/editing';
import type { ObjectRemoval } from '@/types/phase4';

/**
 * The preview photo with object-removal patches composited (the export does
 * the same with composeRemovals at full size). Null when there is nothing
 * to composite — the canvas then reads the working image directly.
 */
export function useRemovalBase(working: SkImage | null, removals: readonly ObjectRemoval[], geometry: Geometry, source: SourceImage | null): SkImage | null {
  const [state, setState] = useState<{ key: string; image: SkImage } | null>(null);
  const key = working && source && removals.length ? JSON.stringify([source.uri, working.width(), working.height(), geometry, removals.map((r) => r.id)]) : '';

  useEffect(() => {
    if (!key || !working || !source) return;
    let alive = true;
    loadMaskImages(removals.map((r) => r.patch.uri))
      .then((patches) => {
        if (!alive) return;
        const image = composeRemovals(working, removals, patches, sourceToOutput(geometry, source.width, source.height, working.width(), working.height()), source.width, source.height);
        setState({ key, image });
      })
      .catch((e) => __DEV__ && console.warn('[removal]', e));
    return () => {
      alive = false;
    };
    // `key` captures every input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!state) return;
    const img = state.image;
    return () => void setTimeout(() => img.dispose(), 500);
  }, [state]);

  if (!key) return null;
  // Only an image built for this exact frame (a stale one could have another crop / size).
  return state?.key === key ? state.image : null;
}
