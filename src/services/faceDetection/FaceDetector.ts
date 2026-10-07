import { backend } from './backend';
import type { DetectedFace, DetectorId } from './types';

/**
 * Entry point for face detection. Picks the platform backend (Apple Vision
 * on iOS dev builds, MediaPipe on web), numbers faces largest first and
 * caches results per image, so the editor preview and the export read the
 * very same landmarks.
 */

export const FACE_DETECTION_SUPPORTED = backend !== null;
export const FACE_DETECTOR: DetectorId | null = backend?.id ?? null;

/** Faces narrower than this share of the image's short side are ignored (too small to reshape well). */
const MIN_FACE_SIZE = 0.035;

const cache = new Map<string, Promise<DetectedFace[]>>();
const CACHE_LIMIT = 8;

export interface DetectionImage {
  uri: string;
  width: number;
  height: number;
}

/** Faces in `image`, largest first, ids `face-0`, `face-1`, …; [] when none (or unsupported). */
export function detectFaces(image: DetectionImage): Promise<DetectedFace[]> {
  if (!backend) return Promise.resolve([]);
  let p = cache.get(image.uri);
  if (!p) {
    const run = backend;
    p = (async () => {
      const faces = await run.detect(image.uri, image.width, image.height);
      const short = Math.min(image.width, image.height);
      const size = (f: (typeof faces)[number]) => Math.max(f.bounds.width * image.width, f.bounds.height * image.height);
      return faces
        .filter((f) => size(f) >= MIN_FACE_SIZE * short)
        .sort((a, b) => size(b) - size(a))
        .map((f, i) => ({ ...f, id: `face-${i}` }));
    })();
    cache.set(image.uri, p);
    p.catch(() => cache.delete(image.uri));
    if (cache.size > CACHE_LIMIT) {
      const first = cache.keys().next().value;
      if (first) cache.delete(first);
    }
  }
  return p;
}

export type { DetectedFace, FaceLandmarks, Point } from './types';
