/**
 * Face retouch tests (Phase 2): warp math for the new controls, skin
 * regions, face re-identification and the per-face state. Pure TypeScript
 * plus the real SkSL through CanvasKit: `npm run test:engine`.
 *
 * Real-photo checks (Apple Vision landmarks) live in scripts/face-warp:
 * `npm run check:face-warp` and `npm run render:face-retouch`.
 */
import { beforeEach, describe, expect, test } from 'bun:test';

import { DEFAULT_RETOUCH } from '@/constants/adjustments';
import { completeFaceRetouch, DEFAULT_FACE_RETOUCH, eyeValue, FACE_RETOUCH_KEYS, sidedKey } from '@/constants/faceRetouch';
import { getFilter } from '@/constants/filters';
import { anchorOf, assignFaceIds } from '@/services/faceDetection/faceIdentity';
import { focusRect } from '@/services/faceDetection/featureFocus';
import type { DetectedFace, EyeLandmarks, FaceLandmarks, Point } from '@/services/faceDetection/types';
import { faceRender, needsFaces } from '@/services/faceWarp/faceRender';
import { buildFaceWarp, prepareFaceInputs, warpBackward, warpForward, type FaceWarpPlan } from '@/services/faceWarp/FaceWarpEngine';
import { buildFaceRegions, prepareRegionInputs, regionRadius, regionUniforms, type Region } from '@/services/faceWarp/regions';
import { parseProject } from '@/services/editProject';
import { resolveProcessing } from '@/services/imageProcessing';
import { createEditState, useEditorStore } from '@/stores/editorStore';
import type { FaceRetouch, Geometry, SourceImage } from '@/types/editing';

import { renderLumi, type Pixels } from './canvaskit';

const W = 400;
const H = 500;
const G: Geometry = { rotation: 0, flipH: false, flipV: false, crop: null, aspect: 'original' };

// ── Synthetic frontal face (normalised to a 400×500 photo) ──────

const ellipse = (cx: number, cy: number, rx: number, ry: number, n: number, a0 = 0, a1 = Math.PI * 2): Point[] =>
  Array.from({ length: n }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / (a1 - a0 >= Math.PI * 2 ? n : n - 1);
    return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
  });

function eye(cx: number, inner: 1 | -1): EyeLandmarks {
  const contour = ellipse(cx, 0.42, 0.05, 0.016, 16);
  const left = { x: cx - 0.05, y: 0.42 };
  const right = { x: cx + 0.05, y: 0.42 };
  return {
    contour,
    inner: inner === 1 ? right : left,
    outer: inner === 1 ? left : right,
    upperLid: contour.filter((p) => p.y < 0.42),
    lowerLid: contour.filter((p) => p.y > 0.42),
    center: { x: cx, y: 0.42 },
  };
}

function syntheticFace(dx = 0, id = 'face-0'): DetectedFace {
  const jaw = ellipse(0.5, 0.42, 0.2, 0.36, 21, Math.PI, 0).reverse(); // image-left → chin → image-right
  const forehead = ellipse(0.5, 0.42, 0.2, 0.22, 9, Math.PI, Math.PI * 2);
  const shift = (p: Point) => ({ x: p.x + dx, y: p.y });
  const lm: FaceLandmarks = {
    faceContour: [...jaw, ...forehead.slice(1, -1).reverse()],
    jaw,
    chin: { x: 0.5, y: 0.78 },
    leftCheek: { x: 0.31, y: 0.56 },
    rightCheek: { x: 0.69, y: 0.56 },
    forehead,
    foreheadEstimated: true,
    leftEye: eye(0.4, 1),
    rightEye: eye(0.6, -1),
    leftEyebrow: Array.from({ length: 10 }, (_, i) => ({ x: 0.34 + i * 0.013, y: 0.375 - 0.01 * Math.sin((i / 9) * Math.PI) })),
    rightEyebrow: Array.from({ length: 10 }, (_, i) => ({ x: 0.54 + i * 0.013, y: 0.375 - 0.01 * Math.sin((i / 9) * Math.PI) })),
    nose: {
      bridge: [0.42, 0.46, 0.5, 0.54].map((y) => ({ x: 0.5, y })),
      tip: { x: 0.5, y: 0.55 },
      leftWing: { x: 0.455, y: 0.56 },
      rightWing: { x: 0.545, y: 0.56 },
      leftNostril: { x: 0.478, y: 0.567 },
      rightNostril: { x: 0.522, y: 0.567 },
      base: { x: 0.5, y: 0.575 },
      contour: [
        { x: 0.455, y: 0.56 },
        { x: 0.478, y: 0.567 },
        { x: 0.5, y: 0.575 },
        { x: 0.522, y: 0.567 },
        { x: 0.545, y: 0.56 },
      ],
    },
    lips: {
      outer: ellipse(0.5, 0.652, 0.07, 0.027, 20),
      inner: ellipse(0.5, 0.652, 0.055, 0.012, 20),
      leftCorner: { x: 0.43, y: 0.652 },
      rightCorner: { x: 0.57, y: 0.652 },
      upperTop: { x: 0.5, y: 0.625 },
      lowerBottom: { x: 0.5, y: 0.679 },
      center: { x: 0.5, y: 0.652 },
    },
    philtrum: { x: 0.5, y: 0.6 },
  };
  const moved = dx ? mapAll(lm, shift) : lm;
  const xs = moved.faceContour.map((p) => p.x);
  const ys = moved.faceContour.map((p) => p.y);
  return {
    id,
    bounds: { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) },
    landmarks: moved,
    detector: 'apple-vision',
  };
}

function mapAll(lm: FaceLandmarks, f: (p: Point) => Point): FaceLandmarks {
  // Deep map of every point (JSON round trip keeps the shape).
  return JSON.parse(JSON.stringify(lm), (_k, v) => (v && typeof v === 'object' && 'x' in v && 'y' in v && Object.keys(v).length === 2 ? f(v) : v));
}

const FACE = syntheticFace();
const px = (p: Point) => ({ x: p.x * W, y: p.y * H });
const edit = (values: Partial<FaceRetouch>) => ({ 'face-0': { ...DEFAULT_FACE_RETOUCH, ...values } });
const planFor = (values: Partial<FaceRetouch>) => buildFaceWarp(prepareFaceInputs([FACE], edit(values), G), W, H);
const moveOf = (plan: FaceWarpPlan, p: Point) => {
  const q = warpForward(px(p), plan);
  return { x: q.x - px(p).x, y: q.y - px(p).y };
};

describe('face warp: new controls', () => {
  test('every control at 0 is no warp and no region', () => {
    expect(planFor({})).toBeNull();
    expect(faceRender([FACE], { faces: edit({}), retouch: DEFAULT_RETOUCH }, G, W, H).active).toBe(false);
  });

  test('eye angle +100 lifts both outer corners, keeps the iris centre', () => {
    const plan = planFor({ eyeAngle: 100 })!;
    for (const e of [FACE.landmarks.leftEye, FACE.landmarks.rightEye]) {
      expect(moveOf(plan, e.outer).y).toBeLessThan(-0.6);
      expect(moveOf(plan, e.inner).y).toBeGreaterThan(0.6);
      const c = moveOf(plan, e.center);
      expect(Math.hypot(c.x, c.y)).toBeLessThan(0.05);
    }
    // −100 turns the other way.
    const down = planFor({ eyeAngle: -100 })!;
    expect(moveOf(down, FACE.landmarks.leftEye.outer).y).toBeGreaterThan(0.6);
  });

  test('a per-eye value only reshapes that eye', () => {
    const plan = planFor({ [sidedKey('eyeSize', 'L')]: 100 })!;
    const lOuter = moveOf(plan, FACE.landmarks.leftEye.outer);
    const rOuter = moveOf(plan, FACE.landmarks.rightEye.outer);
    expect(Math.abs(lOuter.x)).toBeGreaterThan(0.8);
    expect(Math.hypot(rOuter.x, rOuter.y)).toBe(0);
    // Both + one-eye offset add up.
    const r = { ...DEFAULT_FACE_RETOUCH, eyeSize: 30, eyeSizeR: -10 };
    expect(eyeValue(r, 'eyeSize', 'L')).toBe(30);
    expect(eyeValue(r, 'eyeSize', 'R')).toBe(20);
  });

  test('philtrum −100 moves the mouth up; nose and chin stay', () => {
    const plan = planFor({ philtrum: -100 })!;
    expect(moveOf(plan, FACE.landmarks.lips.center).y).toBeLessThan(-1);
    expect(Math.abs(moveOf(plan, FACE.landmarks.nose.tip).y)).toBeLessThan(0.05);
    expect(Math.abs(moveOf(plan, FACE.landmarks.chin).y)).toBeLessThan(0.3);
  });

  test('nostril −100 narrows the nostrils toward the midline; the tip stays', () => {
    const plan = planFor({ nostril: -100 })!;
    expect(moveOf(plan, FACE.landmarks.nose.leftNostril).x).toBeGreaterThan(0.3);
    expect(moveOf(plan, FACE.landmarks.nose.rightNostril).x).toBeLessThan(-0.3);
    expect(Math.abs(moveOf(plan, FACE.landmarks.nose.tip).x)).toBeLessThan(0.05);
  });

  test('mouth corner +100 lifts the corners only', () => {
    const plan = planFor({ mouthCorner: 100 })!;
    expect(moveOf(plan, FACE.landmarks.lips.leftCorner).y).toBeLessThan(-0.8);
    expect(moveOf(plan, FACE.landmarks.lips.rightCorner).y).toBeLessThan(-0.8);
    const c = moveOf(plan, FACE.landmarks.lips.center);
    expect(Math.hypot(c.x, c.y)).toBe(0);
  });

  test('no folds and nothing moves far from the face for any control at ±100', () => {
    for (const key of FACE_RETOUCH_KEYS) {
      for (const v of [100, -100]) {
        const plan = planFor({ [key]: v });
        if (!plan) continue;
        for (let y = 20; y < H - 20; y += 9) {
          for (let x = 20; x < W - 20; x += 9) {
            const p = warpBackward({ x, y }, plan);
            const a = warpBackward({ x: x + 1, y }, plan);
            const b = warpBackward({ x, y: y + 1 }, plan);
            const det = (a.x - p.x) * (b.y - p.y) - (b.x - p.x) * (a.y - p.y);
            if (det < 0.5) throw new Error(`${key}=${v}: fold risk at ${x},${y} (det ${det.toFixed(2)})`);
          }
        }
        // Photo corners are background.
        for (const c of [{ x: 2, y: 2 }, { x: W - 2, y: H - 2 }]) expect(warpBackward(c, plan)).toEqual(c);
      }
    }
  });
});

describe('skin regions', () => {
  const regionsFor = (values: Partial<FaceRetouch>, protect = false) =>
    buildFaceRegions(prepareRegionInputs([FACE], edit(values), G), W, H, protect);
  const kinds = (rs: readonly Region[]) => new Set(rs.map((r) => r.kind));

  test('no tone edit and no smoothing → no regions', () => {
    expect(regionsFor({})).toEqual([]);
    expect(regionsFor({ slim: 100 })).toEqual([]);
  });

  test('skin smoothing protects eyes, brows, lips and nostrils', () => {
    const rs = regionsFor({}, true);
    expect(kinds(rs)).toEqual(new Set(['protect']));
    // r < 0.9 is still ≥ 90 % protected (the mask fades from 0.75 to 1.2).
    const covered = (p: Point) => rs.some((r) => regionRadius(px(p), r) < 0.9);
    const lm = FACE.landmarks;
    for (const p of [lm.leftEye.center, lm.rightEye.outer, lm.leftEyebrow[4]!, lm.lips.center, lm.lips.leftCorner, lm.nose.leftNostril]) {
      expect(covered(p)).toBe(true);
    }
    // Cheeks and forehead stay smoothable.
    expect(covered({ x: 0.36, y: 0.55 })).toBe(false);
    expect(covered({ x: 0.5, y: 0.3 })).toBe(false);
  });

  test('each tool gets only its own area', () => {
    const lm = FACE.landmarks;
    const one = (values: Partial<FaceRetouch>, kind: Region['kind']) => regionsFor(values).filter((r) => r.kind === kind);
    const under = one({ darkCircle: 100 }, 'underEye');
    expect(under).toHaveLength(2);
    for (const r of under) {
      expect(r.c.y).toBeGreaterThan(px(lm.leftEye.center).y + 8);
      expect(regionRadius(px(lm.leftEye.center), r)).toBeGreaterThan(1);
    }
    const mouth = one({ teeth: 100 }, 'mouth');
    expect(mouth).toHaveLength(1);
    expect(regionRadius(px(lm.lips.center), mouth[0]!)).toBeLessThan(0.1);
    // The teeth area stays inside the lips: the lip line is outside it.
    expect(regionRadius(px(lm.lips.upperTop), mouth[0]!)).toBeGreaterThan(1);
    const eyes = one({ eyeBright: 100 }, 'eye');
    expect(eyes).toHaveLength(2);
    expect(regionRadius(px(lm.leftEyebrow[4]!), eyes[0]!)).toBeGreaterThan(1);
    expect(one({ wrinkle: 100 }, 'crease').length).toBeGreaterThanOrEqual(7);
    expect(one({ redness: 100 }, 'face')).toHaveLength(1);
  });

  test('a closed mouth gets no teeth area', () => {
    const closed = syntheticFace();
    closed.landmarks.lips.inner = ellipse(0.5, 0.652, 0.055, 0.0005, 20);
    const rs = buildFaceRegions(prepareRegionInputs([closed], edit({ teeth: 100 }), G), W, H, false);
    expect(rs.filter((r) => r.kind === 'mouth')).toHaveLength(0);
  });
});

// ── Shader: region tools on synthetic pixels ─────────────────────

function fill(w: number, h: number, f: (x: number, y: number) => [number, number, number]): Pixels {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = f(x, y);
      data.set([r, g, b, 255], (y * w + x) * 4);
    }
  }
  return { width: w, height: h, data };
}

const at = (p: Pixels, x: number, y: number) => {
  const k = (y * p.width + x) * 4;
  return [p.data[k]!, p.data[k + 1]!, p.data[k + 2]!] as const;
};
const identity = () => resolveProcessing({ filter: getFilter('original'), intensity: 0 });
const AXIS = { x: 1, y: 0 };

describe('skin region shader', () => {
  test('teeth whitening: yellow teeth inside the mouth only, lips untouched', () => {
    // Left half yellowish teeth, right half lip red; a mouth region over the middle.
    const src = fill(96, 64, (x) => (x < 48 ? [214, 196, 150] : [176, 84, 92]));
    const mouth: Region = { kind: 'mouth', c: { x: 48, y: 32 }, axis: AXIS, rx: 40, ry: 20, amount: 1 };
    const out = renderLumi(src, identity(), regionUniforms([mouth]));
    const teethBefore = at(src, 30, 32);
    const teethAfter = at(out, 30, 32);
    // Less yellow (blue catches up with red), not darker.
    expect(teethAfter[0] - teethAfter[2]).toBeLessThan(teethBefore[0] - teethBefore[2] - 20);
    expect(teethAfter[1]).toBeGreaterThanOrEqual(teethBefore[1]);
    expect(at(out, 66, 32)).toEqual(at(src, 66, 32)); // lips
    expect(at(out, 2, 2)).toEqual(at(src, 2, 2)); // outside the mouth
  });

  test('dark circle: a darker hollow is lifted toward the cheek below; lashes stay dark', () => {
    // Skin with a darker band (the hollow) at y 22…34 and a lash line at y 18.
    const skin: [number, number, number] = [205, 160, 135];
    const src = fill(96, 96, (_x, y) => {
      if (y === 18) return [40, 30, 30];
      if (y >= 22 && y <= 34) return [160, 118, 105];
      return skin;
    });
    const under: Region = { kind: 'underEye', c: { x: 48, y: 28 }, axis: AXIS, rx: 36, ry: 12, amount: 1 };
    const out = renderLumi(src, identity(), regionUniforms([under]));
    const before = at(src, 48, 28);
    const after = at(out, 48, 28);
    expect(after[0]).toBeGreaterThan(before[0] + 15);
    expect(after[0]).toBeLessThanOrEqual(skin[0] + 2);
    expect(at(out, 48, 18)[0]).toBeLessThan(60); // lash
    expect(at(out, 48, 80)).toEqual(at(src, 48, 80)); // cheek (the reference) itself is untouched
  });

  test('protected features keep their pixels under strong skin smoothing', () => {
    // Noisy skin everywhere; a protect ellipse on the left. Radii scale with
    // the image (1/1000 of the short side), so the photo is photo-sized.
    const src = fill(600, 400, (x, y) => {
      const n = ((x * 37 + y * 91) % 17) - 8;
      return [200 + n, 156 + n, 132 + n];
    });
    const protect: Region = { kind: 'protect', c: { x: 150, y: 200 }, axis: AXIS, rx: 90, ry: 90, amount: 1 };
    const p = resolveProcessing({ filter: getFilter('original'), intensity: 0, retouch: { skin: 100, smooth: 100 } });
    const smoothed = renderLumi(src, p);
    const kept = renderLumi(src, p, regionUniforms([protect]));
    expect(at(kept, 150, 200)).toEqual(at(src, 150, 200));
    expect(at(kept, 450, 200)).toEqual(at(smoothed, 450, 200));
    expect(at(smoothed, 150, 200)).not.toEqual(at(src, 150, 200));
  }, 30_000);

  test('texture 0 changes nothing; − softens fine texture on skin', () => {
    const src = fill(500, 500, (x, y) => {
      const n = (x + y) % 2 ? 6 : -6;
      return [200 + n, 156 + n, 132 + n];
    });
    const flat = renderLumi(src, resolveProcessing({ filter: getFilter('original'), intensity: 0, retouch: { texture: 0 } }));
    expect(at(flat, 20, 20)).toEqual(at(src, 20, 20));
    const soft = renderLumi(src, resolveProcessing({ filter: getFilter('original'), intensity: 0, retouch: { texture: -100 } }));
    const contrast = (p: Pixels) => Math.abs(at(p, 20, 20)[0] - at(p, 21, 20)[0]);
    expect(contrast(soft)).toBeLessThan(contrast(src) * 0.7);
  }, 30_000);
});

describe('face identity', () => {
  test('faces keep their ids when detection order changes', () => {
    const a = syntheticFace(-0.25, 'face-0');
    const b = syntheticFace(0.25, 'face-1');
    const anchors = { 'face-1': anchorOf(b, W, H) };
    // A new detection lists b first.
    const ids = assignFaceIds([b, a], anchors, W, H).map((f) => f.id);
    expect(ids).toEqual(['face-1', 'face-0']);
  });

  test("a face whose anchor is gone never takes another face's id", () => {
    const a = syntheticFace(-0.25);
    const b = syntheticFace(0.25);
    // Edits were on a face at b's place; only a is found now.
    const ids = assignFaceIds([a], { 'face-0': anchorOf(b, W, H) }, W, H).map((f) => f.id);
    expect(ids).toEqual(['face-1']);
  });

  test('without anchors, ids are detection order', () => {
    expect(assignFaceIds([syntheticFace(0.2), syntheticFace(-0.2)], {}, W, H).map((f) => f.id)).toEqual(['face-0', 'face-1']);
  });
});

describe('focus framing', () => {
  test('feature rects sit on their feature and are smaller than the face', () => {
    const face = focusRect(FACE, 'face', G, W, H);
    const nose = focusRect(FACE, 'nose', G, W, H);
    const tip = FACE.landmarks.nose.tip;
    expect(tip.x).toBeGreaterThan(nose.x);
    expect(tip.x).toBeLessThan(nose.x + nose.width);
    expect(tip.y).toBeGreaterThan(nose.y);
    expect(tip.y).toBeLessThan(nose.y + nose.height);
    expect(nose.width * W).toBeLessThan(face.width * W);
    // Square on screen.
    expect(nose.width * W).toBeCloseTo(nose.height * H, 5);
  });
});

const SOURCE: SourceImage = { uri: 'file:///docs/originals/original-2.jpg', width: W, height: H, origin: 'library', takenAt: 1 };

describe('per-face state', () => {
  beforeEach(() => useEditorStore.getState().open(SOURCE));

  test('values stay with their face, the anchor is stored once, one undo step per release', () => {
    const s = useEditorStore.getState();
    const anchor = anchorOf(FACE, W, H);
    s.setFaceRetouch('face-0', 'noseWing', 40, anchor);
    s.setFaceRetouch('face-0', 'noseWing', 60, { x: 0, y: 0, size: 1 });
    s.commit();
    s.setFaceRetouch('face-1', 'slim', 30);
    s.commit();
    const st = useEditorStore.getState();
    expect(st.present.faces['face-0']!.noseWing).toBe(60);
    expect(st.present.faces['face-0']!.slim).toBe(0);
    expect(st.present.faces['face-1']!.slim).toBe(30);
    expect(st.present.faceAnchors['face-0']).toEqual(anchor);
    st.undo();
    expect(useEditorStore.getState().present.faces['face-1']).toBeUndefined();
    expect(useEditorStore.getState().present.faces['face-0']!.noseWing).toBe(60);
  });

  test('projects saved before Phase 2 restore with every new control at 0', () => {
    const old = createEditState();
    const legacyFace: Partial<FaceRetouch> = { slim: 40, noseWing: 20 };
    const doc = { ...old, faces: { 'face-0': legacyFace }, retouch: { skin: 10, smooth: 0, tone: 0, glow: 0, detail: 0 } } as Record<string, unknown>;
    delete doc.faceAnchors;
    // A v1 project file, as Phase 2 wrote it.
    const json = JSON.stringify({
      version: 1,
      id: 'p',
      originalUri: SOURCE.uri,
      createdAt: 1,
      updatedAt: 1,
      source: SOURCE,
      document: doc,
    });
    const p = parseProject(json)!;
    expect(p.document.faceAnchors).toEqual({});
    expect(p.document.retouch.texture).toBe(0);
    expect(p.document.retouch.skin).toBe(10);
    expect(p.document.faces['face-0']).toEqual(completeFaceRetouch(legacyFace));
    expect(p.document.faces['face-0']!.eyeAngleL).toBe(0);
  });

  test('skin smoothing alone needs landmarks (feature protection); colour edits do not', () => {
    expect(needsFaces({ faces: {}, retouch: { ...DEFAULT_RETOUCH, skin: 20 } })).toBe(true);
    expect(needsFaces({ faces: {}, retouch: DEFAULT_RETOUCH })).toBe(false);
  });
});
