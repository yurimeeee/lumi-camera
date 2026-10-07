import type { FaceLandmarks, Point } from '@/services/faceDetection/types';

/**
 * Face model in render-target pixels, derived from landmarks only.
 *
 * Face frame: origin at the eye line's midpoint, `down` toward the chin,
 * `across` from the image-left eye to the image-right eye. Face units:
 * s (across) and t (down) in multiples of L, the eye-line → chin length,
 * so t = 0 is the eye line and t = 1 the chin.
 *
 * The contour is kept as a half-width profile per side: at each of
 * PROFILE_LEVELS heights t_k, how far (in L) the face outline is from the
 * midline. The warp shader rebuilds a smooth outline from it (cubic
 * B-spline), which lets contour edits follow the real face shape — a round
 * jaw, a tilted face, a face turned so one side is narrower.
 */

export interface Vec {
  x: number;
  y: number;
}

export const PROFILE_LEVELS = 14;
export const PROFILE_T0 = -0.85;
export const PROFILE_DT = 0.18;
/** Outline half-width floor (L): keeps u = |s| / H finite around the chin and the forehead top. */
export const PROFILE_FLOOR = 0.16;
/** How far past the outline (in outline half-widths) contour edits fade out. */
export const CONTOUR_SPREAD = 0.85;
/** Proportion edits fade out between 1× and BLOCK_FADE× the face block's half-width. */
export const BLOCK_FADE = 1.7;

export const levelT = (k: number) => PROFILE_T0 + k * PROFILE_DT;

export interface EyeModel {
  center: Vec;
  inner: Vec;
  outer: Vec;
  /** Inner → outer corner distance. */
  width: number;
  /** Eye opening (lid to lid). */
  height: number;
}

export interface FaceModel {
  origin: Vec;
  across: Vec;
  down: Vec;
  /** Eye line → chin, px. */
  L: number;
  /** Outline half-width per level, image-left side (s < 0) and image-right side (L units). */
  halfNeg: number[];
  halfPos: number[];
  /**
   * Widest outline half-width over the face (eyes → chin), per side (L units).
   * Proportion edits move the face as a block this wide, so the jaw and the
   * neck under it shift together instead of shearing along the chin.
   */
  blockNeg: number;
  blockPos: number;
  /** |s| beyond which nothing moves (L units). */
  reach: number;
  eyes: [EyeModel, EyeModel];
  brows: [Vec[], Vec[]];
  nose: {
    nasion: Vec;
    tip: Vec;
    base: Vec;
    leftWing: Vec;
    rightWing: Vec;
    /** Half the wing-to-wing width. */
    halfWidth: number;
    /** Nasion → base along `down`. */
    length: number;
  };
  lips: {
    center: Vec;
    leftCorner: Vec;
    rightCorner: Vec;
    upperTop: Vec;
    lowerBottom: Vec;
    halfWidth: number;
    upperHeight: number;
    lowerHeight: number;
  };
  chin: Vec;
  /** Landmark heights in face units, used for proportion bands. */
  levels: {
    hair: number;
    brow: number;
    lowerLid: number;
    alarTop: number;
    /** Top of the nose tip / alae, whichever is higher: where the nose's rigid zone starts. */
    noseTop: number;
    base: number;
    upperLip: number;
    mouth: number;
    lowerLip: number;
  };
}

export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const scale = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;
export const len = (a: Vec) => Math.hypot(a.x, a.y);
export const lerp = (a: Vec, b: Vec, t: number): Vec => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const unit = (a: Vec): Vec => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l };
};

function centroid(pts: readonly Vec[]): Vec {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / Math.max(1, pts.length), y: y / Math.max(1, pts.length) };
}

/**
 * @param lm landmarks normalised against the render target (frame)
 * @param width,height render target size in px
 */
export function buildFaceModel(lm: FaceLandmarks, width: number, height: number): FaceModel | null {
  const px = (p: Point): Vec => ({ x: p.x * width, y: p.y * height });
  const pxs = (ps: readonly Point[]) => ps.map(px);

  // After flips/rotation the detector's "left" eye may not be on the left any
  // more; that's fine — sides are defined by `across`, from eye A to eye B.
  const eyeA = lm.leftEye;
  const eyeB = lm.rightEye;
  const ca = px(eyeA.center);
  const cb = px(eyeB.center);
  const origin = scale(add(ca, cb), 0.5);
  const across = unit(sub(cb, ca));
  let down: Vec = { x: -across.y, y: across.x };
  const chin = px(lm.chin);
  if (dot(sub(chin, origin), down) < 0) down = scale(down, -1);
  const L = dot(sub(chin, origin), down);
  if (!(L > 4) || !Number.isFinite(L)) return null;

  const st = (p: Vec) => {
    const d = sub(p, origin);
    return { s: dot(d, across) / L, t: dot(d, down) / L };
  };

  // ── Outline profile per side ───────────────────────────────
  // faceContour is an ordered loop around the face; at each height take the
  // widest crossing of the loop on that side.
  const loop = pxs(lm.faceContour).map(st);
  const side = (sign: 1 | -1) => {
    const out: number[] = [];
    for (let k = 0; k < PROFILE_LEVELS; k++) out.push(Math.max(PROFILE_FLOOR, halfAt(loop, sign, levelT(k))));
    return out;
  };
  const halfNeg = side(-1);
  const halfPos = side(1);
  const widest = (half: number[]) => Math.max(...half.filter((_, k) => levelT(k) >= -0.2 && levelT(k) <= 1));
  const blockNeg = widest(halfNeg);
  const blockPos = widest(halfPos);
  const reach = Math.max(Math.max(...halfNeg, ...halfPos) * (1 + CONTOUR_SPREAD), Math.max(blockNeg, blockPos) * BLOCK_FADE) + 0.08;

  // ── Features ───────────────────────────────────────────────
  const eye = (e: FaceLandmarks['leftEye']): EyeModel => {
    const inner = px(e.inner);
    const outer = px(e.outer);
    const contour = pxs(e.contour);
    const width = len(sub(outer, inner));
    let lo = Infinity;
    let hi = -Infinity;
    const perp = unit({ x: -(outer.y - inner.y), y: outer.x - inner.x });
    for (const p of contour) {
      const v = dot(sub(p, inner), perp);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    const height = Math.max(0.22 * width, Math.min(0.75 * width, hi - lo));
    return { center: centroid(contour), inner, outer, width, height };
  };
  const eyes: [EyeModel, EyeModel] = [eye(eyeA), eye(eyeB)];

  const nasion = scale(add(eyes[0].inner, eyes[1].inner), 0.5);
  const leftWing = px(lm.nose.leftWing);
  const rightWing = px(lm.nose.rightWing);
  const base = px(lm.nose.base);
  const tip = px(lm.nose.tip);
  const noseHalf = Math.max(0.06 * L, len(sub(rightWing, leftWing)) / 2);
  const noseLength = Math.max(0.2 * L, dot(sub(base, nasion), down));

  const lc = px(lm.lips.leftCorner);
  const rc = px(lm.lips.rightCorner);
  const lipCenter = px(lm.lips.center);
  const upperTop = px(lm.lips.upperTop);
  const lowerBottom = px(lm.lips.lowerBottom);
  const mouthHalf = Math.max(0.1 * L, len(sub(rc, lc)) / 2);

  // ── Heights ────────────────────────────────────────────────
  const tOf = (p: Vec) => st(p).t;
  const minT = (ps: readonly Vec[], fallback: number) => (ps.length ? Math.min(...ps.map(tOf)) : fallback);
  const maxT = (ps: readonly Vec[], fallback: number) => (ps.length ? Math.max(...ps.map(tOf)) : fallback);
  const browPts = [...pxs(lm.leftEyebrow), ...pxs(lm.rightEyebrow)];
  const lidPts = [...pxs(eyeA.lowerLid), ...pxs(eyeB.lowerLid)];
  const base_t = tOf(base);
  const levels = {
    hair: Math.min(-0.35, minT(pxs(lm.forehead), -0.6)),
    brow: Math.min(-0.08, minT(browPts, -0.18)),
    lowerLid: Math.max(0.02, Math.min(0.2, maxT(lidPts, 0.08))),
    alarTop: 0,
    noseTop: 0,
    base: base_t,
    upperLip: Math.max(base_t + 0.05, tOf(upperTop)),
    mouth: 0,
    lowerLip: 0,
  };
  levels.alarTop = Math.max(levels.lowerLid + 0.1, Math.min(tOf(leftWing), tOf(rightWing)) - (0.45 * noseHalf) / L);
  levels.noseTop = Math.max(levels.lowerLid + 0.08, Math.min(levels.alarTop, tOf(tip) - (0.75 * noseHalf) / L));
  levels.mouth = Math.max(levels.upperLip + 0.02, tOf(lipCenter));
  levels.lowerLip = Math.min(0.93, Math.max(levels.mouth + 0.02, tOf(lowerBottom)));

  return {
    origin,
    across,
    down,
    L,
    halfNeg,
    halfPos,
    blockNeg,
    blockPos,
    reach,
    eyes,
    brows: [pxs(lm.leftEyebrow), pxs(lm.rightEyebrow)],
    nose: { nasion, tip, base, leftWing, rightWing, halfWidth: noseHalf, length: noseLength },
    lips: {
      center: lipCenter,
      leftCorner: lc,
      rightCorner: rc,
      upperTop,
      lowerBottom,
      halfWidth: mouthHalf,
      upperHeight: Math.max(0.12 * mouthHalf, dot(sub(lipCenter, upperTop), down)),
      lowerHeight: Math.max(0.12 * mouthHalf, dot(sub(lowerBottom, lipCenter), down)),
    },
    chin,
    levels,
  };
}

/** Widest crossing of the closed outline `loop` at height t on the given side (0 if none). */
function halfAt(loop: readonly { s: number; t: number }[], sign: 1 | -1, t: number): number {
  let best = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]!;
    const b = loop[(i + 1) % loop.length]!;
    const lo = Math.min(a.t, b.t);
    const hi = Math.max(a.t, b.t);
    if (t < lo || t > hi) continue;
    const f = hi > lo ? (t - a.t) / (b.t - a.t) : 0.5;
    best = Math.max(best, (a.s + (b.s - a.s) * f) * sign);
  }
  return best;
}
