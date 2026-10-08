import { ImageFormat, type SkImage } from '@shopify/react-native-skia';

import type { ExportFormat, JpegQuality } from '@/types/settings';

/** Encodes the final render. Throws a user-facing error when the encoder returns nothing. */
export function encodeExport(
  raster: Pick<SkImage, 'encodeToBytes'>,
  format: ExportFormat,
  quality: JpegQuality,
): Uint8Array {
  const bytes =
    format === 'png' ? raster.encodeToBytes(ImageFormat.PNG, 100) : raster.encodeToBytes(ImageFormat.JPEG, quality);
  if (!bytes || bytes.length === 0) throw new Error('사진을 인코딩하지 못했어요.');
  return bytes;
}
