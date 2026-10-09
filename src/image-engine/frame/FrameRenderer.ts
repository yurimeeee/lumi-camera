import {
  BlurStyle,
  ClipOp,
  FillType,
  PaintStyle,
  Skia,
  StrokeJoin,
  TileMode,
  type SkCanvas,
  type SkImage,
  type SkPath,
} from '@shopify/react-native-skia';

import { getFilter } from '@/constants/filters';
import type { FrameStyle, ImageTransform, PhotoLayer, SlotLook } from '@/features/frame-studio/types/document';
import { lowResOf } from '@/render/lowRes';
import { curveTexture, identityCurveTexture } from '@/services/color/curveTexture';
import { buildUniforms, isIdentity, resolveProcessing } from '@/services/imageProcessing';
import { neutralReshapeTextures } from '@/services/reshape';
import { getLumiEffect } from '@/shaders/lumiShader';

import type { AssetBank } from './bank';
import { bareGeometry, coverScale, frameGeometry, type Box, type FrameGeometry } from './frameGeometry';
import { paperPath, roundedBoxPath, slotBox, slotPath } from './FrameMask';
import { getPaperEffect } from './paperShader';
import { getFramePreset, type FramePreset } from './registry';
import { fillPaint, flattenUniforms, hexToRgb, seedOf } from './skiaKit';
import type { SvgElement } from './svgFrame';

/**
 * Draws one print — a photo element with its frame — in element-local
 * coordinates (0,0 = top-left of the unrotated element, layer.width ×
 * layer.height). Layer order inside a print:
 *
 *   shadow → photo (window clip, filter, photo fade) → recessed edge
 *   → frame paper (colour × texture × ageing × wear, paper-region clip)
 *   → frame decorations (perforations, ruling, captions, tape)
 *
 * (photo / frame swap when the manifest's layerOrder says so; a custom
 * album frame without alpha draws its image first and the photo on top.)
 */

export interface PrintOptions {
  /** Canvas units per device pixel (seam bleed, hairlines). */
  pixel: number;
}

export interface PrintGeometry extends FrameGeometry {
  preset: FramePreset | null;
  /** Clip of the photo window. */
  window: SkPath;
  windowBox: Box;
}

export function printGeometry(layer: Pick<PhotoLayer, 'width' | 'height' | 'frame'>): PrintGeometry {
  const { frame, width: w, height: h } = layer;
  if (frame.presetId === 'custom' && frame.custom) {
    const g = bareGeometry(0, w, h);
    const windowBox = slotBox(frame.custom.slot, w, h);
    return { ...g, hole: windowBox, preset: null, window: slotPath(frame.custom.slot, w, h), windowBox };
  }
  const preset = frame.presetId === 'none' ? null : getFramePreset(frame.presetId);
  const g = preset ? frameGeometry(preset.spec, frame, w, h) : bareGeometry(frame.cornerRadius, w, h);
  return { ...g, preset, window: roundedBoxPath(g.hole, g.holeRadius), windowBox: g.hole };
}

/** Photo fade → editor adjustments (lifted blacks, softer contrast, a little warmth). */
export function fadeAdjustments(fade: number) {
  const f = Math.max(0, Math.min(100, fade)) / 100;
  return { fade: 55 * f, contrast: -22 * f, saturation: -14 * f, warmth: 10 * f, highlights: -10 * f };
}

const CUBIC = { B: 1 / 3, C: 1 / 3 };

/**
 * Draws `image` stretched to 0,0…dw×dh through the Lumi shader with `look`
 * (+ photo fade). Same shader and children as the editor's LumiLayer.
 */
export function drawLookImage(canvas: SkCanvas, image: SkImage, dw: number, dh: number, look: SlotLook, fade: number, opacity = 1) {
  const p = resolveProcessing({ filter: getFilter(look.filterId), intensity: look.intensity, adjustments: fadeAdjustments(fade) });
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  if (opacity < 1) paint.setAlphaf(opacity);
  const iw = image.width();
  const ih = image.height();
  if (isIdentity(p)) {
    canvas.drawImageRectCubic(image, Skia.XYWHRect(0, 0, iw, ih), Skia.XYWHRect(0, 0, dw, dh), CUBIC.B, CUBIC.C, paint);
    return;
  }
  const effect = getLumiEffect();
  const uniforms = flattenUniforms(effect, { ...(buildUniforms(p, dw, dh) as Record<string, number | number[]>), uReshape: 0 });
  const fit = (img: SkImage) => Skia.Matrix().scale(dw / img.width(), dh / img.height());
  const field = neutralReshapeTextures();
  const lut = ((p.curves || p.mix?.curves) && curveTexture(p.curves, p.mix?.curves ?? null)) || identityCurveTexture();
  const low = lowResOf(image);
  const children = [
    image.makeShaderCubic(TileMode.Clamp, TileMode.Clamp, CUBIC.B, CUBIC.C, fit(image)),
    field.x.makeShaderCubic(TileMode.Clamp, TileMode.Clamp, 1, 0, fit(field.x)),
    field.y.makeShaderCubic(TileMode.Clamp, TileMode.Clamp, 1, 0, fit(field.y)),
    lut.makeShaderCubic(TileMode.Clamp, TileMode.Clamp, 0, 0),
    low.makeShaderCubic(TileMode.Clamp, TileMode.Clamp, CUBIC.B, CUBIC.C, fit(low)),
  ];
  paint.setShader(effect.makeShaderWithChildren(uniforms, children));
  canvas.drawRect(Skia.XYWHRect(0, 0, dw, dh), paint);
}

/** Placement of an image covering `box` under `t` (scale 1 = cover, offsets in box fractions). */
export function placeInBox(iw: number, ih: number, box: Box, t: Pick<ImageTransform, 'scale' | 'x' | 'y' | 'rotation'>) {
  const s = coverScale(iw, ih, box.width, box.height, t.rotation) * Math.max(0.05, t.scale);
  return {
    width: iw * s,
    height: ih * s,
    cx: box.x + box.width / 2 + t.x * box.width,
    cy: box.y + box.height / 2 + t.y * box.height,
    rotation: t.rotation,
  };
}

function drawPhotoContent(canvas: SkCanvas, layer: PhotoLayer, image: SkImage, box: Box, opacity = 1) {
  const pl = placeInBox(image.width(), image.height(), box, layer.content);
  canvas.save();
  canvas.translate(pl.cx, pl.cy);
  if (pl.rotation) canvas.rotate(pl.rotation, 0, 0);
  canvas.translate(-pl.width / 2, -pl.height / 2);
  drawLookImage(canvas, image, pl.width, pl.height, layer.look, layer.frame.photoFade, opacity);
  canvas.restore();
}

/** Empty slot: soft placeholder so the layout reads before photos are added. */
function drawPlaceholder(canvas: SkCanvas, box: Box) {
  canvas.drawRect(Skia.XYWHRect(box.x, box.y, box.width, box.height), fillPaint('#E4DED5'));
  const r = Math.min(box.width, box.height) * 0.08;
  const p = fillPaint('#B3ACA3');
  p.setStyle(PaintStyle.Stroke);
  p.setStrokeWidth(r * 0.22);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  canvas.drawLine(cx - r, cy, cx + r, cy, p);
  canvas.drawLine(cx, cy - r, cx, cy + r, p);
}

function drawPhoto(canvas: SkCanvas, layer: PhotoLayer, g: PrintGeometry, bank: AssetBank, opts: PrintOptions) {
  canvas.save();
  // Bleed the window by half a device pixel under the paper so no seam shows.
  const bleed = g.preset ? opts.pixel * 0.6 : 0;
  if (bleed > 0) {
    const b = g.windowBox;
    canvas.clipPath(roundedBoxPath({ x: b.x - bleed, y: b.y - bleed, width: b.width + 2 * bleed, height: b.height + 2 * bleed }, g.holeRadius), ClipOp.Intersect, true);
  } else {
    canvas.clipPath(g.window, ClipOp.Intersect, true);
  }
  const image = layer.photo ? bank.images.get(layer.photo.uri) : null;
  if (image) drawPhotoContent(canvas, layer, image, g.windowBox);
  else drawPlaceholder(canvas, g.windowBox);
  canvas.restore();
}

/** Thin inner shadow along the window edge: the photo sits slightly below the paper. */
function drawRecess(canvas: SkCanvas, g: PrintGeometry, amount: number) {
  const k = amount / 100;
  if (k <= 0) return;
  const b = g.windowBox;
  const s = Math.min(g.width, g.height);
  const ring = Skia.PathBuilder.Make()
    .addRect(Skia.XYWHRect(b.x - s, b.y - s, b.width + 2 * s, b.height + 2 * s))
    .addPath(g.window)
    .setFillType(FillType.EvenOdd)
    .build();
  const paint = fillPaint('#000000', 0.32 * k);
  paint.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, s * 0.004, true));
  canvas.save();
  canvas.clipPath(g.window, ClipOp.Intersect, true);
  canvas.translate(0, s * 0.0015);
  canvas.drawPath(ring, paint);
  canvas.restore();
}

/** Paper settings of a kit frame (the studio's FrameStyle, or the editor's frame). */
export type PaperStyle = Pick<FrameStyle, 'color' | 'texture' | 'textureIntensity' | 'aging' | 'edgeWear'>;

function drawPaper(canvas: SkCanvas, preset: FramePreset, paper: PaperStyle, seed: number, g: FrameGeometry, bank: AssetBank) {
  const effect = getPaperEffect();
  const tex = paper.texture ? bank.textures.get(paper.texture) : undefined;
  const texAmt = tex ? paper.textureIntensity / 100 : 0;
  const uniforms = flattenUniforms(effect, {
    uSize: [g.width, g.height],
    uNative: preset.canvas.width,
    uBase: hexToRgb(paper.color),
    uTexAmt: texAmt,
    uTexMean: tex?.mean ?? [1, 1, 1],
    uAging: paper.aging / 100,
    uWear: paper.edgeWear / 100,
    uSeed: seed,
  });
  // One texture tile = 1024 frame pixels, whatever the print's size (mirrored: the kit tiles aren't seamless).
  const unitsPerPx = g.width / preset.canvas.width;
  const child = tex
    ? tex.image.makeShaderCubic(TileMode.Mirror, TileMode.Mirror, CUBIC.B, CUBIC.C, Skia.Matrix().scale(unitsPerPx, unitsPerPx))
    : Skia.Shader.MakeColor(Skia.Color('#FFFFFF'));
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setShader(effect.makeShaderWithChildren(uniforms, [child]));
  canvas.save();
  canvas.clipPath(paperPath(g.width, g.height, g.outerRadius, g.hole, g.holeRadius), ClipOp.Intersect, true);
  canvas.drawRect(Skia.XYWHRect(0, 0, g.width, g.height), paint);
  canvas.restore();
}

/**
 * A kit frame's paper and its own decorations (perforations, ruling,
 * captions, tape) — everything but the photo, at g's coordinates.
 */
export function drawKitFrame(canvas: SkCanvas, preset: FramePreset, paper: PaperStyle, seed: number, g: FrameGeometry, bank: AssetBank) {
  drawPaper(canvas, preset, paper, seed, g, bank);
  // Ruling, perforations and captions belong to the paper: they never run over the photo.
  canvas.save();
  canvas.clipPath(paperPath(g.width, g.height, g.outerRadius, g.hole, g.holeRadius), ClipOp.Intersect, true);
  drawFrameElements(canvas, preset.spec.elements, g, bank);
  canvas.restore();
}

function drawText(canvas: SkCanvas, el: Extract<SvgElement, { type: 'text' }>, x: number, y: number, size: number, spacing: number, bank: AssetBank) {
  if (!bank.typeface || size <= 0.5) return;
  const font = Skia.Font(bank.typeface, size);
  const paint = fillPaint(el.fill, el.opacity);
  let cx = x;
  for (const ch of Array.from(el.text)) {
    canvas.drawText(ch, cx, y, paint, font);
    cx += font.getTextWidth(ch) + spacing;
  }
}

/** The frame's own decorations, re-placed by the 9-slice mapping. */
export function drawFrameElements(canvas: SkCanvas, elements: readonly SvgElement[], g: FrameGeometry, bank: AssetBank) {
  for (const el of elements) {
    switch (el.type) {
      case 'rect': {
        const paint = fillPaint(el.fill, el.opacity);
        if (el.rotate) {
          // Tape and other turned pieces keep their shape: move the centre, scale uniformly.
          const cx = g.mapX(el.x + el.width / 2);
          const cy = g.mapY(el.y + el.height / 2);
          const w = el.width * g.unit;
          const h = el.height * g.unit;
          canvas.save();
          canvas.rotate(el.rotate.deg, cx, cy);
          canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(cx - w / 2, cy - h / 2, w, h), el.rx * g.unit, el.rx * g.unit), paint);
          canvas.restore();
        } else {
          const x0 = g.mapX(el.x);
          const y0 = g.mapY(el.y);
          const x1 = g.mapX(el.x + el.width);
          const y1 = g.mapY(el.y + el.height);
          const r = el.rx * g.unit;
          canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(x0, y0, x1 - x0, y1 - y0), r, r), paint);
        }
        break;
      }
      case 'polyline': {
        const path = Skia.PathBuilder.Make()
          .addPoly(el.points.map((p) => Skia.Point(g.mapX(p.x), g.mapY(p.y))), el.closed)
          .build();
        if (el.fill) canvas.drawPath(path, fillPaint(el.fill, el.opacity));
        if (el.stroke) {
          const paint = fillPaint(el.stroke, el.opacity);
          paint.setStyle(PaintStyle.Stroke);
          paint.setStrokeWidth(el.strokeWidth * g.unit);
          if (el.lineJoin === 'round') paint.setStrokeJoin(StrokeJoin.Round);
          canvas.drawPath(path, paint);
        }
        break;
      }
      case 'path': {
        const src = Skia.Path.MakeFromSVGString(el.d);
        if (!src) break;
        const path = Skia.PathBuilder.Make().addPath(src, Skia.Matrix().scale(g.unit, g.unit)).build();
        if (el.fill) canvas.drawPath(path, fillPaint(el.fill, el.opacity));
        if (el.stroke) {
          const paint = fillPaint(el.stroke, el.opacity);
          paint.setStyle(PaintStyle.Stroke);
          paint.setStrokeWidth(el.strokeWidth * g.unit);
          canvas.drawPath(path, paint);
        }
        break;
      }
      case 'text': {
        // Captions shrink with a thinner border, never grow past the asset size.
        const k = Math.min(g.unit, g.bandScaleY(el.y));
        drawText(canvas, el, g.mapX(el.x), g.mapY(el.y), el.fontSize * k, el.letterSpacing * k, bank);
        break;
      }
    }
  }
}

function drawShadow(canvas: SkCanvas, g: PrintGeometry, amount: number) {
  const k = amount / 100;
  if (k <= 0) return;
  const s = Math.min(g.width, g.height);
  const paint = fillPaint('#2A1F14', 0.42 * k);
  paint.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, s * (0.012 + 0.018 * k), true));
  canvas.save();
  canvas.translate(s * 0.004 * k, s * (0.008 + 0.012 * k));
  canvas.drawPath(roundedBoxPath({ x: 0, y: 0, width: g.width, height: g.height }, g.outerRadius), paint);
  canvas.restore();
}

function drawCustomOverlay(canvas: SkCanvas, layer: PhotoLayer, g: PrintGeometry, bank: AssetBank) {
  const custom = layer.frame.custom!;
  const image = bank.images.get(custom.image.uri);
  if (!image) return;
  const t = custom.transform;
  const pl = placeInBox(image.width(), image.height(), { x: 0, y: 0, width: g.width, height: g.height }, t);
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setAlphaf(Math.max(0, Math.min(100, t.opacity)) / 100);
  canvas.save();
  canvas.clipRect(Skia.XYWHRect(0, 0, g.width, g.height), ClipOp.Intersect, true);
  canvas.translate(pl.cx, pl.cy);
  if (pl.rotation) canvas.rotate(pl.rotation, 0, 0);
  canvas.drawImageRectCubic(
    image,
    Skia.XYWHRect(0, 0, image.width(), image.height()),
    Skia.XYWHRect(-pl.width / 2, -pl.height / 2, pl.width, pl.height),
    CUBIC.B,
    CUBIC.C,
    paint,
  );
  canvas.restore();
}

/** Draws a photo layer's print at the origin (the caller applies position, rotation and opacity). */
export function drawPrint(canvas: SkCanvas, layer: PhotoLayer, bank: AssetBank, opts: PrintOptions) {
  const g = printGeometry(layer);
  const { frame } = layer;
  drawShadow(canvas, g, frame.shadow);

  if (frame.presetId === 'custom' && frame.custom) {
    // A transparent frame lets the photo show through its hole; an opaque one
    // (JPEG) gets the photo placed on top, inside the window the user drew.
    if (frame.custom.image.hasAlpha) {
      drawPhoto(canvas, layer, g, bank, opts);
      drawCustomOverlay(canvas, layer, g, bank);
    } else {
      drawCustomOverlay(canvas, layer, g, bank);
      drawPhoto(canvas, layer, g, bank, opts);
    }
    return;
  }

  if (!g.preset) {
    drawPhoto(canvas, layer, g, bank, opts);
    return;
  }
  for (const part of g.preset.layerOrder) {
    if (part === 'photo') {
      drawPhoto(canvas, layer, g, bank, opts);
      drawRecess(canvas, g, frame.shadow);
    } else {
      drawKitFrame(canvas, g.preset, frame, seedOf(layer.id), g, bank);
    }
  }
}

/** Crop mode (preview only): the whole photo, faint, beyond its window. */
export function drawContentGhost(canvas: SkCanvas, layer: PhotoLayer, bank: AssetBank) {
  const image = layer.photo ? bank.images.get(layer.photo.uri) : null;
  if (!image) return;
  const g = printGeometry(layer);
  canvas.save();
  canvas.clipPath(g.window, ClipOp.Difference, true);
  drawPhotoContent(canvas, layer, image, g.windowBox, 0.35);
  canvas.restore();
}
