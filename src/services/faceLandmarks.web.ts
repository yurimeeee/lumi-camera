import type { FaceLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision';

import type { FaceGeometry, NormalizedPoint } from '@/types/editing';

type VisionModule = typeof import('@mediapipe/tasks-vision');

/**
 * Face landmarks on web via MediaPipe Face Landmarker (468-point face mesh).
 * The JS bundle and WASM runtime are served from `public/mediapipe/` (copied
 * by postinstall) and imported by the browser itself: Metro cannot bundle
 * the package. The model is fetched from Google's model storage on first use.
 */
export const FACE_DETECTION_SUPPORTED = true;

const RUNTIME_BASE = '/mediapipe';

// A native import() Metro doesn't see, so the module is loaded as-is.
const importNative = new Function('url', 'return import(url)') as (url: string) => Promise<VisionModule>;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

// Face-mesh indices. "Left"/"right" are as seen in the image.
const EYE_L = { outer: 33, inner: 133, upper: 159, lower: 145 };
const EYE_R = { outer: 263, inner: 362, upper: 386, lower: 374 };
const CHEEK_L = 234;
const CHEEK_R = 454;
/** Lower jaw contour, top to bottom per side (matches uJaw0…5). */
const JAW = [58, 172, 136, 288, 397, 365];
const FOREHEAD = 10;
const CHIN = 152;

let landmarker: Promise<FaceLandmarker> | null = null;

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
          numFaces: 4,
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

function toGeometry(mesh: NormalizedLandmark[], aspect: number): FaceGeometry {
  const p = (i: number): NormalizedPoint => ({ x: mesh[i]!.x, y: mesh[i]!.y });
  // Lengths in units of image width.
  const dist = (a: number, b: number) => Math.hypot(mesh[a]!.x - mesh[b]!.x, (mesh[a]!.y - mesh[b]!.y) * aspect);
  const centre = (e: typeof EYE_L): NormalizedPoint => ({
    x: (mesh[e.outer]!.x + mesh[e.inner]!.x + mesh[e.upper]!.x + mesh[e.lower]!.x) / 4,
    y: (mesh[e.outer]!.y + mesh[e.inner]!.y + mesh[e.upper]!.y + mesh[e.lower]!.y) / 4,
  });
  return {
    eyes: [centre(EYE_L), centre(EYE_R)],
    eyeWidths: [dist(EYE_L.outer, EYE_L.inner), dist(EYE_R.outer, EYE_R.inner)],
    jaw: JAW.map(p),
    axis: [p(FOREHEAD), p(CHIN)],
    width: dist(CHEEK_L, CHEEK_R),
  };
}

const cache = new Map<string, Promise<FaceGeometry | null>>();
const CACHE_LIMIT = 8;

/** Landmarks of the largest face in the image at `uri`, or null if none. */
export function detectFace(uri: string): Promise<FaceGeometry | null> {
  let p = cache.get(uri);
  if (!p) {
    p = (async () => {
      const [lm, img] = await Promise.all([getLandmarker(), loadImage(uri)]);
      const { faceLandmarks } = await quiet(() => lm.detect(img));
      const aspect = img.naturalHeight / img.naturalWidth;
      const faces = faceLandmarks.map((mesh) => toGeometry(mesh, aspect));
      return faces.reduce<FaceGeometry | null>((best, f) => (!best || f.width > best.width ? f : best), null);
    })();
    cache.set(uri, p);
    p.catch(() => cache.delete(uri));
    if (cache.size > CACHE_LIMIT) {
      const first = cache.keys().next().value;
      if (first) cache.delete(first);
    }
  }
  return p;
}
