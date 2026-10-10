/**
 * Auto Enhance (Phase 4): the CPU tone model must match the real shader,
 * and suggestions must come from the photo's measurements.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { DEFAULT_ADJUSTMENTS } from '@/constants/adjustments';
import { getFilter } from '@/constants/filters';
import { applyAutoShare, applyTone, measureImage, samplePixels, suggestAuto } from '@/services/autoEnhance';
import { resolveProcessing } from '@/services/imageProcessing';
import type { Adjustments } from '@/types/editing';

import { CK, encodePng, renderLumi, type Pixels } from './canvaskit';

/** A scene with sky, skin, foliage, greys and a few highlights; `k` scales light, `cast` tints it. */
function scene(width: number, height: number, k = 1, cast: [number, number, number] = [1, 1, 1]): Pixels {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x / width;
      const v = y / height;
      let c: [number, number, number];
      if (v < 0.35) c = [0.55 + 0.2 * u, 0.7 + 0.1 * u, 0.92];
      else if (u < 0.4) c = [0.85 - 0.3 * v, 0.62 - 0.25 * v, 0.5 - 0.2 * v];
      else if (u < 0.7) c = [0.2 + 0.2 * v, 0.45 - 0.1 * v, 0.18];
      else {
        // Grey stripes (kept clear of clipping so a cast stays measurable).
        const q = 0.15 + 0.6 * (((x * 7 + y * 3) % 23) / 22);
        c = [q, q, q];
      }
      const i = (y * width + x) * 4;
      for (let ch = 0; ch < 3; ch++) data[i + ch] = Math.round(Math.min(1, Math.max(0, c[ch]! * k * cast[ch]!)) * 255);
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

function render(src: Pixels, adjustments: Partial<Adjustments>) {
  return renderLumi(src, resolveProcessing({ filter: getFilter('original'), intensity: 0, adjustments: { ...DEFAULT_ADJUSTMENTS, ...adjustments } }));
}

function decodeFile(path: string): Pixels {
  const img = CK.MakeImageFromEncoded(readFileSync(path));
  const width = img.width();
  const height = img.height();
  const data = img.readPixels(0, 0, { width, height, alphaType: CK.AlphaType.Unpremul, colorType: CK.ColorType.RGBA_8888, colorSpace: CK.ColorSpace.SRGB });
  img.delete();
  return { width, height, data };
}

describe('Auto Enhance', () => {
  test('CPU tone model matches the Lumi shader', () => {
    const src = scene(96, 72);
    const values = { exposure: 25, brightness: -10, contrast: 20, highlights: -30, shadows: 25, saturation: 15, vibrance: 20, temperature: -20, tint: 10 };
    const out = render(src, values);
    const cpu = applyTone(samplePixels(src, 1e9), values);
    let worst = 0;
    let sum = 0;
    for (let i = 0, j = 0; i < out.data.length; i += 4, j += 3) {
      for (let c = 0; c < 3; c++) {
        const d = Math.abs(Math.round(cpu[j + c]! * 255) - out.data[i + c]!);
        worst = Math.max(worst, d);
        sum += d;
      }
    }
    expect(sum / (out.data.length * 0.75)).toBeLessThan(0.6);
    expect(worst).toBeLessThanOrEqual(3);
  });

  test('a dark photo gets brighter, toward the target median', () => {
    const dark = scene(120, 90, 0.35);
    const { values, stats } = suggestAuto(samplePixels(dark));
    expect(values.exposure ?? 0).toBeGreaterThan(20);
    const after = measureImage(render(dark, values));
    expect(after.p50).toBeGreaterThan(stats.p50 + 0.12);
    expect(Math.abs(after.p50 - 0.47)).toBeLessThan(0.08);
  });

  test('a bright photo gets darker, and its clipping is recovered', () => {
    const bright = scene(120, 90, 1.5);
    const { values, stats } = suggestAuto(samplePixels(bright));
    expect(values.exposure ?? 0).toBeLessThan(0);
    const after = measureImage(render(bright, values));
    expect(after.p50).toBeLessThan(stats.p50);
    expect(after.clipHigh).toBeLessThan(stats.clipHigh);
  });

  test('a colour cast is measured and mostly removed', () => {
    // Ground truth: the scene's grey stripes (right, below the sky).
    const greyMean = (p: Pixels) => {
      const m = [0, 0, 0];
      let n = 0;
      for (let y = Math.ceil(p.height * 0.4); y < p.height; y++) {
        for (let x = Math.ceil(p.width * 0.72); x < p.width; x++) {
          const i = (y * p.width + x) * 4;
          for (let c = 0; c < 3; c++) m[c] += p.data[i + c]!;
          n++;
        }
      }
      return m.map((v) => v / n);
    };
    const castRB = (p: Pixels) => {
      const [r, , b] = greyMean(p);
      return Math.log(r! / b!);
    };
    const castG = (p: Pixels) => {
      const [r, g, b] = greyMean(p);
      return Math.log((r! + b!) / 2 / g!);
    };
    const warm = scene(120, 90, 1, [1.1, 1, 0.87]);
    const { values, stats } = suggestAuto(samplePixels(warm));
    expect(stats.warmth).toBeGreaterThan(0.05);
    expect(values.temperature ?? 0).toBeLessThan(-10);
    expect(Math.abs(castRB(render(warm, values)))).toBeLessThan(Math.abs(castRB(warm)) * 0.5);

    const green = scene(120, 90, 1, [0.97, 1.04, 0.97]);
    const g = suggestAuto(samplePixels(green));
    expect(g.stats.tintCast).toBeLessThan(-0.04);
    expect(g.values.tint ?? 0).toBeGreaterThan(5);
    expect(Math.abs(castG(render(green, g.values)))).toBeLessThan(Math.abs(castG(green)) * 0.5);
  });

  test('different photos get different suggestions; a balanced one gets little', () => {
    const a = suggestAuto(samplePixels(scene(120, 90, 0.4))).values;
    const b = suggestAuto(samplePixels(scene(120, 90, 1, [1.1, 1, 0.87]))).values;
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    const ok = suggestAuto(samplePixels(scene(120, 90, 1))).values;
    expect(Math.abs(ok.exposure ?? 0)).toBeLessThan(Math.abs(a.exposure ?? 0));
  });

  test('strength 0 restores the adjustments before Auto; manual edits made since are kept', () => {
    const before: Adjustments = { ...DEFAULT_ADJUSTMENTS, exposure: 10, contrast: 95 };
    const suggested = { exposure: 30, contrast: 20, temperature: -15 };
    const full = applyAutoShare(before, {}, suggested, 100);
    expect(full.adjustments.exposure).toBe(40);
    expect(full.adjustments.contrast).toBe(100); // clamped
    expect(full.applied.contrast).toBe(5);
    const half = applyAutoShare(full.adjustments, full.applied, suggested, 50);
    expect(half.adjustments.exposure).toBe(25);
    expect(half.adjustments.temperature).toBe(-7); // −7.5 rounds half up
    const zero = applyAutoShare(half.adjustments, half.applied, suggested, 0);
    expect(zero.adjustments).toEqual(before);
    // A manual change after Auto survives strength changes.
    const manual = { ...full.adjustments, saturation: 12, exposure: full.adjustments.exposure + 5 };
    const off = applyAutoShare(manual, full.applied, suggested, 0);
    expect(off.adjustments.saturation).toBe(12);
    expect(off.adjustments.exposure).toBe(15);
  });

  const photo = join(import.meta.dir, '../../.face-warp-cache/dark.jpg');
  test.skipIf(!existsSync(photo))('real photo (dark.jpg) is lifted', () => {
    const p = decodeFile(photo);
    const { values, stats } = suggestAuto(samplePixels(p));
    const small = { width: p.width, height: p.height, data: p.data };
    const after = measureImage(render(small, values));
    const out = render(small, values);
    writeFileSync(join(import.meta.dir, '../../.face-warp-cache/renders/auto-dark.png'), encodePng(out));
    console.log('[auto] dark.jpg', JSON.stringify(values), 'p50', stats.p50.toFixed(3), '→', after.p50.toFixed(3));
    expect(after.p50).toBeGreaterThan(stats.p50 * 2.5);
    // A dark photo whose neutrals are barely above black gets no strong white-balance guess.
    expect(Math.abs(values.temperature ?? 0)).toBeLessThan(15);
  }, 60_000);
});
