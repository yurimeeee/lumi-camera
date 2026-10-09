import { Group, rect, rrect, Skia, type SkImage, type SkTypeface } from '@shopify/react-native-skia';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { getFilter } from '@/constants/filters';
import { DateStampLayer } from '@/render/DateStampLayer';
import { FrameLayer } from '@/render/FrameLayer';
import { frameLayout } from '@/render/frameLayout';
import { LumiLayer } from '@/render/LumiLayer';
import { renderOffscreen } from '@/render/offscreen';
import type { EditState, SourceImage } from '@/types/editing';
import type { ExportFormat, JpegQuality } from '@/types/settings';
import { formatDateStamp, stampDateOf } from '@/utils/dateStamp';

import { withExif } from './exif';
import { encodeExport } from './exportEncoding';
import { detectFaces } from './faceDetection/FaceDetector';
import { assignFaceIds } from './faceDetection/faceIdentity';
import { faceRender, needsFaces } from './faceWarp/faceRender';
import { applyGeometry, EXPORT_MAX_SIDE_HQ, EXPORT_MAX_SIDE_STD, type ImageFile } from './imagePipeline';
import { buildUniforms, isIdentity, resolveProcessing } from './imageProcessing';
import { spotUniforms } from './blemish';
import { buildReshapeField } from './reshape';
import type { GeoPoint } from './location';

export interface ExportOptions {
  highQuality: boolean;
  format: ExportFormat;
  /** JPEG only. */
  quality: JpegQuality;
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

function writeImage(bytes: Uint8Array, prefix: string, format: ExportFormat = 'jpeg'): string {
  if (isWeb) {
    // No file system on web: hand back a data URL for download.
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
    }
    return `data:image/${format};base64,${btoa(bin)}`;
  }
  const file = new File(Paths.cache, `${prefix}-${Date.now()}.${format === 'png' ? 'png' : 'jpg'}`);
  file.create({ overwrite: true });
  file.write(bytes);
  return file.uri;
}

/**
 * Renders the final edited photo at export resolution:
 * geometry (native) → Lumi shader (face warp → skin → colour → filter / mix
 * → film effects) + date stamp + frame (Skia, offscreen) → JPEG/PNG + EXIF.
 * The photo keeps its own resolution and aspect; a frame adds its border
 * around it.
 */
export async function renderEdit(source: SourceImage, edit: EditState, opts: ExportOptions): Promise<ImageFile> {
  const maxSide = opts.highQuality ? EXPORT_MAX_SIDE_HQ : EXPORT_MAX_SIDE_STD;

  const base = await applyGeometry(source, edit.geometry, maxSide);
  const image = await loadSkImage(base.uri);
  const width = image.width();
  const height = image.height();

  const processing = resolveProcessing({
    filter: getFilter(edit.filterId),
    intensity: edit.intensity,
    mix: edit.mix,
    adjustments: edit.adjustments,
    retouch: edit.retouch,
    hsl: edit.hsl,
    curves: edit.curves,
    film: edit.film,
  });
  // Face retouch: the same source landmarks the preview used (cached per
  // image, matched to the edit's faces by anchor), mapped through this
  // export's geometry and evaluated at full resolution — never a screenshot
  // of the preview.
  const detected = needsFaces(edit) ? await detectFaces(source).catch(() => []) : [];
  const faces = assignFaceIds(detected, edit.faceAnchors, source.width, source.height);
  const face = faceRender(faces, edit, edit.geometry, width, height);
  const reshape = edit.reshape.length
    ? buildReshapeField(edit.reshape, edit.geometry, source.width, source.height).toTextures()
    : null;
  const uniforms =
    isIdentity(processing) && !reshape && edit.spots.length === 0 && !face.active
      ? null
      : buildUniforms(
          processing,
          width,
          height,
          face.warp,
          spotUniforms(edit.spots, edit.geometry, source, width, height),
          face.regions,
        );
  const date = stampDateOf(source, edit);
  const stamp = edit.dateStamp && opts.stampTypeface && date !== null ? formatDateStamp(date, edit.stamp.format) : null;
  const layout = frameLayout(edit.frame, width, height);
  const { photo } = layout;

  const rendered = await renderOffscreen(
    <Group>
      <FrameLayer frame={edit.frame} layout={layout} />
      <Group
        transform={[{ translateX: photo.x }, { translateY: photo.y }]}
        clip={layout.radius > 0 ? rrect(rect(0, 0, width, height), layout.radius, layout.radius) : undefined}
      >
        <LumiLayer
          image={image}
          width={width}
          height={height}
          uniforms={uniforms}
          reshape={reshape}
          curves={processing.curves}
          mixCurves={processing.mix?.curves ?? null}
        />
        {stamp && opts.stampTypeface ? (
          <DateStampLayer
            text={stamp}
            typeface={opts.stampTypeface}
            width={width}
            height={height}
            position={edit.stamp.position}
            color={edit.stamp.color}
            size={edit.stamp.size}
          />
        ) : null}
      </Group>
    </Group>,
    layout.width,
    layout.height,
  );
  reshape?.x.dispose();
  reshape?.y.dispose();
  if (!rendered) throw new Error('사진을 렌더링하지 못했어요.');

  const raster = rendered.makeNonTextureImage() ?? rendered;
  const bytes = encodeExport(raster, opts.format, opts.quality);
  // EXIF (date, optional GPS) is written for JPEG; PNG carries no EXIF here.
  const out = opts.format === 'jpeg' ? withExif(bytes, { takenAt: source.takenAt, location: opts.location }) : bytes;
  return { uri: writeImage(out, 'lumi', opts.format), width: layout.width, height: layout.height };
}


/**
 * Unfiltered copy of a capture (already ratio-cropped and upright) tagged with
 * Lumi's EXIF (date / optional GPS). Used by "원본 사진 함께 저장".
 */
export async function prepareOriginal(source: SourceImage, location?: GeoPoint | null): Promise<string> {
  if (isWeb) return source.uri;
  const bytes = await new File(source.uri).bytes();
  return writeImage(withExif(bytes, { takenAt: source.takenAt, location }), 'lumi-original');
}
