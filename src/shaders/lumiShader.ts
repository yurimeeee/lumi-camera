import { Skia, type SkRuntimeEffect } from '@shopify/react-native-skia';

import { MAX_SPOTS } from '@/services/blemish';
import { HSL_CENTERS, HSL_MAX_HUE_SHIFT } from '@/services/color/hsl';
import { FACE_WARP_SKSL } from '@/services/faceWarp/shader';
import { RESHAPE_RANGE } from '@/services/reshape';

/**
 * Lumi's single-pass image pipeline, written in SkSL.
 *
 * Order of operations:
 *   face warp → retouch (skin-tone masked) → local detail → exposure/brightness →
 *   white balance → highlights/shadows → contrast → saturation/vibrance →
 *   HSL (per colour) → split tone → tone curves (LUT) → glow → fade →
 *   vignette → grain
 *
 * All radii are expressed in "uPixel" units (1/1000 of the image's short side)
 * so the on-screen preview and the full-resolution export look the same.
 *
 * Retouch note: skin areas are detected with a YCbCr colour-range mask, not
 * semantic face segmentation. Smoothing is an edge-preserving (bilateral)
 * average restricted to that mask, so edges, eyes and hair are kept sharp.
 *
 * Face warp: with face landmarks, the sampling position is displaced before
 * anything else reads the image (services/faceWarp: contour + proportion
 * field and feature primitives), so skin retouch, colour, filter and effects
 * all see the reshaped face. Before that, the 터치 보정 displacement field
 * (two 16-bit encoded textures, see services/reshape.ts) is applied, since
 * strokes are drawn on what the user sees. Vignette and grain use the
 * unwarped position.
 */
const deg = (v: number) => (v / 360).toFixed(6);
const C = HSL_CENTERS;
/** [band index, centre, previous centre, next centre] in hue order (0…1 turns). */
const BANDS = [
  [0, C.red, C.magenta - 360, C.orange],
  [1, C.orange, C.red, C.yellow],
  [2, C.yellow, C.orange, C.green],
  [3, C.green, C.yellow, C.aqua],
  [4, C.aqua, C.green, C.blue],
  [5, C.blue, C.aqua, C.purple],
  [6, C.purple, C.blue, C.magenta],
  [7, C.magenta, C.purple, C.red + 360],
] as const;

/**
 * HSL per colour band, mirrored on the CPU by applyHslCpu (tests). Weights
 * fall off with smoothstep to the neighbouring band centres, so they sum to
 * 1 everywhere; near-grey pixels are gated out.
 */
const HSL_SKSL = `
float3 rgb2hsl(float3 c) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float l = (mx + mn) * 0.5;
  float d = mx - mn;
  if (d < 1e-6) return float3(0.0, 0.0, l);
  float s = d / (1.0 - abs(2.0 * l - 1.0) + 1e-6);
  float h;
  if (mx == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
  else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
  else h = (c.r - c.g) / d + 4.0;
  return float3(fract(h / 6.0), s, l);
}

float3 hsl2rgb(float3 hsl) {
  float3 k = clamp(abs(mod(hsl.x * 6.0 + float3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  float c = (1.0 - abs(2.0 * hsl.z - 1.0)) * hsl.y;
  return hsl.z + c * (k - 0.5);
}

// Weight of a band centred at ce (turns) with neighbours at pr and nx.
float bandWeight(float h, float ce, float pr, float nx) {
  float d = h - ce;
  d -= floor(d + 0.5);
  return d < 0.0 ? 1.0 - smoothstep(0.0, ce - pr, -d) : 1.0 - smoothstep(0.0, nx - ce, d);
}

float3 applyHsl(float3 c) {
  float chroma = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  float gate = smoothstep(0.02, 0.18, chroma);
  if (gate <= 0.0) return c;
  float3 hsl = rgb2hsl(c);
  float3 adj = float3(0.0);
${BANDS.map(([i, ce, pr, nx]) => `  adj += uHsl[${i}] * bandWeight(hsl.x, ${deg(ce)}, ${deg(pr)}, ${deg(nx)});`).join('\n')}
  adj *= gate;
  float s = clamp(hsl.y * (1.0 + adj.y), 0.0, 1.0);
  float3 o = hsl2rgb(float3(fract(hsl.x + adj.x * ${deg(HSL_MAX_HUE_SHIFT)}), s, hsl.z));
  float a = adj.z * 0.35;
  return a > 0.0 ? o + (1.0 - o) * a : o * (1.0 + a);
}

// Linear interpolation between the LUT's byte entries (texel centres are
// exact, whatever sampling the child shader uses).
float curveAt(float v, int ch) {
  float x = clamp(v, 0.0, 1.0) * 255.0;
  float i0 = floor(x);
  float i1 = min(i0 + 1.0, 255.0);
  half4 a = curveLut.eval(float2(i0 + 0.5, 0.5));
  half4 b = curveLut.eval(float2(i1 + 0.5, 0.5));
  float f = x - i0;
  if (ch == 0) return mix(float(a.r), float(b.r), f);
  if (ch == 1) return mix(float(a.g), float(b.g), f);
  return mix(float(a.b), float(b.b), f);
}

float3 applyCurves(float3 c) {
  return float3(curveAt(c.r, 0), curveAt(c.g, 1), curveAt(c.b, 2));
}
`;

export const LUMI_SKSL = `
uniform shader image;
// 터치 보정 displacement, x and y: R = high byte, G = low byte of 0…1.
uniform shader dispX;
uniform shader dispY;
// Tone curves: 256×1 RGB lookup (services/color/curves.ts).
uniform shader curveLut;
uniform float uCurvesOn;
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

// 잡티 제거: xy = centre, z = radius (render pixels).
uniform float3 uSpots[${MAX_SPOTS}];
uniform float uSpotCount;

uniform float3 uShadowTint;
uniform float3 uHighlightTint;
uniform float uSplit;

// HSL: per band (hue, saturation, luminance) in -1…1; see services/color/hsl.ts.
uniform float3 uHsl[8];
uniform float uHslOn;

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

${HSL_SKSL}
${FACE_WARP_SKSL}
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

// 잡티 제거 (healing brush). A nearby patch of skin (the donor) is copied
// whole, so pores and fine shading stay intact, and the colour difference
// between the spot's surroundings and the donor's surroundings is blended in
// from the rim (a membrane interpolation), so the copy meets the spot's edge
// seamlessly. The donor is the nearby patch that best matches the spot's
// surroundings in tone while being flat (no brows, lips or creases). Ring
// samples darker than the ring average (blemish leaking past a too-small
// circle) count less. Feathered to the rim, and a little past it wherever the
// pixel still differs from its surroundings (an off-centre tap leaves no halo).
float3 heal(float2 p, float3 c) {
  for (int i = 0; i < ${MAX_SPOTS}; i++) {
    if (float(i) >= uSpotCount) break;
    float3 spot = uSpots[i];
    float r = spot.z;
    float dist = length(p - spot.xy);
    if (dist >= r * 1.25) continue;

    float3 ring[12];
    float3 mean = float3(0.0);
    for (int k = 0; k < 12; k++) {
      float a = float(k) * 0.5235988;
      ring[k] = blur4(spot.xy + float2(cos(a), sin(a)) * r * 1.3, r * 0.3);
      mean += ring[k];
    }
    mean /= 12.0;
    float lm = luma(mean);

    // Donor: 8 candidates around the spot, scored by tone match + flatness.
    float2 offset = float2(r * 2.4, 0.0);
    float bestErr = 1e9;
    for (int k = 0; k < 8; k++) {
      float a = float(k) * 0.7853982;
      float2 o = float2(cos(a), sin(a)) * r * 2.4;
      float3 m4 = float3(0.0);
      float3 sq = float3(0.0);
      for (int j = 0; j < 4; j++) {
        float b = float(j) * 1.5707963;
        float3 v = blur4(spot.xy + o + float2(cos(b), sin(b)) * r * 0.9, r * 0.3);
        m4 += v;
        sq += v * v;
      }
      m4 *= 0.25;
      float3 var = max(sq * 0.25 - m4 * m4, float3(0.0));
      float3 d = m4 - mean;
      float err = dot(d, d) + 2.0 * (var.r + var.g + var.b);
      if (err < bestErr) {
        bestErr = err;
        offset = o;
      }
    }

    float3 diff = float3(0.0);
    float3 tone = float3(0.0);
    float wsum = 0.0;
    for (int k = 0; k < 12; k++) {
      float a = float(k) * 0.5235988;
      float2 q = spot.xy + float2(cos(a), sin(a)) * r * 1.3;
      float3 donorRing = blur4(q + offset, r * 0.3);
      float dark = max(0.0, lm - luma(ring[k]));
      float w = exp(-dark * dark * 400.0) / pow(0.15 * r + length(p - q), 2.0);
      diff += (ring[k] - donorRing) * w;
      tone += ring[k] * w;
      wsum += w;
    }
    diff /= wsum;
    tone /= wsum;
    float3 fill = image.eval(p + offset).rgb + diff;

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

  if (uHslOn > 0.5) c = applyHsl(clamp(c, 0.0, 1.0));

  if (uSplit > 0.0) {
    l = clamp(luma(c), 0.0, 1.0);
    c += (uShadowTint - 0.5) * (1.0 - l) * uSplit * 0.5;
    c += (uHighlightTint - 0.5) * l * uSplit * 0.5;
  }

  if (uCurvesOn > 0.5) c = applyCurves(c);

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
