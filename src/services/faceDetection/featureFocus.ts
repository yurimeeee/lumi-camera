import { sourceToFrame } from '@/services/frameCoords';
import type { Geometry, NormalizedRect } from '@/types/editing';

import { boundsOf, centroid } from './landmarkMath';
import type { DetectedFace, Point } from './types';

/** What a retouch tool works on, for automatic framing. */
export type FocusTarget = 'face' | 'eyes' | 'eyeL' | 'eyeR' | 'nose' | 'mouth';

/** Size of the framed area as a multiple of the face's width (square on screen). */
const SPAN: Record<Exclude<FocusTarget, 'face'>, number> = {
  eyes: 0.8,
  eyeL: 0.45,
  eyeR: 0.45,
  nose: 0.5,
  mouth: 0.55,
};

/**
 * Frame-normalised rect around a feature of `face` (after rotate / flip /
 * crop), square in pixels for a frame of `frameWidth`×`frameHeight`. eyeL /
 * eyeR are the detector's left / right eye (see EyeSideKey).
 */
export function focusRect(face: DetectedFace, target: FocusTarget, geometry: Geometry, frameWidth: number, frameHeight: number): NormalizedRect {
  const lm = face.landmarks;
  const map = (ps: readonly Point[]) => ps.map((p) => sourceToFrame(p, geometry));
  const outline = map(lm.faceContour);
  const ob = boundsOf(outline);
  if (target === 'face') {
    const pad = 0.22;
    return { x: ob.x - ob.width * pad, y: ob.y - ob.height * pad, width: ob.width * (1 + 2 * pad), height: ob.height * (1 + 2 * pad) };
  }
  // Face size in pixels (its box's larger side, ~face length; robust to a
  // rotated photo) → the area's side in pixels.
  const facePx = 0.8 * Math.max(ob.width * frameWidth, ob.height * frameHeight) || 1;
  const pts =
    target === 'eyes'
      ? [...lm.leftEye.contour, ...lm.rightEye.contour]
      : target === 'eyeL'
        ? lm.leftEye.contour
        : target === 'eyeR'
          ? lm.rightEye.contour
          : target === 'nose'
            ? [...lm.nose.contour, lm.nose.tip, lm.nose.leftWing, lm.nose.rightWing]
            : lm.lips.outer;
  const c = centroid(map(pts));
  const side = SPAN[target] * facePx;
  const w = side / frameWidth;
  const h = side / frameHeight;
  return { x: c.x - w / 2, y: c.y - h / 2, width: w, height: h };
}
