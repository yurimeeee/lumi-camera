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

export type RetouchKey = 'skin' | 'smooth' | 'tone' | 'glow' | 'detail' | 'eyes' | 'slim';

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
  /** 터치 보정 strokes, in drawing order. */
  reshape: readonly ReshapeStroke[];
  dateStamp: boolean;
}

/**
 * One 터치 보정 drag: the content under the brush is pushed along `points`.
 * Points are normalised against the *source* image (before rotate/flip/crop)
 * so strokes stay put when the geometry changes afterwards.
 */
export interface ReshapeStroke {
  id: number;
  /** Brush radius as a fraction of the source image's short side. */
  radius: number;
  /** Share of the finger's travel the content follows (0…1). */
  strength: number;
  points: readonly NormalizedPoint[];
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

/** A point normalised to 0…1 against the image's width and height. */
export interface NormalizedPoint {
  x: number;
  y: number;
}

/**
 * Face landmarks needed by the face-shape warp, normalised against the image
 * the face was detected in. Lengths are fractions of the image width, so the
 * same geometry drives the preview and the full-resolution export.
 */
export interface FaceGeometry {
  /** Eye centres (image-left eye first). */
  eyes: readonly [NormalizedPoint, NormalizedPoint];
  /** Eye opening width, per eye. */
  eyeWidths: readonly [number, number];
  /** Chin tip; with the eye midpoint it spans the face's vertical axis. */
  chin: NormalizedPoint;
  /** Cheek-to-cheek width. */
  width: number;
}
