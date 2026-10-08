/**
 * Pixel tests of the real Lumi SkSL (rendered with CanvasKit):
 * `npm run test:engine`. Golden images live in ./golden; regenerate them
 * after an intended look change with `UPDATE_GOLDEN=1 npm run test:engine`.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { DEFAULT_ADJUSTMENTS } from '@/constants/adjustments';
import { getFilter } from '@/constants/filters';
import { DEFAULT_CURVES, lookupCpu, curveTableBytes } from '@/services/color/curves';
import { DEFAULT_HSL, applyHslCpu, hslToRgb } from '@/services/color/hsl';
import { resolveProcessing, type ProcessingInput } from '@/services/imageProcessing';

import { decodePng, diff, downscale, effect, encodePng, renderLumi, shaderCompileError, type Pixels } from './canvaskit';

const GOLDEN = join(import.meta.dir, 'golden');
const UPDATE = process.env.UPDATE_GOLDEN === '1';

/** Smooth synthetic photo: hue × saturation sweep, a grey ramp, a skin and a sky patch. */
function testImage(width: number, height: number): Pixels {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      const v = (y + 0.5) / height;
      let rgb: [number, number, number];
      if (v < 0.6) rgb = hslToRgb(u * 360, 0.2 + (v / 0.6) * 0.7, 0.35 + 0.3 * Math.sin(u * Math.PI));
      else if (v < 0.75) rgb = [u, u, u];
      else if (u < 0.5) rgb = hslToRgb(24, 0.5, 0.62 + 0.1 * (u - 0.25)); // skin
      else rgb = hslToRgb(212, 0.55, 0.55 + 0.15 * (v - 0.85)); // sky
      const k = (y * width + x) * 4;
      data[k] = Math.round(rgb[0] * 255);
      data[k + 1] = Math.round(rgb[1] * 255);
      data[k + 2] = Math.round(rgb[2] * 255);
      data[k + 3] = 255;
    }
  }
  return { width, height, data };
}

const SRC = testImage(128, 96);
const identity = () => resolveProcessing({ filter: getFilter('original'), intensity: 0 });

function at(p: Pixels, x: number, y: number): [number, number, number] {
  const k = (y * p.width + x) * 4;
  return [p.data[k]!, p.data[k + 1]!, p.data[k + 2]!];
}

function golden(name: string, out: Pixels) {
  const path = join(GOLDEN, `${name}.png`);
  if (UPDATE || !existsSync(path)) {
    writeFileSync(path, encodePng(out));
    return;
  }
  const d = diff(decodePng(readFileSync(path)), out);
  expect(d.max).toBeLessThanOrEqual(2);
}

describe('Lumi SkSL', () => {
  test('compiles', () => {
    expect(shaderCompileError()).toBe('');
    expect(effect).toBeTruthy();
  });

  test('neutral uniforms leave the photo unchanged (HSL and curve paths forced on)', () => {
    const out = renderLumi(SRC, identity(), { uHslOn: 1, uCurvesOn: 1 });
    expect(diff(out, SRC).max).toBeLessThanOrEqual(1);
  });

  test('filter intensity 0 is the original', () => {
    for (const id of ['mellow', 'peachy', 'film-35', 'noir', 'blue-hour']) {
      const p = resolveProcessing({ filter: getFilter(id), intensity: 0 });
      expect(diff(renderLumi(SRC, p, { uHslOn: 1, uCurvesOn: 1 }), SRC).max).toBeLessThanOrEqual(1);
    }
  });

  test('filters render distinct looks (golden)', () => {
    const outs = ['mellow', 'peachy', 'blue-hour', 'film-35', 'cream', 'noir'].map((id) => {
      const out = renderLumi(SRC, resolveProcessing({ filter: getFilter(id), intensity: 100 }));
      golden(`filter-${id}`, out);
      return out;
    });
    for (let i = 0; i < outs.length; i++) {
      for (let j = i + 1; j < outs.length; j++) expect(diff(outs[i]!, outs[j]!).mean).toBeGreaterThan(2);
    }
  });

  test('HSL: Orange luminance/saturation change skin, not sky or greys; matches the CPU mirror', () => {
    const p = resolveProcessing({
      filter: getFilter('original'),
      intensity: 0,
      hsl: { ...DEFAULT_HSL, orange: { hue: 0, saturation: -15, luminance: 20 }, blue: { hue: -10, saturation: 0, luminance: 0 } },
    });
    const out = renderLumi(SRC, p);
    const skin = [20, 85] as const;
    const sky = [110, 85] as const;
    const grey = [64, 66] as const;
    const before = at(SRC, ...skin);
    const after = at(out, ...skin);
    expect(after[0] + after[1] + after[2]).toBeGreaterThan(before[0] + before[1] + before[2] + 15);
    expect(diff({ ...SRC, data: Uint8Array.from(at(SRC, ...grey)) }, { ...SRC, data: Uint8Array.from(at(out, ...grey)) }).max).toBeLessThanOrEqual(1);
    // Blue hue −10 moves the sky toward aqua: more green relative to red.
    const s0 = at(SRC, ...sky);
    const s1 = at(out, ...sky);
    expect(s1[1] - s1[0]).toBeGreaterThan(s0[1] - s0[0]);
    // CPU mirror agrees with the shader on every pixel.
    let worst = 0;
    for (let i = 0; i < SRC.data.length; i += 4) {
      const c = applyHslCpu([SRC.data[i]! / 255, SRC.data[i + 1]! / 255, SRC.data[i + 2]! / 255], p.hsl);
      for (let ch = 0; ch < 3; ch++) worst = Math.max(worst, Math.abs(Math.round(Math.min(1, Math.max(0, c[ch]!)) * 255) - out.data[i + ch]!));
    }
    expect(worst).toBeLessThanOrEqual(2);
    golden('hsl-orange-blue', out);
  });

  test('HSL bands blend without seams across the hue sweep', () => {
    const p = resolveProcessing({
      filter: getFilter('original'),
      intensity: 0,
      hsl: { ...DEFAULT_HSL, orange: { hue: 0, saturation: 0, luminance: 100 } },
    });
    const out = renderLumi(SRC, p);
    // Neighbouring columns never jump more than a smooth gradient would.
    const y = 40;
    for (let x = 1; x < SRC.width; x++) {
      const a = at(out, x - 1, y);
      const b = at(out, x, y);
      const a0 = at(SRC, x - 1, y);
      const b0 = at(SRC, x, y);
      for (let c = 0; c < 3; c++) expect(Math.abs(b[c]! - a[c]!)).toBeLessThanOrEqual(Math.abs(b0[c]! - a0[c]!) + 12);
    }
  });

  test('Curves: S-curve + Blue channel match the LUT exactly as the CPU reads it', () => {
    const p = resolveProcessing({
      filter: getFilter('original'),
      intensity: 0,
      curves: {
        ...DEFAULT_CURVES,
        rgb: [{ x: 0, y: 0 }, { x: 0.25, y: 0.18 }, { x: 0.75, y: 0.84 }, { x: 1, y: 1 }],
        blue: [{ x: 0, y: 0.06 }, { x: 0.5, y: 0.56 }, { x: 1, y: 1 }],
      },
    });
    expect(p.curves).not.toBeNull();
    const out = renderLumi(SRC, p);
    const lut = curveTableBytes(p.curves!);
    let worst = 0;
    for (let i = 0; i < SRC.data.length; i += 4) {
      for (let c = 0 as 0 | 1 | 2; c < 3; c = (c + 1) as 0 | 1 | 2) {
        const expected = Math.round(lookupCpu(lut, SRC.data[i + c]! / 255, c) * 255);
        worst = Math.max(worst, Math.abs(expected - out.data[i + c]!));
      }
    }
    expect(worst).toBeLessThanOrEqual(1);
    golden('curves-s-blue', out);
  });

  test('Curves: extreme points never produce NaN or out-of-range pixels', () => {
    const p = resolveProcessing({
      filter: getFilter('original'),
      intensity: 0,
      curves: {
        ...DEFAULT_CURVES,
        rgb: [{ x: 0, y: 1 }, { x: 0.02, y: 0 }, { x: 0.04, y: 1 }, { x: 1, y: 0 }],
        red: [{ x: 0, y: 0 }, { x: 0.999, y: 1 }, { x: 1, y: 0 }],
      },
    });
    for (const v of p.curves!) expect(Number.isFinite(v) && v >= 0 && v <= 1).toBe(true);
    const out = renderLumi(SRC, p);
    expect(out.data.every((v) => v >= 0 && v <= 255)).toBe(true);
  });

  test('preview and export resolutions render the same look (scenario B)', () => {
    const input: Omit<ProcessingInput, 'filter'> & { id: string } = {
      id: 'peachy',
      intensity: 70,
      adjustments: { ...DEFAULT_ADJUSTMENTS, exposure: 15, highlights: -20, shadows: 10 },
    };
    const p = resolveProcessing({ ...input, filter: getFilter(input.id) });
    const preview = renderLumi(testImage(128, 96), p);
    const exported = renderLumi(testImage(512, 384), p);
    const d = diff(downscale(exported, 4), preview);
    expect(d.mean).toBeLessThan(1.5);
    golden('scenario-b-peachy', preview);
  });

  test('vignette and soft effects are resolution independent', () => {
    const p = resolveProcessing({ filter: getFilter('cream'), intensity: 100, adjustments: { ...DEFAULT_ADJUSTMENTS, vignette: 60, sharpness: 40 } });
    const d = diff(downscale(renderLumi(testImage(512, 384), p), 4), renderLumi(testImage(128, 96), p));
    expect(d.mean).toBeLessThan(2);
  });
});
