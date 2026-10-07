import { Skia, type SkRuntimeEffect } from '@shopify/react-native-skia';

import { MAX_SPOTS } from '@/services/blemish';
import { RESHAPE_RANGE } from '@/services/reshape';

/**
 * Lumi's single-pass image pipeline, written in SkSL.
 *
 * Order of operations:
 *   face warp → retouch (skin-tone masked) → local detail → exposure/brightness →
 *   white balance → highlights/shadows → contrast → saturation/vibrance →
 *   split tone → glow → fade → vignette → grain
 *
 * All radii are expressed in "uPixel" units (1/1000 of the image's short side)
 * so the on-screen preview and the full-resolution export look the same.
 *
 * Retouch note: skin areas are detected with a YCbCr colour-range mask, not
 * semantic face segmentation. Smoothing is an edge-preserving (bilateral)
 * average restricted to that mask, so edges, eyes and hair are kept sharp.
 *
 * Face warp: with face landmarks, the sampling position is displaced before
 * anything else reads the image — a radial bulge around each eye (눈 크게)
 * and a smooth horizontal squeeze of the lower face toward its midline
 * (얼굴 갸름). Before that, the 터치 보정 displacement field (two 16-bit
 * encoded textures, see services/reshape.ts) is applied, since strokes are
 * drawn on what the user sees. Vignette and grain use the unwarped position.
 */
export const LUMI_SKSL = `
uniform shader image;
// 터치 보정 displacement, x and y: R = high byte, G = low byte of 0…1.
uniform shader dispX;
uniform shader dispY;
uniform float uReshape;
uniform float2 uResolution;
uniform float uPixel;

uniform float uExposure;
uniform float uBrightness;
uniform float uContrast;
uniform float uHighlights;
uniform float uShadows;
uniform float uSaturation;
uniform float uVibrance;
uniform float uWarmth;
uniform float uTemperature;
uniform float uTint;
uniform float uSharpness;
uniform float uDefinition;
uniform float uFade;
uniform float uVignette;
uniform float uGrain;
uniform float uGrainSeed;

uniform float uSkin;
uniform float uSmooth;
uniform float uTone;
uniform float uGlow;
uniform float uDetail;

uniform float uEyes;
uniform float3 uEyeL;
uniform float3 uEyeR;
uniform float uSlim;
// Face frame: origin between the eyes, unit vector toward the chin.
uniform float2 uFaceOrigin;
uniform float2 uFaceDown;
uniform float uFaceHalfWidth;
uniform float uFaceLength;

// 잡티 제거: xy = centre, z = radius (render pixels).
uniform float3 uSpots[${MAX_SPOTS}];
uniform float uSpotCount;

uniform float3 uShadowTint;
uniform float3 uHighlightTint;
uniform float uSplit;

const float3 LUMA = float3(0.2126, 0.7152, 0.0722);

float luma(float3 c) {
  return dot(c, LUMA);
}

float hash12(float2 p) {
  float3 p3 = fract(float3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float skinMask(float3 c) {
  float y = dot(c, float3(0.299, 0.587, 0.114));
  float cb = 0.5 - 0.168736 * c.r - 0.331264 * c.g + 0.5 * c.b;
  float cr = 0.5 + 0.5 * c.r - 0.418688 * c.g - 0.081312 * c.b;
  float mCb = smoothstep(0.27, 0.31, cb) * (1.0 - smoothstep(0.48, 0.52, cb));
  float mCr = smoothstep(0.51, 0.55, cr) * (1.0 - smoothstep(0.66, 0.70, cr));
  float mY = smoothstep(0.12, 0.28, y) * (1.0 - smoothstep(0.96, 1.0, y));
  return mCb * mCr * mY;
}

float3 bilateral(float2 xy, float3 center, float radius, float sigma) {
  float3 sum = center;
  float wsum = 1.0;
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5235988;
    float r = mod(float(i), 2.0) < 0.5 ? radius : radius * 0.5;
    float3 s = image.eval(xy + float2(cos(a), sin(a)) * r).rgb;
    float3 d = s - center;
    float w = exp(-dot(d, d) / sigma);
    sum += s * w;
    wsum += w;
  }
  return sum / wsum;
}

float3 ringBlur(float2 xy, float radius) {
  float3 sum = float3(0.0);
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7853982;
    sum += image.eval(xy + float2(cos(a), sin(a)) * radius).rgb;
  }
  return sum / 8.0;
}

// Magnifies the disc eye.xy/eye.z; continuous (no seam) at its rim.
// 눈 크게: magnifies an ellipse around the eye, wider along the eye line than
// across it, so the brows and cheeks barely move. The radial profile
// (1 − t²)² fades to nothing at the rim and stays monotonic (no folds).
float2 bulge(float2 p, float3 eye, float s) {
  float2 down = uFaceDown;
  float2 across = float2(-down.y, down.x);
  float2 d = p - eye.xy;
  float u = dot(d, across) / (eye.z * 0.95);
  float v = dot(d, down) / (eye.z * 0.67);
  float t2 = u * u + v * v;
  if (t2 >= 1.0) return p;
  float f = 1.0 - t2;
  return eye.xy + d * (1.0 - s * f * f);
}

// 얼굴 갸름: squeezes the lower face toward its midline. In face units
// (s across, 1 = cheekbone; t down, 0 = eyes, 1 = chin) content is sampled
// from s·(1 + k). k is ~0 near the midline (nose and mouth keep their shape)
// and rises toward the contour; it fades in below the cheekbones, peaks along
// the jaw, and fades out under the chin and outside the face, so nothing
// creases. The mapping stays monotonic (no folds) for k well under 0.3.
float2 slim(float2 p) {
  float2 down = uFaceDown;
  float2 across = float2(-down.y, down.x);
  float2 d = p - uFaceOrigin;
  float s = dot(d, across) / uFaceHalfWidth;
  float t = dot(d, down) / uFaceLength;
  float wt = smoothstep(0.15, 0.7, t) * (1.0 - smoothstep(1.0, 1.4, t));
  float ws = smoothstep(0.2, 0.85, abs(s)) * (1.0 - smoothstep(0.95, 1.75, abs(s)));
  float k = uSlim * 0.11 * wt * ws;
  return p + across * (s * k * uFaceHalfWidth);
}

float2 faceWarp(float2 p) {
  if (uSlim > 0.0 && uFaceHalfWidth > 0.0) {
    p = slim(p);
  }
  if (uEyes > 0.0 && uEyeL.z > 0.0) {
    p = bulge(p, uEyeL, uEyes * 0.22);
    p = bulge(p, uEyeR, uEyes * 0.22);
  }
  return p;
}

float decode16(half4 c) {
  return (float(c.r) * 65280.0 + float(c.g) * 255.0) / 65535.0;
}

float2 reshape(float2 p) {
  float2 v = float2(decode16(dispX.eval(p)), decode16(dispY.eval(p)));
  return p + (v - 0.5) * ${(RESHAPE_RANGE * 2).toFixed(4)} * uResolution;
}

float3 blur4(float2 p, float r) {
  return (image.eval(p + float2(r, 0.0)).rgb + image.eval(p - float2(r, 0.0)).rgb +
          image.eval(p + float2(0.0, r)).rgb + image.eval(p - float2(0.0, r)).rgb) * 0.25;
}

// 잡티 제거 (frequency-separated heal).
// Tone: a ring of softly blurred skin just outside the spot, weighted toward
// the side the pixel is on; ring samples darker than the ring's average (the
// blemish leaking past a too-small circle) count less.
// Texture: fine detail from whichever of 8 nearby patches best matches the
// ring tone, so pores carry over but brows, lips or creases don't; its
// strength is matched to the skin texture around the spot, so the patch is
// neither grainier nor smoother than its surroundings.
// Mask: feathered to the rim, and a little past it wherever the pixel still
// differs from the fill (a slightly off-centre tap leaves no halo).
float3 heal(float2 p, float3 c) {
  for (int i = 0; i < ${MAX_SPOTS}; i++) {
    if (float(i) >= uSpotCount) break;
    float3 spot = uSpots[i];
    float r = spot.z;
    float dist = length(p - spot.xy);
    if (dist >= r * 1.25) continue;

    float3 ring[12];
    float3 mean = float3(0.0);
    float ringTex = 0.0;
    for (int k = 0; k < 12; k++) {
      float a = float(k) * 0.5235988;
      float2 q = spot.xy + float2(cos(a), sin(a)) * r * 1.3;
      ring[k] = blur4(q, r * 0.3);
      mean += ring[k];
      float3 hi = image.eval(q).rgb - ring[k];
      ringTex += dot(hi, hi);
    }
    mean /= 12.0;
    ringTex /= 12.0;
    float lm = luma(mean);
    float3 sum = float3(0.0);
    float wsum = 0.0;
    for (int k = 0; k < 12; k++) {
      float a = float(k) * 0.5235988;
      float2 q = spot.xy + float2(cos(a), sin(a)) * r * 1.3;
      float dark = max(0.0, lm - luma(ring[k]));
      float w = exp(-dark * dark * 400.0) / pow(0.15 * r + length(p - q), 2.0);
      sum += ring[k] * w;
      wsum += w;
    }
    float3 tone = sum / wsum;

    float2 offset = float2(r * 2.2, 0.0);
    float bestErr = 1e9;
    for (int k = 0; k < 8; k++) {
      float a = float(k) * 0.7853982;
      float2 o = float2(cos(a), sin(a)) * r * 2.2;
      float3 d = blur4(spot.xy + o, r * 0.6) - tone;
      float err = dot(d, d);
      if (err < bestErr) {
        bestErr = err;
        offset = o;
      }
    }
    float donorTex = 0.0;
    for (int k = 0; k < 4; k++) {
      float a = float(k) * 1.5707963 + 0.7853982;
      float2 q = spot.xy + offset + float2(cos(a), sin(a)) * r * 0.6;
      float3 hi = image.eval(q).rgb - blur4(q, r * 0.3);
      donorTex += dot(hi, hi);
    }
    donorTex /= 4.0;
    float texGain = clamp(sqrt(ringTex / max(donorTex, 1e-6)), 0.5, 1.5);
    float2 donor = p + offset;
    float3 grain = (image.eval(donor).rgb - blur4(donor, max(r * 0.3, 1.0))) * texGain;
    float3 fill = tone + grain;

    float t = dist / r;
    float m = 1.0 - smoothstep(0.7, 1.0, t);
    float halo = smoothstep(0.04, 0.1, length(c - tone)) * (1.0 - smoothstep(1.0, 1.25, t));
    c = mix(c, fill, max(m, halo));
  }
  return c;
}

half4 main(float2 pos) {
  float2 xy = faceWarp(uReshape > 0.5 ? reshape(pos) : pos);
  float3 src = image.eval(xy).rgb;
  if (uSpotCount > 0.0) src = heal(xy, src);
  float3 c = src;
  float px = uPixel;

  // ── Retouch ────────────────────────────────────────────────
  float skin = 0.0;
  if (uSkin > 0.0 || uSmooth > 0.0 || uTone != 0.0 || uDetail > 0.0) {
    skin = skinMask(src);
  }
  if (skin > 0.001) {
    if (uSkin > 0.0) {
      float3 fine = bilateral(xy, c, 2.5 * px, 0.012);
      c = mix(c, fine, skin * uSkin * 0.85);
    }
    if (uSmooth > 0.0) {
      float3 broad = bilateral(xy, c, 7.0 * px, 0.006);
      c = mix(c, broad, skin * uSmooth * 0.7);
    }
    if (uTone != 0.0) {
      float3 bright = c * float3(1.03, 1.0, 1.0) + 0.03;
      float3 tan = c * float3(1.04, 0.99, 0.93);
      c = mix(c, uTone > 0.0 ? bright : tan, skin * abs(uTone) * 0.8);
    }
  }

  // ── Local detail ───────────────────────────────────────────
  if (uSharpness > 0.0 || uDetail > 0.0) {
    float3 hi = src - ringBlur(xy, 1.2 * px);
    c += hi * uSharpness * 1.6;
    c += hi * uDetail * 1.4 * (1.0 - skin);
  }
  float3 broadBlur = c;
  if (uDefinition != 0.0 || uGlow > 0.0) {
    broadBlur = ringBlur(xy, 10.0 * px) * 0.5 + ringBlur(xy, 5.0 * px) * 0.5;
    if (uDefinition != 0.0) {
      float mid = clamp(1.0 - abs(luma(c) - 0.5) * 1.4, 0.2, 1.0);
      c += (src - broadBlur) * uDefinition * 0.9 * mid;
    }
  }

  // ── Light ──────────────────────────────────────────────────
  c *= exp2(uExposure);
  c = pow(max(c, float3(0.0)), float3(exp2(-uBrightness * 0.7)));

  // ── White balance ──────────────────────────────────────────
  c *= float3(1.0 + uTemperature * 0.10 + uTint * 0.02,
              1.0 + uTemperature * 0.02 - uTint * 0.07,
              1.0 - uTemperature * 0.12 + uTint * 0.02);
  float l = luma(c);
  c += float3(0.06, 0.02, -0.06) * uWarmth * clamp(4.0 * l * (1.0 - l), 0.0, 1.0);

  // ── Tone ───────────────────────────────────────────────────
  l = luma(c);
  float sh = 1.0 - smoothstep(0.0, 0.55, l);
  float hl = smoothstep(0.45, 1.0, l);
  c += uShadows * 0.28 * sh + uHighlights * 0.28 * hl;
  c = (c - 0.5) * (1.0 + uContrast * 0.6) + 0.5;

  // ── Colour ─────────────────────────────────────────────────
  l = luma(c);
  c = mix(float3(l), c, 1.0 + uSaturation);
  float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  l = luma(c);
  c = mix(float3(l), c, 1.0 + uVibrance * (1.0 - smoothstep(0.0, 0.6, sat)));

  if (uSplit > 0.0) {
    l = clamp(luma(c), 0.0, 1.0);
    c += (uShadowTint - 0.5) * (1.0 - l) * uSplit * 0.5;
    c += (uHighlightTint - 0.5) * l * uSplit * 0.5;
  }

  // ── Effects ────────────────────────────────────────────────
  if (uGlow > 0.0) {
    float g = clamp((luma(broadBlur) - 0.5) / 0.5, 0.0, 1.0);
    float3 bloom = clamp(broadBlur * g * uGlow * 0.9, 0.0, 1.0);
    c = 1.0 - (1.0 - clamp(c, 0.0, 1.0)) * (1.0 - bloom);
  }

  if (uFade > 0.0) {
    l = luma(c);
    c = mix(float3(l), c, 1.0 - uFade * 0.15);
    c = c * (1.0 - uFade * 0.22) + uFade * 0.11;
  }

  if (uVignette != 0.0) {
    float m = max(uResolution.x, uResolution.y);
    float2 d = (pos / uResolution - 0.5) * 2.0 * (uResolution / m);
    float v = smoothstep(0.35, 1.25, length(d));
    if (uVignette > 0.0) {
      c *= 1.0 - v * uVignette * 0.65;
    } else {
      c += v * (-uVignette) * 0.35 * (1.0 - c);
    }
  }

  if (uGrain > 0.0) {
    float2 cell = floor(pos / max(px * 1.1, 0.35));
    float n = hash12(cell + uGrainSeed) + hash12(cell * 1.37 + uGrainSeed + 17.0) - 1.0;
    l = clamp(luma(c), 0.0, 1.0);
    c += n * uGrain * 0.16 * (0.4 + 2.4 * l * (1.0 - l));
  }

  return half4(half3(clamp(c, 0.0, 1.0)), 1.0);
}
`;

let cached: SkRuntimeEffect | null = null;

/** Lazily compiled so that web can load CanvasKit before first use. */
export function getLumiEffect(): SkRuntimeEffect {
  if (!cached) {
    cached = Skia.RuntimeEffect.Make(LUMI_SKSL);
    if (!cached) throw new Error('Lumi shader failed to compile');
  }
  return cached;
}
