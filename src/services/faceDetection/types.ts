/**
 * Detector-independent face landmarks. Every detector (Apple Vision on iOS,
 * MediaPipe Face Landmarker on web) is mapped into this shape, and the warp
 * engine only ever reads this shape, so detectors can be swapped freely.
 *
 * Coordinates are normalised to 0…1 against the image the face was detected
 * in (the editor's source image), origin top-left. "Left"/"right" mean as
 * seen in the image (image-left = the subject's right).
 */

export interface Point {
  x: number;
  y: number;
}

export interface EyeLandmarks {
  /** Closed outline of the eye opening. */
  contour: Point[];
  /** Corner toward the nose. */
  inner: Point;
  /** Corner toward the temple. */
  outer: Point;
  /** Upper eyelid, outer → inner. */
  upperLid: Point[];
  /** Lower eyelid, outer → inner. */
  lowerLid: Point[];
  /** Iris centre when the detector reports it, else the outline's centre. */
  center: Point;
}

export interface NoseLandmarks {
  /** Nasion (between the eyes) → tip, along the ridge. */
  bridge: Point[];
  tip: Point;
  /** Outermost points of the alae (콧볼). */
  leftWing: Point;
  rightWing: Point;
  leftNostril: Point;
  rightNostril: Point;
  /** Subnasale: where the nose meets the upper lip. */
  base: Point;
  /** Outline of the lower nose. */
  contour: Point[];
}

export interface LipLandmarks {
  outer: Point[];
  inner: Point[];
  leftCorner: Point;
  rightCorner: Point;
  /** Top of the upper lip at the centre (cupid's bow). */
  upperTop: Point;
  /** Bottom of the lower lip at the centre. */
  lowerBottom: Point;
  /** Where the lips meet at the centre. */
  center: Point;
}

export interface FaceLandmarks {
  /**
   * Face outline, ordered around the face. Includes the forehead when the
   * detector sees it; otherwise `foreheadEstimated` is true and the forehead
   * arc is extrapolated from the brows and jaw.
   */
  faceContour: Point[];
  /** Jaw line from image-left to image-right, through the chin. */
  jaw: Point[];
  chin: Point;
  leftCheek: Point;
  rightCheek: Point;
  /** Forehead arc (hairline-ish), image-left → image-right. */
  forehead: Point[];
  foreheadEstimated: boolean;

  leftEye: EyeLandmarks;
  rightEye: EyeLandmarks;
  leftEyebrow: Point[];
  rightEyebrow: Point[];

  nose: NoseLandmarks;
  lips: LipLandmarks;
  /** Midpoint of the philtrum (between subnasale and the upper lip). */
  philtrum: Point;

  /** Dense face mesh when the detector provides one (MediaPipe: 478 points). */
  mesh?: Point[];
}

export interface NormalizedBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type DetectorId = 'apple-vision' | 'mediapipe';

export interface DetectedFace {
  /** Stable within one image: faces are numbered largest first. */
  id: string;
  bounds: NormalizedBounds;
  landmarks: FaceLandmarks;
  detector: DetectorId;
}

/** A detection backend. Implementations live next to this file. */
export interface FaceDetectorBackend {
  readonly id: DetectorId;
  /**
   * Faces in the image at `uri` (`width`×`height` px, upright), in any order.
   * Throws if the backend fails to load or read the image.
   */
  detect(uri: string, width: number, height: number): Promise<Omit<DetectedFace, 'id'>[]>;
}
