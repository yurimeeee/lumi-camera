import { Skia, type SkRuntimeEffect } from '@shopify/react-native-skia';

import { MAX_SPOTS } from '@/services/blemish';
import { HSL_CENTERS, HSL_MAX_HUE_SHIFT } from '@/services/color/hsl';
import { REGION_SKSL } from '@/services/faceWarp/regions';
import { FILM_SKSL } from '@/services/film/shader';
import { FACE_WARP_SKSL } from '@/services/faceWarp/shader';
import { RESHAPE_RANGE } from '@/services/reshape';

/**
 * Lumi's single-pass image pipeline, written in SkSL.
 *
 * Order of operations:
 *   face warp → lens fringing → retouch (skin-tone masked, face features
 *   protected) → face region tools (dark circle, wrinkle, redness, teeth,
 *   eyes) → local detail → flash →
 *   look A: exposure/brightness → white balance → highlights/shadows →
 *     contrast → saturation/vibrance → HSL → split tone → curves (LUT row 0)
 *   look B (filter mix, same stage with its own values, LUT row 1) →
 *   colour drift → glow → bloom / halation / soft focus → fade → grain →
 *   dust / scratches → light leak → film burn → vignette
 *
 * All radii are expressed in "uPixel" units (1/1000 of the image's short side)
 * so the on-screen preview and the full-resolution export look the same.
 *
 * Retouch note: skin is a YCbCr colour-range mask; when faces are known it is
 * cut by landmark regions (eyes, brows, lips, nostrils — services/faceWarp/
 * regions.ts), so those stay crisp even where their colour reads as skin.
 * Smoothing is an edge-preserving (bilateral) average restricted to that
 * mask. Tools that need a specific area (under-eye, teeth, eyes, creases)
 * only act inside their landmark region, never on the whole face.
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

/** HSL for one look stage, reading the band shifts from `arr` (uHsl / uHsl2). */
function applyHsl(name: string, arr: string): string {
  return `float3 ${name}(float3 c) {
  float chroma = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  float gate = smoothstep(0.02, 0.18, chroma);
  if (gate <= 0.0) return c;
  float3 hsl = rgb2hsl(c);
  float3 adj = float3(0.0);
${BANDS.map(([i, ce, pr, nx]) => `  adj += ${arr}[${i}] * bandWeight(hsl.x, ${deg(ce)}, ${deg(pr)}, ${deg(nx)});`).join('\n')}
  adj *= gate;
  float s = clamp(hsl.y * (1.0 + adj.y), 0.0, 1.0);
  float3 o = hsl2rgb(float3(fract(hsl.x + adj.x * ${deg(HSL_MAX_HUE_SHIFT)}), s, hsl.z));
  float a = adj.z * 0.35;
  return a > 0.0 ? o + (1.0 - o) * a : o * (1.0 + a);
}`;
}

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

${applyHsl('applyHslA', 'uHsl')}
${applyHsl('applyHslB', 'uHsl2')}

// Linear interpolation between the LUT's byte entries (texel centres are
// exact, whatever sampling the child shader uses). Row 0 = look A, row 1 =
// look B (filter mix).
float curveAt(float v, int ch, float row) {
  float x = clamp(v, 0.0, 1.0) * 255.0;
  float i0 = floor(x);
  float i1 = min(i0 + 1.0, 255.0);
  half4 a = curveLut.eval(float2(i0 + 0.5, row + 0.5));
  half4 b = curveLut.eval(float2(i1 + 0.5, row + 0.5));
  float f = x - i0;
  if (ch == 0) return mix(float(a.r), float(b.r), f);
  if (ch == 1) return mix(float(a.g), float(b.g), f);
  return mix(float(a.b), float(b.b), f);
}

float3 applyCurves(float3 c, float row) {
  return float3(curveAt(c.r, 0, row), curveAt(c.g, 1, row), curveAt(c.b, 2, row));
}
`;

export const LUMI_SKSL = `
uniform shader image;
// 터치 보정 displacement, x and y: R = high byte, G = low byte of 0…1.
uniform shader dispX;
uniform shader dispY;
// Tone curves: 256×2 RGB lookup, row 0 look A, row 1 look B (services/color/curves.ts).
uniform shader curveLut;
// The photo at low resolution (bloom, halation, soft focus).
uniform shader lowRes;
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

uniform float uSkin;
uniform float uSmooth;
uniform float uTexture;
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

// Look B (filter mix): (exposure, brightness, contrast, highlights),
// (shadows, saturation, vibrance, warmth), (temperature, tint, split, hslOn),
// (curvesOn, —, —, —); split tints; HSL bands.
uniform float uMixOn;
uniform float4 uMix[4];
uniform float3 uMixShadow;
uniform float3 uMixHighlight;
uniform float3 uHsl2[8];

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
${REGION_SKSL}
${FILM_SKSL}

// One look: light → white balance → tone → colour → HSL → split → curves.
// Look A (filter + adjustments) and look B (the mixed-in filter) both run it.
float3 lookStage(float3 c, float4 p0, float4 p1, float4 p2, float3 shT, float3 hiT, float curvesOn, float stage) {
  c *= exp2(p0.x);
  c = pow(max(c, float3(0.0)), float3(exp2(-p0.y * 0.7)));

  c *= float3(1.0 + p2.x * 0.10 + p2.y * 0.02,
              1.0 + p2.x * 0.02 - p2.y * 0.07,
              1.0 - p2.x * 0.12 + p2.y * 0.02);
  float l = luma(c);
  c += float3(0.06, 0.02, -0.06) * p1.w * clamp(4.0 * l * (1.0 - l), 0.0, 1.0);

  l = luma(c);
  float sh = 1.0 - smoothstep(0.0, 0.55, l);
  float hl = smoothstep(0.45, 1.0, l);
  c += p1.x * 0.28 * sh + p0.w * 0.28 * hl;
  c = (c - 0.5) * (1.0 + p0.z * 0.6) + 0.5;

  l = luma(c);
  c = mix(float3(l), c, 1.0 + p1.y);
  float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  l = luma(c);
  c = mix(float3(l), c, 1.0 + p1.z * (1.0 - smoothstep(0.0, 0.6, sat)));

  if (p2.w > 0.5) c = stage < 0.5 ? applyHslA(clamp(c, 0.0, 1.0)) : applyHslB(clamp(c, 0.0, 1.0));

  if (p2.z > 0.0) {
    l = clamp(luma(c), 0.0, 1.0);
    c += (shT - 0.5) * (1.0 - l) * p2.z * 0.5;
    c += (hiT - 0.5) * l * p2.z * 0.5;
  }

  if (curvesOn > 0.5) c = applyCurves(c, stage);
  return c;
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
  float filmOn = uFilm[6].y;
  if (filmOn > 0.5 && uFilm[2].w > 0.0) src = filmFringe(xy, src);
  if (uSpotCount > 0.0) src = heal(xy, src);
  float3 c = src;
  float px = uPixel;

  // ── Retouch ────────────────────────────────────────────────
  float protect = uRegionCount > 0.0 ? regionProtect(xy) : 0.0;
  float skin = 0.0;
  if (uSkin > 0.0 || uSmooth > 0.0 || uTexture != 0.0 || uTone != 0.0 || uDetail > 0.0) {
    skin = skinMask(src) * (1.0 - protect);
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

  if (uRegionCount > 0.0) c = regionTone(xy, c, src, protect);

  // ── Local detail ───────────────────────────────────────────
  if (uSharpness > 0.0 || uDetail > 0.0 || uTexture != 0.0) {
    float3 hi = src - ringBlur(xy, 1.2 * px);
    c += hi * uSharpness * 1.6;
    c += hi * uDetail * 1.4 * (1.0 - skin);
    // 피부결: + brings pores back over smoothing, − softens fine texture.
    c += hi * uTexture * (uTexture > 0.0 ? 1.1 : 0.9) * skin;
  }
  float3 broadBlur = c;
  if (uDefinition != 0.0 || uGlow > 0.0) {
    broadBlur = ringBlur(xy, 10.0 * px) * 0.5 + ringBlur(xy, 5.0 * px) * 0.5;
    if (uDefinition != 0.0) {
      float mid = clamp(1.0 - abs(luma(c) - 0.5) * 1.4, 0.2, 1.0);
      c += (src - broadBlur) * uDefinition * 0.9 * mid;
    }
  }

  float2 uv = pos / uResolution;
  float2 aspect = uResolution / min(uResolution.x, uResolution.y);
  if (filmOn > 0.5 && uFilm[5].w > 0.0) c = filmFlash(uv, aspect, c);

  // ── Look A: filter + adjustments ───────────────────────────
  c = lookStage(c, float4(uExposure, uBrightness, uContrast, uHighlights), float4(uShadows, uSaturation, uVibrance, uWarmth),
                float4(uTemperature, uTint, uSplit, uHslOn), uShadowTint, uHighlightTint, uCurvesOn, 0.0);
  // ── Look B: filter mix ─────────────────────────────────────
  if (uMixOn > 0.5) c = lookStage(c, uMix[0], uMix[1], uMix[2], uMixShadow, uMixHighlight, uMix[3].x, 1.0);
  if (filmOn > 0.5 && uFilm[6].x > 0.0) c = filmDrift(uv, c);

  // ── Effects ────────────────────────────────────────────────
  if (uGlow > 0.0) {
    float g = clamp((luma(broadBlur) - 0.5) / 0.5, 0.0, 1.0);
    float3 bloom = clamp(broadBlur * g * uGlow * 0.9, 0.0, 1.0);
    c = 1.0 - (1.0 - clamp(c, 0.0, 1.0)) * (1.0 - bloom);
  }
  if (filmOn > 0.5) c = filmLight(xy, c);

  if (uFade > 0.0) {
    float l = luma(c);
    c = mix(float3(l), c, 1.0 - uFade * 0.15);
    c = c * (1.0 - uFade * 0.22) + uFade * 0.11;
  }

  if (uGrain > 0.0) c = filmGrain(pos, c, uGrain);
  if (filmOn > 0.5) {
    c = filmMarks(pos, uv, c);
    if (uFilm[3].x > 0.0) c = filmLeak(uv, aspect, c);
    if (uFilm[4].y > 0.0) c = filmBurn(uv, aspect, c);
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
