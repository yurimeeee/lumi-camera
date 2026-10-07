import { MAX_BANDS, MAX_PRIMS, MAX_WARP_FACES } from './FaceWarpEngine';
import { BLOCK_FADE, CONTOUR_SPREAD, PROFILE_DT, PROFILE_FLOOR, PROFILE_LEVELS, PROFILE_T0 } from './mesh';

const f = (v: number) => v.toFixed(5);

/**
 * SkSL for the face warp, spliced into the Lumi shader. A line-for-line
 * mirror of `fieldBackward` / `primBackward` in FaceWarpEngine.ts — change
 * both together. Array indices only use loop indices (SkSL's ES2 rules).
 */
export const FACE_WARP_SKSL = `
// ── Face warp (services/faceWarp) ─────────────────────────────
uniform float uFaceCount;
// xy = face origin (eye-line midpoint, px), z = L (eye line → chin, px), w = reach (L units)
uniform float4 uFaceFrame[${MAX_WARP_FACES}];
// xy = across (unit), zw = down (unit)
uniform float4 uFaceAxes[${MAX_WARP_FACES}];
// x, y = face block half-width (neg, pos side) for proportion edits (L units)
uniform float4 uFaceBlock[${MAX_WARP_FACES}];
// per face × level: outline half-width (neg, pos side), inward ratio (neg, pos side)
uniform float4 uFaceProfile[${MAX_WARP_FACES * PROFILE_LEVELS}];
// per face: vertical bands (t0, t1, amount, 0)
uniform float4 uFaceBand[${MAX_WARP_FACES * MAX_BANDS}];
uniform float uPrimCount;
// centre.xy, rx, ryUp
uniform float4 uPrimA[${MAX_PRIMS}];
// axis.xy, ryDown, core
uniform float4 uPrimB[${MAX_PRIMS}];
// kind (0 move, 1 scale), move.xy or (kx, ky)
uniform float4 uPrimC[${MAX_PRIMS}];

float bsp(float x) {
  x = abs(x);
  if (x >= 2.0) return 0.0;
  if (x >= 1.0) {
    float y = 2.0 - x;
    return y * y * y / 6.0;
  }
  return (4.0 - 6.0 * x * x + 3.0 * x * x * x) / 6.0;
}

// Contour (face shape) + vertical bands (proportion), in each face's frame.
float2 faceField(float2 p) {
  for (int i = 0; i < ${MAX_WARP_FACES}; i++) {
    if (float(i) >= uFaceCount) break;
    float4 fr = uFaceFrame[i];
    float4 ax = uFaceAxes[i];
    float2 d = p - fr.xy;
    float s = dot(d, ax.xy) / fr.z;
    float t = dot(d, ax.zw) / fr.z;
    if (t < ${f(PROFILE_T0 - 0.3)} || t > 1.6 || abs(s) > fr.w) continue;
    float H = 0.0;
    float D = 0.0;
    for (int k = 0; k < ${PROFILE_LEVELS}; k++) {
      float w = bsp((t - (${f(PROFILE_T0)} + float(k) * ${f(PROFILE_DT)})) / ${f(PROFILE_DT)});
      if (w > 0.0) {
        float4 pr = uFaceProfile[i * ${PROFILE_LEVELS} + k];
        H += w * (s < 0.0 ? pr.x : pr.y);
        D += w * (s < 0.0 ? pr.z : pr.w);
      }
    }
    H = max(H, ${f(PROFILE_FLOOR)});
    float u = abs(s) / H;
    float g = smoothstep(0.3, 1.0, u) * (1.0 - smoothstep(1.0, ${f(1 + CONTOUR_SPREAD)}, u));
    float V = 0.0;
    for (int j = 0; j < ${MAX_BANDS}; j++) {
      float4 b = uFaceBand[i * ${MAX_BANDS} + j];
      if (b.z != 0.0) V += b.z * smoothstep(b.x, b.y, t);
    }
    float4 blk = uFaceBlock[i];
    float m = 1.0 - smoothstep(1.0, ${f(BLOCK_FADE)}, abs(s) / (s < 0.0 ? blk.x : blk.y));
    p += (ax.xy * (sign(s) * D * g * H) + ax.zw * (V * m)) * fr.z;
  }
  return p;
}

// Feature primitives: elliptical, flat core + smoothstep rim; move or scale.
float2 featureWarp(float2 p) {
  for (int i = 0; i < ${MAX_PRIMS}; i++) {
    if (float(i) >= uPrimCount) break;
    float4 A = uPrimA[i];
    float4 B = uPrimB[i];
    float4 C = uPrimC[i];
    float2 ax = B.xy;
    float2 ay = float2(-ax.y, ax.x);
    float2 d = p - A.xy;
    float a = dot(d, ax);
    float b = dot(d, ay);
    float ry = b < 0.0 ? A.w : B.z;
    float r = length(float2(a / A.z, b / ry));
    if (r >= 1.0) continue;
    float w = 1.0 - smoothstep(B.w, 1.0, r);
    if (C.x < 0.5) {
      p -= C.yz * w;
    } else {
      p = A.xy + ax * (a * (1.0 - C.y * w)) + ay * (b * (1.0 - C.z * w));
    }
  }
  return p;
}

float2 faceWarp(float2 p) {
  if (uPrimCount > 0.0) p = featureWarp(p);
  if (uFaceCount > 0.0) p = faceField(p);
  return p;
}
`;
