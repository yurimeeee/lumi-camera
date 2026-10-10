import type { SkImage } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';

import { backgroundActive } from '@/constants/masks';
import { previewImage } from '@/image-engine/frame/FrameAssetLoader';
import { backgroundBank, BG_PREVIEW_SIDE, buildBackgroundLayer } from '@/services/masks/backgroundLayer';
import { loadMaskImages } from '@/services/masks/maskRender';
import type { Geometry, SourceImage } from '@/types/editing';
import type { BackgroundEdit } from '@/types/phase4';

/**
 * Preview layer for the background stage: rebuilt (asynchronously) when what
 * it shows changes — the photo, geometry, subject, mode, blur size or the
 * replacement — not for strength, brightness or saturation (uniforms).
 */
export function useBackgroundLayer(base: SkImage | null, background: BackgroundEdit, geometry: Geometry, source: SourceImage | null): SkImage | null {
  const [layer, setLayer] = useState<{ key: string; image: SkImage } | null>(null);
  const on = backgroundActive(background) && background.mode !== 'none';
  const key = on && base && source
    ? JSON.stringify([source.uri, base.width(), base.height(), geometry, background.subject?.uri, background.mode, background.mode === 'blur' ? background.blur.radius : background.replace])
    : '';

  useEffect(() => {
    if (!key || !base || !source || !background.subject) return;
    let alive = true;
    const subjectRef = background.subject;
    // Coalesce rapid changes (a slider drag over the replacement's adjustments).
    const timer = setTimeout(async () => {
      try {
        const [images, bank] = await Promise.all([loadMaskImages([subjectRef.uri]), backgroundBank(background, previewImage)]);
        const subject = images.get(subjectRef.uri);
        if (!alive || !subject) return;
        const image = buildBackgroundLayer({ base, background, geometry, srcW: source.width, srcH: source.height, subject, side: BG_PREVIEW_SIDE, bank });
        if (alive && image) setLayer({ key, image });
      } catch (e) {
        if (__DEV__) console.warn('[background]', e);
      }
    }, 60);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // `key` captures every input that changes the layer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!layer) return;
    const img = layer.image;
    return () => void setTimeout(() => img.dispose(), 500);
  }, [layer]);

  // Keep showing the previous layer while the next one builds (no flash of the unblurred photo).
  return on ? (layer?.image ?? null) : null;
}
