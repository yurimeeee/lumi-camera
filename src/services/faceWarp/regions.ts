import { completeFaceRetouch } from '@/constants/faceRetouch';
import type { DetectedFace, FaceLandmarks, Point } from '@/services/faceDetection/types';
import { sourceToFrame } from '@/services/frameCoords';
import type { FaceRetouch, Geometry } from '@/types/editing';

import { mapLandmarks } from './FaceWarpEngine';
import { add, buildFaceModel, dot, len, lerp, scale, sub, unit, type FaceModel, type Vec } from './mesh';

/**
 * Face regions for skin retouch: where on a face each tone tool may act,
 * built from landmarks (never from the whole face or the whole photo).
 *
 *  - protect:  eyes, brows, lips, nostrils. Skin smoothing, wrinkle,
 *              redness and dark-circle work stop here, so features stay crisp.
 *  - eye:      the eye opening (Eye Brightness: clearer iris, whiter sclera).
 *  - underEye: the hollow under each eye (Dark Circle: lifted toward the
 *              cheek's tone, measured just below it).
 *  - aegyo:    a thin band right under the lower lid (애교살).
 *  - mouth:    the inner lip opening (Teeth Whitening, gated to teeth colours).
 *  - crease:   crow's feet, under-eye lines, forehead, glabella, nasolabial
 *              folds (Wrinkle: dark fine lines are lifted).
 *  - face:     the face oval (Redness, gated to skin colours).
 *
 * Every region is an ellipse in render-target pixels, aligned to the face
 * (local y points toward the chin). Landmarks are in the unwarped frame and
 * the shader evaluates regions at the position it samples the photo from, so
 * the regions stay on their features after the face warp.
 */

/**
 * Shader array size (REGION_SKSL is generated from it). One face with every
 * tool uses 23 regions, so three fully edited faces nearly fill it; feature
 * protection for every face is placed first, so it is never the part dropped.
 */
export const MAX_REGIONS = 64;

export type RegionKind = 'protect' | 'eye' | 'underEye' | 'aegyo' | 'mouth' | 'crease' | 'face';

export const REGION_CODE: Record<RegionKind, number> = {
  protect: 0,
  eye: 1,
  underEye: 2,
  aegyo: 3,
  mouth: 4,
  crease: 5,
  face: 6,
};

export interface Region {
  kind: RegionKind;
  c: Vec;
  /** Local x axis (unit); local y = (-axis.y, axis.x) points toward the chin. */
  axis: Vec;
  rx: number;
  ry: number;
  /** Effect strength 0…1 (protect: 1). */
  amount: number;
}

export interface FaceRegionInput {
  id: string;
  /** Normalised against the render target (frame). */
  landmarks: FaceLandmarks;
  retouch: FaceRetouch | null;
}

/** Faces → region inputs in frame coordinates. All faces are kept (protection applies to every face). */
export function prepareRegionInputs(
  faces: readonly DetectedFace[],
  edits: Readonly<Record<string, Partial<FaceRetouch>>>,
  geometry: Geometry,
): FaceRegionInput[] {
  return faces.map((f) => ({
    id: f.id,
    landmarks: mapLandmarks(f.landmarks, (p) => sourceToFrame(p, geometry)),
    retouch: edits[f.id] ? completeFaceRetouch(edits[f.id]) : null,
  }));
}

/** Flips `axis` so its local y (-axis.y, axis.x) points along `down`. */
function orient(axis: Vec, down: Vec): Vec {
  return -axis.y * down.x + axis.x * down.y >= 0 ? axis : scale(axis, -1);
}

/** Ellipse around `pts` aligned to `axis`, centred on their extent, padded by `pad`. */
function fitEllipse(pts: readonly Vec[], axis: Vec, pad: number, minR: number): { c: Vec; rx: number; ry: number } {
  const ay = { x: -axis.y, y: axis.x };
  let a0 = Infinity;
  let a1 = -Infinity;
  let b0 = Infinity;
  let b1 = -Infinity;
  for (const p of pts) {
    const a = dot(p, axis);
    const b = dot(p, ay);
    a0 = Math.min(a0, a);
    a1 = Math.max(a1, a);
    b0 = Math.min(b0, b);
    b1 = Math.max(b1, b);
  }
  const ca = (a0 + a1) / 2;
  const cb = (b0 + b1) / 2;
  return {
    c: add(scale(axis, ca), scale(ay, cb)),
    rx: Math.max(minR, ((a1 - a0) / 2) * pad),
    ry: Math.max(minR, ((b1 - b0) / 2) * pad),
  };
}

const v01 = (v: number) => Math.min(1, Math.max(0, v / 100));

/** Regions for one face. `protect` adds the feature masks even without tone edits (skin smoothing). */
function faceRegions(m: FaceModel, lm: FaceLandmarks, r: FaceRetouch | null, width: number, height: number, protect: boolean): Region[] {
  const px = (p: Point): Vec => ({ x: p.x * width, y: p.y * height });
  const pxs = (ps: readonly Point[]) => ps.map(px);
  const faceAxis = orient(m.across, m.down);
  const up = scale(m.down, -1);
  const out: Region[] = [];
  const darkCircle = r ? v01(r.darkCircle) : 0;
  const aegyo = r ? v01(r.underEye) : 0;
  const wrinkle = r ? v01(r.wrinkle) : 0;
  const redness = r ? v01(r.redness) : 0;
  const teeth = r ? v01(r.teeth) : 0;
  const eyeBright = r ? v01(r.eyeBright) : 0;
  const anyTone = darkCircle + aegyo + wrinkle + redness + teeth + eyeBright > 0;
  if (!protect && !anyTone) return out;

  // ── Protection ─────────────────────────────────────────────
  const eyeEllipse = (i: 0 | 1) => {
    const e = m.eyes[i];
    const axis = orient(unit(sub(e.outer, e.inner)), m.down);
    return { c: e.center, axis, rx: 0.5 * e.width, ry: 0.5 * e.height };
  };
  for (const i of [0, 1] as const) {
    const e = eyeEllipse(i);
    // Lashes and the lid crease sit just outside the opening.
    out.push({ kind: 'protect', c: e.c, axis: e.axis, rx: e.rx * 1.25, ry: e.ry * 1.9, amount: 1 });
  }
  for (const brow of m.brows) {
    if (brow.length < 2) continue;
    const axis = orient(unit(sub(brow[brow.length - 1]!, brow[0]!)), m.down);
    const f = fitEllipse(brow, axis, 1.15, 0.02 * m.L);
    out.push({ kind: 'protect', c: f.c, axis, rx: f.rx, ry: Math.max(f.ry, 0.22 * f.rx), amount: 1 });
  }
  const lipsAxis = orient(unit(sub(m.lips.rightCorner, m.lips.leftCorner)), m.down);
  const lips = fitEllipse(pxs(lm.lips.outer), lipsAxis, 1.12, 0.03 * m.L);
  out.push({ kind: 'protect', c: lips.c, axis: lipsAxis, rx: lips.rx, ry: lips.ry * 1.1, amount: 1 });
  const nw = m.nose.halfWidth;
  for (const n of [m.nose.leftNostril, m.nose.rightNostril]) {
    out.push({ kind: 'protect', c: n, axis: faceAxis, rx: 0.34 * nw, ry: 0.24 * nw, amount: 1 });
  }

  // ── Tone tools ─────────────────────────────────────────────
  // A turned face foreshortens the far eye horizontally but not vertically:
  // heights below the eye follow the wider eye.
  const ewv = Math.max(m.eyes[0].width, m.eyes[1].width);
  for (const i of [0, 1] as const) {
    const e = m.eyes[i];
    const el = eyeEllipse(i);
    const ew = e.width;
    if (eyeBright) out.push({ kind: 'eye', c: el.c, axis: el.axis, rx: el.rx * 0.98, ry: el.ry * 1.05, amount: eyeBright });
    const below = (k: number) => add(e.center, scale(m.down, 0.5 * e.height + k * ewv));
    if (darkCircle) out.push({ kind: 'underEye', c: below(0.3), axis: el.axis, rx: 0.6 * ew, ry: 0.28 * ewv, amount: darkCircle });
    if (aegyo) out.push({ kind: 'aegyo', c: below(0.11), axis: el.axis, rx: 0.44 * ew, ry: 0.085 * ewv, amount: aegyo });
    if (wrinkle) {
      const outward = unit(sub(e.outer, e.inner));
      out.push({ kind: 'crease', c: add(add(e.outer, scale(outward, 0.3 * ew)), scale(m.down, 0.05 * ewv)), axis: faceAxis, rx: 0.34 * ew, ry: 0.45 * ewv, amount: wrinkle });
      out.push({ kind: 'crease', c: below(0.25), axis: el.axis, rx: 0.6 * ew, ry: 0.26 * ewv, amount: wrinkle });
    }
  }
  if (teeth) {
    const inner = pxs(lm.lips.inner);
    if (inner.length >= 3) {
      const f = fitEllipse(inner, lipsAxis, 1.0, 1);
      // A closed mouth shows no teeth: skip a slit thinner than the lips' own height.
      if (f.ry > 0.05 * m.lips.halfWidth) out.push({ kind: 'mouth', c: f.c, axis: lipsAxis, rx: f.rx * 0.96, ry: f.ry * 1.05, amount: teeth });
    }
  }
  if (wrinkle) {
    const lv = m.levels;
    const L = m.L;
    const at = (t: number) => add(m.origin, scale(m.down, t * L));
    const halfAt = (t: number) => {
      const k = Math.round((t + 0.85) / 0.18);
      const i = Math.max(0, Math.min(m.halfNeg.length - 1, k));
      return Math.min(m.halfNeg[i]!, m.halfPos[i]!) * L;
    };
    const browT = lv.brow;
    const hairT = lv.hair;
    const midT = (browT + hairT) / 2 - 0.02;
    // Forehead: between the brows and the (estimated) hairline.
    out.push({ kind: 'crease', c: at(midT), axis: faceAxis, rx: 0.72 * halfAt(midT), ry: Math.max(0.06 * L, ((browT - hairT) / 2) * 0.75 * L), amount: wrinkle });
    // Glabella: between the brows.
    out.push({ kind: 'crease', c: add(m.nose.nasion, scale(up, 0.09 * L)), axis: faceAxis, rx: 0.11 * L, ry: 0.08 * L, amount: wrinkle });
    // Nasolabial folds: alae → mouth corners, just outside that line.
    const sides: [Vec, Vec][] = [
      [m.nose.leftWing, m.lips.leftCorner],
      [m.nose.rightWing, m.lips.rightCorner],
    ];
    for (const [wing, corner] of sides) {
      const outward = unit(sub(wing, lerp(m.nose.leftWing, m.nose.rightWing, 0.5)));
      const a = add(wing, scale(outward, 0.25 * nw));
      const b = add(corner, scale(outward, 0.15 * m.lips.halfWidth));
      const l = len(sub(b, a));
      if (l < 2) continue;
      out.push({ kind: 'crease', c: lerp(a, b, 0.5), axis: orient(unit(sub(b, a)), m.down), rx: 0.62 * l, ry: 0.24 * l, amount: wrinkle });
    }
  }
  if (redness) {
    const t = 0.22;
    const L = m.L;
    const k = Math.round((0.3 + 0.85) / 0.18);
    const half = ((m.halfNeg[k]! + m.halfPos[k]!) / 2) * L;
    out.push({ kind: 'face', c: add(m.origin, scale(m.down, t * L)), axis: faceAxis, rx: half * 0.98, ry: 0.86 * L, amount: redness });
  }
  return out;
}

/**
 * Regions for every face in render-target pixels. `protectAll` adds the
 * feature masks on every face (global skin smoothing is on); otherwise only
 * faces with tone edits get regions. Past MAX_REGIONS, the last face's last
 * tools are dropped.
 */
export function buildFaceRegions(inputs: readonly FaceRegionInput[], width: number, height: number, protectAll: boolean): Region[] {
  const all: Region[] = [];
  for (const input of inputs) {
    const model = buildFaceModel(input.landmarks, width, height);
    if (!model) continue;
    all.push(...faceRegions(model, input.landmarks, input.retouch, width, height, protectAll));
  }
  // Protection for every face first, then the tools face by face.
  return [...all.filter((r) => r.kind === 'protect'), ...all.filter((r) => r.kind !== 'protect')].slice(0, MAX_REGIONS);
}

/** Local radius of `p` in `q` (< 1 inside), as the shader computes it. */
export function regionRadius(p: Vec, q: Region): number {
  const d = sub(p, q.c);
  const a = dot(d, q.axis);
  const b = dot(d, { x: -q.axis.y, y: q.axis.x });
  return Math.hypot(a / q.rx, b / q.ry);
}

// ── Shader uniforms ─────────────────────────────────────────────

export type RegionUniforms = { uRegionCount: number; uRegionA: number[]; uRegionB: number[] };

const EMPTY = new Array<number>(MAX_REGIONS * 4).fill(0);

export const NO_REGIONS: RegionUniforms = { uRegionCount: 0, uRegionA: EMPTY, uRegionB: EMPTY };

export function regionUniforms(regions: readonly Region[]): RegionUniforms {
  if (regions.length === 0) return NO_REGIONS;
  const a = EMPTY.slice();
  const b = EMPTY.slice();
  regions.slice(0, MAX_REGIONS).forEach((q, i) => {
    a.splice(i * 4, 4, q.c.x, q.c.y, q.axis.x, q.axis.y);
    b.splice(i * 4, 4, q.rx, q.ry, REGION_CODE[q.kind], q.amount);
  });
  return { uRegionCount: Math.min(regions.length, MAX_REGIONS), uRegionA: a, uRegionB: b };
}

/**
 * SkSL for the regions, spliced into the Lumi shader after the helpers it
 * uses (luma, skinMask, ringBlur). `regionProtect` is evaluated once per
 * pixel; `regionTone` applies the tone tools.
 */
export const REGION_SKSL = `
// ── Face regions (services/faceWarp/regions.ts) ───────────────
uniform float uRegionCount;
// centre.xy, axis.xy
uniform float4 uRegionA[${MAX_REGIONS}];
// rx, ry, kind (0 protect, 1 eye, 2 underEye, 3 aegyo, 4 mouth, 5 crease, 6 face), amount
uniform float4 uRegionB[${MAX_REGIONS}];

float regionR(float2 p, float4 A, float4 B) {
  float2 d = p - A.xy;
  return length(float2(dot(d, A.zw) / B.x, dot(d, float2(-A.w, A.z)) / B.y));
}

// 1 on eyes, brows, lips and nostrils (feathered), else 0.
float regionProtect(float2 p) {
  float m = 0.0;
  for (int i = 0; i < ${MAX_REGIONS}; i++) {
    if (float(i) >= uRegionCount) break;
    float4 B = uRegionB[i];
    if (B.z > 0.5) continue;
    m = max(m, 1.0 - smoothstep(0.75, 1.2, regionR(p, uRegionA[i], B)));
  }
  return m;
}

float3 toYcc(float3 c) {
  return float3(dot(c, float3(0.299, 0.587, 0.114)),
                0.5 - 0.168736 * c.r - 0.331264 * c.g + 0.5 * c.b,
                0.5 + 0.5 * c.r - 0.418688 * c.g - 0.081312 * c.b);
}

float3 fromYcc(float3 y) {
  return float3(y.x + 1.402 * (y.z - 0.5),
                y.x - 0.344136 * (y.y - 0.5) - 0.714136 * (y.z - 0.5),
                y.x + 1.772 * (y.y - 0.5));
}

float3 regionTone(float2 p, float3 c, float3 src, float protect) {
  for (int i = 0; i < ${MAX_REGIONS}; i++) {
    if (float(i) >= uRegionCount) break;
    float4 A = uRegionA[i];
    float4 B = uRegionB[i];
    float kind = B.z;
    float amt = B.w;
    if (kind < 0.5 || amt <= 0.0) continue;
    float2 ay = float2(-A.w, A.z);
    float r = regionR(p, A, B);

    if (kind < 3.5 && kind > 2.5) {
      // 애교살: a soft highlight on the band under the lid, a faint shade under it.
      float r2 = regionR(p - ay * B.y * 1.8, A, B);
      if (r >= 1.0 && r2 >= 1.0) continue;
      float m1 = (1.0 - smoothstep(0.25, 1.0, r)) * (1.0 - protect);
      float m2 = (1.0 - smoothstep(0.2, 1.0, r2)) * (1.0 - protect) * (1.0 - m1);
      c += (1.0 - c) * (0.11 * amt * m1);
      c *= 1.0 - 0.07 * amt * m2;
      continue;
    }
    if (r >= 1.0) continue;

    if (kind < 1.5) {
      // Eye: clearer iris (local contrast) on the dark parts, a whiter,
      // less red sclera on the bright low-chroma parts.
      float m = 1.0 - smoothstep(0.55, 1.0, r);
      float3 local = ringBlur(p, max(1.0, B.y * 0.3));
      float l = luma(c);
      float chroma = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
      float sclera = smoothstep(0.32, 0.55, l) * (1.0 - smoothstep(0.1, 0.28, chroma));
      float3 o = c + (c - local) * 0.8 * (1.0 - sclera);
      float3 w = mix(o, float3(luma(o)), 0.35) ;
      w += (1.0 - w) * 0.22;
      o = mix(o, w, sclera);
      c = mix(c, o, m * amt);
    } else if (kind < 2.5) {
      // Dark circle: lift the hollow toward the cheek's tone measured just
      // below it. Only what is darker than the cheek moves, and only its
      // low-frequency colour: pores and lashes' shadows keep their detail.
      float m = (1.0 - smoothstep(0.4, 1.0, r)) * (1.0 - protect);
      float3 ref = ringBlur(A.xy + ay * B.y * 2.0, B.y * 0.45);
      float3 local = (ringBlur(p, B.y * 0.22) + ringBlur(p, B.y * 0.44)) * 0.5;
      float lift = smoothstep(0.0, 0.05, luma(ref) - luma(local));
      // Lashes and lid lines are much darker than their own surroundings
      // (a hollow is not): leave them dark.
      float lash = smoothstep(0.03, 0.1, luma(local) - luma(c));
      c += clamp(ref - local, float3(-0.02), float3(0.16)) * lift * m * amt * 0.9 * (1.0 - lash);
    } else if (kind < 4.5) {
      // Teeth: inside the mouth opening, only bright, low-saturation,
      // not-red pixels (teeth, not lips, gums or tongue) lose their yellow.
      float m = 1.0 - smoothstep(0.7, 1.0, r);
      float3 y = toYcc(c);
      float chroma = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
      float t = smoothstep(0.22, 0.42, y.x) * (1.0 - smoothstep(0.22, 0.36, chroma)) * (1.0 - smoothstep(0.565, 0.6, y.z));
      float3 w = fromYcc(float3(y.x + (1.0 - y.x) * 0.12, mix(y.y, 0.5, 0.75), mix(y.z, 0.5, 0.5)));
      c = mix(c, w, t * m * amt);
    } else if (kind < 5.5) {
      // Wrinkle: fine lines are darker than the skin around them; lift that
      // dark residual back to the local tone (bright pores are left alone).
      float m = (1.0 - smoothstep(0.45, 1.0, r)) * (1.0 - protect) * skinMask(src);
      float rad = max(1.0, B.y * 0.07);
      float3 local = (ringBlur(p, rad) + ringBlur(p, rad * 2.0)) * 0.5;
      float3 d = c - local;
      float crease = smoothstep(0.0, 0.035, -luma(d));
      c -= d * crease * m * amt * 0.9;
    } else {
      // Redness: skin redder than a calm skin tone gives up part of its excess.
      float m = (1.0 - smoothstep(0.7, 1.0, r)) * (1.0 - protect) * skinMask(src);
      float3 y = toYcc(c);
      // Red → warm skin (Cr down, a touch toward yellow), not toward green.
      float excess = clamp(y.z - 0.56, 0.0, 0.08);
      y.z -= excess * 0.5 * m * amt;
      y.y -= excess * 0.15 * m * amt;
      c = fromYcc(y);
    }
  }
  return c;
}
`;
