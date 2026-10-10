import type { MaskImageRef } from '@/types/phase4';

/** What a backend can segment. `background` is the subject, inverted; Lumi has no sky model. */
export type SegmentKind = 'subject' | 'person' | 'skin';

export interface SegmentationSource {
  uri: string;
  width: number;
  height: number;
}

export interface SegmentationBackend {
  id: string;
  supports: Record<SegmentKind | 'tap', boolean>;
  /** Mask of `kind` over the whole photo, stored as a greyscale PNG (white = selected). */
  segment(source: SegmentationSource, kind: SegmentKind): Promise<MaskImageRef>;
  /** The object under a tap (source-normalised), or null when nothing is there. */
  segmentAt(source: SegmentationSource, point: { x: number; y: number }): Promise<MaskImageRef | null>;
}

/** Longest side AI masks are stored at. */
export const MASK_STORE_SIDE = 1280;
