/**
 * Object removal (Phase 4): exemplar inpainting must reconstruct texture
 * from the rest of the image, not just smear the hole's border.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { inpaintPatchMatch, InpaintCancelled, type InpaintImage } from '@/services/inpaint/patchmatch';

import { CK, encodePng } from './canvaskit';

function toRgba(w: number, h: number, rgb: Uint8Array) {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data.set(rgb.subarray(i * 3, i * 3 + 3), i * 4);
    data[i * 4 + 3] = 255;
  }
  return { width: w, height: h, data };
}

/** Diagonal stripes with fine noise (period 12 px). */
function stripes(w: number, h: number) {
  const rgb = new Uint8Array(w * h * 3);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const on = (x + y) % 12 < 6;
      const n = (rnd() - 0.5) * 16;
      const i = (y * w + x) * 3;
      rgb[i] = (on ? 200 : 70) + n;
      rgb[i + 1] = (on ? 150 : 90) + n;
      rgb[i + 2] = (on ? 90 : 160) + n;
    }
  }
  return rgb;
}

function rectMask(w: number, h: number, x0: number, y0: number, x1: number, y1: number) {
  const m = new Uint8Array(w * h);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * w + x] = 1;
  return m;
}

function holeError(a: Uint8Array, b: Uint8Array, mask: Uint8Array) {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    for (let c = 0; c < 3; c++) sum += Math.abs(a[i * 3 + c]! - b[i * 3 + c]!);
    n += 3;
  }
  return sum / n;
}

/** Baseline: plain diffusion of the hole's border (what a naive heal does). */
function diffuseFill(input: InpaintImage) {
  const { width: w, height: h } = input;
  const img = Float32Array.from(input.rgb);
  for (let it = 0; it < 400; it++) {
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (!input.mask[i]) continue;
        for (let c = 0; c < 3; c++) img[i * 3 + c] = (img[(i - 1) * 3 + c]! + img[(i + 1) * 3 + c]! + img[(i - w) * 3 + c]! + img[(i + w) * 3 + c]!) / 4;
      }
    }
  }
  return Uint8Array.from(img, (v) => Math.round(v));
}

const OUT = join(import.meta.dir, '../../.face-warp-cache/renders');

describe('PatchMatch inpainting', () => {
  test('reconstructs a periodic texture far better than border diffusion', () => {
    const w = 160;
    const h = 120;
    const truth = stripes(w, h);
    const mask = rectMask(w, h, 60, 40, 100, 80);
    const input: InpaintImage = { width: w, height: h, rgb: Uint8Array.from(truth), mask };
    for (let i = 0; i < mask.length; i++) if (mask[i]) input.rgb.set([255, 0, 255], i * 3);
    const t = performance.now();
    const out = inpaintPatchMatch(input, { seed: 3 });
    const ms = performance.now() - t;
    const err = holeError(out, truth, mask);
    const base = holeError(diffuseFill(input), truth, mask);
    console.log(`[inpaint] stripes err ${err.toFixed(1)} vs diffusion ${base.toFixed(1)} (${ms.toFixed(0)} ms)`);
    expect(err).toBeLessThan(base * 0.5);
    expect(err).toBeLessThan(25);
    // Known pixels are never touched.
    for (let i = 0; i < mask.length; i++) if (!mask[i]) expect(out[i * 3]).toBe(truth[i * 3]!);
    if (existsSync(OUT)) writeFileSync(join(OUT, 'inpaint-stripes.png'), encodePng(toRgba(w, h, out)));
  });

  test('is deterministic for a seed and can be cancelled', () => {
    const w = 96;
    const h = 72;
    const input: InpaintImage = { width: w, height: h, rgb: stripes(w, h), mask: rectMask(w, h, 30, 20, 60, 50) };
    expect(inpaintPatchMatch(input, { seed: 9 })).toEqual(inpaintPatchMatch(input, { seed: 9 }));
    let calls = 0;
    expect(() => inpaintPatchMatch(input, { shouldCancel: () => ++calls > 2 })).toThrow(InpaintCancelled);
  });

  const photo = join(import.meta.dir, '../../.face-warp-cache/hat.jpg');
  test.skipIf(!existsSync(photo))('real photo: a patch of foliage is filled with foliage (ground truth error)', () => {
    const img = CK.MakeImageFromEncoded(readFileSync(photo));
    const W = img.width();
    const H = img.height();
    const px = img.readPixels(0, 0, { width: W, height: H, alphaType: CK.AlphaType.Unpremul, colorType: CK.ColorType.RGBA_8888, colorSpace: CK.ColorSpace.SRGB });
    img.delete();
    // 320×320 crop at the left (tree / foliage), 70×70 hole.
    const cw = 320;
    const ch = 320;
    const ox = 20;
    const oy = 300;
    const crop = new Uint8Array(cw * ch * 3);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) crop.set(px.subarray(((oy + y) * W + ox + x) * 4, ((oy + y) * W + ox + x) * 4 + 3), (y * cw + x) * 3);
    const mask = rectMask(cw, ch, 125, 125, 195, 195);
    const t = performance.now();
    const out = inpaintPatchMatch({ width: cw, height: ch, rgb: crop, mask }, { seed: 1 });
    const ms = performance.now() - t;
    const err = holeError(out, crop, mask);
    const base = holeError(diffuseFill({ width: cw, height: ch, rgb: crop, mask }), crop, mask);
    console.log(`[inpaint] hat.jpg foliage err ${err.toFixed(1)} vs diffusion ${base.toFixed(1)} (${ms.toFixed(0)} ms, 320² crop, 70² hole)`);
    if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, 'inpaint-hat.png'), encodePng(toRgba(cw, ch, out)));
    writeFileSync(join(OUT, 'inpaint-hat-src.png'), encodePng(toRgba(cw, ch, crop)));
    // Texture: the filled area keeps local contrast (diffusion would be flat).
    const variance = (rgb: Uint8Array) => {
      let s = 0;
      let s2 = 0;
      let n = 0;
      for (let i = 0; i < mask.length; i++) {
        if (!mask[i]) continue;
        const l = rgb[i * 3 + 1]!;
        s += l;
        s2 += l * l;
        n++;
      }
      return s2 / n - (s / n) ** 2;
    };
    expect(variance(out)).toBeGreaterThan(variance(crop) * 0.35);
  }, 60_000);
});
