/**
 * Background stage (Phase 4): subject segmentation → blur / replace /
 * brightness / saturation behind the subject. Real rasteriser (RN Skia web
 * backend on CanvasKit) + real Lumi shader.
 */
import { describe, expect, test } from 'bun:test';
import { AlphaType, ColorType, Skia, type SkImage } from '@shopify/react-native-skia';

import { NO_BACKGROUND } from '@/constants/masks';
import { buildBackgroundLayer } from '@/services/masks/backgroundLayer';
import { buildMaskAtlas } from '@/services/masks/maskRender';
import { maskUniforms } from '@/services/masks/shader';
import type { Geometry } from '@/types/editing';
import type { BackgroundEdit } from '@/types/phase4';

import { diff, downscale, renderLumi, type Pixels } from '../image-engine/canvaskit';
import { at, IDENTITY, lum, NO_GEOMETRY, pixelsOf } from './helpers';

const W = 200;
const H = 150;

/** Red disc (the subject) on fine blue / green stripes. */
function scene(w = W, h = H): Pixels {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const inside = Math.hypot(x - w / 2, y - h / 2) < h * 0.25;
      const stripe = Math.floor(x / (w / 50)) % 2 === 0;
      const c = inside ? [220, 40, 40] : stripe ? [40, 80, 200] : [60, 180, 90];
      data.set([c[0]!, c[1]!, c[2]!, 255], i);
    }
  }
  return { width: w, height: h, data };
}

function skImage(p: Pixels): SkImage {
  return Skia.Image.MakeImage({ width: p.width, height: p.height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Opaque }, Skia.Data.fromBytes(p.data), p.width * 4)!;
}

/** The subject mask (white disc), at mask resolution. */
function subjectMask(w = 160, h = 120): SkImage {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = Math.hypot(x - w / 2, y - h / 2) < h * 0.25 ? 255 : 0;
      data.set([v, v, v, 255], (y * w + x) * 4);
    }
  }
  return skImage({ width: w, height: h, data });
}

const MASK_URI = 'mem:subject';

function render(src: Pixels, bg: BackgroundEdit, geometry: Geometry = NO_GEOMETRY, side = 512) {
  const subject = subjectMask();
  const ctx = { geometry, srcW: src.width, srcH: src.height, images: new Map([[MASK_URI, subject]]) };
  const atlas = buildMaskAtlas([], bg, ctx, null, side)!;
  const layer = buildBackgroundLayer({ base: skImage(src), background: bg, geometry, srcW: src.width, srcH: src.height, subject, side, bank: null });
  return renderLumi(src, IDENTITY(), maskUniforms([], atlas, null, bg) as unknown as Record<string, number[]>, {
    maskAtlas: pixelsOf(atlas.image),
    bgLayer: layer ? pixelsOf(layer, AlphaType.Premul) : undefined,
  });
}

const SUBJECT = { uri: MASK_URI, width: 160, height: 120, model: 'test' };
const blurBg = (radius = 50, edge = 10): BackgroundEdit => ({ ...NO_BACKGROUND, mode: 'blur', subject: SUBJECT, blur: { strength: 100, radius }, edge });

/** Local variance of luminance in a box (texture left after blurring). */
function texture(p: Pixels, x0: number, y0: number, s: number) {
  let sum = 0;
  let sq = 0;
  let n = 0;
  for (let y = y0; y < y0 + s; y++) {
    for (let x = x0; x < x0 + s; x++) {
      const l = lum(at(p, x, y));
      sum += l;
      sq += l * l;
      n++;
    }
  }
  return sq / n - (sum / n) ** 2;
}

describe('background blur', () => {
  test('the subject is untouched; the background loses its texture', () => {
    const src = scene();
    const out = render(src, blurBg());
    expect(at(out, W / 2, H / 2)).toEqual(at(src, W / 2, H / 2));
    expect(texture(out, 5, 5, 20)).toBeLessThan(texture(src, 5, 5, 20) * 0.05);
  });

  test('no red halo from the subject in the blurred background next to it', () => {
    const src = scene();
    const out = render(src, blurBg(80, 0));
    // Just outside the subject's edge: red must stay at the stripes' level (≤ 60), not pick up the disc's 220.
    const r = H * 0.25;
    for (const a of [0, 1.2, 2.4, 3.6, 4.8]) {
      const x = W / 2 + Math.cos(a) * (r + 8);
      const y = H / 2 + Math.sin(a) * (r + 8);
      expect(at(out, x, y)[0]).toBeLessThan(75);
    }
  });

  test('strength 0 and mode none leave the photo as it was; brightness acts only behind the subject', () => {
    const src = scene();
    expect(diff(render(src, { ...blurBg(), blur: { strength: 0, radius: 50 } }), src).max).toBeLessThanOrEqual(1);
    const darker = render(src, { ...NO_BACKGROUND, subject: SUBJECT, brightness: -60 });
    expect(lum(at(darker, 5, 5))).toBeLessThan(lum(at(src, 5, 5)) - 10);
    expect(at(darker, W / 2, H / 2)).toEqual(at(src, W / 2, H / 2));
  });
});

describe('background replace', () => {
  test('a colour fills behind the subject', () => {
    const src = scene();
    const out = render(src, { ...NO_BACKGROUND, mode: 'replace', subject: SUBJECT, replace: { ...NO_BACKGROUND.replace, fill: { kind: 'color', color: '#F0E0C0' } } });
    const c = at(out, 6, 6);
    expect(Math.abs(c[0] - 0xf0)).toBeLessThan(4);
    expect(Math.abs(c[2] - 0xc0)).toBeLessThan(4);
    expect(at(out, W / 2, H / 2)).toEqual(at(src, W / 2, H / 2));
  });

  test('a gradient replacement follows Frame Studio’s gradient', () => {
    const src = scene();
    const out = render(src, { ...NO_BACKGROUND, mode: 'replace', subject: SUBJECT, replace: { ...NO_BACKGROUND.replace, fill: { kind: 'gradient', from: '#000000', to: '#FFFFFF', angle: 0 } } });
    expect(lum(at(out, 4, 10))).toBeLessThan(lum(at(out, W - 4, 10)) - 150);
  });
});

describe('preview = export; geometry', () => {
  test('layer + atlas at preview and export sizes give the same picture', () => {
    const big = scene(W * 4, H * 4);
    const exp = render(big, blurBg(40, 20), NO_GEOMETRY, 2048);
    const prev = render(downscale(big, 4), blurBg(40, 20), NO_GEOMETRY, 1024);
    expect(diff(downscale(exp, 4), prev).mean).toBeLessThan(2.5);
  });

  test('a rotated frame keeps the subject in place', () => {
    const src = scene();
    const g: Geometry = { rotation: 90, flipH: false, flipV: false, crop: null, aspect: 'original' };
    // Rotated source (what the working image is under this geometry).
    const rot = { width: H, height: W, data: new Uint8Array(W * H * 4) };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) rot.data.set(src.data.subarray((y * W + x) * 4, (y * W + x) * 4 + 4), (x * H + (H - 1 - y)) * 4);
    const subject = subjectMask();
    const ctx = { geometry: g, srcW: W, srcH: H, images: new Map([[MASK_URI, subject]]) };
    const bg = blurBg();
    const atlas = buildMaskAtlas([], bg, ctx, null, 512)!;
    const layer = buildBackgroundLayer({ base: skImage(rot), background: bg, geometry: g, srcW: W, srcH: H, subject, side: 512, bank: null })!;
    const out = renderLumi(rot, IDENTITY(), maskUniforms([], atlas, null, bg) as unknown as Record<string, number[]>, { maskAtlas: pixelsOf(atlas.image), bgLayer: pixelsOf(layer, AlphaType.Premul) });
    expect(at(out, H / 2, W / 2)).toEqual(at(rot, H / 2, W / 2));
    expect(texture(out, 5, 5, 20)).toBeLessThan(texture(rot, 5, 5, 20) * 0.05);
  });
});
