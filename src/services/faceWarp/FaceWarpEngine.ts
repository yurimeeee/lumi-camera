import { isNeutralFace } from '@/constants/faceRetouch';
import type { DetectedFace, FaceLandmarks, Point } from '@/services/faceDetection/types';
import { sourceToFrame } from '@/services/frameCoords';
import type { FaceRetouch, Geometry } from '@/types/editing';

import {
  BLOCK_FADE,
  buildFaceModel,
  CONTOUR_SPREAD,
  levelT,
  PROFILE_DT,
  PROFILE_FLOOR,
  PROFILE_LEVELS,
  PROFILE_T0,
  type Vec,
} from './mesh';
import { buildDeformation, type Band, type Prim } from './transforms';

/**
 * Face warp engine: landmarks + slider values → a backward warp (for every
 * output pixel, where to sample the original), evaluated on the GPU by the
 * Lumi shader (see shader.ts) at any resolution.
 *
 * Non-destructive: the plan is rebuilt from the original landmarks and the
 * current values every time, and the shader always samples the untouched
 * photo, so repeated edits never degrade it. Everything is computed in
 * render-target pixels from normalised landmarks, so the small preview and
 * the full-resolution export produce the same shape.
 *
 * Order (forward): contour field (shape + proportion) → feature primitives.
 * The shader runs the inverse chain: primitives first, then the field.
 */

/** Shader array sizes; keep in sync with shader.ts. */
export const MAX_WARP_FACES = 3;
export const MAX_BANDS = 6;
export const MAX_PRIMS = 32;

export interface FieldFace {
  origin: Vec;
  across: Vec;
  down: Vec;
  L: number;
  reach: number;
  halfNeg: number[];
  halfPos: number[];
  blockNeg: number;
  blockPos: number;
  contourNeg: number[];
  contourPos: number[];
  bands: Band[];
}

export interface FaceWarpPlan {
  fields: FieldFace[];
  prims: Prim[];
}

export interface FaceWarpInput {
  id: string;
  /** Normalised against the render target (frame). */
  landmarks: FaceLandmarks;
  retouch: FaceRetouch;
}

/**
 * Detected faces (source-normalised) + per-face values → engine inputs in
 * frame coordinates. Faces without edits are skipped.
 */
export function prepareFaceInputs(
  faces: readonly DetectedFace[],
  edits: Readonly<Record<string, FaceRetouch>>,
  geometry: Geometry,
): FaceWarpInput[] {
  const out: FaceWarpInput[] = [];
  for (const face of faces) {
    const retouch = edits[face.id];
    if (!retouch || isNeutralFace(retouch)) continue;
    out.push({ id: face.id, landmarks: mapLandmarks(face.landmarks, (p) => sourceToFrame(p, geometry)), retouch });
  }
  return out.slice(0, MAX_WARP_FACES);
}

export function mapLandmarks(lm: FaceLandmarks, f: (p: Point) => Point): FaceLandmarks {
  const ps = (a: readonly Point[]) => a.map(f);
  const eye = (e: FaceLandmarks['leftEye']) => ({
    contour: ps(e.contour),
    inner: f(e.inner),
    outer: f(e.outer),
    upperLid: ps(e.upperLid),
    lowerLid: ps(e.lowerLid),
    center: f(e.center),
  });
  return {
    faceContour: ps(lm.faceContour),
    jaw: ps(lm.jaw),
    chin: f(lm.chin),
    leftCheek: f(lm.leftCheek),
    rightCheek: f(lm.rightCheek),
    forehead: ps(lm.forehead),
    foreheadEstimated: lm.foreheadEstimated,
    leftEye: eye(lm.leftEye),
    rightEye: eye(lm.rightEye),
    leftEyebrow: ps(lm.leftEyebrow),
    rightEyebrow: ps(lm.rightEyebrow),
    nose: {
      bridge: ps(lm.nose.bridge),
      tip: f(lm.nose.tip),
      leftWing: f(lm.nose.leftWing),
      rightWing: f(lm.nose.rightWing),
      leftNostril: f(lm.nose.leftNostril),
      rightNostril: f(lm.nose.rightNostril),
      base: f(lm.nose.base),
      contour: ps(lm.nose.contour),
    },
    lips: {
      outer: ps(lm.lips.outer),
      inner: ps(lm.lips.inner),
      leftCorner: f(lm.lips.leftCorner),
      rightCorner: f(lm.lips.rightCorner),
      upperTop: f(lm.lips.upperTop),
      lowerBottom: f(lm.lips.lowerBottom),
      center: f(lm.lips.center),
    },
    philtrum: f(lm.philtrum),
    mesh: lm.mesh ? ps(lm.mesh) : undefined,
  };
}

/** Plan for a `width`×`height` render target, or null when nothing moves. */
export function buildFaceWarp(inputs: readonly FaceWarpInput[], width: number, height: number): FaceWarpPlan | null {
  const fields: FieldFace[] = [];
  const prims: Prim[] = [];
  for (const input of inputs.slice(0, MAX_WARP_FACES)) {
    const model = buildFaceModel(input.landmarks, width, height);
    if (!model) continue;
    const def = buildDeformation(model, input.retouch);
    const field: FieldFace = {
      origin: model.origin,
      across: model.across,
      down: model.down,
      L: model.L,
      reach: model.reach,
      halfNeg: model.halfNeg,
      halfPos: model.halfPos,
      blockNeg: model.blockNeg,
      blockPos: model.blockPos,
      contourNeg: def.contourNeg,
      contourPos: def.contourPos,
      bands: def.bands,
    };
    const moves = field.bands.length > 0 || def.contourNeg.some((v) => v !== 0) || def.contourPos.some((v) => v !== 0);
    if (moves) fields.push(field);
    // Features are reshaped after the contour field: anchor them where the
    // field put them.
    for (const p of def.prims) {
      const c = moves ? fieldForward(p.c, field) : p.c;
      prims.push(p.kind === 'move' && p.move ? { ...p, c: { x: c.x + p.move.x, y: c.y + p.move.y } } : { ...p, c });
    }
  }
  if (fields.length === 0 && prims.length === 0) return null;
  return { fields, prims: prims.slice(0, MAX_PRIMS) };
}

// ── Exact mirror of the shader (keep in sync with shader.ts) ─────

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Uniform cubic B-spline basis. */
export function bspline(x: number): number {
  const a = Math.abs(x);
  if (a >= 2) return 0;
  if (a >= 1) {
    const y = 2 - a;
    return (y * y * y) / 6;
  }
  return (4 - 6 * a * a + 3 * a * a * a) / 6;
}

/** Backward contour/proportion field of one face: output pixel → where it samples from. */
export function fieldBackward(p: Vec, f: FieldFace): Vec {
  const dx = p.x - f.origin.x;
  const dy = p.y - f.origin.y;
  const s = (dx * f.across.x + dy * f.across.y) / f.L;
  const t = (dx * f.down.x + dy * f.down.y) / f.L;
  if (t < PROFILE_T0 - 0.3 || t > 1.6 || Math.abs(s) > f.reach) return p;
  let H = 0;
  let D = 0;
  const neg = s < 0;
  for (let k = 0; k < PROFILE_LEVELS; k++) {
    const w = bspline((t - (PROFILE_T0 + k * PROFILE_DT)) / PROFILE_DT);
    if (w > 0) {
      H += w * (neg ? f.halfNeg[k]! : f.halfPos[k]!);
      D += w * (neg ? f.contourNeg[k]! : f.contourPos[k]!);
    }
  }
  H = Math.max(H, PROFILE_FLOOR);
  const u = Math.abs(s) / H;
  const g = smoothstep(0.3, 1, u) * (1 - smoothstep(1, 1 + CONTOUR_SPREAD, u));
  let V = 0;
  for (const b of f.bands) V += b.amount * smoothstep(b.t0, b.t1, t);
  const m = 1 - smoothstep(1, BLOCK_FADE, Math.abs(s) / (neg ? f.blockNeg : f.blockPos));
  const ds = Math.sign(s) * D * g * H;
  return {
    x: p.x + (f.across.x * ds + f.down.x * V * m) * f.L,
    y: p.y + (f.across.y * ds + f.down.y * V * m) * f.L,
  };
}

/** Backward feature primitive. */
export function primBackward(p: Vec, q: Prim): Vec {
  const ax = q.axis;
  const ay = { x: -ax.y, y: ax.x };
  const dx = p.x - q.c.x;
  const dy = p.y - q.c.y;
  const a = dx * ax.x + dy * ax.y;
  const b = dx * ay.x + dy * ay.y;
  const ry = b < 0 ? q.ryUp : q.ryDown;
  const r = Math.hypot(a / q.rx, b / ry);
  if (r >= 1) return p;
  const w = 1 - smoothstep(q.core, 1, r);
  if (q.kind === 'move') return { x: p.x - (q.move?.x ?? 0) * w, y: p.y - (q.move?.y ?? 0) * w };
  const sa = a * (1 - (q.kx ?? 0) * w);
  const sb = b * (1 - (q.ky ?? 0) * w);
  return { x: q.c.x + ax.x * sa + ay.x * sb, y: q.c.y + ax.y * sa + ay.y * sb };
}

/** Full backward warp, as the shader evaluates it. */
export function warpBackward(p: Vec, plan: FaceWarpPlan): Vec {
  let q = p;
  for (const prim of plan.prims) q = primBackward(q, prim);
  for (const f of plan.fields) q = fieldBackward(q, f);
  return q;
}

/** Where content at `p` ends up after the field (fixed-point inverse of the backward map). */
export function fieldForward(p: Vec, f: FieldFace): Vec {
  let q = p;
  for (let i = 0; i < 6; i++) {
    const b = fieldBackward(q, f);
    q = { x: q.x + (p.x - b.x), y: q.y + (p.y - b.y) };
  }
  return q;
}

/** Where content at `p` ends up after the whole warp (for overlays / tests). */
export function warpForward(p: Vec, plan: FaceWarpPlan): Vec {
  let q = p;
  for (let i = 0; i < 8; i++) {
    const b = warpBackward(q, plan);
    q = { x: q.x + (p.x - b.x), y: q.y + (p.y - b.y) };
  }
  return q;
}

// ── Shader uniforms ─────────────────────────────────────────────

export type FaceWarpUniforms = {
  uFaceCount: number;
  uFaceFrame: number[];
  uFaceAxes: number[];
  uFaceBlock: number[];
  uFaceProfile: number[];
  uFaceBand: number[];
  uPrimCount: number;
  uPrimA: number[];
  uPrimB: number[];
  uPrimC: number[];
};

const zeros = (n: number) => new Array<number>(n).fill(0);

export const NO_FACE_WARP: FaceWarpUniforms = {
  uFaceCount: 0,
  uFaceFrame: zeros(MAX_WARP_FACES * 4),
  uFaceAxes: zeros(MAX_WARP_FACES * 4),
  uFaceBlock: zeros(MAX_WARP_FACES * 4),
  uFaceProfile: zeros(MAX_WARP_FACES * PROFILE_LEVELS * 4),
  uFaceBand: zeros(MAX_WARP_FACES * MAX_BANDS * 4),
  uPrimCount: 0,
  uPrimA: zeros(MAX_PRIMS * 4),
  uPrimB: zeros(MAX_PRIMS * 4),
  uPrimC: zeros(MAX_PRIMS * 4),
};

export function faceWarpUniforms(plan: FaceWarpPlan | null): FaceWarpUniforms {
  if (!plan) return NO_FACE_WARP;
  const u: FaceWarpUniforms = {
    uFaceCount: plan.fields.length,
    uFaceFrame: NO_FACE_WARP.uFaceFrame.slice(),
    uFaceAxes: NO_FACE_WARP.uFaceAxes.slice(),
    uFaceBlock: NO_FACE_WARP.uFaceBlock.slice(),
    uFaceProfile: NO_FACE_WARP.uFaceProfile.slice(),
    uFaceBand: NO_FACE_WARP.uFaceBand.slice(),
    uPrimCount: plan.prims.length,
    uPrimA: NO_FACE_WARP.uPrimA.slice(),
    uPrimB: NO_FACE_WARP.uPrimB.slice(),
    uPrimC: NO_FACE_WARP.uPrimC.slice(),
  };
  plan.fields.forEach((f, i) => {
    u.uFaceFrame.splice(i * 4, 4, f.origin.x, f.origin.y, f.L, f.reach);
    u.uFaceAxes.splice(i * 4, 4, f.across.x, f.across.y, f.down.x, f.down.y);
    u.uFaceBlock.splice(i * 4, 4, f.blockNeg, f.blockPos, 0, 0);
    for (let k = 0; k < PROFILE_LEVELS; k++) {
      u.uFaceProfile.splice((i * PROFILE_LEVELS + k) * 4, 4, f.halfNeg[k]!, f.halfPos[k]!, f.contourNeg[k]!, f.contourPos[k]!);
    }
    f.bands.slice(0, MAX_BANDS).forEach((b, j) => {
      u.uFaceBand.splice((i * MAX_BANDS + j) * 4, 4, b.t0, b.t1, b.amount, 0);
    });
  });
  plan.prims.forEach((q, i) => {
    u.uPrimA.splice(i * 4, 4, q.c.x, q.c.y, q.rx, q.ryUp);
    u.uPrimB.splice(i * 4, 4, q.axis.x, q.axis.y, q.ryDown, q.core);
    if (q.kind === 'move') u.uPrimC.splice(i * 4, 4, 0, q.move?.x ?? 0, q.move?.y ?? 0, 0);
    else u.uPrimC.splice(i * 4, 4, 1, q.kx ?? 0, q.ky ?? 0, 0);
  });
  return u;
}

/** Profile level heights (face units), for debugging overlays. */
export const PROFILE_HEIGHTS = Array.from({ length: PROFILE_LEVELS }, (_, k) => levelT(k));
