/**
 * Shared editing vocabulary. Filters, user adjustments and retouch all speak
 * the same "-100…100" parameter language so they can be composed linearly
 * before being handed to the image-processing layer.
 */

export type AdjustmentKey =
  | 'brightness'
  | 'exposure'
  | 'contrast'
  | 'highlights'
  | 'shadows'
  | 'saturation'
  | 'vibrance'
  | 'warmth'
  | 'temperature'
  | 'tint'
  | 'sharpness'
  | 'definition'
  | 'fade'
  | 'vignette'
  | 'grain';

export type RetouchKey = 'skin' | 'smooth' | 'tone' | 'glow' | 'detail';

/** Every scalar the processing pipeline understands. */
export type ToneKey = AdjustmentKey | RetouchKey;

export type ToneParams = Partial<Record<ToneKey, number>>;

export type Adjustments = Record<AdjustmentKey, number>;
export type Retouch = Record<RetouchKey, number>;

/** RGB in 0…1, where 0.5/0.5/0.5 is neutral. */
export type RGB = readonly [number, number, number];

export interface SplitTone {
  shadows: RGB;
  highlights: RGB;
  /** 0…100 */
  amount: number;
}

export type Rotation = 0 | 90 | 180 | 270;

export type CropAspectId = 'free' | 'original' | '1:1' | '4:3' | '3:4' | '16:9' | '9:16';

/** Crop rectangle normalised to 0…1 against the rotated/flipped image. */
export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Geometry {
  rotation: Rotation;
  flipH: boolean;
  flipV: boolean;
  crop: NormalizedRect | null;
  aspect: CropAspectId;
}

export interface EditState {
  filterId: string;
  /** 0…100 */
  intensity: number;
  adjustments: Adjustments;
  retouch: Retouch;
  geometry: Geometry;
  dateStamp: boolean;
}

export interface SourceImage {
  uri: string;
  width: number;
  height: number;
  /** Where the image came from; drives "save original" behaviour. */
  origin: 'camera' | 'library';
  /** Capture time (ms) used for the date stamp. */
  takenAt: number;
  /** Position recorded at capture when "위치 정보 저장" is on. */
  location?: { latitude: number; longitude: number; altitude: number | null } | null;
}
