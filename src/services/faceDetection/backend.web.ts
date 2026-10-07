import type { FaceLandmarker } from '@mediapipe/tasks-vision';

import { mapMediaPipeMesh } from './mediapipeMapping';
import type { FaceDetectorBackend } from './types';

type VisionModule = typeof import('@mediapipe/tasks-vision');

/**
 * Web: MediaPipe Face Landmarker (478-point mesh). The JS bundle and WASM
 * runtime are served from `public/mediapipe/` (copied by postinstall) and
 * imported by the browser itself: Metro cannot bundle the package. The model
 * is fetched from Google's model storage on first use.
 */
const RUNTIME_BASE = '/mediapipe';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
/** Faces per photo the landmarker returns. */
const MAX_FACES = 5;

// A native import() Metro doesn't see, so the module is loaded as-is.
const importNative = new Function('url', 'return import(url)') as (url: string) => Promise<VisionModule>;

/**
 * MediaPipe's WASM routes its INFO/glog lines to console.error, which the
 * dev error toast picks up (and it covers the editor toolbar). Drop those
 * lines while MediaPipe runs.
 */
const NOISE = /^(INFO:|[IW]\d{4} |Graph successfully)/;
async function quiet<T>(fn: () => T | Promise<T>): Promise<T> {
  const { error, warn, log } = console;
  const filter =
    (out: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      if (typeof args[0] === 'string' && NOISE.test(args[0])) return;
      out(...args);
    };
  console.error = filter(error);
  console.warn = filter(warn);
  console.log = filter(log);
  try {
    return await fn();
  } finally {
    console.error = error;
    console.warn = warn;
    console.log = log;
  }
}

let landmarker: Promise<FaceLandmarker> | null = null;

function getLandmarker(): Promise<FaceLandmarker> {
  if (!landmarker) {
    landmarker = (async () => {
      const { FaceLandmarker, FilesetResolver } = await importNative(`${RUNTIME_BASE}/vision_bundle.mjs`);
      const fileset = await FilesetResolver.forVisionTasks(RUNTIME_BASE);
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

async function loadImage(uri: string): Promise<HTMLImageElement> {
  const img = new window.Image();
  img.crossOrigin = 'anonymous';
  img.src = uri;
  await img.decode();
  return img;
}

export const backend: FaceDetectorBackend = {
  id: 'mediapipe',
  async detect(uri) {
    const [lm, img] = await Promise.all([getLandmarker(), loadImage(uri)]);
    const { faceLandmarks } = await quiet(() => lm.detect(img));
    const aspect = img.naturalHeight / img.naturalWidth;
    return faceLandmarks.flatMap((mesh) => mapMediaPipeMesh(mesh, aspect) ?? []);
  },
};
