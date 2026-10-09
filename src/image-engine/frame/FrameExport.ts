import { Skia, type SkImage } from '@shopify/react-native-skia';

import type { StudioDocument } from '@/features/frame-studio/types/document';

import type { AssetBank } from './bank';
import { drawDocument } from './FrameCompositor';

/**
 * High-resolution export of a Frame Studio document. Never a screenshot of
 * the preview: the document is drawn again, from the original photos and the
 * kit's assets, into an offscreen surface at output size.
 */

export const EXPORT_LONG_SIDE_HQ = 4096;
export const EXPORT_LONG_SIDE_STD = 2048;

export function exportSize(doc: Pick<StudioDocument, 'width' | 'height'>, longSide: number) {
  const scale = longSide / Math.max(doc.width, doc.height);
  return { width: Math.round(doc.width * scale), height: Math.round(doc.height * scale), scale };
}

/**
 * Draws `doc` at `scale` px per canvas unit into a new surface and returns a
 * raster (CPU) image. `gpu` uses an offscreen GPU surface (native); the CPU
 * surface is used on web (WebGL context limits) and in tests.
 */
export function renderDocumentImage(doc: StudioDocument, bank: AssetBank, width: number, height: number, gpu: boolean): SkImage {
  const surface = (gpu ? Skia.Surface.MakeOffscreen(width, height) : null) ?? Skia.Surface.Make(width, height);
  if (!surface) throw new Error('사진을 렌더링하지 못했어요.');
  const scale = width / doc.width;
  drawDocument(surface.getCanvas(), doc, bank, { scale });
  surface.flush();
  const snapshot = surface.makeImageSnapshot();
  const raster = snapshot.makeNonTextureImage() ?? snapshot;
  surface.dispose();
  return raster;
}

/** Records the preview: the same drawing, as a picture at screen scale. */
export function recordDocument(doc: StudioDocument, bank: AssetBank, scale: number, selection: Parameters<typeof drawDocument>[3]['selection']) {
  const recorder = Skia.PictureRecorder();
  const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, doc.width * scale, doc.height * scale));
  drawDocument(canvas, doc, bank, { scale, selection });
  return recorder.finishRecordingAsPicture();
}
