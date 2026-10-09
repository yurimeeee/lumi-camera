/**
 * Test fixtures for Frame Studio: the real kit assets decoded from disk, a
 * procedural test photo, and pixel helpers.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { AlphaType, ColorType, Skia, type SkImage } from '@shopify/react-native-skia';

import type { AssetBank } from '@/image-engine/frame/bank';
import { textureMean } from '@/image-engine/frame/FrameAssetLoader';
import { decorationPresets, texturePresets } from '@/image-engine/frame/registry';
import type { ImageRef } from '@/features/frame-studio/types/document';

export const ROOT = join(import.meta.dir, '..', '..');

/** Asset module (number on device) → file path in tests. */
export function assetPath(source: unknown): string {
  return typeof source === 'string' ? source : (source as { default: string }).default;
}

export function decodeFile(path: string): SkImage {
  const img = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(new Uint8Array(readFileSync(path))));
  if (!img) throw new Error(`cannot decode ${path}`);
  return img;
}

/** Kit bank (textures, tapes, caption font) + extra images by URI. */
export function kitBank(images: Record<string, SkImage> = {}): AssetBank {
  const textures = new Map(
    texturePresets().map((t) => {
      const image = decodeFile(assetPath(t.source));
      return [t.id, { image, mean: textureMean(image) }] as const;
    }),
  );
  const decorations = new Map<string, SkImage>();
  for (const d of decorationPresets()) if (d.type === 'image') decorations.set(d.id, decodeFile(assetPath(d.source)));
  const typeface = Skia.Typeface.MakeFreeTypeFaceFromData(Skia.Data.fromBytes(new Uint8Array(readFileSync(join(ROOT, 'assets/fonts/Inter-Medium.ttf')))));
  return { textures, decorations, images: new Map(Object.entries(images)), typeface };
}

/** Deterministic "photo": sky gradient, sun, hills, a dark tree — every tone present. */
export function testPhoto(width = 1200, height = 900, hue = 0): SkImage {
  const s = Skia.Surface.Make(width, height)!;
  const c = s.getCanvas();
  const sky = Skia.Paint();
  sky.setShader(
    Skia.Shader.MakeLinearGradient(Skia.Point(0, 0), Skia.Point(0, height * 0.6), [Skia.Color(hue ? '#C9A0DC' : '#8FB3D9'), Skia.Color('#F4C9A0')], null, 0),
  );
  c.drawRect(Skia.XYWHRect(0, 0, width, height), sky);
  const sun = Skia.Paint();
  sun.setColor(Skia.Color('#FFE9B8'));
  c.drawCircle(width * 0.7, height * 0.35, height * 0.1, sun);
  const hill = Skia.Paint();
  hill.setColor(Skia.Color(hue ? '#7A5C3E' : '#4F7A4A'));
  c.drawOval(Skia.XYWHRect(-width * 0.2, height * 0.55, width * 1.4, height * 0.9), hill);
  const tree = Skia.Paint();
  tree.setColor(Skia.Color('#1E2A1C'));
  c.drawRect(Skia.XYWHRect(width * 0.22, height * 0.35, width * 0.05, height * 0.4), tree);
  c.drawCircle(width * 0.245, height * 0.33, height * 0.12, tree);
  s.flush();
  return s.makeImageSnapshot();
}

export function photoRef(uri: string, img: SkImage): ImageRef {
  return { uri, width: img.width(), height: img.height() };
}

export interface Pixels {
  width: number;
  height: number;
  data: Uint8Array;
}

export function pixelsOf(img: SkImage): Pixels {
  const width = img.width();
  const height = img.height();
  const data = img.readPixels(0, 0, { width, height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul }) as Uint8Array;
  return { width, height, data: new Uint8Array(data) };
}

export function px(p: Pixels, x: number, y: number): [number, number, number, number] {
  const i = (Math.round(y) * p.width + Math.round(x)) * 4;
  return [p.data[i]!, p.data[i + 1]!, p.data[i + 2]!, p.data[i + 3]!];
}

/** Mean RGB over a rect (inclusive bounds clamped). */
export function meanRgb(p: Pixels, x0: number, y0: number, x1: number, y1: number): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(p.height, Math.ceil(y1)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(p.width, Math.ceil(x1)); x++) {
      const i = (y * p.width + x) * 4;
      r += p.data[i]!;
      g += p.data[i + 1]!;
      b += p.data[i + 2]!;
      n++;
    }
  }
  return [r / n, g / n, b / n];
}

export function encodePng(img: SkImage): Uint8Array {
  return img.encodeToBytes(4 /* PNG */, 100);
}

/** Box-downscales `p` to w×h (for preview vs export comparison). */
export function resize(img: SkImage, w: number, h: number): Pixels {
  const s = Skia.Surface.Make(w, h)!;
  s.getCanvas().drawImageRectCubic(img, Skia.XYWHRect(0, 0, img.width(), img.height()), Skia.XYWHRect(0, 0, w, h), 1 / 3, 1 / 3);
  s.flush();
  return pixelsOf(s.makeImageSnapshot());
}

export function meanAbsDiff(a: Pixels, b: Pixels): number {
  let d = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    d += Math.abs(a.data[i]! - b.data[i]!) + Math.abs(a.data[i + 1]! - b.data[i + 1]!) + Math.abs(a.data[i + 2]! - b.data[i + 2]!);
  }
  return d / ((a.data.length / 4) * 3);
}
