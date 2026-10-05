import {
  BlurMask,
  Circle,
  Group,
  LinearGradient,
  Oval,
  Rect,
  vec,
  type SkImage,
} from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';

import { renderOffscreen } from '@/render/offscreen';
import { loadSkImage } from '@/services/exportImage';
import { normalizeImage, THUMB_MAX_SIDE } from '@/services/imagePipeline';

/**
 * Small source image for filter thumbnails: the user's latest photo when
 * there is one, otherwise a procedurally drawn golden-hour scene (sky, sun,
 * sea, a peach bloom) that shows off each look's colour response.
 */

const SAMPLE_W = 540;
const SAMPLE_H = 720;
let samplePromise: Promise<SkImage | null> | null = null;

function drawSample(): Promise<SkImage | null> {
  const w = SAMPLE_W;
  const h = SAMPLE_H;
  const horizon = h * 0.58;
  const u = w / 180;
  return renderOffscreen(
    <Group>
      <Rect x={0} y={0} width={w} height={horizon}>
        <LinearGradient start={vec(0, 0)} end={vec(0, horizon)} colors={['#9DB4C9', '#E7C2AA', '#F4B78E', '#F0A47C']} />
      </Rect>
      <Circle cx={w * 0.64} cy={horizon - 26 * u} r={18 * u} color="#FFE8C4">
        <BlurMask blur={8 * u} style="solid" />
      </Circle>
      <Rect x={0} y={horizon} width={w} height={h - horizon}>
        <LinearGradient start={vec(0, horizon)} end={vec(0, h)} colors={['#D59A7E', '#7D6C72', '#3E4656']} />
      </Rect>
      <Rect x={w * 0.5} y={horizon + 4 * u} width={w * 0.3} height={2 * u} color="#FFE2BE" opacity={0.7} />
      <Rect x={w * 0.56} y={horizon + 12 * u} width={w * 0.18} height={2 * u} color="#FFE2BE" opacity={0.5} />
      <Group>
        <Oval x={w * 0.06} y={h * 0.7} width={w * 0.42} height={h * 0.26} color="#F2C2B0" />
        <Oval x={w * 0.14} y={h * 0.74} width={w * 0.26} height={h * 0.16} color="#E9A694" />
        <Oval x={w * 0.2} y={h * 0.78} width={w * 0.13} height={h * 0.08} color="#C9786A" />
        <Oval x={w * 0.4} y={h * 0.82} width={w * 0.24} height={h * 0.12} color="#8E9A6C" />
      </Group>
    </Group>,
    w,
    h,
  );
}

export function getSampleImage(): Promise<SkImage | null> {
  // Offscreen renders are GPU textures bound to their own context; a raster
  // copy can be drawn by every canvas (required on web).
  if (!samplePromise) samplePromise = drawSample().then((img) => img?.makeNonTextureImage() ?? img).catch(() => null);
  return samplePromise;
}

const thumbCache = new Map<string, Promise<SkImage | null>>();

function loadThumb(uri: string, maxSide: number): Promise<SkImage | null> {
  const key = `${maxSide}:${uri}`;
  let p = thumbCache.get(key);
  if (!p) {
    p = normalizeImage(uri, maxSide, 0.85)
      .then((t) => loadSkImage(t.uri))
      .catch(() => null);
    thumbCache.set(key, p);
    if (thumbCache.size > 8) {
      const first = thumbCache.keys().next().value;
      if (first) thumbCache.delete(first);
    }
  }
  return p;
}

/**
 * @param uri photo to preview; falls back to the sample scene.
 * @param maxSide longest side of the decoded preview.
 */
export function usePreviewImage(uri: string | null | undefined, maxSide = THUMB_MAX_SIDE): SkImage | null {
  const [image, setImage] = useState<SkImage | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const img = (uri ? await loadThumb(uri, maxSide) : null) ?? (await getSampleImage());
      if (alive) setImage(img);
    })();
    return () => {
      alive = false;
    };
  }, [uri, maxSide]);
  return image;
}
