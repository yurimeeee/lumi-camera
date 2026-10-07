import LumiFaceLandmarks from '../../../modules/lumi-face-landmarks';

import type { FaceDetectorBackend } from './types';
import { mapVisionFace } from './visionMapping';

const native = LumiFaceLandmarks;

/**
 * iOS: Apple Vision through the local `lumi-face-landmarks` module. The
 * module only exists in a development build; in Expo Go (and on Android,
 * which has no backend yet) this is null and the face tools say so.
 */
export const backend: FaceDetectorBackend | null = native
  ? {
      id: 'apple-vision',
      async detect(uri, width, height) {
        const faces = await native.detect(uri);
        return faces.flatMap((f) => mapVisionFace(f, height / width) ?? []);
      },
    }
  : null;
