/**
 * Smart filter recommendation (Phase 4): rule-based, driven by measured
 * photo statistics. Synthetic scenes stand for the spec's examples.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { FILTERS } from '@/constants/filters';
import { measureImage, type RgbaPixels } from '@/services/autoEnhance';
import { recommendFilters } from '@/services/recommend';

import { CK } from './canvaskit';

/** Fills with a weighted mix of colours (per row band) plus mild noise. */
function scene(bands: [number, [number, number, number]][], w = 120, h = 90): RgbaPixels {
  const data = new Uint8Array(w * h * 4);
  const total = bands.reduce((a, [k]) => a + k, 0);
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < h; y++) {
    let acc = 0;
    let c = bands[0]![1];
    for (const [k, col] of bands) {
      acc += k / total;
      if (y / h < acc) {
        c = col;
        break;
      }
    }
    for (let x = 0; x < w; x++) {
      const n = (rnd() - 0.5) * 0.06;
      const i = (y * w + x) * 4;
      for (let ch = 0; ch < 3; ch++) data[i + ch] = Math.round(Math.min(1, Math.max(0, c[ch]! + n)) * 255);
      data[i + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

const top = (ids: { filterId: string }[], n = 4) => ids.slice(0, n).map((r) => r.filterId);

describe('filter recommendation', () => {
  const warmPortrait = scene([
    [5, [0.86, 0.62, 0.48]],
    [3, [0.7, 0.48, 0.36]],
    [2, [0.55, 0.45, 0.38]],
  ]);
  const coolLandscape = scene([
    [4, [0.55, 0.7, 0.88]],
    [3, [0.25, 0.45, 0.35]],
    [3, [0.2, 0.35, 0.55]],
  ]);
  const night = scene([
    [6, [0.05, 0.05, 0.08]],
    [3, [0.12, 0.1, 0.12]],
    [1, [0.8, 0.65, 0.3]],
  ]);

  test('warm portrait → warm, gentle looks (Mellow / Peachy / Cream family)', () => {
    const { profile, items } = recommendFilters(measureImage(warmPortrait), true);
    expect(profile.mood).toBe('warmPortrait');
    const ids = top(items);
    expect(ids.some((id) => ['mellow', 'peachy', 'cream'].includes(id))).toBe(true);
    expect(ids.every((id) => FILTERS.find((f) => f.id === id)!.category !== 'bw')).toBe(true);
  });

  test('cool landscape → cool looks (Mist / Blue Hour / Breeze)', () => {
    const { profile, items } = recommendFilters(measureImage(coolLandscape), false);
    expect(profile.mood).toBe('coolLandscape');
    const ids = top(items, 3);
    expect(ids.filter((id) => ['mist', 'blue-hour', 'breeze'].includes(id)).length).toBeGreaterThanOrEqual(2);
  });

  test('night → filmic / mono looks (Film 35 / Dusty / Noir family)', () => {
    const { profile, items } = recommendFilters(measureImage(night), false);
    expect(profile.mood).toBe('night');
    const cats = top(items).map((id) => FILTERS.find((f) => f.id === id)!.category);
    expect(cats.every((c) => c === 'film' || c === 'bw')).toBe(true);
  });

  test('deterministic, diverse, only real filters, never Original', () => {
    const a = recommendFilters(measureImage(warmPortrait), true);
    const b = recommendFilters(measureImage(warmPortrait), true);
    expect(a.items).toEqual(b.items);
    const ids = a.items.map((r) => r.filterId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain('original');
    for (const id of ids) expect(FILTERS.some((f) => f.id === id)).toBe(true);
    const perCat = new Map<string, number>();
    for (const id of ids) {
      const c = FILTERS.find((f) => f.id === id)!.category;
      perCat.set(c, (perCat.get(c) ?? 0) + 1);
    }
    expect(Math.max(...perCat.values())).toBeLessThanOrEqual(3);
    // Different photos, different lists.
    expect(top(recommendFilters(measureImage(coolLandscape), false).items).join()).not.toBe(top(a.items).join());
  });

  for (const [file, faces] of [['long-hair', true], ['no-face', false], ['dark', true]] as const) {
    const path = join(import.meta.dir, `../../.face-warp-cache/${file}.jpg`);
    test.skipIf(!existsSync(path))(`real photo ${file}.jpg`, () => {
      const img = CK.MakeImageFromEncoded(readFileSync(path));
      const w = img.width();
      const h = img.height();
      const data = img.readPixels(0, 0, { width: w, height: h, alphaType: CK.AlphaType.Unpremul, colorType: CK.ColorType.RGBA_8888, colorSpace: CK.ColorSpace.SRGB });
      img.delete();
      const { profile, items } = recommendFilters(measureImage({ width: w, height: h, data }), faces);
      console.log(`[recommend] ${file}: ${profile.mood} → ${top(items, 5).join(', ')}`);
      expect(items.length).toBeGreaterThan(4);
    });
  }
});
