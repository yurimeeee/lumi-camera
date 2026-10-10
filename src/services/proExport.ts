import type { SkTypeface } from '@shopify/react-native-skia';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import LumiVision from '../../modules/lumi-vision';
import type { EditState, SourceImage } from '@/types/editing';

import { renderEdit } from './exportImage';
import { HEIC_QUALITY, JPEG_QUALITY, outputLongSide, type ProDestination, type ProExportOptions, type ProFormat } from './exportOptions';
import { saveToLibrary, LUMI_ALBUM, type SaveResult } from './mediaLibrary';

export * from './exportOptions';

/**
 * 상세 저장 (Professional Export): format, quality, resolution, metadata and
 * destination on top of the same renderer as quick save (renderEdit — the
 * full edit at output resolution, never a capture of the preview).
 */

const isWeb = Platform.OS === 'web';

/** What this platform / build can do. HEIC needs the native ImageIO encoder (iOS development build). */
export function exportCapabilities() {
  const heic = !isWeb && !!LumiVision && LumiVision.capabilities().heic;
  return {
    heic,
    share: true,
    /** iOS: the share sheet's "파일에 저장"; web: a download. */
    files: true,
  };
}

export interface ProExportResult {
  uri: string;
  width: number;
  height: number;
  format: ProFormat;
}

export async function proExport(source: SourceImage, edit: EditState, o: ProExportOptions, typeface: SkTypeface | null): Promise<ProExportResult> {
  const heic = o.format === 'heic';
  if (heic && !exportCapabilities().heic) throw new Error('이 기기에서는 HEIC로 저장할 수 없어요.');
  const out = await renderEdit(source, edit, {
    highQuality: true,
    maxSide: outputLongSide(o, source),
    // HEIC is encoded from a maximum-quality JPEG (with its EXIF) by ImageIO.
    format: o.format === 'png' ? 'png' : 'jpeg',
    quality: heic ? 100 : JPEG_QUALITY[o.quality],
    stampTypeface: typeface,
    location: source.location,
    metadata: o.metadata,
  });
  if (!heic) return { ...out, format: o.format };
  const target = new File(Paths.cache, `lumi-${Date.now()}.heic`).uri;
  const uri = await LumiVision!.encodeHeic(out.uri, target, HEIC_QUALITY[o.quality], o.metadata);
  return { uri, width: out.width, height: out.height, format: 'heic' };
}

const UTI: Record<ProFormat, string> = { jpeg: 'public.jpeg', png: 'public.png', heic: 'public.heic' };
const MIME: Record<ProFormat, string> = { jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic' };

/** Delivers a saved file: Photos, the share sheet, or Files. */
export async function deliver(r: ProExportResult, destination: ProDestination): Promise<SaveResult> {
  if (destination === 'photos' || (isWeb && destination === 'files')) return saveToLibrary(r.uri, LUMI_ALBUM);
  if (isWeb) {
    // Web Share with a file where supported, otherwise a download.
    try {
      const blob = await (await fetch(r.uri)).blob();
      const file = new window.File([blob], `lumi-${Date.now()}.${r.format === 'jpeg' ? 'jpg' : r.format}`, { type: MIME[r.format] });
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        return { ok: true };
      }
    } catch {
      // Fall through to a download.
    }
    return saveToLibrary(r.uri, LUMI_ALBUM);
  }
  if (!(await Sharing.isAvailableAsync())) return { ok: false, reason: 'error', message: '공유를 쓸 수 없어요' };
  await Sharing.shareAsync(r.uri, { UTI: UTI[r.format], mimeType: MIME[r.format], dialogTitle: destination === 'files' ? '파일에 저장' : '공유' });
  return { ok: true };
}
