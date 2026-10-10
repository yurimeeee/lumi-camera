import { BlendMode, Skia, TileMode, type SkImage, type SkMatrix } from '@shopify/react-native-skia';

import type { AssetBank } from '@/image-engine/frame/bank';
import { loadKit } from '@/image-engine/frame/FrameAssetLoader';
import { drawBackground } from '@/image-engine/frame/FrameCompositor';
import type { Geometry } from '@/types/editing';
import type { BackgroundEdit } from '@/types/phase4';

import { sourceToOutput, tileSize } from './maskRaster';

/**
 * The picture behind the subject for the background stage (shader child
 * `bgLayer`), over the visible frame:
 *
 * - blur: the photo with the subject cut out (alpha = background weight),
 *   blurred as premultiplied colour. The shader divides colour by alpha —
 *   a normalised convolution — so the subject's colours never bleed into the
 *   blurred background as a halo, and the blur fills in behind the subject's
 *   edge from the surrounding background only.
 * - replace: Frame Studio's canvas background (colour, gradient, paper,
 *   texture, album photo with scale / position / blur / brightness /
 *   saturation), drawn by the same function Frame Studio uses.
 *
 * Sizes and blur radii are relative to the frame, so the preview and the
 * export produce the same look at their own resolutions.
 */

export const BG_PREVIEW_SIDE = 1024;
export const BG_EXPORT_SIDE = 2048;

export interface BackgroundLayerInput {
  /** The photo for this frame (geometry applied; object removal composited). */
  base: SkImage;
  background: BackgroundEdit;
  geometry: Geometry;
  srcW: number;
  srcH: number;
  /** The subject mask image (background.subject). */
  subject: SkImage;
  /** Long side of the layer. */
  side: number;
  /** Textures / album images for replacement fills. */
  bank: AssetBank | null;
}

/** Blur sigma as a share of the frame's long side (radius slider 0…100). */
export const blurSigma = (radius: number) => 0.003 + (Math.max(0, Math.min(100, radius)) / 100) * 0.032;

export function buildBackgroundLayer(input: BackgroundLayerInput): SkImage | null {
  const { background: bg } = input;
  if (bg.mode === 'none') return null;
  const { width: w, height: h } = tileSize({ geometry: input.geometry, srcW: input.srcW, srcH: input.srcH }, input.side);

  if (bg.mode === 'replace') {
    const surface = Skia.Surface.Make(w, h);
    if (!surface) return null;
    drawBackground(surface.getCanvas(), { width: w, height: h, background: bg.replace }, input.bank ?? { textures: new Map(), decorations: new Map(), images: new Map(), typeface: null });
    surface.flush();
    const out = surface.makeImageSnapshot();
    surface.dispose();
    return out.makeNonTextureImage() ?? out;
  }

  // Blur: background only (premultiplied), then blurred.
  const keyed = Skia.Surface.Make(w, h);
  if (!keyed) return null;
  const kc = keyed.getCanvas();
  kc.clear(Float32Array.of(0, 0, 0, 0));
  kc.drawImageRectCubic(input.base, Skia.XYWHRect(0, 0, input.base.width(), input.base.height()), Skia.XYWHRect(0, 0, w, h), 1 / 3, 1 / 3);
  // Mask → alpha = background weight, cut a little inside the subject's soft
  // edge (alpha 1 below 0.3 subject, 0 above 0.55) so no subject colour stays.
  const cut = Skia.Paint();
  cut.setBlendMode(BlendMode.DstIn);
  cut.setColorFilter(Skia.ColorFilter.MakeMatrix([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -4, 0, 0, 0, 2.2]));
  kc.save();
  kc.concat(Skia.Matrix(sourceToOutput(input.geometry, input.srcW, input.srcH, w, h)) as SkMatrix);
  kc.drawImageRectCubic(input.subject, Skia.XYWHRect(0, 0, input.subject.width(), input.subject.height()), Skia.XYWHRect(0, 0, input.srcW, input.srcH), 1 / 3, 1 / 3, cut);
  kc.restore();
  keyed.flush();
  const cutOut = keyed.makeImageSnapshot();
  keyed.dispose();

  const blurred = Skia.Surface.Make(w, h);
  if (!blurred) return null;
  const bc = blurred.getCanvas();
  bc.clear(Float32Array.of(0, 0, 0, 0));
  const sigma = blurSigma(bg.blur.radius) * Math.max(w, h);
  const p = Skia.Paint();
  p.setImageFilter(Skia.ImageFilter.MakeBlur(sigma, sigma, TileMode.Decal, null));
  bc.drawImage(cutOut, 0, 0, p);
  blurred.flush();
  const out = blurred.makeImageSnapshot();
  blurred.dispose();
  cutOut.dispose();
  return out.makeNonTextureImage() ?? out;
}

/** Album images a replacement needs (by uri), for the caller to load into the bank. */
export function replacementImages(bg: BackgroundEdit) {
  return bg.mode === 'replace' && bg.replace.fill.kind === 'image' ? [bg.replace.fill.image] : [];
}

/** Kit textures + the replacement's album image, loaded by `load` (preview or export size). */
export async function backgroundBank(bg: BackgroundEdit, load: (ref: { uri: string; width: number; height: number }) => Promise<SkImage | null>): Promise<AssetBank> {
  const kit = bg.mode === 'replace' && bg.replace.fill.kind === 'texture' ? await loadKit().catch(() => null) : null;
  const images = new Map<string, SkImage>();
  for (const ref of replacementImages(bg)) {
    const img = await load(ref);
    if (img) images.set(ref.uri, img);
  }
  return { textures: kit?.textures ?? new Map(), decorations: new Map(), images, typeface: null };
}

