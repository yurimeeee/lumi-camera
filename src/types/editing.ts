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
  /** 터치 보정 strokes, in drawing order. */
  reshape: readonly ReshapeStroke[];
  /** 잡티 제거 spots, in tap order. */
  spots: readonly BlemishSpot[];
  /**
   * Face shape / feature retouch per detected face (by face id). Only faces
   * the user has touched are present. Values are UI slider values; the warp
   * engine turns them into face-relative deformations.
   */
  faces: Readonly<Record<string, FaceRetouch>>;
  dateStamp: boolean;
}

/** Face retouch controls. Ranges live in constants/faceRetouch.ts (0…100 or -100…100). */
export type FaceRetouchKey =
  // Face
  | 'slim'
  | 'faceWidth'
  | 'jaw'
  | 'chin'
  | 'vLine'
  | 'cheek'
  | 'forehead'
  // Eyes
  | 'eyeSize'
  | 'eyeWidth'
  | 'eyeHeight'
  | 'eyeDistance'
  | 'eyePosition'
  | 'outerCorner'
  // Nose
  | 'noseSlim'
  | 'noseWidth'
  | 'noseTip'
  | 'noseSize'
  | 'noseLength'
  | 'noseWing'
  // Lips
  | 'lipSize'
  | 'lipWidth'
  | 'upperLip'
  | 'lowerLip'
  | 'mouthPosition'
  | 'smile'
  // Proportion
  | 'midface'
  | 'faceLength'
  | 'upperFace'
  | 'lowerFace'
  | 'nosePosition';

export type FaceRetouch = Record<FaceRetouchKey, number>;

/** A blemish healed by 잡티 제거; centre normalised against the source image. */
export interface BlemishSpot extends NormalizedPoint {
  id: number;
  /** Radius as a fraction of the source image's short side. */
  radius: number;
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
  /** push moves content along the drag; restore eases it back toward the original. */
  kind: 'push' | 'restore';
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
