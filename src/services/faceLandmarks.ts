import type { FaceGeometry } from '@/types/editing';

/**
 * Face landmarks for 눈 크게 / 얼굴 갸름. Only web (MediaPipe) is wired up so
 * far; native needs Vision / ML Kit in a development build. See
 * faceLandmarks.web.ts.
 */
export const FACE_DETECTION_SUPPORTED = false;

export async function detectFace(_uri: string): Promise<FaceGeometry | null> {
  return null;
}
