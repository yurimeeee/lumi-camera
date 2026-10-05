import { Group, ImageFormat, Skia, type SkImage, type SkTypeface } from '@shopify/react-native-skia';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { getFilter } from '@/constants/filters';
import { DateStampLayer } from '@/render/DateStampLayer';
import { LumiLayer } from '@/render/LumiLayer';
import { renderOffscreen } from '@/render/offscreen';
import type { EditState, SourceImage } from '@/types/editing';
import type { DateFormat } from '@/types/settings';
import { formatDateStamp } from '@/utils/dateStamp';

import { withExif } from './exif';
import { applyGeometry, EXPORT_MAX_SIDE_HQ, EXPORT_MAX_SIDE_STD, type ImageFile } from './imagePipeline';
import { buildUniforms, isIdentity, resolveProcessing } from './imageProcessing';
import type { GeoPoint } from './location';

export interface ExportOptions {
  highQuality: boolean;
  dateFormat: DateFormat;
  stampTypeface: SkTypeface | null;
  location?: GeoPoint | null;
}

const isWeb = Platform.OS === 'web';

export async function loadSkImage(uri: string): Promise<SkImage> {
  const data = await Skia.Data.fromURI(uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) throw new Error('이미지를 열 수 없어요.');
  return image;
}

function writeJpeg(bytes: Uint8Array, prefix: string): string {
  if (isWeb) {
    // No file system on web: hand back a data URL for download.
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
    }
    return `data:image/jpeg;base64,${btoa(bin)}`;
  }
  const file = new File(Paths.cache, `${prefix}-${Date.now()}.jpg`);
  file.create({ overwrite: true });
  file.write(bytes);
  return file.uri;
}

/**
 * Renders the final edited photo at export resolution:
 * geometry (native) → Lumi shader + date stamp (Skia, offscreen) → JPEG + EXIF.
 */
export async function renderEdit(source: SourceImage, edit: EditState, opts: ExportOptions): Promise<ImageFile> {
  const maxSide = opts.highQuality ? EXPORT_MAX_SIDE_HQ : EXPORT_MAX_SIDE_STD;
  const quality = opts.highQuality ? 95 : 85;

  const base = await applyGeometry(source, edit.geometry, maxSide);
  const image = await loadSkImage(base.uri);
  const width = image.width();
  const height = image.height();

  const processing = resolveProcessing({
    filter: getFilter(edit.filterId),
    intensity: edit.intensity,
    adjustments: edit.adjustments,
    retouch: edit.retouch,
  });
  const uniforms = isIdentity(processing) ? null : buildUniforms(processing, width, height);
  const stamp =
    edit.dateStamp && opts.stampTypeface ? formatDateStamp(source.takenAt, opts.dateFormat) : null;

  const rendered = await renderOffscreen(
    <Group>
      <LumiLayer image={image} width={width} height={height} uniforms={uniforms} />
      {stamp && opts.stampTypeface ? (
        <DateStampLayer text={stamp} typeface={opts.stampTypeface} width={width} height={height} />
      ) : null}
    </Group>,
    width,
    height,
  );
  if (!rendered) throw new Error('사진을 렌더링하지 못했어요.');

  const raster = rendered.makeNonTextureImage() ?? rendered;
  const jpeg = raster.encodeToBytes(ImageFormat.JPEG, quality);
  if (!jpeg || jpeg.length === 0) throw new Error('사진을 인코딩하지 못했어요.');

  const tagged = withExif(jpeg, { takenAt: source.takenAt, location: opts.location });
  return { uri: writeJpeg(tagged, 'lumi'), width, height };
}

/**
 * Unfiltered copy of a capture (already ratio-cropped and upright) tagged with
 * Lumi's EXIF (date / optional GPS). Used by "원본 사진 함께 저장".
 */
export async function prepareOriginal(source: SourceImage, location?: GeoPoint | null): Promise<string> {
  if (isWeb) return source.uri;
  const bytes = await new File(source.uri).bytes();
  return writeJpeg(withExif(bytes, { takenAt: source.takenAt, location }), 'lumi-original');
}
