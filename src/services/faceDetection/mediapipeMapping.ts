import { boundsOf, centroid, eyeFromOutline, isUsable, makeAxes, mid, sortAcross } from './landmarkMath';
import type { DetectedFace, FaceLandmarks, Point } from './types';

/**
 * MediaPipe Face Landmarker (468-point face mesh + 10 iris points) →
 * FaceLandmarks. Indices follow MediaPipe's canonical face mesh topology;
 * "L" is the image-left side.
 */
const MESH = {
  silhouette: [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
    172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
  ],
  /** Image-left cheek → chin → image-right cheek. */
  jaw: [234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454],
  /** Image-left temple → forehead top → image-right temple. */
  forehead: [234, 127, 162, 21, 54, 103, 67, 109, 10, 338, 297, 332, 284, 251, 389, 356, 454],
  chin: 152,
  eyeL: [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7],
  eyeR: [263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249],
  irisL: 468,
  irisR: 473,
  browL: [70, 63, 105, 66, 107, 55, 65, 52, 53, 46],
  browR: [300, 293, 334, 296, 336, 285, 295, 282, 283, 276],
  bridge: [168, 6, 197, 195, 5, 4],
  tip: 1,
  wingL: 64,
  wingR: 294,
  nostrilL: 98,
  nostrilR: 327,
  base: 2,
  noseContour: [129, 64, 98, 97, 2, 326, 327, 294, 358],
  lipsOuter: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146],
  lipsInner: [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95],
  cornerL: 61,
  cornerR: 291,
  upperTop: 0,
  lowerBottom: 17,
  innerTop: 13,
  innerBottom: 14,
  philtrum: 164,
} as const;

export function mapMediaPipeMesh(mesh: readonly Point[], aspect: number): Omit<DetectedFace, 'id'> | null {
  if (mesh.length < 468) return null;
  const p = (i: number): Point => ({ x: mesh[i]!.x, y: mesh[i]!.y });
  const ps = (ids: readonly number[]) => ids.map(p);

  let eyeA = ps(MESH.eyeL);
  let eyeB = ps(MESH.eyeR);
  let irisA = mesh.length > MESH.irisL ? p(MESH.irisL) : undefined;
  let irisB = mesh.length > MESH.irisR ? p(MESH.irisR) : undefined;
  if (centroid(eyeA).x > centroid(eyeB).x) {
    [eyeA, eyeB] = [eyeB, eyeA];
    [irisA, irisB] = [irisB, irisA];
  }
  const ca = centroid(eyeA);
  const cb = centroid(eyeB);
  const axes = makeAxes(ca, cb, p(MESH.upperTop), aspect);

  let jaw = ps(MESH.jaw);
  if (jaw[0]!.x > jaw[jaw.length - 1]!.x) jaw = jaw.reverse();
  let forehead = ps(MESH.forehead);
  if (forehead[0]!.x > forehead[forehead.length - 1]!.x) forehead = forehead.reverse();
  const brows = [ps(MESH.browL), ps(MESH.browR)].sort((a, b) => centroid(a).x - centroid(b).x);
  const [wingA, wingB] = [p(MESH.wingL), p(MESH.wingR)].sort((a, b) => a.x - b.x) as [Point, Point];
  const [nosA, nosB] = [p(MESH.nostrilL), p(MESH.nostrilR)].sort((a, b) => a.x - b.x) as [Point, Point];
  const [cornerA, cornerB] = [p(MESH.cornerL), p(MESH.cornerR)].sort((a, b) => a.x - b.x) as [Point, Point];
  const [cheekA, cheekB] = [p(234), p(454)].sort((a, b) => a.x - b.x) as [Point, Point];

  const landmarks: FaceLandmarks = {
    faceContour: ps(MESH.silhouette),
    jaw,
    chin: p(MESH.chin),
    leftCheek: cheekA,
    rightCheek: cheekB,
    forehead,
    foreheadEstimated: false,
    leftEye: eyeFromOutline(eyeA, cb, axes, irisA),
    rightEye: eyeFromOutline(eyeB, ca, axes, irisB),
    leftEyebrow: sortAcross(brows[0]!, axes),
    rightEyebrow: sortAcross(brows[1]!, axes),
    nose: {
      bridge: ps(MESH.bridge),
      tip: p(MESH.tip),
      leftWing: wingA,
      rightWing: wingB,
      leftNostril: nosA,
      rightNostril: nosB,
      base: p(MESH.base),
      contour: ps(MESH.noseContour),
    },
    lips: {
      outer: ps(MESH.lipsOuter),
      inner: ps(MESH.lipsInner),
      leftCorner: cornerA,
      rightCorner: cornerB,
      upperTop: p(MESH.upperTop),
      lowerBottom: p(MESH.lowerBottom),
      center: mid(p(MESH.innerTop), p(MESH.innerBottom)),
    },
    philtrum: p(MESH.philtrum),
    mesh: mesh.map((q) => ({ x: q.x, y: q.y })),
  };
  if (!isUsable(landmarks, aspect)) return null;
  return { bounds: boundsOf(landmarks.faceContour), landmarks, detector: 'mediapipe' };
}
