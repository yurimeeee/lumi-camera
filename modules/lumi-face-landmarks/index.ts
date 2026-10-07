import { requireOptionalNativeModule } from 'expo';

/** One face as reported by Apple Vision; every region is a flat [x0, y0, x1, y1, …] list. */
export interface NativeFace {
  bounds: { x: number; y: number; width: number; height: number };
  confidence: number;
  landmarkConfidence: number;
  roll?: number;
  yaw?: number;
  regions: Partial<Record<NativeRegion, number[]>>;
}

export type NativeRegion =
  | 'faceContour'
  | 'leftEye'
  | 'rightEye'
  | 'leftEyebrow'
  | 'rightEyebrow'
  | 'nose'
  | 'noseCrest'
  | 'medianLine'
  | 'outerLips'
  | 'innerLips'
  | 'leftPupil'
  | 'rightPupil';

interface LumiFaceLandmarksModule {
  detect(uri: string): Promise<NativeFace[]>;
}

/**
 * Null where the native code isn't compiled in: Expo Go, web, Android.
 * Requires a development build on iOS (see README).
 */
export default requireOptionalNativeModule<LumiFaceLandmarksModule>('LumiFaceLandmarks');
