/**
 * Phase 4 Stage C workflow: edit history names + jumping, versions, copy /
 * paste edits, project v1 → v2 migration.
 */
import { beforeEach, describe, expect, test } from 'bun:test';

import { DEFAULT_ADJUSTMENTS } from '@/constants/adjustments';
import { DEFAULT_MASK_ADJUST } from '@/constants/masks';
import { DEFAULT_HSL } from '@/services/color/hsl';
import { copyEdits, pasteEdits } from '@/services/editClipboard';
import { documentFiles, parseProject } from '@/services/editProject';
import { describeChange, historyEntries } from '@/services/history';
import { createEditState, useEditorStore } from '@/stores/editorStore';
import type { SourceImage } from '@/types/editing';

const SOURCE: SourceImage = { uri: 'file:///docs/originals/o.jpg', width: 4000, height: 3000, origin: 'library', takenAt: 1 };

beforeEach(() => useEditorStore.getState().open(SOURCE, {}));

describe('edit history', () => {
  test('steps are named from what changed', () => {
    const s = useEditorStore.getState();
    s.setFilter('mellow');
    s.setAdjustment('exposure', 15);
    s.commit();
    s.setHsl('orange', 'saturation', 20);
    s.commit();
    s.setFaceRetouch('face-0', 'slim', 10);
    s.commit();
    s.editBackground((b) => ({ ...b, subject: { uri: 'm', width: 10, height: 10, model: 't' }, mode: 'blur' }));
    s.setFrame((f) => ({ ...f, id: 'classic_polaroid' }));
    s.commit();
    const { past, present, future } = useEditorStore.getState();
    const labels = historyEntries(past, present, future, true).map((e) => e.label);
    expect(labels).toEqual(['원본', '필터 — Mellow', '노출 +15', 'HSL — Orange', '얼굴 · 갸름하게 +10', '피사체 분리', '프레임 — Classic Polaroid']);
  });

  test('jumping to a step shows it; a new edit after jumping back drops the later steps (linear)', () => {
    const s = useEditorStore.getState();
    s.setFilter('mellow');
    s.setFilter('noir');
    s.setFilter('cream');
    s.jumpTo(1);
    let st = useEditorStore.getState();
    expect(st.present.filterId).toBe('mellow');
    expect(st.future.length).toBe(2);
    s.jumpTo(3);
    expect(useEditorStore.getState().present.filterId).toBe('cream');
    s.jumpTo(1);
    s.setAdjustment('contrast', 10);
    s.commit();
    st = useEditorStore.getState();
    expect(st.future.length).toBe(0);
    expect(historyEntries(st.past, st.present, st.future, true).map((e) => e.label)).toEqual(['원본', '필터 — Mellow', '대비 +10']);
  });

  test('mask and removal steps are named', () => {
    const before = createEditState();
    const withMask = { ...before, masks: [{ id: 'a', name: '원형 1', visible: true, invert: false, shape: { kind: 'radial' as const, cx: 0.5, cy: 0.5, rx: 0.2, ry: 0.2, angle: 0, feather: 50 }, strokes: [], adjust: DEFAULT_MASK_ADJUST }] };
    expect(describeChange(before, withMask)).toBe('마스크 추가 — 원형 1');
    const exposed = { ...withMask, masks: [{ ...withMask.masks[0]!, adjust: { ...DEFAULT_MASK_ADJUST, exposure: 30 } }] };
    expect(describeChange(withMask, exposed)).toBe('원형 1 · 노출 +30');
  });
});

describe('versions', () => {
  test('save, change, save, restore the first: values match exactly', () => {
    const s = useEditorStore.getState();
    s.setFilter('mellow');
    s.setAdjustment('exposure', 20);
    s.commit();
    const warm = s.saveVersion('Warm Edit');
    const warmDoc = useEditorStore.getState().committed;
    s.setFilter('blue-hour');
    s.setAdjustment('exposure', -10);
    s.commit();
    s.saveVersion('Film Edit');
    expect(useEditorStore.getState().versions.map((v) => v.name)).toEqual(['Warm Edit', 'Film Edit']);
    s.restoreVersion(warm);
    const now = useEditorStore.getState().present;
    expect(now).toEqual(warmDoc);
    expect(now.filterId).toBe('mellow');
    expect(now.adjustments.exposure).toBe(20);
    // Restoring is one undo step.
    s.undo();
    expect(useEditorStore.getState().present.filterId).toBe('blue-hour');
  });

  test('versions keep snapshots, not copies of the photo', () => {
    const s = useEditorStore.getState();
    s.setFilter('noir');
    s.saveVersion('Mono');
    const v = useEditorStore.getState().versions[0]!;
    expect(JSON.stringify(v).includes('file://')).toBe(false);
    s.renameVersion(v.id, 'Noir');
    expect(useEditorStore.getState().versions[0]!.name).toBe('Noir');
    s.deleteVersion(v.id);
    expect(useEditorStore.getState().versions).toEqual([]);
  });
});

describe('copy / paste edits', () => {
  test('chosen categories only; photo-specific edits never travel', () => {
    const from = createEditState({
      filterId: 'peachy',
      intensity: 70,
      adjustments: { ...DEFAULT_ADJUSTMENTS, exposure: 12, grain: 40 },
      hsl: { ...DEFAULT_HSL, blue: { hue: -10, saturation: 0, luminance: 0 } },
      faces: { 'face-0': { slim: 30 } as never },
      spots: [{ id: 1, x: 0.5, y: 0.5, radius: 0.01 }],
      geometry: { rotation: 90, flipH: false, flipV: false, crop: null, aspect: 'original' },
    });
    const to = createEditState({ filterId: 'noir', adjustments: { ...DEFAULT_ADJUSTMENTS, contrast: 5 } });
    const pasted = pasteEdits(to, copyEdits(from), new Set(['filter', 'adjust']));
    expect(pasted.filterId).toBe('peachy');
    expect(pasted.intensity).toBe(70);
    expect(pasted.adjustments.exposure).toBe(12);
    expect(pasted.adjustments.contrast).toBe(0);
    // Grain is a film effect: not pasted without 'film'.
    expect(pasted.adjustments.grain).toBe(0);
    expect(pasted.hsl).toEqual(to.hsl);
    expect(pasted.faces).toEqual({});
    expect(pasted.spots).toEqual([]);
    expect(pasted.geometry.rotation).toBe(0);
    const film = pasteEdits(to, copyEdits(from), new Set(['film', 'hsl']));
    expect(film.adjustments.grain).toBe(40);
    expect(film.adjustments.exposure).toBe(0);
    expect(film.hsl.blue.hue).toBe(-10);
    expect(film.filterId).toBe('noir');
  });
});

describe('project migration', () => {
  test('a v1 project becomes v2 with no versions; Phase 4 fields get defaults', () => {
    const v1 = { version: 1, id: 'p', originalUri: 'a', createdAt: 1, updatedAt: 1, source: SOURCE, document: { filterId: 'mellow', intensity: 50 } };
    const p = parseProject(JSON.stringify(v1))!;
    expect(p.version).toBe(2);
    expect(p.versions).toEqual([]);
    expect(p.document.masks).toEqual([]);
    expect(p.document.removals).toEqual([]);
    expect(p.document.background.mode).toBe('none');
    expect(p.document.autoEnhance).toBeNull();
  });

  test('v2 round-trips versions; referenced mask files are known for pruning', () => {
    const doc = createEditState({
      removals: [{ id: 'r', engine: 'patchmatch', rect: { x: 0, y: 0, width: 0.1, height: 0.1 }, patch: { uri: 'file:///masks/patch.png', width: 10, height: 10 }, selection: { kind: 'lasso', points: [] }, createdAt: 1 }],
    });
    const json = JSON.stringify({ version: 2, documentVersion: 2, id: 'p', originalUri: 'a', createdAt: 1, updatedAt: 1, source: SOURCE, document: doc, versions: [{ id: 'v', name: 'A', createdAt: 1, document: doc }] });
    const p = parseProject(json)!;
    expect(p.versions[0]!.document.removals[0]!.patch.uri).toBe('file:///masks/patch.png');
    expect(documentFiles(p.document)).toEqual(['file:///masks/patch.png']);
  });
});

describe('professional export', () => {
  test('resolution: original, presets and custom never upscale past the photo', async () => {
    const { outputLongSide } = await import('@/services/exportOptions');
    const src = { width: 3000, height: 2000 };
    expect(outputLongSide({ resolution: 'original', customSide: 0 }, src)).toBe(3000);
    expect(outputLongSide({ resolution: '2048', customSide: 0 }, src)).toBe(2048);
    expect(outputLongSide({ resolution: '4096', customSide: 0 }, src)).toBe(3000);
    expect(outputLongSide({ resolution: 'custom', customSide: 1500 }, src)).toBe(1500);
    expect(outputLongSide({ resolution: 'custom', customSide: 100 }, src)).toBe(512);
  });

  test('metadata: keep writes date + GPS, noLocation drops GPS, none writes nothing', async () => {
    const piexif = (await import('piexifjs')).default;
    const { exportMetadata } = await import('@/services/exif');
    const { CK } = await import('./canvaskit');
    const img = CK.MakeImage({ width: 4, height: 4, alphaType: CK.AlphaType.Opaque, colorType: CK.ColorType.RGBA_8888, colorSpace: CK.ColorSpace.SRGB }, new Uint8Array(64).fill(200), 16);
    const jpeg = img.encodeToBytes(CK.ImageFormat.JPEG, 90) as Uint8Array;
    const input = { takenAt: Date.UTC(2024, 4, 1), location: { latitude: 37.5, longitude: 127, altitude: null } };
    const read = (b: Uint8Array) => {
      let bin = '';
      for (const v of b) bin += String.fromCharCode(v);
      try {
        return piexif.load(bin);
      } catch {
        return null;
      }
    };
    const keep = read(exportMetadata(jpeg, 'keep', input))!;
    expect(Object.keys(keep.GPS ?? {}).length).toBeGreaterThan(0);
    expect(keep.Exif?.[piexif.ExifIFD.DateTimeOriginal]).toBeTruthy();
    const noLoc = read(exportMetadata(jpeg, 'noLocation', input))!;
    expect(Object.keys(noLoc.GPS ?? {}).length).toBe(0);
    expect(noLoc.Exif?.[piexif.ExifIFD.DateTimeOriginal]).toBeTruthy();
    const none = read(exportMetadata(jpeg, 'none', input));
    expect(none?.Exif?.[piexif.ExifIFD.DateTimeOriginal]).toBeUndefined();
    expect(Object.keys(none?.GPS ?? {}).length).toBe(0);
  });
});
