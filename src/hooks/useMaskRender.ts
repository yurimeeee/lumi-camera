import { useEffect, useMemo, useState } from 'react';

import { backgroundActive } from '@/constants/masks';
import { maskRasterKey, tileSize, type MaskAtlas } from '@/services/masks/maskRaster';
import { buildMaskAtlas, loadMaskImages, maskImageUris, MaskPlaneCache, subjectAsMask } from '@/services/masks/maskRender';
import { maskUniforms, renderSlots, type MaskUniforms } from '@/services/masks/shader';
import type { Geometry, SourceImage } from '@/types/editing';
import type { BackgroundEdit, SelectiveMask } from '@/types/phase4';

import type { SkImage } from '@shopify/react-native-skia';

/**
 * Preview side of the mask stage: the same atlas and uniforms the export
 * builds (services/masks), kept between frames. Planes are cached by their
 * pixel-relevant content, so moving an adjustment slider only rebuilds the
 * uniforms and a brush stroke only redraws its own mask.
 */
export function useMaskRender(
  masks: readonly SelectiveMask[],
  background: BackgroundEdit,
  overlayId: string | null,
  geometry: Geometry,
  source: SourceImage | null,
): { atlas: MaskAtlas | null; uniforms: MaskUniforms; active: boolean } {
  const [cache] = useState(() => new MaskPlaneCache());
  const slots = useMemo(() => renderSlots(masks, overlayId), [masks, overlayId]);
  const bg = backgroundActive(background) ? background : null;

  // AI mask images (files) load asynchronously; render without them meanwhile.
  const uris = useMemo(() => maskImageUris(slots, bg), [slots, bg]);
  const urisKey = uris.join('|');
  const [images, setImages] = useState<{ key: string; map: Map<string, SkImage> }>({ key: '', map: new Map() });
  useEffect(() => {
    if (!urisKey) return;
    let alive = true;
    loadMaskImages(urisKey.split('|')).then((map) => alive && setImages({ key: urisKey, map }));
    return () => {
      alive = false;
    };
  }, [urisKey]);
  const imageMap = images.key === urisKey ? images.map : null;

  // Pixel content of the atlas (not the adjustment values).
  const atlasKey = useMemo(() => {
    if (!source || (slots.length === 0 && !bg?.subject)) return '';
    const ctx = { geometry, srcW: source.width, srcH: source.height };
    const t = tileSize(ctx);
    const parts = slots.map((m) => maskRasterKey(m, ctx, t.width, t.height));
    if (bg?.subject) parts.push(maskRasterKey(subjectAsMask(bg.subject), ctx, t.width, t.height));
    return `${parts.join('#')}|${imageMap ? images.key : 'loading'}`;
  }, [slots, bg?.subject, geometry, source, imageMap, images.key]);

  const atlas = useMemo(() => {
    if (!atlasKey || !source) return null;
    try {
      return buildMaskAtlas(slots, bg, { geometry, srcW: source.width, srcH: source.height, images: imageMap ?? new Map() }, cache);
    } catch (e) {
      if (__DEV__) console.warn('[masks]', e);
      return null;
    }
    // atlasKey captures everything that changes the atlas' pixels.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atlasKey]);

  useEffect(() => {
    if (!atlas) return;
    // Freed a little after it is replaced, once no frame can still draw it.
    return () => void setTimeout(() => atlas.image.dispose(), 500);
  }, [atlas]);

  // The background stage waits for its subject mask (without it everything would count as background).
  const bgReady = bg?.subject && atlas && imageMap?.has(bg.subject.uri) ? bg : null;
  const uniforms = useMemo(() => maskUniforms(slots, atlas, overlayId, bgReady), [slots, atlas, overlayId, bgReady]);
  return { atlas, uniforms, active: uniforms.uMaskCount > 0 || uniforms.uBgEdge[2] === 1 };
}
