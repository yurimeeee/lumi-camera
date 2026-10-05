import { Skia, type SkRuntimeEffect } from '@shopify/react-native-skia';

/**
 * Lumi's single-pass image pipeline, written in SkSL.
 *
 * Order of operations:
 *   retouch (skin-tone masked) → local detail → exposure/brightness →
 *   white balance → highlights/shadows → contrast → saturation/vibrance →
 *   split tone → glow → fade → vignette → grain
 *
 * All radii are expressed in "uPixel" units (1/1000 of the image's short side)
 * so the on-screen preview and the full-resolution export look the same.
 *
 * Retouch note: skin areas are detected with a YCbCr colour-range mask, not
 * semantic face segmentation. Smoothing is an edge-preserving (bilateral)
 * average restricted to that mask, so edges, eyes and hair are kept sharp.
 */
export const LUMI_SKSL = `
uniform shader image;
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

half4 main(float2 xy) {
  float3 src = image.eval(xy).rgb;
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
    float2 d = (xy / uResolution - 0.5) * 2.0 * (uResolution / m);
    float v = smoothstep(0.35, 1.25, length(d));
    if (uVignette > 0.0) {
      c *= 1.0 - v * uVignette * 0.65;
    } else {
      c += v * (-uVignette) * 0.35 * (1.0 - c);
    }
  }

  if (uGrain > 0.0) {
    float2 cell = floor(xy / max(px * 1.1, 0.35));
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
