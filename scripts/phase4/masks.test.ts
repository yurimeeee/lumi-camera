/**
 * Selective adjustments (Phase 4): masks are rasterised by the app's own
 * code (RN Skia web backend on CanvasKit) and applied by the real Lumi
 * shader. `npm run test:phase4`.
 */
import { describe, expect, test } from 'bun:test';

import { DEFAULT_ADJUSTMENTS } from '@/constants/adjustments';
import { getFilter } from '@/constants/filters';
import { sourceToFrame } from '@/services/frameCoords';
import { resolveProcessing } from '@/services/imageProcessing';
import { rasterizeMask, sourceToOutput, tileSize } from '@/services/masks/maskRaster';
import { buildMaskAtlas, MaskPlaneCache } from '@/services/masks/maskRender';
import { maskUniforms, renderSlots } from '@/services/masks/shader';
import type { Geometry } from '@/types/editing';
import type { SelectiveMask } from '@/types/phase4';

import { diff, downscale, renderLumi, type Pixels } from '../image-engine/canvaskit';
import { at, flat, IDENTITY, lum, mask, maxStep, NO_GEOMETRY, pixelsOf, twoTone } from './helpers';

const W = 160;
const H = 120;

function renderMasks(src: Pixels, masks: SelectiveMask[], geometry: Geometry = NO_GEOMETRY, overlayId: string | null = null, side?: number) {
  const ctx = { geometry, srcW: W, srcH: H, images: new Map() };
  const slots = renderSlots(masks, overlayId);
  const atlas = buildMaskAtlas(slots, null, ctx, null, side);
  return renderLumi(src, IDENTITY(), maskUniforms(slots, atlas, overlayId, null) as unknown as Record<string, number[]>, {
    maskAtlas: atlas ? pixelsOf(atlas.image) : undefined,
  });
}

describe('mask coordinates', () => {
  test('the source → output matrix agrees with sourceToFrame for every geometry', () => {
    const crops = [null, { x: 0.1, y: 0.2, width: 0.6, height: 0.5 }];
    for (const rotation of [0, 90, 180, 270] as const) {
      for (const flipH of [false, true]) {
        for (const flipV of [false, true]) {
          for (const crop of crops) {
            const g: Geometry = { rotation, flipH, flipV, crop, aspect: 'free' };
            const m = sourceToOutput(g, 400, 300, 200, 100);
            for (const p of [{ x: 0.3, y: 0.7 }, { x: 0.9, y: 0.1 }, { x: 0.5, y: 0.5 }]) {
              const f = sourceToFrame(p, g);
              const sx = p.x * 400;
              const sy = p.y * 300;
              expect(m[0]! * sx + m[1]! * sy + m[2]!).toBeCloseTo(f.x * 200, 6);
              expect(m[3]! * sx + m[4]! * sy + m[5]!).toBeCloseTo(f.y * 100, 6);
            }
          }
        }
      }
    }
  });
});

describe('mask shapes', () => {
  const ctx = { geometry: NO_GEOMETRY, srcW: W, srcH: H, images: new Map() };

  test('radial: full inside, none outside, smooth feather', () => {
    const m = mask({ kind: 'radial', cx: 0.5, cy: 0.5, rx: 0.3, ry: 0.2, angle: 0, feather: 50 });
    const p = rasterizeMask(m, ctx, W, H);
    expect(p[60 * W + 80]).toBeGreaterThan(250);
    expect(p[5 * W + 5]).toBe(0);
    // rx = 0.3 × 120 = 36 px: just inside the inner half is still full, beyond the radius it's 0.
    expect(p[60 * W + 80 + 15]).toBeGreaterThan(245);
    expect(p[60 * W + 80 + 40]).toBe(0);
    // No step larger than a smooth 18 px ramp would make.
    let worst = 0;
    for (let x = 1; x < W; x++) worst = Math.max(worst, Math.abs(p[60 * W + x]! - p[60 * W + x - 1]!));
    expect(worst).toBeLessThan(26);
  });

  test('radial: rotation and invert', () => {
    const r = mask({ kind: 'radial', cx: 0.5, cy: 0.5, rx: 0.45, ry: 0.08, angle: 90, feather: 10 });
    const p = rasterizeMask(r, ctx, W, H);
    // Rotated 90°: long axis vertical.
    expect(p[(60 - 40) * W + 80]).toBeGreaterThan(200);
    expect(p[60 * W + 80 + 40]).toBe(0);
    const inv = rasterizeMask({ ...r, invert: true }, ctx, W, H);
    expect(inv[60 * W + 80]).toBeLessThan(5);
    expect(inv[5 * W + 5]).toBe(255);
  });

  test('linear: full at the start, none past the end, monotonic', () => {
    const p = rasterizeMask(mask({ kind: 'linear', x0: 0.5, y0: 0.2, x1: 0.5, y1: 0.6 }), ctx, W, H);
    expect(p[10 * W + 80]).toBe(255);
    expect(p[100 * W + 80]).toBe(0);
    for (let y = 1; y < H; y++) expect(p[y * W + 80]!).toBeLessThanOrEqual(p[(y - 1) * W + 80]! + 1);
  });

  test('brush: add paints, erase removes, opacity caps', () => {
    const stroke = { id: 1, mode: 'add' as const, radius: 0.08, feather: 30, flow: 100, opacity: 100, points: [{ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }] };
    const add = rasterizeMask(mask({ kind: 'brush' }, {}, { strokes: [stroke] }), ctx, W, H);
    expect(add[60 * W + 80]).toBeGreaterThan(250);
    expect(add[10 * W + 80]).toBe(0);
    const half = rasterizeMask(mask({ kind: 'brush' }, {}, { strokes: [{ ...stroke, opacity: 50 }] }), ctx, W, H);
    expect(Math.abs(half[60 * W + 80]! - 128)).toBeLessThan(6);
    const erased = rasterizeMask(
      mask({ kind: 'brush' }, {}, { strokes: [stroke, { ...stroke, id: 2, mode: 'erase', points: [{ x: 0.5, y: 0.3 }, { x: 0.5, y: 0.7 }] }] }),
      ctx,
      W,
      H,
    );
    expect(erased[60 * W + 80]).toBeLessThan(5);
    expect(erased[60 * W + 40]).toBeGreaterThan(250);
  });
});

describe('masked adjustments in the shader', () => {
  const grey = flat(W, H, [110, 110, 110]);

  test('local exposure inside a radial equals global exposure; outside is untouched; the edge is smooth', () => {
    const m = mask({ kind: 'radial', cx: 0.5, cy: 0.5, rx: 0.35, ry: 0.35, angle: 0, feather: 60 }, { exposure: 60 });
    const out = renderMasks(grey, [m]);
    const global = renderLumi(grey, resolveProcessing({ filter: getFilter('original'), intensity: 0, adjustments: { ...DEFAULT_ADJUSTMENTS, exposure: 60 } }));
    expect(diff({ ...out, data: Uint8Array.from(at(out, 80, 60)) }, { ...out, data: Uint8Array.from(at(global, 80, 60)) }).max).toBeLessThanOrEqual(1);
    expect(at(out, 3, 3)).toEqual([110, 110, 110]);
    expect(maxStep(out)).toBeLessThan(6);
  });

  test('neutral masks change nothing', () => {
    const out = renderMasks(grey, [mask({ kind: 'radial', cx: 0.5, cy: 0.5, rx: 0.3, ry: 0.3, angle: 0, feather: 50 })]);
    expect(diff(out, renderLumi(grey, IDENTITY())).max).toBe(0);
  });

  test('colour range selects the picked colour only (and inverts)', () => {
    const src = twoTone(W, H);
    const picked = at(src, 30, 60).map((v) => v / 255) as [number, number, number];
    const m = mask({ kind: 'color', color: picked, at: { x: 0.2, y: 0.5 }, range: 40 }, { saturation: -100 });
    const out = renderMasks(src, [m]);
    const red = at(out, 30, 60);
    expect(Math.max(...red) - Math.min(...red)).toBeLessThan(8); // desaturated
    expect(at(out, 130, 60)).toEqual(at(src, 130, 60)); // blue untouched
    const inv = renderMasks(src, [{ ...m, invert: true }]);
    expect(at(inv, 30, 60)).toEqual(at(src, 30, 60));
    const blue = at(inv, 130, 60);
    expect(Math.max(...blue) - Math.min(...blue)).toBeLessThan(8);
  });

  test('luminance range: highlights only', () => {
    // Vertical grey ramp, 10 % (top) → 95 % (bottom).
    const src = flat(W, H, [0, 0, 0]);
    for (let y = 0; y < H; y++) {
      const v = Math.round((0.1 + 0.85 * (y / (H - 1))) * 255);
      for (let x = 0; x < W; x++) src.data.fill(v, (y * W + x) * 4, (y * W + x) * 4 + 3);
    }
    const m = mask({ kind: 'luminance', min: 45, max: 100, feather: 10 }, { exposure: -80 });
    const out = renderMasks(src, [m]);
    // Bright rows (bottom) darkened, dark rows (top) kept.
    expect(lum(at(out, 130, H - 3))).toBeLessThan(lum(at(src, 130, H - 3)) - 20);
    expect(at(out, 130, 2)).toEqual(at(src, 130, 2));
  });

  test('clarity and sharpness act only inside the mask', () => {
    const src = twoTone(W, H);
    const m = mask({ kind: 'linear', x0: 0, y0: 0.5, x1: 0.01, y1: 0.5 }, { clarity: 80, sharpness: 80 });
    const out = renderMasks(src, [m]);
    // Mask covers nothing right of x≈2: the red/blue boundary there is untouched.
    expect(at(out, 80, 60)).toEqual(at(src, 80, 60));
    const all = renderMasks(src, [{ ...m, shape: { kind: 'luminance', min: 0, max: 100, feather: 0 } }]);
    expect(diff(all, src).max).toBeGreaterThan(10);
  });

  test('several masks combine in order; hidden masks are skipped', () => {
    const a = mask({ kind: 'linear', x0: 0.5, y0: 0, x1: 0.5, y1: 0.4 }, { exposure: 50 });
    const b = mask({ kind: 'linear', x0: 0.5, y0: 1, x1: 0.5, y1: 0.6 }, { exposure: -50 });
    const out = renderMasks(grey, [a, b]);
    expect(lum(at(out, 80, 3))).toBeGreaterThan(130);
    expect(lum(at(out, 80, H - 3))).toBeLessThan(90);
    expect(lum(at(out, 80, 60))).toBeCloseTo(110, -1);
    const hidden = renderMasks(grey, [a, { ...b, visible: false }]);
    expect(lum(at(hidden, 80, H - 3))).toBeCloseTo(110, 0);
  });

  test('overlay tints only the shown mask and is drawn even before it has values', () => {
    const m = mask({ kind: 'radial', cx: 0.5, cy: 0.5, rx: 0.2, ry: 0.2, angle: 0, feather: 20 });
    const out = renderMasks(grey, [m], NO_GEOMETRY, m.id);
    const c = at(out, 80, 60);
    expect(c[0]).toBeGreaterThan(c[2] + 30);
    expect(at(out, 3, 3)).toEqual([110, 110, 110]);
  });
});

describe('masks follow geometry; preview = export', () => {
  test('a rotated + flipped + cropped render shows the mask on the same content', () => {
    const m = mask({ kind: 'radial', cx: 0.25, cy: 0.3, rx: 0.15, ry: 0.15, angle: 0, feather: 30 }, { exposure: 80 });
    const g: Geometry = { rotation: 90, flipH: true, flipV: false, crop: { x: 0.1, y: 0.05, width: 0.8, height: 0.9 }, aspect: 'free' };
    const ctx = { geometry: g, srcW: W, srcH: H, images: new Map() };
    const t = tileSize(ctx, 256);
    // Mask value at the frame position of the mask's centre must be full.
    const f = sourceToFrame({ x: 0.25, y: 0.3 }, g);
    const plane = rasterizeMask(m, ctx, t.width, t.height);
    expect(plane[Math.round(f.y * t.height) * t.width + Math.round(f.x * t.width)]).toBeGreaterThan(250);
    const far = sourceToFrame({ x: 0.75, y: 0.8 }, g);
    expect(plane[Math.round(far.y * t.height) * t.width + Math.round(far.x * t.width)]).toBe(0);
  });

  test('atlas built at preview and export sizes renders the same picture', () => {
    const src = twoTone(W * 4, H * 4);
    const m = mask({ kind: 'radial', cx: 0.4, cy: 0.5, rx: 0.3, ry: 0.25, angle: 20, feather: 50 }, { exposure: 40, temperature: 30 });
    const ctx = (w: number, h: number) => ({ geometry: NO_GEOMETRY, srcW: w, srcH: h, images: new Map() });
    const slots = renderSlots([m], null);
    const big = buildMaskAtlas(slots, null, ctx(W * 4, H * 4), null, 1024)!;
    const exportRender = renderLumi(src, IDENTITY(), maskUniforms(slots, big, null, null) as unknown as Record<string, number[]>, { maskAtlas: pixelsOf(big.image) });
    const small = downscale(src, 4);
    const prevAtlas = buildMaskAtlas(slots, null, ctx(W * 4, H * 4), new MaskPlaneCache(), 256)!;
    const preview = renderLumi(small, IDENTITY(), maskUniforms(slots, prevAtlas, null, null) as unknown as Record<string, number[]>, { maskAtlas: pixelsOf(prevAtlas.image) });
    expect(diff(downscale(exportRender, 4), preview).mean).toBeLessThan(1.5);
  });
});
