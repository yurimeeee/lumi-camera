import {
  boundsOf,
  centroid,
  estimateForehead,
  extreme,
  eyeFromOutline,
  isUsable,
  makeAxes,
  mid,
  project,
  sortAcross,
} from './landmarkMath';
import type { DetectedFace, FaceLandmarks, Point } from './types';

/** Apple Vision regions, each a flat [x0, y0, x1, y1, …] list normalised top-left. */
export interface VisionFace {
  bounds: { x: number; y: number; width: number; height: number };
  regions: Partial<Record<string, number[]>>;
}

function points(flat: number[] | undefined): Point[] {
  const out: Point[] = [];
  if (!flat) return out;
  for (let i = 0; i + 1 < flat.length; i += 2) out.push({ x: flat[i]!, y: flat[i + 1]! });
  return out;
}

/**
 * Vision (76/65-point constellation) → FaceLandmarks. Vision has no forehead
 * points, so the forehead arc is estimated. `aspect` = image height / width.
 */
export function mapVisionFace(face: VisionFace, aspect: number): Omit<DetectedFace, 'id'> | null {
  const r = face.regions;
  const eyesRaw = [points(r.leftEye), points(r.rightEye)].filter((e) => e.length >= 4);
  const contour = points(r.faceContour);
  const outerLips = points(r.outerLips);
  const nose = points(r.nose);
  if (eyesRaw.length < 2 || contour.length < 5 || outerLips.length < 4 || nose.length < 3) return null;

  // Image-left eye first, whatever Vision called it.
  const [eyeA, eyeB] = eyesRaw.sort((a, b) => centroid(a).x - centroid(b).x) as [Point[], Point[]];
  const ca = centroid(eyeA);
  const cb = centroid(eyeB);
  const mouth = centroid(outerLips);
  const axes = makeAxes(ca, cb, mouth, aspect);

  const pupils = [...points(r.leftPupil), ...points(r.rightPupil)];
  const nearest = (c: Point) =>
    pupils.length ? pupils.reduce((best, p) => (Math.hypot(p.x - c.x, p.y - c.y) < Math.hypot(best.x - c.x, best.y - c.y) ? p : best)) : undefined;
  const leftEye = eyeFromOutline(eyeA, cb, axes, nearest(ca));
  const rightEye = eyeFromOutline(eyeB, ca, axes, nearest(cb));

  const brows = [points(r.leftEyebrow), points(r.rightEyebrow)].filter((b) => b.length > 0).sort((a, b) => centroid(a).x - centroid(b).x);

  // Jaw: Vision's contour runs temple → chin → temple; order it image-left → image-right.
  const jaw = contour[0]!.x > contour[contour.length - 1]!.x ? [...contour].reverse() : contour;
  const chin = extreme(jaw, axes, 't', 1);

  // Nose: crest (nasion → tip) + lower outline (wings, nostrils, base).
  const crest = points(r.noseCrest).sort((a, b) => project(a, axes).t - project(b, axes).t);
  const nasion = mid(leftEye.inner, rightEye.inner);
  const leftWing = extreme(nose, axes, 's', -1);
  const rightWing = extreme(nose, axes, 's', 1);
  const noseMid = project(mid(leftWing, rightWing), axes);
  const wingSpan = project(rightWing, axes).s - project(leftWing, axes).s;
  const central = nose.filter((p) => Math.abs(project(p, axes).s - noseMid.s) < wingSpan * 0.3);
  const base = extreme(central.length ? central : nose, axes, 't', 1);
  const tip = crest.length ? crest[crest.length - 1]! : base;
  const bridge = [nasion, ...crest];

  // Lips: corners are the extremes across; centre top/bottom are the outer
  // points nearest the midline above/below the corner line.
  const leftCorner = extreme(outerLips, axes, 's', -1);
  const rightCorner = extreme(outerLips, axes, 's', 1);
  const lipMid = project(mid(leftCorner, rightCorner), axes);
  const halfWidth = (project(rightCorner, axes).s - project(leftCorner, axes).s) / 2;
  const nearMid = outerLips.filter((p) => Math.abs(project(p, axes).s - lipMid.s) < halfWidth * 0.45);
  const pool = nearMid.length >= 2 ? nearMid : outerLips;
  const upperTop = extreme(pool, axes, 't', -1);
  const lowerBottom = extreme(pool, axes, 't', 1);
  const inner = points(r.innerLips);
  const lipCenter = inner.length ? centroid(inner) : mid(upperTop, lowerBottom);

  const forehead = estimateForehead(jaw[0]!, jaw[jaw.length - 1]!, chin, axes);
  const cheekLevel = project(base, axes).t;
  const atLevel = (side: Point[]) =>
    side.reduce((best, p) => (Math.abs(project(p, axes).t - cheekLevel) < Math.abs(project(best, axes).t - cheekLevel) ? p : best));
  const half = Math.floor(jaw.length / 2);

  const landmarks: FaceLandmarks = {
    faceContour: [...jaw, ...[...forehead].reverse().slice(1, -1)],
    jaw,
    chin,
    leftCheek: atLevel(jaw.slice(0, half)),
    rightCheek: atLevel(jaw.slice(-half)),
    forehead,
    foreheadEstimated: true,
    leftEye,
    rightEye,
    leftEyebrow: brows[0] ? sortAcross(brows[0], axes) : [],
    rightEyebrow: brows[1] ? sortAcross(brows[1], axes) : [],
    nose: {
      bridge,
      tip,
      leftWing,
      rightWing,
      leftNostril: mid(mid(leftWing, base), tip),
      rightNostril: mid(mid(rightWing, base), tip),
      base,
      contour: nose,
    },
    lips: {
      outer: outerLips,
      inner,
      leftCorner,
      rightCorner,
      upperTop,
      lowerBottom,
      center: lipCenter,
    },
    philtrum: mid(base, upperTop),
  };
  if (!isUsable(landmarks, aspect)) return null;
  return { bounds: boundsOf(landmarks.faceContour), landmarks, detector: 'apple-vision' };
}
