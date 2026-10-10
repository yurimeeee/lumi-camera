/**
 * Renders the real Lumi SkSL with CanvasKit (CPU) — the same shader source
 * and the same uniform/curve inputs the app hands to Skia on the device.
 */
import { join } from 'path';

import { curveLutBytes } from '@/services/color/curveTexture';
import { buildUniforms, type ResolvedProcessing } from '@/services/imageProcessing';
import { LUMI_SKSL } from '@/shaders/lumiShader';

const ROOT = join(import.meta.dir, '..', '..');
const CK_DIR = join(ROOT, 'node_modules/canvaskit-wasm/bin/full/');
const { default: CanvasKitInit } = await import(join(CK_DIR, 'canvaskit.js'));
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- CanvasKit's bundled types aren't loaded here
export const CK: any = await CanvasKitInit({ locateFile: (f: string) => CK_DIR + f });

let compileError = '';
export const effect = CK.RuntimeEffect.Make(LUMI_SKSL, (e: string) => {
  compileError = e;
});
export const shaderCompileError = () => compileError;

const INFO = { alphaType: CK.AlphaType.Unpremul, colorType: CK.ColorType.RGBA_8888, colorSpace: CK.ColorSpace.SRGB };

export interface Pixels {
  width: number;
  height: number;
  data: Uint8Array;
}

function image(p: Pixels) {
  return CK.MakeImage({ width: p.width, height: p.height, ...INFO, alphaType: CK.AlphaType.Opaque }, p.data, p.width * 4);
}

/** Flattens a uniform dictionary in the effect's declaration order. */
export function flatten(values: Record<string, number | number[]>): Float32Array {
  const flat = new Float32Array(effect.getUniformFloatCount());
  for (let i = 0; i < effect.getUniformCount(); i++) {
    const name = effect.getUniformName(i);
    const v = values[name];
    if (v === undefined) throw new Error(`uniform ${name} missing`);
    flat.set(typeof v === 'number' ? [v] : v, effect.getUniform(i).slot);
  }
  return flat;
}

export interface ExtraChildren {
  /** Mask atlas (RGB planes, see services/masks/maskRaster), sampled 1:1 like the app. */
  maskAtlas?: Pixels;
  /** Background layer over the frame (premultiplied RGBA). */
  bgLayer?: Pixels;
  /** Replaces the photo the shader reads (e.g. with object-removal patches composited). */
  image?: Pixels;
}

/** Runs the Lumi shader over `src` with `p` (resolution = the source size). */
export function renderLumi(
  src: Pixels,
  p: ResolvedProcessing,
  overrides: Record<string, number | number[]> = {},
  extra: ExtraChildren = {},
): Pixels {
  const { width: W, height: H } = src;
  const values = { ...buildUniforms(p, W, H), uReshape: 0, ...overrides } as Record<string, number | number[]>;
  const img = image(src);
  // Neutral 16-bit displacement (0.5 → R = 128, G = 0).
  const neutral = CK.MakeImage({ width: 1, height: 1, ...INFO, alphaType: CK.AlphaType.Opaque }, new Uint8Array([128, 0, 0, 255]), 4);
  const lutBytes = curveLutBytes(p.curves, p.mix?.curves ?? null);
  const lut = CK.MakeImage({ width: 256, height: 2, ...INFO, alphaType: CK.AlphaType.Opaque }, lutBytes, 256 * 4);
  const low = lowResPixels(src);
  const lowImg = image(low);
  // Same mapping as the app: the small copy is stretched over the frame.
  const lowShader = lowImg.makeShaderCubic(CK.TileMode.Clamp, CK.TileMode.Clamp, 1 / 3, 1 / 3, CK.Matrix.scaled(W / low.width, H / low.height));
  const nearest = (i: { makeShaderOptions: (...a: unknown[]) => unknown }) =>
    i.makeShaderOptions(CK.TileMode.Clamp, CK.TileMode.Clamp, CK.FilterMode.Nearest, CK.MipmapMode.None);
  // B-spline cubic (B = 1, C = 0), as LumiLayer samples masks and the background layer.
  const black = CK.MakeImage({ width: 1, height: 1, ...INFO, alphaType: CK.AlphaType.Opaque }, new Uint8Array([0, 0, 0, 255]), 4);
  const atlasImg = extra.maskAtlas ? image(extra.maskAtlas) : black;
  const atlas = atlasImg.makeShaderCubic(CK.TileMode.Clamp, CK.TileMode.Clamp, 1, 0, CK.Matrix.identity());
  const bgImg = extra.bgLayer
    ? CK.MakeImage({ width: extra.bgLayer.width, height: extra.bgLayer.height, ...INFO, alphaType: CK.AlphaType.Premul }, extra.bgLayer.data, extra.bgLayer.width * 4)
    : black;
  const bgW = extra.bgLayer?.width ?? 1;
  const bgH = extra.bgLayer?.height ?? 1;
  const bg = bgImg.makeShaderCubic(CK.TileMode.Clamp, CK.TileMode.Clamp, 1, 0, CK.Matrix.scaled(W / bgW, H / bgH));
  const photo = extra.image ? image(extra.image) : img;
  const shader = effect.makeShaderWithChildren(flatten(values), [nearest(photo), nearest(neutral), nearest(neutral), nearest(lut), lowShader, atlas, bg]);
  const surface = CK.MakeSurface(W, H);
  const paint = new CK.Paint();
  paint.setShader(shader);
  surface.getCanvas().drawRect(CK.XYWHRect(0, 0, W, H), paint);
  surface.flush();
  const data = surface.makeImageSnapshot().readPixels(0, 0, { width: W, height: H, ...INFO }) as Uint8Array;
  surface.delete();
  img.delete();
  neutral.delete();
  lut.delete();
  lowImg.delete();
  black.delete();
  if (extra.maskAtlas) atlasImg.delete();
  if (extra.bgLayer) bgImg.delete();
  if (extra.image) photo.delete();
  return { width: W, height: H, data };
}

/** The app's lowResOf (render/lowRes.ts): long side 384, cubic downscale. */
export function lowResPixels(p: Pixels): Pixels {
  const s = 384 / Math.max(p.width, p.height);
  if (s >= 1) return p;
  const w = Math.max(1, Math.round(p.width * s));
  const h = Math.max(1, Math.round(p.height * s));
  const img = image(p);
  const surface = CK.MakeSurface(w, h);
  surface.getCanvas().drawImageRectCubic(img, CK.XYWHRect(0, 0, p.width, p.height), CK.XYWHRect(0, 0, w, h), 1 / 3, 1 / 3, null);
  surface.flush();
  const data = surface.makeImageSnapshot().readPixels(0, 0, { width: w, height: h, ...INFO }) as Uint8Array;
  surface.delete();
  img.delete();
  return { width: w, height: h, data };
}

/** Box-downscales by an integer factor (export-resolution render → preview size). */
export function downscale(p: Pixels, factor: number): Pixels {
  const w = Math.floor(p.width / factor);
  const h = Math.floor(p.height / factor);
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        for (let dy = 0; dy < factor; dy++) {
          for (let dx = 0; dx < factor; dx++) sum += p.data[((y * factor + dy) * p.width + x * factor + dx) * 4 + c]!;
        }
        data[(y * w + x) * 4 + c] = Math.round(sum / (factor * factor));
      }
    }
  }
  return { width: w, height: h, data };
}

export function diff(a: Pixels, b: Pixels): { max: number; mean: number } {
  let max = 0;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(a.data[i + c]! - b.data[i + c]!);
      max = Math.max(max, d);
      sum += d;
      n++;
    }
  }
  return { max, mean: sum / n };
}

export function encodePng(p: Pixels): Uint8Array {
  const img = CK.MakeImage({ width: p.width, height: p.height, ...INFO }, p.data, p.width * 4);
  const bytes = img.encodeToBytes(CK.ImageFormat.PNG, 100) as Uint8Array;
  img.delete();
  return bytes;
}

export function decodePng(bytes: Uint8Array): Pixels {
  const img = CK.MakeImageFromEncoded(bytes);
  const width = img.width();
  const height = img.height();
  const data = img.readPixels(0, 0, { width, height, ...INFO }) as Uint8Array;
  img.delete();
  return { width, height, data };
}
