import { eyeValue } from '@/constants/faceRetouch';
import type { FaceRetouch } from '@/types/editing';

import * as LIM from './limits';
import { add, dot, levelT, PROFILE_LEVELS, lerp, len, scale, sub, unit, type FaceModel, type Vec } from './mesh';

/**
 * Slider values → deformations. Three building blocks, all local and all
 * zero when the slider is 0:
 *
 *  1. Contour profile (face shape): per height, how far the outline moves
 *     toward the midline, separately per side. The shader spreads it from
 *     ~0 at the midline (nose, mouth keep their shape) to full at the outline
 *     and back to 0 a little outside it (background barely moves).
 *  2. Vertical bands (proportion): smooth steps along the face's own
 *     vertical axis. Only the skin between features is stretched or
 *     compressed; eyes, nose and mouth sit in flat parts and move rigidly.
 *  3. Feature primitives: an ellipse around a feature with a flat core and a
 *     smooth rim, that moves its content (`move`), scales it about its centre
 *     (`scale`, per axis) or turns it about its centre (`rotate`). The core
 *     moves/scales/turns as a whole, so the feature keeps its shape; only the
 *     rim (skin) absorbs the change.
 */

/** Displacement step along the face's vertical axis (face units, + = content moves up). */
export interface Band {
  t0: number;
  t1: number;
  amount: number;
}

export interface Prim {
  kind: 'move' | 'scale' | 'rotate';
  /** Centre in px — for `move`, where the feature ends up. */
  c: Vec;
  /** Local x axis (unit); local y = (-axis.y, axis.x) points toward the chin. */
  axis: Vec;
  rx: number;
  /** Radius toward the forehead / toward the chin. */
  ryUp: number;
  ryDown: number;
  /** Flat core as a share of the radius (0…0.9). */
  core: number;
  /** `move`: displacement in px. */
  move?: Vec;
  /** `scale`: k per local axis (core grows by 1 / (1 − k)). */
  kx?: number;
  ky?: number;
  /** `rotate`: angle in radians, positive = clockwise on screen (y down). */
  angle?: number;
}

export interface FaceDeformation {
  /** Outline inward ratio per profile level, image-left side / image-right side. */
  contourNeg: number[];
  contourPos: number[];
  bands: Band[];
  /** Feature primitives with centres in *original* face coordinates (moved through the field later). */
  prims: Prim[];
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const ss = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Slider (−100…100) → −1…1 with a gentle start: 20 → 0.1, 50 → 0.34,
 * 100 → 1. Fine control where most edits happen; exactly 0 at 0.
 */
export function ease(v: number): number {
  const x = clamp(v / 100, -1, 1);
  return x * (0.35 + 0.65 * Math.abs(x));
}

/** Largest move a primitive with this core/radius allows (see MAX_RIM_STRETCH). */
function clampMove(v: Vec, core: number, r: number): Vec {
  const max = (LIM.MAX_RIM_STRETCH * (1 - core) * r) / 1.5;
  const l = len(v);
  return l > max ? scale(v, max / l) : v;
}

const clampK = (k: number) => clamp(k, LIM.MIN_SCALE_K, LIM.MAX_SCALE_K);

/**
 * Largest k (in magnitude) a scale primitive can use before the skin in its
 * rim distorts by more than MAX_SCALE_DISTORTION. Along the radius the map's
 * slope is 1 − k·(w + r·w′), measured on the actual falloff; an elongated
 * ellipse adds shear (the offset along the long axis changes over the short
 * radius), so the bound tightens by the aspect ratio.
 */
function rimSafeK(k: number, core: number, aspect: number): number {
  if (k === 0) return 0;
  let lo = 0;
  let hi = 0;
  for (let i = 0; i <= 40; i++) {
    const r = core + ((1 - core) * i) / 40;
    const x = (r - core) / (1 - core);
    const w = 1 - x * x * (3 - 2 * x);
    const dw = (-6 * x * (1 - x)) / (1 - core);
    const g = w + r * dw * Math.max(1, aspect);
    lo = Math.min(lo, g);
    hi = Math.max(hi, g);
  }
  // Keep the slope s = 1 − k·g inside [1 / (1 + D), 1 / (1 − D)].
  const D = LIM.MAX_SCALE_DISTORTION;
  const sMin = 1 / (1 + D);
  const sMax = 1 / (1 - D);
  let max = Infinity;
  for (const g of [lo, hi]) {
    if (g === 0) continue;
    // k·g > 0 lowers the slope (toward sMin); k·g < 0 raises it (toward sMax).
    max = Math.min(max, k * g > 0 ? (1 - sMin) / Math.abs(g) : (sMax - 1) / Math.abs(g));
  }
  return clamp(k, -max, max);
}

/**
 * Largest angle a rotation primitive can use: the rim shears by
 * |θ| · r · |w′(r)|, worst at the rim's middle, more on an elongated ellipse.
 */
function clampAngle(angle: number, core: number, aspect: number): number {
  const r = core + (1 - core) / 2;
  const slope = 1.5 / (1 - core);
  const max = LIM.MAX_ROTATE_SHEAR / (r * slope * Math.max(1, aspect));
  return clamp(angle, -max, max);
}

/** Scale primitive with k limited per axis for its shape. */
function scalePrim(p: Omit<Prim, 'kind' | 'kx' | 'ky'>, kx: number, ky: number): Prim {
  const ryMin = Math.min(p.ryUp, p.ryDown);
  const ryMax = Math.max(p.ryUp, p.ryDown);
  return {
    ...p,
    kind: 'scale',
    kx: rimSafeK(clampK(kx), p.core, p.rx / ryMin),
    ky: rimSafeK(clampK(ky), p.core, ryMax / p.rx),
  };
}

export function buildDeformation(m: FaceModel, r: FaceRetouch): FaceDeformation {
  const up = scale(m.down, -1);
  /** Axis for primitives aligned to the face (local y = down). */
  const faceAxis = orient(m.across, m.down);
  const prims: Prim[] = [];

  // ── 1. Contour ─────────────────────────────────────────────
  const slim = ease(r.slim) * LIM.MAX_FACE_SLIM_RATIO;
  const width = -ease(r.faceWidth) * LIM.MAX_FACE_WIDTH_RATIO;
  const jaw = ease(r.jaw) * LIM.MAX_JAW_RATIO;
  const vLine = ease(r.vLine) * LIM.MAX_VLINE_RATIO;
  const cheek = ease(r.cheek) * LIM.MAX_CHEEK_RATIO;
  const forehead = -ease(r.forehead) * LIM.MAX_FOREHEAD_RATIO;
  const contour: number[] = [];
  for (let k = 0; k < PROFILE_LEVELS; k++) {
    const t = levelT(k);
    let d = 0;
    // Slim: cheekbones down to the jaw, a touch stronger low on the cheek.
    if (slim) d += slim * ss(0.0, 0.35, t) * (1 - ss(0.95, 1.15, t)) * (0.8 + 0.2 * ss(0.3, 0.75, t));
    // Width: temples to jaw (the whole outline), not the chin tip.
    if (width) d += width * ss(-0.7, -0.3, t) * (1 - ss(0.92, 1.12, t));
    // Jaw: lower face only; the cheekbones stay.
    if (jaw) d += jaw * ss(0.45, 0.78, t) * (1 - ss(0.97, 1.15, t));
    // V-line: grows toward the chin in one continuous taper, eased off at the
    // tip itself so the chin stays rounded.
    if (vLine) d += vLine * ss(0.35, 0.85, t) * (1 - ss(0.92, 1.1, t));
    // Cheek: the cheekbone band.
    if (cheek) d += cheek * ss(-0.1, 0.12, t) * (1 - ss(0.3, 0.55, t));
    if (forehead) d += forehead * ss(-0.85, -0.55, t) * (1 - ss(-0.2, 0.05, t));
    contour.push(clamp(d, -LIM.MAX_CONTOUR_TOTAL, LIM.MAX_CONTOUR_TOTAL));
  }

  // ── 2. Vertical bands ──────────────────────────────────────
  const lv = m.levels;
  const band = (t0: number, t1: number) => ({ t0, t1: Math.max(t1, t0 + 0.04) });
  const B = {
    hair: band(lv.hair - 0.32, lv.hair - 0.02),
    forehead: band(lv.hair + 0.04, lv.brow - 0.03),
    underEye: band(lv.lowerLid + 0.03, lv.noseTop),
    philtrum: band(lv.base + 0.01, lv.upperLip - 0.01),
    chin: band(lv.lowerLip + 0.03, 0.96),
    neck: band(1.03, 1.42),
  };
  const amt = { hair: 0, forehead: 0, underEye: 0, philtrum: 0, chin: 0 };
  const w1 = B.underEye.t1 - B.underEye.t0;
  const w2 = B.philtrum.t1 - B.philtrum.t0;

  // Positive sliders lengthen: content below the band moves down (amount < 0).
  const upperFace = ease(r.upperFace) * LIM.MAX_UPPER_FACE_SHIFT;
  amt.hair += upperFace;
  amt.forehead -= upperFace;
  const midface = ease(r.midface) * LIM.MAX_MIDFACE_RATIO * Math.max(0.3, lv.mouth);
  amt.underEye -= (midface * w1) / (w1 + w2);
  amt.philtrum -= (midface * w2) / (w1 + w2);
  const faceLength = ease(r.faceLength) * LIM.MAX_FACE_LENGTH_SHIFT;
  amt.underEye -= faceLength * 0.45;
  amt.chin -= faceLength * 0.55;
  const lowerFace = ease(r.lowerFace) * LIM.MAX_LOWER_FACE_SHIFT;
  amt.philtrum -= lowerFace * 0.4;
  amt.chin -= lowerFace * 0.6;
  amt.chin -= ease(r.chin) * LIM.MAX_CHIN_SHIFT;
  // Philtrum: the mouth moves with the philtrum's length; the skin between
  // the lower lip and the chin takes it back, so the chin stays put. Limited
  // to what both bands can take smoothly, so the two always cancel.
  const philtrumCap = (LIM.MAX_BAND_STRETCH * Math.min(B.philtrum.t1 - B.philtrum.t0, B.chin.t1 - B.chin.t0)) / 1.5;
  const philtrum = clamp(ease(r.philtrum) * LIM.MAX_PHILTRUM_SHIFT, -philtrumCap, philtrumCap);
  amt.philtrum -= philtrum;
  amt.chin += philtrum;
  // V-line lifts the chin a little, so the narrower jaw doesn't read as longer.
  amt.chin += ease(r.vLine) * LIM.MAX_VLINE_CHIN_LIFT;

  const cap = (b: { t0: number; t1: number }) => (LIM.MAX_BAND_STRETCH * (b.t1 - b.t0)) / 1.5;
  const bands: Band[] = [];
  // Upper bands cancel each other, so both share the tighter cap.
  const hairA = clamp(amt.hair, -Math.min(cap(B.hair), cap(B.forehead)), Math.min(cap(B.hair), cap(B.forehead)));
  if (hairA) bands.push({ ...B.hair, amount: hairA }, { ...B.forehead, amount: -hairA });
  // Lower bands are cancelled under the chin; if the neck can't take it all
  // back smoothly, all of them are scaled down together.
  const lower: Band[] = [];
  for (const [b, a] of [[B.underEye, amt.underEye], [B.philtrum, amt.philtrum], [B.chin, amt.chin]] as const) {
    const v = clamp(a, -cap(b), cap(b));
    if (v) lower.push({ ...b, amount: v });
  }
  const total = lower.reduce((sum, b) => sum + b.amount, 0);
  // Bands that cancel among themselves (philtrum vs. chin) need no neck band.
  const k = total ? Math.min(1, cap(B.neck) / Math.abs(total)) : 1;
  for (const b of lower) bands.push({ ...b, amount: b.amount * k });
  if (Math.abs(total) > 1e-9) bands.push({ ...B.neck, amount: -total * k });

  // ── 3. Features ────────────────────────────────────────────
  const L = m.L;

  // Eyes (eyes[0] is the detector's left eye: per-eye offsets use 'L')
  m.eyes.forEach((eye, i) => {
    const side = i === 0 ? -1 : 1;
    const which = i === 0 ? 'L' : 'R';
    const v = (key: Parameters<typeof eyeValue>[1]) => ease(eyeValue(r, key, which));
    const ew = eye.width;
    const axis = orient(unit(sub(eye.outer, eye.inner)), m.down);
    const kSize = v('eyeSize') * LIM.MAX_EYE_SCALE;
    const kx = clampK(kSize + v('eyeWidth') * LIM.MAX_EYE_WIDTH_SCALE);
    const ky = clampK(kSize + v('eyeHeight') * LIM.MAX_EYE_HEIGHT_SCALE);
    // Moves first (outermost), then the scale about the original centre.
    const mv = add(
      scale(m.across, side * ease(r.eyeDistance) * LIM.MAX_EYE_DISTANCE_SHIFT * ew),
      scale(up, v('eyePosition') * LIM.MAX_EYE_POSITION_SHIFT * L),
    );
    if (mv.x || mv.y) {
      const core = 0.5;
      const ry = 0.9 * ew;
      prims.push({ kind: 'move', c: eye.center, axis, rx: 1.05 * ew, ryUp: ry, ryDown: ry, core, move: clampMove(mv, core, ry) });
    }
    const tilt = v('eyeAngle') * LIM.MAX_EYE_ANGLE;
    if (tilt) {
      // Turn the whole eye (lids, lashes, iris) about its centre so the outer
      // corner rises for +; the iris stays round. The sign depends on which
      // side the outer corner is on.
      const out = sub(eye.outer, eye.center);
      const lift = dot({ x: -out.y, y: out.x }, up) > 0 ? 1 : -1;
      const core = 0.45;
      const rx = 1.0 * ew;
      const ry = 0.78 * ew;
      prims.push({ kind: 'rotate', c: eye.center, axis, rx, ryUp: ry, ryDown: ry, core, angle: clampAngle(lift * tilt, core, rx / ry) });
    }
    if (kx || ky) {
      // Ellipse follows the eye opening: wide along the lid line, as tall as
      // the opening allows, so brows and cheeks barely move.
      const ry = clamp(2.1 * eye.height, 0.5 * ew, 0.72 * ew);
      prims.push({ kind: 'scale', c: eye.center, axis, rx: 0.92 * ew, ryUp: ry, ryDown: ry, core: 0.42, kx, ky });
    }
    const corner = v('outerCorner') * LIM.MAX_OUTER_CORNER_SHIFT * ew;
    if (corner) {
      const core = 0.12;
      const rr = 0.5 * ew;
      prims.push({ kind: 'move', c: eye.outer, axis: faceAxis, rx: rr, ryUp: rr, ryDown: rr, core, move: clampMove(scale(up, corner), core, rr) });
    }
  });

  // Nose
  const n = m.nose;
  const nw = n.halfWidth;
  const nl = n.length;
  const wingMid = lerp(n.leftWing, n.rightWing, 0.5);
  /** Room between the nose base and the top of the upper lip. */
  const philtrumGap = Math.max(0.25 * nw, dot(sub(m.lips.upperTop, n.base), m.down));
  const baseBelowWings = Math.max(0, dot(sub(n.base, wingMid), m.down));
  const noseBottomRoom = baseBelowWings + 0.7 * philtrumGap;

  const position = ease(r.nosePosition) * LIM.MAX_NOSE_POSITION_SHIFT * nl;
  if (position) {
    // Centred between the nose's middle and its tip so a nose turned with the
    // face still sits inside the rigid core.
    const c = lerp(lerp(n.nasion, n.base, 0.6), n.tip, 0.4);
    const core = 0.6;
    const ryUp = 0.65 * nl;
    const ryDown = Math.max(0.3 * nl, dot(sub(n.base, c), m.down)) + 0.85 * philtrumGap;
    prims.push({ kind: 'move', c, axis: faceAxis, rx: 2.1 * nw, ryUp, ryDown, core, move: clampMove(scale(up, position), core, Math.min(ryDown, ryUp)) });
  }
  const length = ease(r.noseLength) * LIM.MAX_NOSE_LENGTH_SHIFT * nl;
  if (length) {
    // Tip, wings and base move together; the bridge stretches.
    const c = lerp(wingMid, n.tip, 0.5);
    const core = 0.4;
    const ryDown = dot(sub(n.base, c), m.down) + 0.85 * philtrumGap;
    prims.push({ kind: 'move', c, axis: faceAxis, rx: 1.75 * nw, ryUp: 0.6 * nl, ryDown, core, move: clampMove(scale(m.down, length), core, Math.min(ryDown, 0.6 * nl)) });
  }
  const kSize = clampK(ease(r.noseSize) * LIM.MAX_NOSE_SIZE_SCALE);
  if (kSize) {
    const c = lerp(n.nasion, n.base, 0.6);
    prims.push(scalePrim({ c, axis: faceAxis, rx: 1.8 * nw, ryUp: 0.75 * nl, ryDown: dot(sub(n.base, c), m.down) + noseBottomRoom, core: 0.45 }, kSize, kSize));
  }
  const kWidth = clampK(ease(r.noseWidth) * LIM.MAX_NOSE_WIDTH_SCALE);
  if (kWidth) {
    const c = lerp(n.nasion, n.base, 0.62);
    prims.push(scalePrim({ c, axis: faceAxis, rx: 1.95 * nw, ryUp: 0.65 * nl, ryDown: dot(sub(n.base, c), m.down) + noseBottomRoom, core: 0.45 }, kWidth, 0));
  }
  const kSlim = clampK(-ease(r.noseSlim) * LIM.MAX_NOSE_SLIM_SCALE);
  if (kSlim) {
    // Bridge only: narrow ellipse from between the eyes to above the tip.
    const c = lerp(n.nasion, n.tip, 0.42);
    const ry = 0.5 * Math.max(nw, len(sub(n.tip, n.nasion)));
    prims.push(scalePrim({ c, axis: faceAxis, rx: 1.1 * nw, ryUp: ry, ryDown: ry, core: 0.3 }, kSlim, 0));
  }
  const kWing = clampK(-ease(r.noseWing) * LIM.MAX_NOSE_WING_RATIO);
  if (kWing) {
    // 콧볼: the alae, nostrils and the skin around them narrow together toward
    // the nose's midline — wings move most, the tip not at all — so the
    // nostrils keep their shape instead of being pinched. The ellipse reaches
    // well above and below the alae so the change fades over the cheeks and
    // the upper lip instead of shearing right under the nostrils.
    const c = sub(wingMid, scale(m.down, 0.1 * nw));
    const ryDown = baseBelowWings + 1.0 * philtrumGap + 0.25 * nw;
    prims.push(scalePrim({ c, axis: faceAxis, rx: 2.2 * nw, ryUp: 1.3 * nw, ryDown, core: 0.45 }, kWing, 0));
  }
  const kNostril = clampK(ease(r.nostril) * LIM.MAX_NOSTRIL_SCALE);
  if (kNostril) {
    // Nostrils only: a flatter ellipse than the wings', centred between the
    // nostrils, so the tip above and the alae's outer edge barely move.
    const c = lerp(n.leftNostril, n.rightNostril, 0.5);
    const ryDown = Math.max(0.25 * nw, dot(sub(n.base, c), m.down)) + 0.8 * philtrumGap;
    prims.push(scalePrim({ c, axis: faceAxis, rx: 1.45 * nw, ryUp: 0.7 * nw, ryDown, core: 0.35 }, kNostril, 0));
  }
  const kTip = clampK(ease(r.noseTip) * LIM.MAX_NOSE_TIP_SCALE);
  if (kTip) {
    const rr = 0.72 * nw;
    prims.push(scalePrim({ c: n.tip, axis: faceAxis, rx: rr, ryUp: rr, ryDown: Math.min(rr, baseBelowWings + 0.6 * philtrumGap + 0.2 * nw), core: 0.3 }, kTip, kTip));
  }

  // Lips
  const lp = m.lips;
  const mw = lp.halfWidth;
  const uh = lp.upperHeight;
  const lh = lp.lowerHeight;
  const gapUp = Math.max(0.1 * mw, dot(sub(lp.upperTop, n.base), m.down));
  const gapDown = Math.max(0.2 * mw, Math.min(2.4 * lh, dot(sub(m.chin, lp.lowerBottom), m.down)));
  const mouthPos = ease(r.mouthPosition) * LIM.MAX_MOUTH_POSITION_SHIFT * L;
  if (mouthPos) {
    const core = 0.5;
    const ryUp = uh + 0.85 * gapUp;
    const ryDown = lh + 0.75 * gapDown;
    prims.push({ kind: 'move', c: lp.center, axis: faceAxis, rx: 1.6 * mw, ryUp, ryDown, core, move: clampMove(scale(up, mouthPos), core, Math.min(ryUp, ryDown)) });
  }
  const kLip = ease(r.lipSize) * LIM.MAX_LIP_SIZE_SCALE;
  const kLipX = clampK(kLip + ease(r.lipWidth) * LIM.MAX_LIP_WIDTH_SCALE);
  const kLipY = clampK(kLip);
  if (kLipX || kLipY) {
    prims.push(scalePrim({ c: lp.center, axis: faceAxis, rx: 1.7 * mw, ryUp: uh + 0.9 * gapUp, ryDown: lh + 0.85 * gapDown, core: 0.5 }, kLipX, kLipY));
  }
  const kUpper = clampK(ease(r.upperLip) * LIM.MAX_UPPER_LIP_SCALE);
  if (kUpper) {
    prims.push(scalePrim({ c: lp.center, axis: faceAxis, rx: 1.3 * mw, ryUp: uh + 0.7 * gapUp, ryDown: 0.6 * lh, core: 0.35 }, 0, kUpper));
  }
  const kLower = clampK(ease(r.lowerLip) * LIM.MAX_LOWER_LIP_SCALE);
  if (kLower) {
    prims.push(scalePrim({ c: lp.center, axis: faceAxis, rx: 1.3 * mw, ryUp: 0.6 * uh, ryDown: lh + 0.5 * gapDown, core: 0.35 }, 0, kLower));
  }
  const smile = ease(r.smile) * LIM.MAX_SMILE_SHIFT * mw;
  if (smile) {
    for (const corner of [lp.leftCorner, lp.rightCorner]) {
      const out = unit(sub(corner, lp.center));
      const core = 0.1;
      const rr = 0.55 * mw;
      const mv = add(scale(up, 0.9 * smile), scale(out, 0.3 * smile));
      prims.push({ kind: 'move', c: corner, axis: faceAxis, rx: rr, ryUp: 0.9 * rr, ryDown: 0.9 * rr, core, move: clampMove(mv, core, 0.9 * rr) });
    }
  }

  const cornerLift = ease(r.mouthCorner) * LIM.MAX_MOUTH_CORNER_SHIFT * mw;
  if (cornerLift) {
    // Corners only, straight up / down: the centre of the lips stays put.
    for (const corner of [lp.leftCorner, lp.rightCorner]) {
      const core = 0.1;
      const rr = 0.5 * mw;
      prims.push({ kind: 'move', c: corner, axis: faceAxis, rx: rr, ryUp: 0.9 * rr, ryDown: 0.9 * rr, core, move: clampMove(scale(up, cornerLift), core, 0.9 * rr) });
    }
  }

  return { contourNeg: contour, contourPos: contour, bands, prims };
}

/** Flips `axis` so its local y (-axis.y, axis.x) points along `down`. */
function orient(axis: Vec, down: Vec): Vec {
  return -axis.y * down.x + axis.x * down.y >= 0 ? axis : scale(axis, -1);
}
