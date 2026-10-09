import { Skia, type SkRuntimeEffect } from '@shopify/react-native-skia';

/**
 * Paper of a frame: base colour × paper texture × fibres × ageing × worn
 * edges, evaluated per pixel in *frame pixels* (pos × uNative / width), so
 * the pattern is the same at preview and at export resolution. Only the
 * frame region is ever drawn with it — the photo is untouched.
 *
 * Every effect is multiplied by its own amount; with texture, ageing and
 * wear at 0 the output is exactly the flat base colour (the clean SVG).
 */
export const PAPER_SKSL = `
uniform float2 uSize;
uniform float uNative;
uniform float3 uBase;
uniform float uTexAmt;
uniform float3 uTexMean;
uniform float uAging;
uniform float uWear;
uniform float uSeed;
uniform shader tex;

float hash(float2 p) {
  p = fract(p * float2(123.34, 456.21) + uSeed * 0.0137);
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + float2(1.0, 0.0));
  float c = hash(i + float2(0.0, 1.0));
  float d = hash(i + float2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(float2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + float2(17.0, 9.0);
    a *= 0.5;
  }
  return v;
}

half4 main(float2 pos) {
  float k = uNative / uSize.x;
  float2 px = pos * k;
  float2 S = uSize * k;
  float3 col = uBase;
  float lumBase = dot(uBase, float3(0.3333));

  if (uTexAmt > 0.0) {
    // Kit textures carry their fibres as transparent pixels: composite over
    // white so they read as light fibres (premultiplied → over white).
    half4 tp = tex.eval(pos);
    float3 t = float3(tp.rgb) + float3(1.0 - tp.a);
    float3 mean = max(uTexMean, float3(0.05));
    // Relief (texture detail around its own mean) on the chosen colour,
    // plus a gentle pull toward the stock's own tint.
    float3 detail = clamp(t / mean, 0.55, 1.45);
    col = mix(col, col * detail, uTexAmt);
    float3 tinted = t * (lumBase / max(dot(mean, float3(0.3333)), 0.05));
    col = mix(col, tinted, uTexAmt * 0.3);
  }

  float fibre = uTexAmt * 0.6 + uAging * 0.4;
  if (fibre > 0.0) {
    // Fine, soft fibres in random directions + low speckle (no hard dashes).
    float2 q = float2(px.x * 0.55 + px.y * 0.21, px.y * 0.11 - px.x * 0.05);
    float streak = smoothstep(0.70, 0.98, vnoise(q + 11.0)) * vnoise(px / 30.0 + 4.0);
    float speck = vnoise(px * 0.9 + 5.0) - 0.5;
    col *= 1.0 - fibre * (0.022 * streak + 0.02 * speck);
  }

  if (uAging > 0.0) {
    float2 e2 = min(px, S - px);
    float edge = min(e2.x, e2.y);
    float blot = fbm(px / 240.0);
    float edgeTone = 1.0 - smoothstep(0.0, 110.0, edge);
    float3 yellowed = col * float3(0.93, 0.83, 0.64);
    col = mix(col, yellowed, clamp(uAging * (0.10 + 0.35 * blot + 0.35 * edgeTone), 0.0, 1.0));
    // Foxing: sparse brown spots.
    float fox = smoothstep(0.80, 0.92, vnoise(px / 16.0 + 91.0)) * smoothstep(0.50, 0.72, fbm(px / 140.0 + 7.0));
    col = mix(col, col * float3(0.80, 0.64, 0.46), fox * uAging * 0.55);
  }

  float alpha = 1.0;
  if (uWear > 0.0) {
    float2 e2 = min(px, S - px);
    float edge = min(e2.x, e2.y);
    float n = fbm(px / 7.0 + 33.0);
    float reach = uWear * 16.0 * n * n;
    alpha = smoothstep(reach - 0.8, reach + 0.8, edge);
    float worn = (1.0 - smoothstep(0.0, uWear * 30.0 + 1.0, edge)) * (0.45 + 0.55 * fbm(px / 4.0 + 3.0));
    col = mix(col, float3(0.99, 0.97, 0.93), worn * uWear * 0.6);
  }

  col = clamp(col, 0.0, 1.0);
  return half4(half3(col) * half(alpha), half(alpha));
}
`;

let effect: SkRuntimeEffect | null = null;

export function getPaperEffect(): SkRuntimeEffect {
  if (!effect) {
    const e = Skia.RuntimeEffect.Make(PAPER_SKSL);
    if (!e) throw new Error('paper shader failed to compile');
    effect = e;
  }
  return effect;
}
