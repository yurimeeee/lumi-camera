import { FILM_SLOTS } from './uniforms';

/**
 * SkSL for the film effects, spliced into the Lumi shader after its helpers
 * (luma, hash12, hsl2rgb) and child shaders (image, lowRes). Uniform layout:
 * services/film/uniforms.ts.
 *
 * Colour spaces and compositing:
 *  - Fringing re-samples the source's red and blue channels (lens space,
 *    before any grading).
 *  - Flash modulates exposure (scene light, before the look).
 *  - Bloom, halation and soft focus measure light on the *ungraded* source
 *    (`lowRes`, a small copy of the photo, so highlights still carry their
 *    real brightness) and are screened onto the graded image.
 *  - Grain is added in display space with a luminance response (most in the
 *    midtones), dust and scratches are drawn over it, light leaks and burns
 *    are screened on top, and the vignette comes last.
 * Every pattern is a function of frame-relative position and `seed` only, so
 * the same edit renders the same grain, dust and scratches at any size.
 */
export const FILM_SKSL = `
// ── Film effects (services/film) ─────────────────────────────
uniform float4 uFilm[${FILM_SLOTS}];

float vnoise(float2 p, float seed) {
  float2 i = floor(p);
  float2 f = fract(p);
  float2 u = f * f * (3.0 - 2.0 * f);
  float s = seed * 17.17;
  float a = hash12(i + s);
  float b = hash12(i + float2(1.0, 0.0) + s);
  float c = hash12(i + float2(0.0, 1.0) + s);
  float d = hash12(i + float2(1.0, 1.0) + s);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(float2 p, float seed) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    v += amp * vnoise(p, seed + float(i) * 7.1);
    p *= 2.03;
    amp *= 0.5;
  }
  return v;
}

// Lateral chromatic aberration: red pushed out, blue pulled in, growing
// toward the corners (zero at the centre).
float3 filmFringe(float2 xy, float3 src) {
  float k = uFilm[2].w * 0.004;
  float m = max(uResolution.x, uResolution.y);
  float2 d = (xy - uResolution * 0.5) / m;
  float2 off = d * dot(d, d) * 4.0 * k * m;
  return float3(image.eval(xy + off).r, src.g, image.eval(xy - off).b);
}

// Direct on-camera flash: the subject (centre) gets more light than the
// background, frontal light flattens the shadows.
float3 filmFlash(float2 uv, float2 a, float3 c) {
  float f = uFilm[5].w;
  float r = length((uv - float2(0.5, 0.45)) * a) / length(0.5 * a);
  float fall = 1.0 - smoothstep(0.1, 0.95, r);
  c *= exp2(f * (fall - 0.6));
  float l = luma(c);
  return mix(c, c + 0.12 * (1.0 - l), f * fall * 0.3);
}

// Instant-film drift: slow, uneven tint across the frame.
float3 filmDrift(float2 uv, float3 c) {
  float seed = uFilm[0].w;
  float t = vnoise(uv * 2.2, seed + 5.0) - 0.5;
  float u = vnoise(uv * 1.6 + 9.0, seed + 7.0) - 0.5;
  return c + float3(t * 0.6 + u * 0.2, u * 0.35, -t * 0.55) * uFilm[6].x * 0.12;
}

float3 brightPass(float3 s, float thr) {
  return s * smoothstep(thr, thr + 0.2, luma(s));
}

// Centre-weighted Vogel-disk average of the bright parts of the small copy
// of the photo (blur of the thresholded image, not a threshold of a blur).
float3 glowAt(float2 p, float radius, float thr) {
  float3 sum = float3(0.0);
  float wsum = 0.0;
  for (int i = 0; i < 16; i++) {
    float f = (float(i) + 0.5) / 16.0;
    float r = sqrt(f) * radius;
    float ang = float(i) * 2.399963;
    float w = 1.0 - 0.7 * f;
    sum += brightPass(lowRes.eval(p + float2(cos(ang), sin(ang)) * r).rgb, thr) * w;
    wsum += w;
  }
  return sum / wsum;
}

float3 screen(float3 c, float3 light) {
  return 1.0 - (1.0 - clamp(c, 0.0, 1.0)) * (1.0 - clamp(light, 0.0, 1.0));
}

// Bloom (soft light around bright areas), halation (a red-orange fringe
// around bright light, not on it) and soft focus (a mist: highlights diffuse
// over their surroundings, detail underneath stays).
float3 filmLight(float2 p, float3 c) {
  float4 F1 = uFilm[1];
  float4 F2 = uFilm[2];
  float px = uPixel;
  if (F1.x > 0.0) {
    c = screen(c, glowAt(p, F1.z * px, F1.y) * F1.x * 1.4);
  }
  if (F1.w > 0.0) {
    float halo = luma(glowAt(p, F2.x * px, 0.6));
    float self = smoothstep(0.62, 0.9, luma(lowRes.eval(p).rgb));
    float h = max(halo - self * 0.6, 0.0) * 3.2;
    float3 tint = mix(float3(1.0, 0.5, 0.18), float3(1.0, 0.16, 0.06), F2.y);
    c = screen(c, tint * h * F1.w);
  }
  if (F2.z > 0.0) {
    float3 mist = glowAt(p, 14.0 * px, 0.0);
    float hl = smoothstep(0.3, 0.9, luma(mist));
    c = screen(c, mist * hl * F2.z * 0.55);
    c = mix(c, c * 0.92 + 0.04, F2.z * 0.5);
  }
  return c;
}

// Film grain: value noise on a grid of cells sized relative to the frame
// (uPixel), so the grain has the same size on the photo at any resolution.
// Roughness mixes in sharper sub-cell noise; colour adds chroma noise. Cells
// finer than an output pixel average out, so a small preview shows what the
// full-size export looks like scaled down. Most visible in the midtones.
float3 filmGrain(float2 pos, float3 c, float amount) {
  float4 G = uFilm[0];
  float cell = max(G.x * uPixel, 1e-4);
  float2 q = pos / cell;
  float seed = G.w;
  float smoothN = (vnoise(q, seed) - 0.5) * 2.2;
  float rough = (hash12(floor(q * 1.6) + seed * 3.7) - 0.5) * 2.0;
  float n = mix(smoothN, rough, G.y * 0.7);
  float att = clamp(cell, 0.0, 1.0);
  float l = clamp(luma(c), 0.0, 1.0);
  float resp = 0.35 + 2.4 * l * (1.0 - l);
  float3 g = float3(n);
  if (G.z > 0.0) {
    g += float3(vnoise(q + 31.7, seed + 1.0) - 0.5, 0.0, vnoise(q + 57.3, seed + 2.0) - 0.5) * 2.2 * G.z;
  }
  return c + g * amount * 0.16 * resp * att;
}

// Dust specks (white like a scanned negative, some dark) and vertical
// scratches, placed by seed on a frame-relative grid.
float3 filmMarks(float2 pos, float2 uv, float3 c) {
  float4 F5 = uFilm[5];
  float seed = uFilm[0].w;
  float dust = F5.y;
  float scratch = F5.z;
  if (dust > 0.0) {
    float2 g = pos / (60.0 * uPixel);
    float2 ci = floor(g);
    float2 f = fract(g);
    if (hash12(ci + seed * 1.73) < dust * 0.35) {
      float2 ctr = 0.2 + 0.6 * float2(hash12(ci + 3.1 + seed), hash12(ci + 7.7 + seed));
      float r1 = hash12(ci + 11.3 + seed);
      float rad = 0.012 + 0.045 * r1 * r1;
      float2 dd = (f - ctr) * float2(1.0, 0.55 + 0.9 * hash12(ci + 5.5 + seed));
      float m = 1.0 - smoothstep(rad * 0.55, rad, length(dd));
      float white = step(0.4, hash12(ci + 13.0 + seed));
      c = mix(c, mix(float3(0.06, 0.05, 0.05), float3(0.96, 0.95, 0.92), white), m * (0.45 + 0.45 * dust));
    }
  }
  if (scratch > 0.0) {
    for (int k = 0; k < 6; k++) {
      float fk = float(k) + seed * 0.37;
      if (hash12(float2(fk, 1.3)) > scratch) continue;
      float x0 = 0.05 + 0.9 * hash12(float2(fk, 2.7));
      float y0 = hash12(float2(fk, 4.1)) * 0.5;
      float y1 = y0 + 0.35 + 0.6 * hash12(float2(fk, 5.9));
      float x = (x0 + 0.004 * sin(uv.y * 11.0 + fk * 3.0)) * uResolution.x;
      float w = (0.6 + 1.4 * hash12(float2(fk, 7.3))) * uPixel;
      // Thinner than a pixel: draw a pixel-wide line, fainter.
      float vis = min(1.0, w / 0.8);
      w = max(w, 0.8);
      float dx = abs(pos.x - x);
      float m = (1.0 - smoothstep(w * 0.5, w * 1.5, dx)) * smoothstep(y0, y0 + 0.04, uv.y) * (1.0 - smoothstep(y1 - 0.04, y1, uv.y));
      m *= (0.55 + 0.45 * vnoise(float2(uv.y * 60.0, fk), seed)) * vis;
      float bright = step(0.3, hash12(float2(fk, 8.8)));
      c = mix(c, mix(c * 0.55, float3(0.94), bright), m * (0.5 + 0.4 * scratch));
    }
  }
  return c;
}

// Where on the frame's edge light enters: t in 0…1 clockwise from the
// top-left corner. xy = point (uv), zw = inward normal.
float4 edgeEntry(float t) {
  t = fract(t);
  if (t < 0.25) return float4(t * 4.0, 0.0, 0.0, 1.0);
  if (t < 0.5) return float4(1.0, (t - 0.25) * 4.0, -1.0, 0.0);
  if (t < 0.75) return float4(1.0 - (t - 0.5) * 4.0, 1.0, 0.0, -1.0);
  return float4(0.0, 1.0 - (t - 0.75) * 4.0, 1.0, 0.0);
}

// Leaks and burns never cover the middle of the frame completely.
float centreGuard(float2 uv, float2 a) {
  return 0.3 + 0.7 * smoothstep(0.08, 0.5, length((uv - 0.5) * a));
}

float3 leakColor(float style, float t) {
  if (style < 0.5) return mix(float3(1.0, 0.82, 0.5), float3(1.0, 0.42, 0.16), t);
  if (style < 1.5) return mix(float3(1.0, 0.36, 0.22), float3(0.85, 0.06, 0.12), t);
  if (style < 2.5) return mix(float3(1.0, 0.72, 0.3), float3(1.0, 0.42, 0.08), t);
  if (style < 3.5) return mix(float3(1.0, 0.93, 0.86), float3(1.0, 0.78, 0.7), t);
  return hsl2rgb(float3(fract(0.98 - t * 0.8), 0.85, 0.62));
}

// Light leak: a streak of light entering from the frame's edge.
float3 filmLeak(float2 uv, float2 a, float3 c) {
  float4 L3 = uFilm[3];
  float4 L4 = uFilm[4];
  float4 e = edgeEntry(L3.z);
  float rot = L3.w;
  float2 dir = float2(e.z * cos(rot) - e.w * sin(rot), e.z * sin(rot) + e.w * cos(rot));
  float2 d = (uv - e.xy) * a;
  float along = dot(d, dir);
  float across = dot(d, float2(-dir.y, dir.x));
  float len = 0.25 + 0.75 * L4.x;
  float wid = len * 0.55;
  float m = exp(-max(along, 0.0) / (len * 0.45)) * exp(-(across * across) / (wid * wid));
  m = max(m, 0.55 * exp(-length(d) / (len * 0.9)));
  m *= centreGuard(uv, a);
  float3 col = leakColor(L3.y, clamp(along / len, 0.0, 1.0));
  float k = clamp(m * L3.x, 0.0, 0.92);
  c = screen(c, col * k);
  return mix(c, c * 0.88 + col * 0.1, k * 0.35);
}

// Film burn: the film itself fogged by light — blown-out where it peaks,
// with an irregular (seeded) edge.
float3 filmBurn(float2 uv, float2 a, float3 c) {
  float4 B4 = uFilm[4];
  float4 B5 = uFilm[5];
  float style = B4.z;
  float4 e = edgeEntry(B5.x);
  float2 d = (uv - e.xy) * a;
  float depth = dot(d, e.zw);
  float lat = dot(d, float2(-e.w, e.z));
  float reach = 0.1 + 0.55 * B4.w;
  float n = fbm(float2(lat * 5.0, depth * 2.0) + 3.7, uFilm[0].w + 11.0);
  float dd = depth + (n - 0.5) * reach * 0.6;
  float m;
  float3 hot;
  float3 deep;
  if (style < 0.5) {
    m = (1.0 - smoothstep(0.0, reach, dd)) * exp(-lat * lat / (reach * reach * 2.5));
    hot = float3(1.0, 0.9, 0.62);
    deep = float3(1.0, 0.42, 0.12);
  } else if (style < 1.5) {
    m = 1.0 - smoothstep(0.0, reach * 0.45, dd);
    hot = float3(1.0, 0.75, 0.35);
    deep = float3(0.82, 0.12, 0.04);
  } else {
    m = (1.0 - smoothstep(0.0, reach * 1.3, dd)) * exp(-lat * lat / (reach * reach * 4.0));
    hot = float3(1.0, 0.95, 0.75);
    deep = float3(1.0, 0.62, 0.22);
  }
  m *= centreGuard(uv, a);
  float k = clamp(m * B4.y, 0.0, 1.0);
  float3 col = mix(deep, hot, k);
  c = screen(c, col * k);
  c = mix(c, col, k * k * k * 0.85);
  if (style > 0.5 && style < 1.5) {
    float rim = smoothstep(reach * 0.3, reach * 0.45, dd) * (1.0 - smoothstep(reach * 0.45, reach * 0.65, dd));
    c *= 1.0 - rim * B4.y * 0.35;
  }
  return c;
}
`;
