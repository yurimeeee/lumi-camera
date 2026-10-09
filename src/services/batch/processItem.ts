import type { SkTypeface } from '@shopify/react-native-skia';

import { renderEdit } from '@/services/exportImage';
import { EXPORT_MAX_SIDE_HQ, EXPORT_MAX_SIDE_STD, normalizeImage } from '@/services/imagePipeline';
import { LUMI_ALBUM, resolvePhotoFile, saveToLibrary } from '@/services/mediaLibrary';
import { createEditState } from '@/stores/editorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { SourceImage } from '@/types/editing';

import type { BatchItem, BatchJob } from './queue';

/**
 * One batch photo: read (upright, at most the export size, original file
 * untouched) → the job's look as a fresh edit → the same export renderer the
 * editor uses → saved as a new photo. Only this photo is in memory.
 */
export async function processBatchItem(item: BatchItem, job: BatchJob, typeface: SkTypeface | null): Promise<{ uri: string; width: number; height: number }> {
  const settings = useSettingsStore.getState();
  const file =
    item.source.kind === 'asset' ? await resolvePhotoFile(item.source.assetId) : { uri: item.source.uri, takenAt: item.source.takenAt };
  const image = await normalizeImage(file.uri, settings.highQuality ? EXPORT_MAX_SIDE_HQ : EXPORT_MAX_SIDE_STD);
  const source: SourceImage = {
    ...image,
    origin: 'library',
    takenAt: file.takenAt ?? 0,
    dateKnown: file.takenAt !== null,
  };
  const { look } = job;
  const edit = createEditState({
    filterId: look.filterId,
    intensity: look.intensity,
    mix: look.mix ?? null,
    adjustments: look.adjustments,
    hsl: look.hsl,
    curves: look.curves,
    film: look.film,
    frame: look.frame,
    // Unknown capture date: no stamp (a batch never invents a date).
    dateStamp: look.dateStamp,
    stamp: look.stamp,
  });
  const out = await renderEdit(source, edit, {
    highQuality: settings.highQuality,
    format: settings.exportFormat,
    quality: settings.jpegQuality,
    stampTypeface: typeface,
  });
  const saved = await saveToLibrary(out.uri, LUMI_ALBUM);
  if (!saved.ok) throw new Error(saved.reason === 'permission' ? '사진 저장 권한이 없어요' : (saved.message ?? '저장하지 못했어요'));
  return out;
}
