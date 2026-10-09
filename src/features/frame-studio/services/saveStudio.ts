import { loadExportBank } from '@/image-engine/frame/FrameAssetLoader';
import { EXPORT_LONG_SIDE_HQ, EXPORT_LONG_SIDE_STD, exportSize, renderDocumentImage } from '@/image-engine/frame/FrameExport';
import { encodeExport } from '@/services/exportEncoding';
import { writeImage } from '@/services/exportImage';
import type { ImageFile } from '@/services/imagePipeline';
import type { ExportFormat, JpegQuality } from '@/types/settings';

import type { StudioDocument } from '../types/document';

export interface StudioExportOptions {
  highQuality: boolean;
  format: ExportFormat;
  quality: JpegQuality;
}

/**
 * Renders the document at output resolution (4096 px long side in high
 * quality, 2048 otherwise) from the original images and writes a JPEG / PNG.
 */
export async function exportStudio(doc: StudioDocument, opts: StudioExportOptions): Promise<ImageFile> {
  const { width, height, scale } = exportSize(doc, opts.highQuality ? EXPORT_LONG_SIDE_HQ : EXPORT_LONG_SIDE_STD);
  const bank = await loadExportBank(doc, scale);
  // GPU offscreen on every platform: the paper and photo shaders at 4096 px
  // take minutes on a CPU surface. On web this costs one extra WebGL context
  // per save (thumbnails stay on CPU; see useStudioAssets).
  const image = renderDocumentImage(doc, bank, width, height, true);
  const bytes = encodeExport(image, opts.format, opts.quality);
  image.dispose();
  for (const img of bank.images.values()) img.dispose();
  return { uri: writeImage(bytes, 'lumi-frame', opts.format), width, height };
}
