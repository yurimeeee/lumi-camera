import { ImageFormat, Skia, type SkCanvas, type SkImage } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { PixelRatio, Platform } from 'react-native';

import { getSampleImage } from '@/hooks/usePreviewImage';
import type { AssetBank } from '@/image-engine/frame/bank';
import { loadKit, loadPreviewBank, previewImage } from '@/image-engine/frame/FrameAssetLoader';

import { documentImages } from '../model/document';
import type { ImageRef, StudioDocument } from '../types/document';

/**
 * Preview asset bank for the document: kit assets + screen-size copies of
 * every image it draws. The previous bank stays in use while new images
 * load, so adding a photo never blanks the canvas.
 */
export function usePreviewBank(doc: StudioDocument | null): AssetBank | null {
  const [bank, setBank] = useState<AssetBank | null>(null);
  const key = doc ? [...documentImages(doc).map((r) => r.uri), ...Object.keys(doc.imports)].join('|') : '';
  useEffect(() => {
    if (!doc) return;
    let alive = true;
    loadPreviewBank(doc)
      .then((b) => alive && setBank(b))
      .catch((e) => __DEV__ && console.warn('[studio] assets', e));
    return () => {
      alive = false;
    };
    // The document's image set (key) is what matters, not every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return bank;
}

/** The photo thumbnails show: the first photo of the project, or Lumi's sample scene. */
export function useThumbPhoto(ref: ImageRef | null | undefined): { image: SkImage | null; key: string } {
  // Image and key change together, so a thumbnail is never cached under the
  // photo's key while the previous image is still showing.
  const [state, setState] = useState<{ image: SkImage | null; key: string }>({ image: null, key: 'none' });
  const uri = ref?.uri ?? null;
  useEffect(() => {
    let alive = true;
    (async () => {
      const own = ref ? await previewImage(ref) : null;
      const img = own ?? (await getSampleImage());
      if (alive) setState({ image: img, key: own ? uri! : 'sample' });
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);
  return state;
}

/** Kit-only bank (thumbnails). */
export function useKitBank(): AssetBank | null {
  const [bank, setBank] = useState<AssetBank | null>(null);
  useEffect(() => {
    let alive = true;
    loadKit()
      .then((k) => alive && setBank({ ...k, images: new Map() }))
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, []);
  return bank;
}

// ── Thumbnails ──────────────────────────────────────────────────

const thumbCache = new Map<string, string | null>();
const THUMB_CACHE = 160;

/**
 * Renders a small image with `draw` and caches it as a data URI under `key`.
 * Native draws on a GPU offscreen surface (paper / photo shaders stay off
 * the JS thread's CPU); web uses a CPU surface, since every WebGL offscreen
 * surface is a new browser context and lists would exhaust them.
 */
export function renderThumbnail(key: string, width: number, height: number, draw: (canvas: SkCanvas, scale: number) => void): string | null {
  if (thumbCache.has(key)) return thumbCache.get(key)!;
  const scale = Math.min(3, PixelRatio.get());
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  let uri: string | null = null;
  try {
    const surface = (Platform.OS === 'web' ? null : Skia.Surface.MakeOffscreen(w, h)) ?? Skia.Surface.Make(w, h);
    if (surface) {
      draw(surface.getCanvas(), scale);
      surface.flush();
      const snap = surface.makeImageSnapshot();
      const img = snap.makeNonTextureImage() ?? snap;
      uri = `data:image/png;base64,${img.encodeToBase64(ImageFormat.PNG, 100)}`;
      surface.dispose();
    }
  } catch (e) {
    if (__DEV__) console.warn('[studio] thumbnail', e);
  }
  thumbCache.set(key, uri);
  if (thumbCache.size > THUMB_CACHE) thumbCache.delete(thumbCache.keys().next().value!);
  return uri;
}

/** Cached thumbnail, rendered after mount (keeps scrolling lists responsive). */
export function useThumbnail(key: string | null, width: number, height: number, draw: (canvas: SkCanvas, scale: number) => void): string | null {
  const [rendered, setRendered] = useState<{ key: string; uri: string | null } | null>(null);
  const drawRef = useMemo(() => ({ draw }), [draw]);
  const cached = key !== null && thumbCache.has(key);
  useEffect(() => {
    if (!key || cached) return;
    const t = setTimeout(() => setRendered({ key, uri: renderThumbnail(key, width, height, drawRef.draw) }), 0);
    return () => clearTimeout(t);
  }, [key, cached, width, height, drawRef]);
  if (!key) return null;
  if (cached) return thumbCache.get(key) ?? null;
  return rendered?.key === key ? rendered.uri : null;
}
