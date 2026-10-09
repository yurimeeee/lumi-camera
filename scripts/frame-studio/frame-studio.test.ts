/**
 * Frame Studio tests: `npm run test:frames`. Everything is drawn by the app's
 * own compositor through React Native Skia's web backend on CanvasKit (see
 * setup.ts), so these are real renders, not mocks.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { ImageFormat, Skia } from '@shopify/react-native-skia';

import {
  addDecoration,
  addPhotos,
  applyFrame,
  applyLayout,
  applyTemplate,
  createDocument,
  customFrameStyle,
  duplicateLayer,
  hitTest,
  IDENTITY_TRANSFORM,
  photoLayers,
  presetFrameStyle,
  reorderLayer,
  setMargin,
  toLayerSpace,
  toTemplate,
  updateFrame,
  updateLayer,
  zIndexOf,
} from '@/features/frame-studio/model/document';
import { hexToHsv, hsvToHex } from '@/features/frame-studio/model/color';
import { studioLayouts } from '@/features/frame-studio/presets/layouts';
import { starterTemplates } from '@/features/frame-studio/presets/starterTemplates';
import { useStudioStore } from '@/features/frame-studio/stores/studioStore';
import { useTemplateStore } from '@/features/frame-studio/stores/templateStore';
import type { PhotoLayer, StudioDocument } from '@/features/frame-studio/types/document';
import { exportImageSides } from '@/image-engine/frame/FrameAssetLoader';
import { exportSize, recordDocument, renderDocumentImage } from '@/image-engine/frame/FrameExport';
import { frameGeometry } from '@/image-engine/frame/frameGeometry';
import { findTransparentSlot, hasTransparency } from '@/image-engine/frame/FrameMask';
import { printGeometry } from '@/image-engine/frame/FrameRenderer';
import { decorationPresets, framePresets, getFramePreset, layoutJson, MANIFEST, texturePresets } from '@/image-engine/frame/registry';
import { parseFrameSvg } from '@/image-engine/frame/svgFrame';
import { encodeExport } from '@/services/exportEncoding';

import { generate } from '../frame-assets/generate';
import { asyncStorageMemory } from './setup';
import { assetPath, decodeFile, encodePng, kitBank, meanAbsDiff, meanRgb, photoRef, pixelsOf, px, resize, ROOT, testPhoto, type Pixels } from './kit';

const PHOTO = testPhoto(1200, 900);
const PHOTO2 = testPhoto(900, 1200, 1);
const P1 = photoRef('photo:1', PHOTO);
const P2 = photoRef('photo:2', PHOTO2);
const BANK = kitBank({ [P1.uri]: PHOTO, [P2.uri]: PHOTO2 });

/** Renders `doc` with its long side = `long` px. */
function render(doc: StudioDocument, long = 360, bank = BANK) {
  const { width, height, scale } = exportSize(doc, long);
  return { pixels: pixelsOf(renderDocumentImage(doc, bank, width, height, false)), scale };
}

/** A paper-only (clean) style: no texture, ageing, wear, fade or shadow. */
const CLEAN = { texture: null, textureIntensity: 0, aging: 0, edgeWear: 0, photoFade: 0, shadow: 0 } as const;

/** Channel-wise |a − b| ≤ tol over b's channels (RGBA vs RGB compares RGB). */
const near = (a: readonly number[], b: readonly number[], tol: number) => b.every((v, i) => Math.abs(a[i]! - v) <= tol);
const rgb255 = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// ── Manifest & registry ─────────────────────────────────────────

describe('manifest parsing', () => {
  test('the kit manifest lists 27 frames, 8 textures, 7 decorations, 9 layouts', () => {
    expect(MANIFEST.version).toBe(1);
    expect(MANIFEST.frames).toHaveLength(27);
    expect(MANIFEST.textures).toHaveLength(8);
    expect(MANIFEST.decorations).toHaveLength(7);
    expect(MANIFEST.layouts).toHaveLength(9);
  });

  test('every manifest frame becomes a preset with its own geometry and colour', () => {
    const presets = framePresets();
    expect(presets.map((p) => p.id)).toEqual(MANIFEST.frames.map((f) => f.id));
    for (const p of presets) {
      const m = MANIFEST.frames.find((f) => f.id === p.id)!;
      expect(p.canvasRatio).toBeCloseTo(m.canvas.width / m.canvas.height, 6);
      expect(p.photoSlots[0]).toMatchObject(m.photoSlot);
      expect(p.defaultColor).toBe(m.editableColor);
      expect(p.layerOrder).toEqual(['photo', 'frame']);
    }
  });

  test('every category except Custom has frames', () => {
    const cats = new Set(framePresets().map((p) => p.category));
    expect([...cats].sort()).toEqual(['film', 'instant', 'minimal', 'paper', 'scrapbook']);
  });
});

describe('asset registry', () => {
  test('generated registry is in sync with assets/frames', () => {
    expect(readFileSync(join(ROOT, 'src/image-engine/frame/assets.generated.ts'), 'utf8')).toBe(generate());
  });

  test('textures, decorations and layouts map to files that exist and decode', () => {
    for (const t of texturePresets()) {
      const img = decodeFile(assetPath(t.source));
      expect([img.width(), img.height()]).toEqual([1024, 1024]);
    }
    for (const d of decorationPresets()) {
      if (d.type === 'image') expect(existsSync(assetPath(d.source))).toBe(true);
      else expect(d.spec.elements.length).toBeGreaterThan(0);
    }
    for (const id of MANIFEST.layouts) {
      const l = layoutJson(id)!;
      expect(l.id).toBe(id);
      for (const s of l.slots) {
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.x + s.width).toBeLessThanOrEqual(1.0001);
        expect(s.y + s.height).toBeLessThanOrEqual(1.0001);
      }
    }
    expect(studioLayouts().map((l) => l.id)).toEqual(['frame', ...MANIFEST.layouts, 'free']);
  });
});

// ── SVG ─────────────────────────────────────────────────────────

describe('SVG frames', () => {
  test('the SVG hole matches the manifest photo slot (within half a pixel) for all 27 frames', () => {
    for (const p of framePresets()) {
      const { hole, width, height } = p.spec;
      expect([width, height]).toEqual([p.canvas.width, p.canvas.height]);
      const s = p.photoSlots[0]!;
      expect(Math.abs(hole.x - s.x * width)).toBeLessThan(0.5);
      expect(Math.abs(hole.y - s.y * height)).toBeLessThan(0.5);
      expect(Math.abs(hole.width - s.width * width)).toBeLessThan(0.5);
      expect(Math.abs(hole.height - s.height * height)).toBeLessThan(0.5);
    }
  });

  test('paper colour, perforations, ruling, captions and tape are read from the SVG', () => {
    const film = getFramePreset('film_strip')!.spec;
    expect(film.baseColor).toBe('#302722');
    expect(film.elements.filter((e) => e.type === 'rect')).toHaveLength(22);
    const journal = getFramePreset('journal_page')!.spec;
    expect(journal.elements.filter((e) => e.type === 'polyline')).toHaveLength(15);
    expect(journal.elements.find((e) => e.type === 'text')).toMatchObject({ text: 'LUMI / MOMENTS', fontSize: 21, letterSpacing: 5 });
    const tape = getFramePreset('tape_frame')!.spec.elements[0]!;
    expect(tape).toMatchObject({ type: 'rect', rotate: { deg: -4, cx: 450, cy: 40 } });
  });

  test('unsupported SVG is rejected, not drawn wrong', () => {
    expect(() => parseFrameSvg('<svg viewBox="0 0 10 10"><circle r="3"/></svg>')).toThrow();
  });

  test('default settings reproduce the SVG window; thickness recomputes borders without scaling', () => {
    const p = getFramePreset('vintage_polaroid')!;
    const style = presetFrameStyle(p.id);
    const g = frameGeometry(p.spec, style, 900, 1100);
    expect(g.hole).toEqual({ x: 76, y: 77, width: 747, height: 758 });
    expect(g.holeRadius).toBeCloseTo(1, 1);
    const thin = frameGeometry(p.spec, { ...style, thickness: 50 }, 900, 1100);
    expect(thin.hole.x).toBeCloseTo(38);
    expect(thin.hole.y).toBeCloseTo(38.5);
    expect(900 - thin.hole.x - thin.hole.width).toBeCloseTo((900 - 76 - 747) / 2);
    // Polaroid bottom on its own.
    const tall = frameGeometry(p.spec, { ...style, bottom: 150 }, 900, 1100);
    expect(tall.hole.y).toBe(77);
    expect(1100 - tall.hole.y - tall.hole.height).toBeCloseTo(265 * 1.5);
    // 9-slice: a perforation in the left margin stays inside the (thinner) margin.
    const film = getFramePreset('film_strip')!;
    const fg = frameGeometry(film.spec, { ...presetFrameStyle(film.id), thickness: 40 }, 850, 1250);
    const perf = film.spec.elements[0] as { x: number; width: number };
    expect(fg.mapX(perf.x + perf.width)).toBeLessThan(fg.hole.x);
  });
});

// ── Rendering ───────────────────────────────────────────────────

function single(presetId: string, patch: Record<string, unknown> = {}): StudioDocument {
  return updateFrame(createDocument([P1], presetId), [], patch);
}

/** Frame-pixel point of a single-print document → render pixels. */
function at(doc: StudioDocument, scale: number, fx: number, fy: number): [number, number] {
  const preset = getFramePreset(photoLayers(doc)[0]!.frame.presetId)!;
  const k = (doc.width / preset.canvas.width) * scale;
  return [fx * k, fy * k];
}

describe('frame colour and paper', () => {
  test('frame colour changes only the paper; perforations keep their colour; the window shows the photo', () => {
    const doc = single('film_strip', { ...CLEAN, color: '#37332F' });
    const { pixels, scale } = render(doc);
    const g = printGeometry(photoLayers(doc)[0]!);
    // Paper between perforations (left margin, mid-height, between holes).
    expect(near(px(pixels, ...at(doc, scale, 70, 20)), rgb255('#37332F'), 2)).toBe(true);
    // A perforation.
    const perf = getFramePreset('film_strip')!.spec.elements[0] as { x: number; y: number; width: number; height: number };
    expect(near(px(pixels, ...at(doc, scale, perf.x + perf.width / 2, perf.y + perf.height / 2)), rgb255('#D9C7A7'), 3)).toBe(true);
    // Window centre is photo, not paper.
    const c = px(pixels, (g.hole.x + g.hole.width / 2) * scale, (g.hole.y + g.hole.height * 0.2) * scale);
    expect(near(c, rgb255('#37332F'), 30)).toBe(false);
  });

  test('all vintage effects at 0 give the clean SVG paper colour', () => {
    const doc = single('vintage_polaroid', CLEAN);
    const { pixels, scale } = render(doc);
    const base = rgb255('#E8DCC6');
    for (const [x, y] of [
      [10, 10],
      [450, 40],
      [880, 1080],
      [450, 1000],
    ] as const) {
      expect(near(px(pixels, ...at(doc, scale, x, y)), base, 1)).toBe(true);
    }
  });

  test('texture, ageing and wear are masked to the frame: the photo is untouched', () => {
    const clean = single('vintage_polaroid', CLEAN);
    const aged = single('vintage_polaroid', { ...CLEAN, texture: 'aged_paper', textureIntensity: 100, aging: 100, edgeWear: 100 });
    const a = render(clean);
    const b = render(aged);
    const g0 = printGeometry(photoLayers(clean)[0]!);
    // printGeometry is in doc units; express the window in frame px.
    const u = clean.width / 900;
    const g = { hole: { x: g0.hole.x / u, y: g0.hole.y / u, width: g0.hole.width / u, height: g0.hole.height / u } };
    const s = a.scale * u;
    const inPhoto = meanRgb(a.pixels, (g.hole.x + 6) * s, (g.hole.y + 6) * s, (g.hole.x + g.hole.width - 6) * s, (g.hole.y + g.hole.height - 6) * s);
    const inPhotoAged = meanRgb(b.pixels, (g.hole.x + 6) * s, (g.hole.y + 6) * s, (g.hole.x + g.hole.width - 6) * s, (g.hole.y + g.hole.height - 6) * s);
    expect(near(inPhoto, inPhotoAged, 0.01)).toBe(true);
    const paper = meanRgb(a.pixels, 100 * s, 900 * s, 800 * s, 1050 * s);
    const paperAged = meanRgb(b.pixels, 100 * s, 900 * s, 800 * s, 1050 * s);
    expect(near(paper, paperAged, 4)).toBe(false);
  });

  test('photo fade changes the photo, not the paper', () => {
    const a = render(single('classic_polaroid', CLEAN));
    const b = render(single('classic_polaroid', { ...CLEAN, photoFade: 100 }));
    const s = a.scale * (1000 / 900);
    expect(near(meanRgb(a.pixels, 100 * s, 900 * s, 800 * s, 1050 * s), meanRgb(b.pixels, 100 * s, 900 * s, 800 * s, 1050 * s), 0.01)).toBe(true);
    // Darkest photo tones (the tree) are lifted.
    // Tree trunk: photo x 0.22…0.27, y 0.35…0.75, covering a 747×758 window at frame px (76, 77).
    const tree = (p: Pixels) => meanRgb(p, 175 * s, 420 * s, 205 * s, 600 * s);
    expect(tree(a.pixels)[1]).toBeLessThan(50);
    expect(tree(b.pixels)[1]).toBeGreaterThan(tree(a.pixels)[1] + 8);
  });
});

describe('layers', () => {
  test('z-order: reorder moves a layer and the render follows the order', () => {
    let doc = addDecoration(single('none'), 'sage_tape');
    const deco = doc.layers[1]!;
    doc = updateLayer(doc, deco.id, { x: 300, y: 300, rotation: 0, width: 400, height: 160 });
    expect(zIndexOf(doc, deco.id)).toBe(1);
    const front = render(doc);
    const back = render(reorderLayer(doc, deco.id, 'back'));
    expect(zIndexOf(reorderLayer(doc, deco.id, 'back'), deco.id)).toBe(0);
    const s = front.scale;
    // Tape over the photo tints it; behind the photo it disappears.
    expect(meanAbsDiff(front.pixels, back.pixels)).toBeGreaterThan(0.5);
    expect(near(meanRgb(back.pixels, 350 * s, 340 * s, 650 * s, 420 * s), meanRgb(render(single('none')).pixels, 350 * s, 340 * s, 650 * s, 420 * s), 0.5)).toBe(true);
    expect(zIndexOf(reorderLayer(reorderLayer(doc, deco.id, 'back'), deco.id, 'front'), deco.id)).toBe(1);
  });

  test('canvas transform: hit test and local space follow rotation', () => {
    let doc = addDecoration(single('none'), 'clear_tape');
    const id = doc.layers[1]!.id;
    doc = updateLayer(doc, id, { x: 100, y: 100, width: 400, height: 100, rotation: 90 });
    const l = doc.layers[1]!;
    // Rotated 90° about (300,150): the tape now spans x 250…350, y -50…350.
    expect(hitTest(doc, 300, 320)?.id).toBe(id);
    expect(hitTest(doc, 480, 150)?.id).not.toBe(id);
    const p = toLayerSpace(l, 300, 150);
    expect(p.x).toBeCloseTo(200);
    expect(p.y).toBeCloseTo(50);
    // Hidden layers are not hit.
    expect(hitTest(updateLayer(doc, id, { visible: false }), 300, 320)?.id).not.toBe(id);
  });

  test('duplicate places a copy above with a new id', () => {
    const doc = addDecoration(single('none'), 'heart_doodle');
    const { doc: next, id } = duplicateLayer(doc, doc.layers[1]!.id);
    expect(next.layers).toHaveLength(3);
    expect(next.layers[2]!.id).toBe(id!);
    expect(next.layers[2]!.id).not.toBe(doc.layers[1]!.id);
  });
});

describe('layouts', () => {
  test('switching layouts keeps photos in order and refills from the pool', () => {
    let doc = createDocument([P1, P2]);
    expect(doc.layoutId).toBe('grid_2x2');
    expect(photoLayers(doc).map((l) => l.photo?.uri ?? null)).toEqual([P1.uri, P2.uri, null, null]);
    doc = applyLayout(doc, 'duo_vertical');
    expect(photoLayers(doc).map((l) => l.photo?.uri)).toEqual([P1.uri, P2.uri]);
    doc = applyLayout(doc, 'frame');
    expect(photoLayers(doc).map((l) => l.photo?.uri)).toEqual([P1.uri]);
    doc = applyLayout(doc, 'strip_3');
    expect(photoLayers(doc).map((l) => l.photo?.uri ?? null)).toEqual([P1.uri, P2.uri, null]);
  });

  test('framed prints keep their frame proportions inside slots', () => {
    const doc = applyFrame(applyLayout(createDocument([P1, P2]), 'grid_2x2'), presetFrameStyle('classic_polaroid'));
    for (const l of photoLayers(doc)) expect(l.width / l.height).toBeCloseTo(900 / 1100, 5);
  });

  test('the frame layout wraps the print (+ margin)', () => {
    const doc = setMargin(createDocument([P1], 'wide_instant'), 10);
    const l = photoLayers(doc)[0]!;
    expect(l.width / l.height).toBeCloseTo(1100 / 850, 5);
    expect(l.x).toBeCloseTo(l.width * 0.1);
    expect(doc.height).toBe(Math.round(l.height + 0.2 * l.width));
  });
});

// ── Imports ─────────────────────────────────────────────────────

/** A frame image: coloured border with a transparent window. */
function frameImage(hole: { x: number; y: number; w: number; h: number }, alpha: boolean) {
  const s = Skia.Surface.Make(400, 500)!;
  const c = s.getCanvas();
  const paint = Skia.Paint();
  paint.setColor(Skia.Color('#B04A5A'));
  c.drawRect(Skia.XYWHRect(0, 0, 400, 500), paint);
  if (alpha) {
    const clear = Skia.Paint();
    clear.setBlendMode(0 /* Clear */);
    c.drawRect(Skia.XYWHRect(hole.x, hole.y, hole.w, hole.h), clear);
  }
  s.flush();
  return s.makeImageSnapshot();
}

describe('custom frames (album)', () => {
  test('PNG alpha: the transparent window is found; opaque JPEGs have none', () => {
    const img = frameImage({ x: 40, y: 60, w: 320, h: 300 }, true);
    const p = pixelsOf(img);
    expect(hasTransparency(p.data)).toBe(true);
    const slot = findTransparentSlot(p.data, p.width, p.height)!;
    expect(slot.x).toBeCloseTo(40 / 400, 2);
    expect(slot.y).toBeCloseTo(60 / 500, 2);
    expect(slot.width).toBeCloseTo(320 / 400, 2);
    expect(slot.height).toBeCloseTo(300 / 500, 2);
    const jpeg = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(img.encodeToBytes(ImageFormat.JPEG, 90)))!;
    expect(hasTransparency(pixelsOf(jpeg).data)).toBe(false);
    // Kit tapes are translucent PNGs.
    expect(hasTransparency(pixelsOf(decodeFile(join(ROOT, 'assets/frames/decorations/washi_tape.png'))).data)).toBe(true);
  });

  test('transparent PNG frame: photo shows through the hole, frame elsewhere', () => {
    const img = frameImage({ x: 40, y: 60, w: 320, h: 300 }, true);
    const ref = { uri: 'frame:png', width: 400, height: 500, hasAlpha: true };
    const bank = kitBank({ [P1.uri]: PHOTO, [ref.uri]: img });
    const doc = applyFrame(createDocument([P1]), customFrameStyle({ image: ref, slot: { x: 0.1, y: 0.12, width: 0.8, height: 0.6, shape: 'rect', radius: 0 }, transform: { ...IDENTITY_TRANSFORM } }));
    expect(doc.width / doc.height).toBeCloseTo(400 / 500, 2);
    const { pixels } = render(doc, 500, bank);
    expect(near(px(pixels, 10, 10), rgb255('#B04A5A'), 3)).toBe(true);
    expect(near(px(pixels, 200, 210), rgb255('#B04A5A'), 30)).toBe(false);
  });

  test('JPEG frame with an ellipse window: the photo is clipped to the ellipse on top', () => {
    const img = frameImage({ x: 0, y: 0, w: 0, h: 0 }, false);
    const ref = { uri: 'frame:jpg', width: 400, height: 500 };
    const bank = kitBank({ [P1.uri]: PHOTO, [ref.uri]: img });
    const doc = applyFrame(
      createDocument([P1]),
      customFrameStyle({ image: ref, slot: { x: 0.1, y: 0.1, width: 0.8, height: 0.6, shape: 'ellipse', radius: 0 }, transform: { ...IDENTITY_TRANSFORM } }),
    );
    const { pixels } = render(doc, 500, bank);
    // Corner of the slot box is outside the ellipse → frame; the centre is photo.
    expect(near(px(pixels, 0.12 * 400, 0.12 * 500), rgb255('#B04A5A'), 3)).toBe(true);
    expect(near(px(pixels, 200, 200), rgb255('#B04A5A'), 30)).toBe(false);
  });
});

describe('album background', () => {
  test('fills the canvas keeping the image aspect; blur and opacity apply', () => {
    // Left half red, right half blue, 2:1.
    const s = Skia.Surface.Make(400, 200)!;
    const red = Skia.Paint();
    red.setColor(Skia.Color('#FF0000'));
    const blue = Skia.Paint();
    blue.setColor(Skia.Color('#0000FF'));
    s.getCanvas().drawRect(Skia.XYWHRect(0, 0, 200, 200), red);
    s.getCanvas().drawRect(Skia.XYWHRect(200, 0, 200, 200), blue);
    s.flush();
    const ref = { uri: 'bg:1', width: 400, height: 200 };
    const bank = kitBank({ [ref.uri]: s.makeImageSnapshot() });
    let doc = applyLayout(createDocument([]), 'free');
    doc = { ...doc, layers: [], background: { ...doc.background, fill: { kind: 'image', image: ref } } };
    const { pixels } = render(doc, 400, bank);
    const w = pixels.width;
    // Cover: the split stays in the middle (not stretched), both colours present.
    expect(px(pixels, w / 2 - 4, 100)[0]).toBeGreaterThan(200);
    expect(px(pixels, w / 2 + 4, 100)[2]).toBeGreaterThan(200);
    const blurred = render({ ...doc, background: { ...doc.background, adjust: { ...doc.background.adjust, blur: 60, opacity: 50 } } }, 400, bank).pixels;
    const mid = px(blurred, w / 2, 100);
    expect(mid[0]).toBeGreaterThan(130); // blended toward the white base and the blue
    expect(mid[2]).toBeGreaterThan(130);
  });
});

// ── Templates & history ─────────────────────────────────────────

describe('templates', () => {
  beforeEach(() => {
    asyncStorageMemory.clear();
    useTemplateStore.setState({ templates: [] });
  });

  test('a template keeps the design, never the photos, and fills new photos in slot order', () => {
    let doc = applyFrame(applyLayout(createDocument([P1, P2]), 'scrapbook'), presetFrameStyle('vintage_polaroid'));
    doc = updateFrame(doc, [], { color: '#F1E4C8' });
    doc = addDecoration(doc, 'pink_tape');
    const t = toTemplate(doc, 'Travel Scrapbook');
    expect(photoLayers(t.doc).every((l) => l.photo === null)).toBe(true);
    expect(t.doc.pool).toEqual([]);
    const P3 = { uri: 'photo:3', width: 800, height: 600 };
    const next = applyTemplate(t, [P3, P1]);
    const prints = photoLayers(next);
    expect(prints.map((l) => l.photo?.uri)).toEqual([P3.uri, P1.uri]);
    expect(prints.every((l) => l.frame.presetId === 'vintage_polaroid' && l.frame.color === '#F1E4C8')).toBe(true);
    expect(prints.map((l) => [l.x, l.y, l.rotation])).toEqual(photoLayers(doc).map((l) => [l.x, l.y, l.rotation]));
    expect(next.layers.filter((l) => l.kind === 'decoration')).toHaveLength(1);
    expect(next.layers.map((l) => l.id)).not.toEqual(doc.layers.map((l) => l.id));
  });

  test('templates persist and come back', async () => {
    useTemplateStore.getState().save('  Cream   Polaroid ', single('classic_polaroid', { color: '#F1E4C8' }));
    await new Promise((r) => setTimeout(r, 0));
    const raw = asyncStorageMemory.get('lumi.frameTemplates');
    expect(raw).toBeDefined();
    // Simulate a restart: wipe memory state (which persists too), then put the saved JSON back.
    useTemplateStore.setState({ templates: [] });
    await new Promise((r) => setTimeout(r, 0));
    asyncStorageMemory.set('lumi.frameTemplates', raw!);
    await useTemplateStore.persist.rehydrate();
    const [t] = useTemplateStore.getState().templates;
    expect(t!.name).toBe('Cream Polaroid');
    expect(photoLayers(t!.doc)[0]!.frame.color).toBe('#F1E4C8');
    expect(photoLayers(t!.doc)[0]!.photo).toBeNull();
  });

  test('starter templates build from real kit assets', () => {
    expect(starterTemplates().map((t) => t.name)).toEqual(['Cream Polaroid', 'My Vintage Diary', 'Travel Scrapbook', 'Soft Film']);
  });
});

describe('undo / redo', () => {
  test('live edits become one step on commit; undo and redo restore documents', () => {
    const st = useStudioStore.getState();
    st.open(single('none'));
    const id = photoLayers(useStudioStore.getState().doc!)[0]!.id;
    st.apply((d) => applyFrame(d, presetFrameStyle('classic_polaroid')));
    for (let i = 1; i <= 5; i++) st.live((d) => updateLayer(d, id, { rotation: i }));
    st.commit();
    expect(useStudioStore.getState().past).toHaveLength(2);
    st.undo();
    expect(photoLayers(useStudioStore.getState().doc!)[0]!.rotation).toBe(0);
    expect(photoLayers(useStudioStore.getState().doc!)[0]!.frame.presetId).toBe('classic_polaroid');
    st.undo();
    expect(photoLayers(useStudioStore.getState().doc!)[0]!.frame.presetId).toBe('none');
    st.redo();
    st.redo();
    expect(photoLayers(useStudioStore.getState().doc!)[0]!.rotation).toBe(5);
    // A selection of a layer that undo removes is dropped.
    st.apply((d) => addDecoration(d, 'sparkle'));
    const deco = useStudioStore.getState().doc!.layers.at(-1)!;
    st.select({ id: deco.id, mode: 'layer' });
    st.undo();
    expect(useStudioStore.getState().selection).toBeNull();
  });
});

describe('colour picker math', () => {
  test('HSV ⇄ HEX round-trips', () => {
    for (const hex of ['#F1E4C8', '#37332F', '#C7D0BA', '#E2C3BC', '#FFFFFF', '#000000']) {
      const { h, s, v } = hexToHsv(hex);
      const back = hsvToHex(h, s, v);
      expect(near(rgb255(back), rgb255(hex), 3)).toBe(true);
    }
  });
});

// ── Export ──────────────────────────────────────────────────────

describe('export', () => {
  test('writes JPEG and PNG files of the requested size', () => {
    const doc = single('vintage_polaroid');
    const { width, height } = exportSize(doc, 640);
    const img = renderDocumentImage(doc, BANK, width, height, false);
    for (const [format, magic] of [
      ['jpeg', [0xff, 0xd8]],
      ['png', [0x89, 0x50]],
    ] as const) {
      const bytes = encodeExport(img, format, 90);
      expect([bytes[0], bytes[1]]).toEqual([...magic]);
      const back = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(bytes))!;
      expect([back.width(), back.height()]).toEqual([width, height]);
    }
    expect(Math.max(...Object.values(exportSize(doc, 4096)).slice(0, 2))).toBe(4096);
  });

  test('export decodes each photo at the size it is printed at', () => {
    const doc = createDocument([P1, P2]);
    const sides = exportImageSides(doc, exportSize(doc, 4096).scale);
    // Four 2×2 slots on a 4096 canvas: each photo needs well under 4096 px.
    for (const v of sides.values()) {
      expect(v).toBeGreaterThan(1500);
      expect(v).toBeLessThan(4096);
    }
  });

  test('preview (recorded picture at screen scale) matches the export', () => {
    let doc = applyLayout(createDocument([P1, P2]), 'scrapbook');
    doc = applyFrame(doc, presetFrameStyle('vintage_polaroid'));
    doc = addDecoration(doc, 'washi_tape');
    doc = { ...doc, background: { ...doc.background, fill: { kind: 'texture', textureId: 'kraft_paper' } } };
    const prevScale = 300 / doc.width;
    const pic = recordDocument(doc, BANK, prevScale, null);
    const pw = Math.round(doc.width * prevScale);
    const ph = Math.round(doc.height * prevScale);
    const surface = Skia.Surface.Make(pw, ph)!;
    surface.getCanvas().drawPicture(pic);
    surface.flush();
    const preview = pixelsOf(surface.makeImageSnapshot());
    const { width, height } = exportSize(doc, 900);
    const exported = resize(renderDocumentImage(doc, BANK, width, height, false), pw, ph);
    const diff = meanAbsDiff(preview, exported);
    expect(diff).toBeLessThan(4);
    // Selection overlays are preview-only.
    const sel = recordDocument(doc, BANK, prevScale, { id: doc.layers[0]!.id, mode: 'layer' });
    const s2 = Skia.Surface.Make(pw, ph)!;
    s2.getCanvas().drawPicture(sel);
    s2.flush();
    expect(meanAbsDiff(pixelsOf(s2.makeImageSnapshot()), preview)).toBeGreaterThan(0);
  });
});

// ── Golden images: the verification scenarios ───────────────────

const GOLDEN = join(import.meta.dir, 'golden');
const UPDATE = process.env.UPDATE_GOLDEN === '1';

function golden(name: string, doc: StudioDocument, bank = BANK, long = 420) {
  const img = renderDocumentImage(doc, bank, exportSize(doc, long).width, exportSize(doc, long).height, false);
  const file = join(GOLDEN, `${name}.png`);
  if (UPDATE || !existsSync(file)) {
    mkdirSync(GOLDEN, { recursive: true });
    writeFileSync(file, encodePng(img));
  }
  const want = pixelsOf(decodeFile(file));
  const got = pixelsOf(img);
  expect([got.width, got.height]).toEqual([want.width, want.height]);
  expect(meanAbsDiff(got, want)).toBeLessThan(0.75);
}

describe('golden scenarios', () => {
  test('A · vintage polaroid, paper texture, Cream, ageing', () => {
    let doc = setMargin(createDocument([P1], 'vintage_polaroid'), 6);
    doc = updateFrame(doc, [], { texture: 'warm_paper', textureIntensity: 60, color: '#F1E4C8', aging: 55 });
    golden('A-vintage-polaroid', doc);
  });

  test('B · film strip: photo in the slot between the perforations', () => {
    golden('B-film-strip', createDocument([P2], 'film_strip'));
  });

  test('C · album frame with a rounded window, photo zoomed and moved', () => {
    const img = frameImage({ x: 0, y: 0, w: 0, h: 0 }, false);
    const ref = { uri: 'frame:jpg', width: 400, height: 500 };
    let doc = applyFrame(
      createDocument([P1]),
      customFrameStyle({ image: ref, slot: { x: 0.12, y: 0.1, width: 0.76, height: 0.62, shape: 'rounded', radius: 30 }, transform: { ...IDENTITY_TRANSFORM } }),
    );
    const id = photoLayers(doc)[0]!.id;
    doc = updateLayer(doc, id, { content: { ...IDENTITY_TRANSFORM, scale: 1.6, x: 0.12, y: -0.05 } } as Partial<PhotoLayer>);
    golden('C-album-frame', doc, kitBank({ [P1.uri]: PHOTO, [ref.uri]: img }));
  });

  test('D · album background, blurred, with a frame', () => {
    let doc = setMargin(createDocument([P1], 'classic_polaroid'), 18);
    doc = { ...doc, background: { fill: { kind: 'image', image: P2 }, adjust: { ...doc.background.adjust, blur: 40 } } };
    golden('D-album-background', doc);
  });

  test('E · scrapbook: paper background, three rotated polaroids, tape', () => {
    let doc = applyLayout(createDocument([P1, P2]), 'scrapbook');
    doc = { ...doc, background: { ...doc.background, fill: { kind: 'texture', textureId: 'kraft_paper' } } };
    doc = addPhotos(doc, [P1]);
    doc = applyFrame(doc, presetFrameStyle('vintage_polaroid'));
    const prints = photoLayers(doc);
    doc = updateLayer(doc, prints[2]!.id, { rotation: -9, x: 120, y: 700 });
    doc = addDecoration(doc, 'washi_tape');
    const tape = doc.layers.at(-1)!;
    doc = updateLayer(doc, tape.id, { x: prints[0]!.x + 60, y: prints[0]!.y - 30, rotation: -12 });
    expect(photoLayers(doc)).toHaveLength(3);
    expect(doc.layers.at(-1)!.kind).toBe('decoration');
    golden('E-scrapbook', doc);
  });

  test('F · template reuse gives the same frame on a different photo', () => {
    let doc = setMargin(createDocument([P1], 'cream_instant'), 8);
    doc = updateFrame(doc, [], { color: '#E2C3BC', thickness: 80, bottom: 130, shadow: 50 });
    const t = toTemplate(doc, 'Soft Pink');
    const reused = applyTemplate(t, [P2]);
    const a = photoLayers(doc)[0]!;
    const b = photoLayers(reused)[0]!;
    expect(b.frame).toEqual(a.frame);
    expect([b.x, b.y, b.width, b.height]).toEqual([a.x, a.y, a.width, a.height]);
    golden('F-template-reuse', reused);
  });
});
