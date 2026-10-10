import { BlendMode, ClipOp, PaintStyle, Skia, StrokeCap, StrokeJoin, TileMode, vec, type SkCanvas } from '@shopify/react-native-skia';

import type { BackgroundFill, DecorationLayer, StudioBackground, StudioDocument, StudioLayer, TextLayer } from '@/features/frame-studio/types/document';

import type { AssetBank } from './bank';
import { drawContentGhost, drawPrint, placeInBox, printGeometry } from './FrameRenderer';
import { getDecoration } from './registry';
import { adjustMatrix, fillPaint } from './skiaKit';

/**
 * Frame Studio compositor: draws a whole canvas document. The on-screen
 * preview records it into an SkPicture at screen scale; the export draws it
 * into an offscreen surface at output scale. Same function, same document,
 * so position, crop, frame, paper, background, decorations, order, rotation
 * and opacity cannot drift apart between the two.
 *
 * Layer stack: base white → background (fill, blur, brightness /
 * saturation, opacity) → layers bottom-to-top (photo prints, decorations,
 * text) → (preview only) selection.
 */

export interface Selection {
  id: string;
  /** `content` = moving the photo inside its window (double-tap crop mode). */
  mode: 'layer' | 'content';
}

export interface DrawOptions {
  /** Device pixels per canvas unit. */
  scale: number;
  /** Preview-only overlays; never passed by the export. */
  selection?: Selection | null;
}

/** Base under a translucent background (JPEG has no alpha). */
export const CANVAS_BASE = '#FFFFFF';

function drawFill(canvas: SkCanvas, fill: BackgroundFill, adjust: StudioBackground['adjust'], W: number, H: number, bank: AssetBank) {
  const rect = Skia.XYWHRect(0, 0, W, H);
  const zoom = Math.max(1, adjust.scale / 100);
  switch (fill.kind) {
    case 'color':
      canvas.drawRect(rect, fillPaint(fill.color));
      break;
    case 'gradient': {
      const a = (fill.angle * Math.PI) / 180;
      const r = (Math.abs(Math.cos(a)) * W + Math.abs(Math.sin(a)) * H) / 2;
      const cx = W / 2;
      const cy = H / 2;
      const paint = Skia.Paint();
      paint.setShader(
        Skia.Shader.MakeLinearGradient(
          vec(cx - Math.cos(a) * r, cy - Math.sin(a) * r),
          vec(cx + Math.cos(a) * r, cy + Math.sin(a) * r),
          [Skia.Color(fill.from), Skia.Color(fill.to)],
          null,
          TileMode.Clamp,
        ),
      );
      canvas.drawRect(rect, paint);
      break;
    }
    case 'texture': {
      const tex = bank.textures.get(fill.textureId);
      if (!tex) {
        canvas.drawRect(rect, fillPaint('#EFE6D6'));
        break;
      }
      // One 1024 px tile spans 60 % of the canvas width at 100 %.
      const tile = 0.6 * W * zoom;
      const k = tile / tex.image.width();
      const m = Skia.Matrix().translate((adjust.x / 100) * tile, (adjust.y / 100) * tile).scale(k, k);
      const paint = Skia.Paint();
      paint.setShader(tex.image.makeShaderCubic(TileMode.Mirror, TileMode.Mirror, 1 / 3, 1 / 3, m));
      canvas.drawRect(rect, paint);
      break;
    }
    case 'pattern':
      drawPattern(canvas, fill, W, H, zoom, adjust);
      break;
    case 'image': {
      const image = bank.images.get(fill.image.uri);
      if (!image) {
        canvas.drawRect(rect, fillPaint('#EFE6D6'));
        break;
      }
      const box = { x: 0, y: 0, width: W, height: H };
      // Fill (cover) keeping the photo's aspect; pan only as far as the zoom allows.
      const pl0 = placeInBox(image.width(), image.height(), box, { scale: zoom, x: 0, y: 0, rotation: 0 });
      const slackX = (pl0.width - W) / 2 / W;
      const slackY = (pl0.height - H) / 2 / H;
      const pl = placeInBox(image.width(), image.height(), box, {
        scale: zoom,
        x: (adjust.x / 100) * slackX,
        y: (adjust.y / 100) * slackY,
        rotation: 0,
      });
      canvas.drawImageRectCubic(
        image,
        Skia.XYWHRect(0, 0, image.width(), image.height()),
        Skia.XYWHRect(pl.cx - pl.width / 2, pl.cy - pl.height / 2, pl.width, pl.height),
        1 / 3,
        1 / 3,
      );
      break;
    }
  }
}

function drawPattern(
  canvas: SkCanvas,
  fill: Extract<BackgroundFill, { kind: 'pattern' }>,
  W: number,
  H: number,
  zoom: number,
  adjust: StudioBackground['adjust'],
) {
  canvas.drawRect(Skia.XYWHRect(0, 0, W, H), fillPaint(fill.color));
  const cell = W * 0.06 * zoom;
  const ox = (((adjust.x / 100) * cell) % cell) - cell;
  const oy = (((adjust.y / 100) * cell) % cell) - cell;
  const ink = fillPaint(fill.ink);
  const line = fillPaint(fill.ink);
  line.setStyle(PaintStyle.Stroke);
  line.setStrokeWidth(cell * 0.06);
  for (let y = oy; y < H + cell; y += cell) {
    for (let x = ox; x < W + cell; x += cell) {
      switch (fill.pattern) {
        case 'dots':
          canvas.drawCircle(x + cell / 2, y + cell / 2, cell * 0.11, ink);
          break;
        case 'grid':
          canvas.drawLine(x, y, x + cell, y, line);
          canvas.drawLine(x, y, x, y + cell, line);
          break;
        case 'stripes':
          canvas.drawRect(Skia.XYWHRect(x, y, cell * 0.5, cell), ink);
          break;
        case 'check': {
          const odd = (Math.round((x - ox) / cell) + Math.round((y - oy) / cell)) % 2 === 0;
          if (odd) canvas.drawRect(Skia.XYWHRect(x, y, cell, cell), ink);
          break;
        }
      }
    }
  }
}

/**
 * Canvas background (fill, blur, brightness / saturation, opacity over white).
 * Also draws the editor's background replacement behind a segmented subject
 * (services/masks/backgroundLayer), with the same fills and adjustments.
 */
export function drawBackground(canvas: SkCanvas, doc: Pick<StudioDocument, 'width' | 'height' | 'background'>, bank: AssetBank) {
  const { width: W, height: H, background } = doc;
  const { adjust } = background;
  canvas.drawRect(Skia.XYWHRect(0, 0, W, H), fillPaint(CANVAS_BASE));
  const layer = Skia.Paint();
  layer.setAlphaf(Math.max(0, Math.min(100, adjust.opacity)) / 100);
  if (adjust.brightness !== 0 || adjust.saturation !== 0) {
    layer.setColorFilter(Skia.ColorFilter.MakeMatrix(adjustMatrix(adjust.brightness / 100, adjust.saturation / 100)));
  }
  canvas.save();
  canvas.clipRect(Skia.XYWHRect(0, 0, W, H), ClipOp.Intersect, false);
  canvas.saveLayer(layer);
  if (adjust.blur > 0) {
    // Blur in canvas units (the CTM scales it), edges clamped so they don't go soft.
    const sigma = (adjust.blur / 100) * 0.025 * Math.max(W, H);
    const inner = Skia.Paint();
    inner.setImageFilter(Skia.ImageFilter.MakeBlur(sigma, sigma, TileMode.Clamp, null));
    canvas.saveLayer(inner);
    drawFill(canvas, background.fill, adjust, W, H, bank);
    canvas.restore();
  } else {
    drawFill(canvas, background.fill, adjust, W, H, bank);
  }
  canvas.restore();
  canvas.restore();
}

function drawDecoration(canvas: SkCanvas, layer: DecorationLayer, bank: AssetBank) {
  const deco = getDecoration(layer.assetId);
  if (!deco) return;
  const { width: w, height: h } = layer;
  if (deco.type === 'image') {
    const image = bank.decorations.get(deco.id);
    if (!image) return;
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    // Tape lifts a hair off the page: a faint, tight shadow under it.
    paint.setImageFilter(Skia.ImageFilter.MakeDropShadow(0, h * 0.05, h * 0.05, h * 0.05, Skia.Color('rgba(60, 40, 20, 0.22)'), null));
    canvas.drawImageRectCubic(image, Skia.XYWHRect(0, 0, image.width(), image.height()), Skia.XYWHRect(0, 0, w, h), 1 / 3, 1 / 3, paint);
    return;
  }
  const vb = deco.spec.viewBox;
  canvas.save();
  canvas.scale(w / vb.width, h / vb.height);
  canvas.translate(-vb.x, -vb.y);
  for (const el of deco.spec.elements) {
    if (el.type !== 'path' && el.type !== 'polyline') continue;
    const p =
      el.type === 'path'
        ? Skia.Path.MakeFromSVGString(el.d)
        : Skia.PathBuilder.Make()
            .addPoly(el.points.map((pt) => Skia.Point(pt.x, pt.y)), el.closed)
            .build();
    if (!p) continue;
    if (el.fill) canvas.drawPath(p, fillPaint(layer.tint ?? el.fill, el.opacity));
    if (el.stroke) {
      const paint = fillPaint(layer.tint ?? el.stroke, el.opacity);
      paint.setStyle(PaintStyle.Stroke);
      paint.setStrokeWidth(el.strokeWidth);
      paint.setStrokeJoin(el.lineJoin === 'round' ? StrokeJoin.Round : StrokeJoin.Miter);
      paint.setStrokeCap(StrokeCap.Round);
      canvas.drawPath(p, paint);
    }
  }
  canvas.restore();
}

/** Text width in canvas units (0 without a font). */
export function measureText(text: string, fontSize: number, bank: AssetBank): number {
  if (!bank.typeface) return 0;
  return Skia.Font(bank.typeface, fontSize).getTextWidth(text);
}

function drawTextLayer(canvas: SkCanvas, layer: TextLayer, bank: AssetBank) {
  if (!bank.typeface) return;
  const font = Skia.Font(bank.typeface, layer.fontSize);
  const tw = font.getTextWidth(layer.text);
  canvas.drawText(layer.text, (layer.width - tw) / 2, layer.height / 2 + layer.fontSize * 0.36, fillPaint(layer.color), font);
}

/** Moves the canvas into a layer's local space (origin = unrotated top-left). */
export function enterLayer(canvas: SkCanvas, layer: StudioLayer) {
  canvas.translate(layer.x + layer.width / 2, layer.y + layer.height / 2);
  if (layer.rotation) canvas.rotate(layer.rotation, 0, 0);
  canvas.translate(-layer.width / 2, -layer.height / 2);
}

export function drawLayer(canvas: SkCanvas, layer: StudioLayer, bank: AssetBank, pixel: number) {
  if (!layer.visible || layer.opacity <= 0) return;
  canvas.save();
  enterLayer(canvas, layer);
  const translucent = layer.opacity < 1;
  if (translucent) {
    const p = Skia.Paint();
    p.setAlphaf(layer.opacity);
    canvas.saveLayer(p);
  }
  if (layer.kind === 'photo') drawPrint(canvas, layer, bank, { pixel });
  else if (layer.kind === 'decoration') drawDecoration(canvas, layer, bank);
  else drawTextLayer(canvas, layer, bank);
  if (translucent) canvas.restore();
  canvas.restore();
}

function drawSelection(canvas: SkCanvas, doc: StudioDocument, sel: Selection, bank: AssetBank, pixel: number) {
  const layer = doc.layers.find((l) => l.id === sel.id);
  if (!layer) return;
  canvas.save();
  enterLayer(canvas, layer);
  const accent = '#E8956B';
  if (sel.mode === 'content' && layer.kind === 'photo') {
    drawContentGhost(canvas, layer, bank);
    const g = printGeometry(layer);
    const p = fillPaint(accent);
    p.setStyle(PaintStyle.Stroke);
    p.setStrokeWidth(2 * pixel);
    canvas.drawPath(g.window, p);
  } else {
    const pad = 4 * pixel;
    const p = fillPaint(accent);
    p.setStyle(PaintStyle.Stroke);
    p.setStrokeWidth(1.5 * pixel);
    canvas.drawRect(Skia.XYWHRect(-pad, -pad, layer.width + 2 * pad, layer.height + 2 * pad), p);
    const dot = fillPaint('#FFFFFF');
    const ring = fillPaint(accent);
    ring.setStyle(PaintStyle.Stroke);
    ring.setStrokeWidth(1.5 * pixel);
    for (const [x, y] of [
      [-pad, -pad],
      [layer.width + pad, -pad],
      [-pad, layer.height + pad],
      [layer.width + pad, layer.height + pad],
    ] as const) {
      canvas.drawCircle(x, y, 5 * pixel, dot);
      canvas.drawCircle(x, y, 5 * pixel, ring);
    }
    if (layer.locked) {
      const lockPaint = fillPaint(accent, 0.12);
      lockPaint.setBlendMode(BlendMode.SrcOver);
      canvas.drawRect(Skia.XYWHRect(0, 0, layer.width, layer.height), lockPaint);
    }
  }
  canvas.restore();
}

/** Draws `doc` into `canvas` (already sized doc.width × doc.height × scale). */
export function drawDocument(canvas: SkCanvas, doc: StudioDocument, bank: AssetBank, opts: DrawOptions) {
  const pixel = 1 / opts.scale;
  canvas.save();
  canvas.scale(opts.scale, opts.scale);
  canvas.clipRect(Skia.XYWHRect(0, 0, doc.width, doc.height), ClipOp.Intersect, false);
  drawBackground(canvas, doc, bank);
  for (const layer of doc.layers) drawLayer(canvas, layer, bank, pixel);
  if (opts.selection) drawSelection(canvas, doc, opts.selection, bank, pixel);
  canvas.restore();
}

