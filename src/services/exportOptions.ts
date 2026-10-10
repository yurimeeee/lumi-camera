import type { ExportMetadata } from './exportImage';
import type { JpegQuality } from '@/types/settings';
import type { SourceImage } from '@/types/editing';

/** 상세 저장 options and the pure parts of the plan (testable without native modules). */
export type ProFormat = 'jpeg' | 'png' | 'heic';
export type ProQuality = 'standard' | 'high' | 'max';
export type ProResolution = 'original' | '2048' | '4096' | 'custom';
export type ProDestination = 'photos' | 'share' | 'files';

export interface ProExportOptions {
  format: ProFormat;
  quality: ProQuality;
  resolution: ProResolution;
  /** Long side for `custom`. */
  customSide: number;
  metadata: ExportMetadata;
  destination: ProDestination;
}

export const DEFAULT_PRO_EXPORT: ProExportOptions = {
  format: 'jpeg',
  quality: 'high',
  resolution: 'original',
  customSide: 3000,
  metadata: 'keep',
  destination: 'photos',
};

export const JPEG_QUALITY: Record<ProQuality, JpegQuality> = { standard: 80, high: 90, max: 100 };
export const HEIC_QUALITY: Record<ProQuality, number> = { standard: 0.75, high: 0.85, max: 0.95 };

/** Smallest / largest custom long side. */
export const CUSTOM_MIN = 512;

/** Long side the photo will be saved at (never upscaled past the imported photo). */
export function outputLongSide(o: Pick<ProExportOptions, 'resolution' | 'customSide'>, source: Pick<SourceImage, 'width' | 'height'>): number {
  const original = Math.max(source.width, source.height);
  const wanted = o.resolution === 'original' ? original : o.resolution === 'custom' ? o.customSide : Number(o.resolution);
  return Math.max(CUSTOM_MIN, Math.min(original, Math.round(wanted)));
}

