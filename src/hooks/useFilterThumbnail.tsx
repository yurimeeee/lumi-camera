import { AlphaType, ColorType, Group, ImageFormat, Skia, type SkImage } from '@shopify/react-native-skia';
import { useEffect, useRef, useState } from 'react';
import { PixelRatio } from 'react-native';

import { LumiLayer } from '@/render/LumiLayer';
import { renderSheet, sheetUsesGpu } from '@/render/offscreen';
import { lookRender, type ShaderLook as Look } from '@/services/imageProcessing';

/**
 * Filter thumbnails are rendered offscreen and shown as plain images.
 * This keeps lists of 20+ previews cheap (no live GPU surface per cell) and
 * avoids the browser's cap on simultaneous WebGL contexts on web.
 *
 * Requests made around the same time (a carousel mounting its cells) are
 * drawn together on one sheet: one GPU pass and one readback for the batch
 * instead of one per thumbnail.
 */

const cache = new WeakMap<SkImage, Map<string, Promise<string | null>>>();

interface Job {
  image: SkImage;
  look: Look;
  /** Pixel size. */
  w: number;
  h: number;
  resolve: (uri: string | null) => void;
}

/** Sheet width cap; rows grow downwards. */
const SHEET_MAX_WIDTH = 2048;
const BATCH_MAX = 24;

let pending: Job[] = [];
let running = false;

async function drain() {
  if (running) return;
  running = true;
  try {
    while (pending.length) {
      const size = sheetUsesGpu() ? BATCH_MAX : 1;
      const batch = pending.slice(0, size);
      pending = pending.slice(size);
      await renderBatch(batch).catch(() => batch.forEach((j) => j.resolve(null)));
    }
  } finally {
    running = false;
  }
}

async function renderBatch(batch: Job[]) {
  const cellW = Math.max(...batch.map((j) => j.w));
  const cellH = Math.max(...batch.map((j) => j.h));
  const cols = Math.max(1, Math.min(batch.length, Math.floor(SHEET_MAX_WIDTH / cellW)));
  const rows = Math.ceil(batch.length / cols);
  const at = (i: number) => ({ x: (i % cols) * cellW, y: Math.floor(i / cols) * cellH });

  const sheet = await renderSheet(
    <Group>
      {batch.map((j, i) => {
        const { x, y } = at(i);
        const { uniforms, curves, mixCurves } = lookRender(j.look, j.w, j.h);
        return (
          <Group key={i} transform={[{ translateX: x }, { translateY: y }]} clip={{ x: 0, y: 0, width: j.w, height: j.h }}>
            <LumiLayer image={j.image} width={j.w} height={j.h} fit="cover" uniforms={uniforms} curves={curves} mixCurves={mixCurves} />
          </Group>
        );
      })}
    </Group>,
    cols * cellW,
    rows * cellH,
  );

  batch.forEach((j, i) => {
    let uri: string | null = null;
    if (sheet) {
      try {
        const { x, y } = at(i);
        const info = { width: j.w, height: j.h, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Premul };
        const pixels = sheet.readPixels(x, y, info);
        const thumb = pixels && Skia.Image.MakeImage(info, Skia.Data.fromBytes(pixels as Uint8Array), j.w * 4);
        if (thumb) {
          uri = `data:image/jpeg;base64,${thumb.encodeToBase64(ImageFormat.JPEG, 88)}`;
          thumb.dispose();
        }
      } catch {
        uri = null;
      }
    }
    j.resolve(uri);
  });
  sheet?.dispose();
}

function render(image: SkImage, look: Look, width: number, height: number): Promise<string | null> {
  const scale = Math.min(3, PixelRatio.get());
  return new Promise((resolve) => {
    pending.push({ image, look, w: Math.round(width * scale), h: Math.round(height * scale), resolve });
    // The other cells of this commit request theirs in the same effects
    // flush, so a microtask is enough to batch them (a macrotask would queue
    // behind other work, e.g. the camera preview starting up).
    queueMicrotask(drain);
  });
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
