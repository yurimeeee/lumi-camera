import type { FaceLandmarker } from '@mediapipe/tasks-vision';

import { mapMediaPipeMesh } from './mediapipeMapping';
import type { FaceDetectorBackend } from './types';

import { loadImageElement, mediapipe, quiet } from '../mediapipe.web';

/**
 * Web: MediaPipe Face Landmarker (478-point mesh), on the shared MediaPipe
 * runtime (services/mediapipe.web.ts). The model is fetched from Google's
 * model storage on first use.
 */
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
/** Faces per photo the landmarker returns. */
const MAX_FACES = 5;

let landmarker: Promise<FaceLandmarker> | null = null;

function getLandmarker(): Promise<FaceLandmarker> {
  if (!landmarker) {
    landmarker = (async () => {
      const { vision, fileset } = await mediapipe();
      const { FaceLandmarker } = vision;
      // CPU: the GPU delegate would take one of the browser's few WebGL
      // contexts, which Skia already uses.
      return quiet(() =>
        FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
          runningMode: 'IMAGE',
          numFaces: MAX_FACES,
        }),
      );
    })();
    landmarker.catch(() => {
      landmarker = null;
    });
  }
  return landmarker;
}

export const backend: FaceDetectorBackend = {
  id: 'mediapipe',
  async detect(uri) {
    const [lm, img] = await Promise.all([getLandmarker(), loadImageElement(uri)]);
    const { faceLandmarks } = await quiet(() => lm.detect(img));
    const aspect = img.naturalHeight / img.naturalWidth;
    return faceLandmarks.flatMap((mesh) => mapMediaPipeMesh(mesh, aspect) ?? []);
  },
};
