/**
 * Object removal (Phase 4): selection → region → PatchMatch fill → RGBA
 * patch → composited by the preview / export compositor. Real Skia (RN Skia
 * web backend on CanvasKit).
 */
import { describe, expect, test } from 'bun:test';
import { AlphaType, ColorType, Skia, type SkImage } from '@shopify/react-native-skia';

import { composeRemovals, PATCHMATCH, removeObject, selectionBounds } from '@/services/inpaint/objectRemoval';
import { sourceToOutput } from '@/services/masks/maskRaster';
import type { Geometry } from '@/types/editing';
import type { MaskStroke } from '@/types/phase4';

import { at, NO_GEOMETRY, pixelsOf } from './helpers';

const W = 240;
const H = 180;

/** Diagonal stripes with a red disc (the object to remove) at (150, 90). */
function scene(object = true) {
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const on = (x + y) % 14 < 7;
      let c = on ? [210, 190, 150] : [90, 110, 140];
      if (object && Math.hypot(x - 150, y - 90) < 18) c = [220, 30, 30];
      data.set([c[0]!, c[1]!, c[2]!, 255], (y * W + x) * 4);
    }
  }
  return Skia.Image.MakeImage({ width: W, height: H, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Opaque }, Skia.Data.fromBytes(data), W * 4)!;
}

const store = new Map<string, Uint8Array>();
const save = (png: Uint8Array) => {
  const uri = `mem:${store.size}`;
  store.set(uri, png);
  return uri;
};
const load = (uri: string): SkImage => Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(store.get(uri)!))!;

const brush: MaskStroke = { id: 1, mode: 'add', radius: 22 / H, feather: 0, flow: 100, opacity: 100, points: [{ x: 150 / W, y: 90 / H }] };

function redness(p: { width: number; height: number; data: Uint8Array }, cx: number, cy: number, r: number) {
  let n = 0;
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    const [R, G, B] = at(p, x, y);
    if (R > 180 && G < 80 && B < 80) n++;
  }
  return n;
}

describe('object removal', () => {
  test('a brushed object is replaced by the surrounding stripes; the rest is unchanged', async () => {
    const photo = scene();
    const removal = await removeObject({ photo, srcW: W, srcH: H, selection: { kind: 'brush', strokes: [brush] }, tapImage: null, inpainter: PATCHMATCH, shouldCancel: () => false, onProgress: () => undefined, store: save });
    expect(removal).not.toBeNull();
    const out = pixelsOf(composeRemovals(photo, [removal!], new Map([[removal!.patch.uri, load(removal!.patch.uri)]]), sourceToOutput(NO_GEOMETRY, W, H, W, H), W, H));
    const before = pixelsOf(photo);
    expect(redness(before, 150, 90, 15)).toBeGreaterThan(500);
    expect(redness(out, 150, 90, 20)).toBe(0);
    // Matches the clean scene in the hole (stripes continue).
    const clean = pixelsOf(scene(false));
    let err = 0;
    let n = 0;
    for (let y = 75; y <= 105; y++) for (let x = 135; x <= 165; x++) {
      const a = at(out, x, y);
      const b = at(clean, x, y);
      err += Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
      n += 3;
    }
    expect(err / n).toBeLessThan(30);
    // Far from the object: identical.
    expect(at(out, 20, 20)).toEqual(at(before, 20, 20));
  });

  test('lasso selection and bounds', async () => {
    const lasso = { kind: 'lasso' as const, points: [0, 1, 2, 3, 4, 5, 6, 7].map((k) => ({ x: (150 + Math.cos(k * 0.785) * 24) / W, y: (90 + Math.sin(k * 0.785) * 24) / H })) };
    const b = selectionBounds(lasso, W, H, null)!;
    expect(b.x0).toBeCloseTo(126, 0);
    expect(b.x1).toBeCloseTo(174, 0);
    const photo = scene();
    const removal = await removeObject({ photo, srcW: W, srcH: H, selection: lasso, tapImage: null, inpainter: PATCHMATCH, shouldCancel: () => false, onProgress: () => undefined, store: save });
    const out = pixelsOf(composeRemovals(photo, [removal!], new Map([[removal!.patch.uri, load(removal!.patch.uri)]]), sourceToOutput(NO_GEOMETRY, W, H, W, H), W, H));
    expect(redness(out, 150, 90, 20)).toBe(0);
  });

  test('the patch follows geometry and is the same at preview and export sizes', async () => {
    const photo = scene();
    const removal = (await removeObject({ photo, srcW: W, srcH: H, selection: { kind: 'brush', strokes: [brush] }, tapImage: null, inpainter: PATCHMATCH, shouldCancel: () => false, onProgress: () => undefined, store: save }))!;
    const patches = new Map([[removal.patch.uri, load(removal.patch.uri)]]);
    // Rotated 90° + flipped frame at 2× (export) vs 1× (preview).
    const g: Geometry = { rotation: 90, flipH: true, flipV: false, crop: null, aspect: 'original' };
    const rotated = (scale: number) => {
      const s = Skia.Surface.Make(H * scale, W * scale)!;
      const c = s.getCanvas();
      c.concat(Skia.Matrix(sourceToOutput(g, W, H, H * scale, W * scale)));
      c.drawImageRectCubic(photo, Skia.XYWHRect(0, 0, W, H), Skia.XYWHRect(0, 0, W, H), 1 / 3, 1 / 3, null);
      s.flush();
      return s.makeImageSnapshot();
    };
    const big = pixelsOf(composeRemovals(rotated(2), [removal], patches, sourceToOutput(g, W, H, H * 2, W * 2), W, H));
    const small = pixelsOf(composeRemovals(rotated(1), [removal], patches, sourceToOutput(g, W, H, H, W), W, H));
    // Object position in the rotated + flipped frame: x' = 1 − (1 − y) = y, y' = x.
    expect(redness(small, 90, 150, 18)).toBe(0);
    expect(redness(big, 180, 300, 36)).toBe(0);
    const a = at(small, 90, 150);
    const b = at(big, 180, 300);
    expect(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])).toBeLessThan(60);
  });

  test('cancelling stops the fill and stores nothing', async () => {
    const before = store.size;
    await expect(
      removeObject({ photo: scene(), srcW: W, srcH: H, selection: { kind: 'brush', strokes: [brush] }, tapImage: null, inpainter: PATCHMATCH, shouldCancel: () => true, onProgress: () => undefined, store: save }),
    ).rejects.toThrow('cancelled');
    expect(store.size).toBe(before);
  });
});
