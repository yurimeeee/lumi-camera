/**
 * Engine, state and persistence tests (pure TypeScript): `npm run test:engine`.
 */
import { beforeEach, describe, expect, test } from 'bun:test';

import { DEFAULT_ADJUSTMENTS } from '@/constants/adjustments';
import { FILTERS, getFilter } from '@/constants/filters';
import {
  buildCurveTable,
  curveSampler,
  DEFAULT_CURVES,
  insertCurvePoint,
  isIdentityTable,
  LUT_SIZE,
  moveCurvePoint,
  removeCurvePoint,
  sanitizeCurve,
  scaleCurve,
} from '@/services/color/curves';
import { composeHsl, DEFAULT_HSL, HSL_COLORS, hslWeights } from '@/services/color/hsl';
import { parseProject, serializeProject, type EditProject } from '@/services/editProject';
import { encodeExport } from '@/services/exportEncoding';
import { isIdentity, resolveProcessing } from '@/services/imageProcessing';
import { colorLookOf, createEditState, lookOf, useEditorStore } from '@/stores/editorStore';
import { normalizeRecipeName, recipeToLook, scaleColorLook, useRecipeStore } from '@/stores/recipeStore';
import type { SourceImage } from '@/types/editing';

import { asyncStorageMemory } from './stubs';

const SOURCE: SourceImage = { uri: 'file:///docs/originals/original-1.jpg', width: 4032, height: 3024, origin: 'library', takenAt: 1 };

describe('filter intensity', () => {
  test('0 equals the original for every filter', () => {
    for (const f of FILTERS) expect(isIdentity(resolveProcessing({ filter: f, intensity: 0 }))).toBe(true);
  });

  test('100 is the defined filter', () => {
    const f = getFilter('mellow');
    const p = resolveProcessing({ filter: f, intensity: 100 });
    for (const [k, v] of Object.entries(f.params)) expect(p.tone[k as keyof typeof p.tone]).toBe(v);
    expect(p.split.amount).toBe(f.splitTone!.amount);
    expect(p.curves).not.toBeNull();
  });

  test('scales linearly in between, and manual adjustments stay separate', () => {
    const f = getFilter('peachy');
    const p = resolveProcessing({ filter: f, intensity: 50, adjustments: { ...DEFAULT_ADJUSTMENTS, exposure: 15 } });
    expect(p.tone.brightness).toBeCloseTo((f.params.brightness ?? 0) / 2);
    expect(p.tone.exposure).toBe(15);
  });

  test('every filter is distinct', () => {
    const keys = new Set(FILTERS.map((f) => JSON.stringify(resolveProcessing({ filter: f, intensity: 100 }))));
    expect(keys.size).toBe(FILTERS.length);
  });
});

describe('HSL', () => {
  test('defaults change nothing', () => {
    expect(composeHsl(undefined, 1, DEFAULT_HSL).every((v) => v === 0)).toBe(true);
    expect(isIdentity(resolveProcessing({ filter: getFilter('original'), intensity: 100, hsl: DEFAULT_HSL }))).toBe(true);
  });

  test('band weights sum to 1 at every hue', () => {
    for (let h = 0; h < 360; h += 0.5) {
      const w = hslWeights(h);
      expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
      expect(w.every((x) => x >= 0 && x <= 1)).toBe(true);
    }
  });

  test('a band is fully selected at its centre', () => {
    expect(hslWeights(30)[HSL_COLORS.indexOf('orange')]).toBeCloseTo(1);
    expect(hslWeights(225)[HSL_COLORS.indexOf('blue')]).toBeCloseTo(1);
  });
});

describe('curves', () => {
  test('default straight line maps input to output', () => {
    const f = curveSampler(DEFAULT_CURVES.rgb);
    for (let i = 0; i <= 100; i++) expect(f(i / 100)).toBeCloseTo(i / 100, 10);
    expect(isIdentityTable(buildCurveTable(undefined, 1, DEFAULT_CURVES))).toBe(true);
  });

  test('passes through control points and stays monotone between them', () => {
    const pts = [{ x: 0, y: 0 }, { x: 0.25, y: 0.15 }, { x: 0.75, y: 0.85 }, { x: 1, y: 1 }];
    const f = curveSampler(pts);
    for (const p of pts) expect(f(p.x)).toBeCloseTo(p.y, 6);
    let prev = -1;
    for (let i = 0; i <= 1000; i++) {
      const v = f(i / 1000);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
  });

  test('garbage points never produce NaN or out-of-range output', () => {
    const f = curveSampler([
      { x: NaN, y: 0.5 },
      { x: 0.5, y: Infinity },
      { x: 2, y: -3 },
      { x: 0.5, y: 0.9 },
      { x: 0.5001, y: 0.1 },
    ]);
    for (let i = 0; i <= 200; i++) {
      const v = f(i / 200);
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  test('editing helpers keep end points and order', () => {
    const added = insertCurvePoint(DEFAULT_CURVES.rgb, 0.5)!;
    expect(added.points).toHaveLength(3);
    const moved = moveCurvePoint(added.points, added.index, 2, 0.7);
    expect(moved[1]!.x).toBeLessThan(1);
    expect(moved[1]!.y).toBe(0.7);
    expect(moveCurvePoint(moved, 0, 0.4, 0.2)[0]).toEqual({ x: 0, y: 0.2 });
    expect(removeCurvePoint(moved, 0)).toHaveLength(3);
    expect(removeCurvePoint(moved, 1)).toHaveLength(2);
    expect(moved[1]!.x).toBeCloseTo(0.98); // clamped before the end point
    expect(insertCurvePoint(moved, 0.99)).toBeNull(); // too close to an existing point
  });

  test('filter curves blend toward linear with intensity', () => {
    const film = getFilter('dusty'); // RGB curve only: blending is linear per entry
    expect(isIdentityTable(buildCurveTable(film.curves, 0, undefined))).toBe(true);
    const half = buildCurveTable(film.curves, 0.5, undefined);
    const full = buildCurveTable(film.curves, 1, undefined);
    const i = 0;
    expect(half[i * 3]!).toBeCloseTo(full[i * 3]! / 2, 5);
    expect(half.length).toBe(LUT_SIZE * 3);
  });

  test('scaleCurve(0) is linear, scaleCurve(1) unchanged', () => {
    const pts = sanitizeCurve([{ x: 0, y: 0.1 }, { x: 0.5, y: 0.7 }, { x: 1, y: 0.9 }]);
    expect(scaleCurve(pts, 0).every((p) => p.x === p.y)).toBe(true);
    expect(scaleCurve(pts, 1)).toEqual(pts);
  });
});

describe('editor history', () => {
  beforeEach(() => useEditorStore.getState().open(SOURCE));

  test('a slider drag is one undo step', () => {
    const s = useEditorStore.getState();
    for (const v of [5, 10, 15, 20]) s.setAdjustment('exposure', v);
    expect(useEditorStore.getState().past).toHaveLength(0);
    s.commit();
    expect(useEditorStore.getState().past).toHaveLength(1);
    s.undo();
    expect(useEditorStore.getState().present.adjustments.exposure).toBe(0);
    s.redo();
    expect(useEditorStore.getState().present.adjustments.exposure).toBe(20);
  });

  test('filter, HSL and curves changes are undoable', () => {
    const s = useEditorStore.getState();
    s.setFilter('peachy');
    s.setHsl('orange', 'luminance', 20);
    s.commit();
    s.setCurve('blue', [{ x: 0, y: 0.1 }, { x: 1, y: 1 }]);
    s.commit();
    expect(useEditorStore.getState().past).toHaveLength(3);
    s.undo();
    expect(useEditorStore.getState().present.curves.blue).toBe(DEFAULT_CURVES.blue);
    s.undo();
    expect(useEditorStore.getState().present.hsl.orange.luminance).toBe(0);
    s.undo();
    expect(useEditorStore.getState().present.filterId).toBe('original');
    s.redo();
    s.redo();
    expect(useEditorStore.getState().present.hsl.orange.luminance).toBe(20);
  });

  test('resets: one HSL colour, one curve channel, everything', () => {
    const s = useEditorStore.getState();
    s.setHsl('orange', 'saturation', -15);
    s.setHsl('blue', 'hue', -10);
    s.commit();
    s.resetHslColor('orange');
    expect(useEditorStore.getState().present.hsl.orange.saturation).toBe(0);
    expect(useEditorStore.getState().present.hsl.blue.hue).toBe(-10);
    s.setCurve('rgb', [{ x: 0, y: 0.2 }, { x: 1, y: 1 }]);
    s.commit();
    s.resetCurve('rgb');
    expect(useEditorStore.getState().present.curves.rgb).toBe(DEFAULT_CURVES.rgb);
    s.resetAll();
    expect(isIdentity(resolveProcessing({ ...colorLookOf(useEditorStore.getState().present), filter: getFilter('original') }))).toBe(true);
    s.undo();
    expect(useEditorStore.getState().present.hsl.blue.hue).toBe(-10);
  });
});

describe('My Recipe', () => {
  beforeEach(() => {
    useRecipeStore.setState({ recipes: [] });
    useEditorStore.getState().open(SOURCE);
  });

  test('save → apply to another photo gives the same values', () => {
    const s = useEditorStore.getState();
    s.setFilter('mellow');
    s.setAdjustment('exposure', 12);
    s.setHsl('orange', 'luminance', 18);
    s.setCurve('rgb', [{ x: 0, y: 0 }, { x: 0.3, y: 0.25 }, { x: 1, y: 1 }]);
    s.setRetouch('skin', 40); // photo-specific: not part of a recipe
    s.commit();
    const look = colorLookOf(useEditorStore.getState().present);
    const id = useRecipeStore.getState().add('  Warm   Diary ', lookOf(useEditorStore.getState().present));
    const recipe = useRecipeStore.getState().recipes.find((r) => r.id === id)!;
    expect(recipe.name).toBe('Warm Diary');

    useEditorStore.getState().open({ ...SOURCE, uri: 'file:///other.jpg' });
    useEditorStore.getState().applyLook(recipeToLook(recipe), recipe.id);
    const next = useEditorStore.getState().present;
    expect(colorLookOf(next)).toEqual(look);
    expect(next.retouch.skin).toBe(0);
    expect(next.recipeId).toBe(id);
  });

  test('deleting a recipe does not change edits made with it', () => {
    const s = useEditorStore.getState();
    s.setAdjustment('contrast', 30);
    s.commit();
    const id = useRecipeStore.getState().add('Soft Peach', lookOf(useEditorStore.getState().present));
    useEditorStore.getState().open(SOURCE);
    useEditorStore.getState().applyLook(recipeToLook(useRecipeStore.getState().recipes[0]!), id);
    useRecipeStore.getState().remove(id);
    expect(useEditorStore.getState().present.adjustments.contrast).toBe(30);
  });

  test('rename, favourite, persistence', async () => {
    const id = useRecipeStore.getState().add('Summer Mood', lookOf(createEditState()));
    useRecipeStore.getState().rename(id, 'Summer');
    useRecipeStore.getState().rename(id, '   ');
    useRecipeStore.getState().toggleFavorite(id);
    await new Promise((r) => setTimeout(r, 0));
    const stored = JSON.parse(asyncStorageMemory.get('lumi.recipes')!);
    expect(stored.state.recipes[0].name).toBe('Summer');
    expect(stored.state.recipes[0].favorite).toBe(true);
    expect(normalizeRecipeName('x'.repeat(40))).toHaveLength(24);
  });

  test('camera intensity scales the whole recipe (0 = original)', () => {
    const look = { ...colorLookOf(createEditState({ filterId: 'peachy', intensity: 70 })) };
    look.adjustments = { ...look.adjustments, exposure: 20 };
    look.hsl = { ...look.hsl, orange: { hue: 0, saturation: 0, luminance: 30 } };
    look.curves = { ...look.curves, rgb: [{ x: 0, y: 0.1 }, { x: 1, y: 1 }] };
    const zero = scaleColorLook(look, 0);
    expect(isIdentity(resolveProcessing({ ...zero, filter: getFilter(zero.filterId) }))).toBe(true);
    expect(scaleColorLook(look, 1)).toBe(look);
    expect(scaleColorLook(look, 0.5).adjustments.exposure).toBe(10);
  });
});

describe('edit project', () => {
  test('serialises and restores the full edit document', () => {
    const doc = createEditState({
      filterId: 'portra',
      intensity: 65,
      adjustments: { ...DEFAULT_ADJUSTMENTS, highlights: -20 },
      hsl: { ...DEFAULT_HSL, blue: { hue: -10, saturation: 0, luminance: 0 } },
      curves: { ...DEFAULT_CURVES, blue: [{ x: 0, y: 0.05 }, { x: 1, y: 1 }] },
      spots: [{ id: 7, x: 0.4, y: 0.5, radius: 0.01 }],
    });
    const project: EditProject = { version: 2, documentVersion: 2, id: 'p1', originalUri: SOURCE.uri, createdAt: 1, updatedAt: 2, source: SOURCE, document: doc, versions: [] };
    const back = parseProject(serializeProject(project))!;
    expect(back.document).toEqual(doc);
    expect(back.source.uri).toBe(SOURCE.uri);
  });

  test('old documents get defaults for new fields; garbage is rejected', () => {
    const old = { version: 1, id: 'p', originalUri: 'a', createdAt: 1, updatedAt: 1, source: SOURCE, document: { filterId: 'mellow', intensity: 50 } };
    const back = parseProject(JSON.stringify(old))!;
    expect(back.document.hsl).toEqual(DEFAULT_HSL);
    expect(back.document.curves).toEqual(DEFAULT_CURVES);
    expect(parseProject('{nope')).toBeNull();
    expect(parseProject(JSON.stringify({ version: 2 }))).toBeNull();
  });

  test('restoring keeps referencing the stored original and new strokes get fresh ids', () => {
    const doc = createEditState({ spots: [{ id: 41, x: 0.5, y: 0.5, radius: 0.01 }] });
    useEditorStore.getState().open(SOURCE, doc);
    expect(useEditorStore.getState().source!.uri).toBe(SOURCE.uri);
    useEditorStore.getState().addSpot({ x: 0.1, y: 0.1, radius: 0.01 });
    const ids = useEditorStore.getState().present.spots.map((s) => s.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids[1]).toBeGreaterThan(41);
  });
});

describe('export', () => {
  test('encoder failure surfaces a user-facing error', () => {
    expect(() => encodeExport({ encodeToBytes: () => new Uint8Array(0) }, 'jpeg', 90)).toThrow('사진을 인코딩하지 못했어요.');
  });

  test('format and quality reach the encoder', () => {
    const calls: unknown[][] = [];
    const raster = { encodeToBytes: (...a: unknown[]) => (calls.push(a), new Uint8Array([1])) };
    encodeExport(raster, 'jpeg', 80);
    encodeExport(raster, 'png', 100);
    expect(calls[0]![1]).toBe(80);
    expect(calls[1]![1]).toBe(100);
    expect(calls[0]![0]).not.toBe(calls[1]![0]);
  });
});
