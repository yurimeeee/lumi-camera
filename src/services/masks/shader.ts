import { backgroundActive, isNeutralMaskAdjust, MAX_MASKS, SUBJECT_CHANNEL } from '@/constants/masks';
import type { BackgroundEdit, MaskAdjust, SelectiveMask } from '@/types/phase4';

import type { MaskAtlas } from './maskRaster';

/**
 * SkSL for the background stage (subject segmentation) and selective
 * adjustments. Inserted into the Lumi shader after retouch / local detail
 * and before look A (filter + global adjustments), so a filter colours the
 * composed picture as a whole. Both read the mask atlas at `xy` — the photo
 * position after the face / touch warps — so masks stay on the content.
 *
 * A mask's adjustments run through the same `lookStage` as the global
 * sliders (with HSL, split tone and curves off): local exposure +20 looks
 * exactly like global exposure +20 inside the mask. Clarity and sharpness
 * are local-contrast terms on the unadjusted photo, like 정의 / 선명도.
 */
export const MASK_SKSL = `
uniform shader maskAtlas;
// Behind the subject: blurred photo (premultiplied, normalised in the shader) or a replacement.
uniform shader bgLayer;
// Atlas tile width, height, stride (x of tile i = i × stride).
uniform float4 uMaskGrid;
uniform float uMaskCount;
// Mask slot shown as an apricot overlay (−1 = none).
uniform float uMaskOverlay;
// Any slot with clarity / sharpness (needs the blur samples).
uniform float uMaskDetail;
// Per slot: (exposure, brightness, contrast, highlights), (shadows, saturation, temperature, tint),
// (clarity, sharpness, range kind, active), range parameters.
uniform float4 uMaskA[${MAX_MASKS}];
uniform float4 uMaskB[${MAX_MASKS}];
uniform float4 uMaskC[${MAX_MASKS}];
uniform float4 uMaskD[${MAX_MASKS}];
// Background: (mode 0 none / 1 blur / 2 replace, amount, brightness, saturation), (edge low, edge high, on, —).
uniform float4 uBg;
uniform float4 uBgEdge;

float maskTex(float ch, float2 uv) {
  float tile = floor(ch / 3.0);
  float comp = ch - tile * 3.0;
  float2 p = float2(tile * uMaskGrid.z + clamp(uv.x * uMaskGrid.x, 2.0, uMaskGrid.x - 2.0),
                    clamp(uv.y * uMaskGrid.y, 2.0, uMaskGrid.y - 2.0));
  half4 t = maskAtlas.eval(p);
  return clamp(float(comp < 0.5 ? t.r : (comp < 1.5 ? t.g : t.b)), 0.0, 1.0);
}

float3 maskYcc(float3 c) {
  return float3(dot(c, float3(0.299, 0.587, 0.114)),
                0.5 - 0.168736 * c.r - 0.331264 * c.g + 0.5 * c.b,
                0.5 + 0.5 * c.r - 0.418688 * c.g - 0.081312 * c.b);
}

// Weight of one slot: atlas value × colour / luminance range (kinds 1/2 colour, 3/4 luminance; even = inverted).
float maskWeight(float ch, float4 cc, float4 d, float2 uv, float3 src) {
  float m = maskTex(ch, uv);
  float kind = cc.z;
  if (kind > 0.5 && kind < 2.5) {
    float3 q = maskYcc(clamp(src, 0.0, 1.0)) - d.xyz;
    float dist = length(float3(q.x * 0.5, q.y, q.z));
    float r = 1.0 - smoothstep(d.w * 0.45, d.w, dist);
    m *= kind < 1.5 ? r : 1.0 - r;
  } else if (kind > 2.5) {
    float l = clamp(luma(src), 0.0, 1.0);
    float f = max(d.z, 0.002);
    float lo = d.x <= 0.001 ? 1.0 : smoothstep(d.x - f, d.x + f * 0.25, l);
    float hi = d.y >= 0.999 ? 1.0 : 1.0 - smoothstep(d.y - f * 0.25, d.y + f, l);
    float r = lo * hi;
    m *= kind < 3.5 ? r : 1.0 - r;
  }
  return m;
}

float3 applyMasks(float3 c, float3 src, float2 xy) {
  float2 uv = xy / uResolution;
  float3 hi = float3(0.0);
  float3 broad = src;
  if (uMaskDetail > 0.5) {
    hi = src - ringBlur(xy, 1.2 * uPixel);
    broad = ringBlur(xy, 10.0 * uPixel) * 0.5 + ringBlur(xy, 5.0 * uPixel) * 0.5;
  }
  for (int i = 0; i < ${MAX_MASKS}; i++) {
    if (float(i) >= uMaskCount) break;
    float4 cc = uMaskC[i];
    if (cc.w < 0.5) continue;
    float m = maskWeight(float(i), cc, uMaskD[i], uv, src);
    if (m < 0.002) continue;
    float4 b = uMaskB[i];
    float3 a = lookStage(c, uMaskA[i], float4(b.x, b.y, 0.0, 0.0), float4(b.z, b.w, 0.0, 0.0), float3(0.5), float3(0.5), 0.0, 0.0);
    if (cc.x != 0.0) {
      float mid = clamp(1.0 - abs(luma(a) - 0.5) * 1.4, 0.2, 1.0);
      a += (src - broad) * cc.x * 0.9 * mid;
    }
    a += hi * cc.y * 1.6;
    c = mix(c, a, m);
  }
  return c;
}

float3 maskOverlay(float3 c, float3 src, float2 xy) {
  float2 uv = xy / uResolution;
  for (int i = 0; i < ${MAX_MASKS}; i++) {
    if (float(i) != uMaskOverlay) continue;
    float m = maskWeight(float(i), uMaskC[i], uMaskD[i], uv, src);
    c = mix(c, float3(0.91, 0.58, 0.42), m * 0.55);
  }
  return c;
}

// Subject segmentation: c is the photo so far (retouched); the subject keeps
// it, everything behind is blurred / replaced, then its brightness and
// saturation are adjusted.
float3 applyBackground(float3 c, float2 xy) {
  float subject = smoothstep(uBgEdge.x, uBgEdge.y, maskTex(${SUBJECT_CHANNEL}.0, xy / uResolution));
  float w = 1.0 - subject;
  if (w < 0.002) return c;
  float3 bg = c;
  if (uBg.x > 0.5) {
    half4 l = bgLayer.eval(xy);
    float3 layer = uBg.x < 1.5 ? float3(l.rgb) / max(float(l.a), 0.004) : float3(l.rgb);
    // Blur: the normalised colour is valid wherever any background was near;
    // only deep inside the subject (no background within the blur) keep the photo.
    float cover = uBg.x < 1.5 ? smoothstep(0.0, 0.004, float(l.a)) : 1.0;
    bg = mix(c, clamp(layer, 0.0, 1.0), uBg.y * cover);
  }
  if (uBg.z != 0.0) bg = pow(max(bg, float3(0.0)), float3(exp2(-uBg.z * 0.7)));
  if (uBg.w != 0.0) {
    float l = luma(bg);
    bg = mix(float3(l), bg, 1.0 + uBg.w);
  }
  return mix(c, bg, w);
}
`;

// ── Uniforms ────────────────────────────────────────────────────

export interface MaskUniforms {
  uMaskGrid: number[];
  uMaskCount: number;
  uMaskOverlay: number;
  uMaskDetail: number;
  uMaskA: number[];
  uMaskB: number[];
  uMaskC: number[];
  uMaskD: number[];
  uBg: number[];
  uBgEdge: number[];
}

const ZERO = new Array<number>(MAX_MASKS * 4).fill(0);

export const NO_MASKS: MaskUniforms = {
  uMaskGrid: [1, 1, 1, 0],
  uMaskCount: 0,
  uMaskOverlay: -1,
  uMaskDetail: 0,
  uMaskA: ZERO,
  uMaskB: ZERO,
  uMaskC: ZERO,
  uMaskD: ZERO,
  uBg: [0, 0, 0, 0],
  uBgEdge: [0.4, 0.6, 0, 0],
};

/**
 * Masks the shader evaluates: visible ones with an adjustment, plus the one
 * shown as an overlay (even before it has values). At most MAX_MASKS, in
 * document order. Slot index = atlas channel.
 */
export function renderSlots(masks: readonly SelectiveMask[], overlayId: string | null): SelectiveMask[] {
  return masks.filter((m) => m.id === overlayId || (m.visible && !isNeutralMaskAdjust(m.adjust))).slice(0, MAX_MASKS);
}

function ycc(c: readonly [number, number, number]) {
  const [r, g, b] = c;
  return [0.299 * r + 0.587 * g + 0.114 * b, 0.5 - 0.168736 * r - 0.331264 * g + 0.5 * b, 0.5 + 0.5 * r - 0.418688 * g - 0.081312 * b];
}

const n = (v: number) => v / 100;

function adjustVectors(a: MaskAdjust) {
  return {
    A: [n(a.exposure) * 1.2, n(a.brightness), n(a.contrast), n(a.highlights)],
    B: [n(a.shadows), n(a.saturation), n(a.temperature), n(a.tint)],
  };
}

export function maskUniforms(
  slots: readonly SelectiveMask[],
  atlas: Pick<MaskAtlas, 'tileW' | 'tileH' | 'stride'> | null,
  overlayId: string | null,
  background: BackgroundEdit | null,
): MaskUniforms {
  const A = ZERO.slice();
  const B = ZERO.slice();
  const C = ZERO.slice();
  const D = ZERO.slice();
  let detail = 0;
  let overlay = -1;
  slots.forEach((m, i) => {
    const v = adjustVectors(m.adjust);
    A.splice(i * 4, 4, ...v.A);
    B.splice(i * 4, 4, ...v.B);
    const s = m.shape;
    let kind = 0;
    if (s.kind === 'color') {
      kind = m.invert ? 2 : 1;
      D.splice(i * 4, 4, ...ycc(s.color), 0.025 + (s.range / 100) * 0.3);
    } else if (s.kind === 'luminance') {
      kind = m.invert ? 4 : 3;
      D.splice(i * 4, 4, n(Math.min(s.min, s.max)), n(Math.max(s.min, s.max)), 0.01 + n(s.feather) * 0.3, 0);
    }
    const active = m.visible && !isNeutralMaskAdjust(m.adjust) ? 1 : 0;
    C.splice(i * 4, 4, n(m.adjust.clarity), Math.max(0, n(m.adjust.sharpness)), kind, active);
    if (active && (m.adjust.clarity !== 0 || m.adjust.sharpness > 0)) detail = 1;
    if (m.id === overlayId) overlay = i;
  });
  const bg = background && backgroundActive(background) ? background : null;
  const mode = bg ? (bg.mode === 'blur' ? 1 : bg.mode === 'replace' ? 2 : 0) : 0;
  // Edge softness: a narrow band around the segmentation's 0.5 contour, widened by `edge`.
  const e = bg ? 0.03 + n(bg.edge) * 0.42 : 0.1;
  return {
    uMaskGrid: atlas ? [atlas.tileW, atlas.tileH, atlas.stride, 0] : [1, 1, 1, 0],
    uMaskCount: slots.length,
    uMaskOverlay: overlay,
    uMaskDetail: detail,
    uMaskA: A,
    uMaskB: B,
    uMaskC: C,
    uMaskD: D,
    uBg: bg ? [mode, mode === 1 ? n(bg.blur.strength) : 1, n(bg.brightness), n(bg.saturation)] : [0, 0, 0, 0],
    uBgEdge: [0.5 - e, 0.5 + e, bg ? 1 : 0, 0],
  };
}
