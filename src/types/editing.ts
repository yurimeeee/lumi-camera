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

export type RetouchKey = 'skin' | 'smooth' | 'texture' | 'tone' | 'glow' | 'detail';

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

/** HSL colour bands, in hue order (see services/color/hsl.ts for their centres). */
export type HslColor = 'red' | 'orange' | 'yellow' | 'green' | 'aqua' | 'blue' | 'purple' | 'magenta';

/** Per-band HSL shift, each -100…100 (0 = unchanged). */
export interface HslAdjust {
  hue: number;
  saturation: number;
  luminance: number;
}

export type HslSettings = Record<HslColor, HslAdjust>;

export type CurveChannel = 'rgb' | 'red' | 'green' | 'blue';

/** Curve control point: input → output, both 0…1. */
export interface CurvePoint {
  x: number;
  y: number;
}

/**
 * Tone curves. Each channel is a list of control points sorted by x that
 * always includes an x = 0 and an x = 1 point. `rgb` applies to all three
 * channels first, then each colour channel is mapped by its own curve.
 */
export type CurveSettings = Record<CurveChannel, readonly CurvePoint[]>;

export interface EditState {
  filterId: string;
  /** 0…100 */
  intensity: number;
  /**
   * My Recipe the colour values came from (for highlighting only). The values
   * themselves are copied into this state, so deleting the recipe never
   * changes an edit.
   */
  recipeId: string | null;
  adjustments: Adjustments;
  hsl: HslSettings;
  curves: CurveSettings;
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
  /**
   * Where each edited face was when it was first edited (source-normalised).
   * Re-detection (another detector version, a restored project) matches
   * faces to these, so edits stay on the same person.
   */
  faceAnchors: Readonly<Record<string, FaceAnchor>>;
  dateStamp: boolean;
}

/** A face's position for re-identification: centre and size, normalised against the source image. */
export interface FaceAnchor {
  x: number;
  y: number;
  /** Larger side of the face box (share of the image's larger side). */
  size: number;
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
  | 'eyeAngle'
  | 'outerCorner'
  | 'underEye'
  | EyeSideKey
  // Nose
  | 'noseSlim'
  | 'noseWidth'
  | 'noseTip'
  | 'noseSize'
  | 'noseLength'
  | 'noseWing'
  | 'nostril'
  // Lips
  | 'lipSize'
  | 'lipWidth'
  | 'upperLip'
  | 'lowerLip'
  | 'mouthPosition'
  | 'smile'
  | 'mouthCorner'
  | 'philtrum'
  // Proportion
  | 'midface'
  | 'faceLength'
  | 'upperFace'
  | 'lowerFace'
  | 'nosePosition'
  // Skin (needs the face's regions: under-eye, eyes, mouth, creases)
  | 'darkCircle'
  | 'wrinkle'
  | 'redness'
  | 'teeth'
  | 'eyeBright';

/** Eye controls that can also be set per eye (added to the both-eyes value). */
export type EyeShapeKey = 'eyeSize' | 'eyeWidth' | 'eyeHeight' | 'eyePosition' | 'eyeAngle' | 'outerCorner';
/**
 * Per-eye offsets. L / R are the detector's left / right eye (image-left /
 * image-right in the *source* photo), so they stay on the same eye when the
 * photo is flipped later.
 */
export type EyeSideKey = `${EyeShapeKey}${'L' | 'R'}`;

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
