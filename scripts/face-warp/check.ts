/**
 * Face-warp regression check (macOS + Bun): `npm run check:face-warp`.
 *
 *  1. Downloads the test photos in photos.json (+ low-res / dark variants)
 *     into .face-warp-cache/ (not committed).
 *  2. Detects landmarks with the app's own FaceLandmarkDetector.swift
 *     (Apple Vision), built into a small CLI.
 *  3. For every face × control × ±100, checks the warp with the TS mirror of
 *     the shader: no folds, bounded skin stretch, background untouched,
 *     features kept rigid by proportion moves, slider 0 = no warp.
 *  4. Compiles the real Lumi SkSL with CanvasKit and checks that the shader
 *     samples exactly where the TS mirror says.
 *
 * Exits 1 when a threshold is exceeded.
 */
import { $ } from 'bun';
import { existsSync, mkdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import { DEFAULT_FACE_RETOUCH, FACE_RETOUCH_KEYS } from '@/constants/faceRetouch';
import { getFilter } from '@/constants/filters';
import { mid } from '@/services/faceDetection/landmarkMath';
import type { DetectedFace } from '@/services/faceDetection/types';
import { mapVisionFace } from '@/services/faceDetection/visionMapping';
import {
  buildFaceWarp,
  faceWarpUniforms,
  prepareFaceInputs,
  warpBackward,
  warpForward,
  type FaceWarpPlan,
} from '@/services/faceWarp/FaceWarpEngine';
import { buildFaceModel } from '@/services/faceWarp/mesh';
import { buildFaceRegions, prepareRegionInputs, regionRadius } from '@/services/faceWarp/regions';
import { buildUniforms, resolveProcessing } from '@/services/imageProcessing';
import { LUMI_SKSL } from '@/shaders/lumiShader';
import type { FaceRetouch, FaceRetouchKey, Geometry } from '@/types/editing';

// ── Thresholds (slider ±100) ────────────────────────────────────
const MIN_DET = 0.5; // backward Jacobian determinant: > 0 means no folds
const MAX_STRETCH = 0.36; // largest local magnification / squeeze of skin
const MAX_FEATURE_DISTORTION = 0.08; // eye / mouth / nose tip under proportion moves
const MAX_MIRROR_ERROR = 1; // px, shader vs TS (nearest-sample rounding)

const ROOT = join(import.meta.dir, '..', '..');
const HERE = import.meta.dir;
const CACHE = join(ROOT, '.face-warp-cache');
const G: Geometry = { rotation: 0, flipH: false, flipV: false, crop: null, aspect: 'original' };
const PROPORTION_KEYS: FaceRetouchKey[] = ['midface', 'faceLength', 'lowerFace', 'mouthPosition', 'nosePosition', 'eyePosition', 'philtrum'];

interface Photo {
  id: string;
  note: string;
  url: string;
  expectFaces?: number;
}

// ── CanvasKit ───────────────────────────────────────────────────
const CK_DIR = join(ROOT, 'node_modules/canvaskit-wasm/bin/full/');
const { default: CanvasKitInit } = await import(join(CK_DIR, 'canvaskit.js'));
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- CanvasKit's bundled types aren't loaded here
const CK: any = await CanvasKitInit({ locateFile: (f: string) => CK_DIR + f });

function decode(path: string) {
  const img = CK.MakeImageFromEncoded(readFileSync(path));
  if (!img) throw new Error(`cannot decode ${path}`);
  return img;
}

/** Writes a resized / darkened JPEG variant of `src`. */
async function variant(src: string, dst: string, scale: number, brightness: number) {
  const img = decode(src);
  const w = Math.round(img.width() * scale);
  const h = Math.round(img.height() * scale);
  const surface = CK.MakeSurface(w, h);
  const paint = new CK.Paint();
  paint.setColorFilter(CK.ColorFilter.MakeMatrix([brightness, 0, 0, 0, 0, 0, brightness, 0, 0, 0, 0, 0, brightness, 0, 0, 0, 0, 0, 1, 0]));
  surface.getCanvas().drawImageRectCubic(img, CK.XYWHRect(0, 0, img.width(), img.height()), CK.XYWHRect(0, 0, w, h), 1 / 3, 1 / 3, paint);
  surface.flush();
  await Bun.write(dst, surface.makeImageSnapshot().encodeToBytes(CK.ImageFormat.JPEG, 90));
  surface.delete();
}

// ── 1. Photos ───────────────────────────────────────────────────
mkdirSync(CACHE, { recursive: true });
const photos: Photo[] = JSON.parse(readFileSync(join(HERE, 'photos.json'), 'utf8'));
for (const p of photos) {
  const file = join(CACHE, `${p.id}.jpg`);
  if (existsSync(file)) continue;
  const res = await fetch(p.url, { headers: { 'User-Agent': 'LumiFaceWarpCheck/1.0' } });
  if (!res.ok) throw new Error(`download ${p.id}: ${res.status}`);
  await Bun.write(file, await res.arrayBuffer());
}
const frontal = join(CACHE, 'frontal.jpg');
if (!existsSync(join(CACHE, 'low-res.jpg'))) await variant(frontal, join(CACHE, 'low-res.jpg'), 0.25, 1);
if (!existsSync(join(CACHE, 'dark.jpg'))) await variant(frontal, join(CACHE, 'dark.jpg'), 1, 0.18);
photos.push({ id: 'low-res', note: '320px', url: '' }, { id: 'dark', note: '밝기 18%', url: '' });

// ── 2. Landmarks (Apple Vision) ─────────────────────────────────
const detectorSrc = join(ROOT, 'modules/lumi-face-landmarks/ios/FaceLandmarkDetector.swift');
const bin = join(CACHE, 'vision-detect');
const stale = !existsSync(bin) || statSync(bin).mtimeMs < Math.max(statSync(detectorSrc).mtimeMs, statSync(join(HERE, 'vision', 'main.swift')).mtimeMs);
if (stale) await $`swiftc -O ${detectorSrc} ${join(HERE, 'vision', 'main.swift')} -o ${bin}`.quiet();
const files = photos.map((p) => join(CACHE, `${p.id}.jpg`));
const vision = JSON.parse(await $`${bin} ${files}`.text());

const failures: string[] = [];
const fail = (msg: string) => failures.push(msg);

function facesOf(p: Photo, w: number, h: number): DetectedFace[] {
  const raw = vision[`${p.id}.jpg`];
  if (raw?.error) throw new Error(`${p.id}: ${raw.error}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON from the Swift CLI
  return (raw.faces as any[]).flatMap((f) => mapVisionFace(f, h / w) ?? []).map((f, i) => ({ ...f, id: `face-${i}` }));
}

// ── 3. Warp metrics ─────────────────────────────────────────────
type Box = { x0: number; y0: number; x1: number; y1: number };

function svd(a: number, b: number, c: number, d: number) {
  const s1 = Math.sqrt((a * a + b * b + c * c + d * d + Math.sqrt(((a - d) ** 2 + (b + c) ** 2) * ((a + d) ** 2 + (b - c) ** 2))) / 2);
  return [s1, Math.abs(a * d - b * c) / (s1 || 1)] as const;
}

function jacobian(plan: FaceWarpPlan, x: number, y: number) {
  const p = warpBackward({ x, y }, plan);
  const px = warpBackward({ x: x + 1, y }, plan);
  const py = warpBackward({ x, y: y + 1 }, plan);
  return [px.x - p.x, py.x - p.x, px.y - p.y, py.y - p.y] as const;
}

function analyse(plan: FaceWarpPlan, W: number, H: number, near: Box, far: Box) {
  let minDet = Infinity;
  let stretch = 0;
  let bg = 0;
  const step = Math.max(1, Math.round((near.x1 - near.x0) / 200));
  for (let y = Math.max(1, near.y0); y < Math.min(H - 1, near.y1); y += step) {
    for (let x = Math.max(1, near.x0); x < Math.min(W - 1, near.x1); x += step) {
      const [a, b, c, d] = jacobian(plan, x, y);
      minDet = Math.min(minDet, a * d - b * c);
      const [s1, s2] = svd(a, b, c, d);
      stretch = Math.max(stretch, Math.abs(1 / s1 - 1), Math.abs(1 / s2 - 1));
    }
  }
  for (let y = 0; y < H; y += 7) {
    for (let x = 0; x < W; x += 7) {
      if (x > far.x0 && x < far.x1 && y > far.y0 && y < far.y1) continue;
      const q = warpBackward({ x, y }, plan);
      bg = Math.max(bg, Math.hypot(q.x - x, q.y - y));
    }
  }
  return { minDet, stretch, bg };
}

/** Distortion of the content that ends up around `p` (0 = moved rigidly). */
function featureDistortion(plan: FaceWarpPlan, p: { x: number; y: number }) {
  const q = warpForward(p, plan);
  const [s1, s2] = svd(...jacobian(plan, q.x, q.y));
  return Math.max(Math.abs(s1 - 1), Math.abs(s2 - 1));
}

const worst = { det: Infinity, stretch: 0, bg: 0, feature: 0 };
const rows: string[] = [];
let cases = 0;
for (const p of photos) {
  const img = decode(join(CACHE, `${p.id}.jpg`));
  const W = img.width();
  const H = img.height();
  img.delete();
  const faces = facesOf(p, W, H);
  const expected = p.expectFaces;
  if (expected !== undefined ? faces.length !== expected : faces.length === 0) {
    fail(`${p.id}: expected ${expected ?? '≥1'} faces, found ${faces.length}`);
  }
  if (faces.length === 0) {
    rows.push(`${p.id.padEnd(15)} faces=0  (${p.note})`);
    continue;
  }
  if (buildFaceWarp(prepareFaceInputs(faces, { 'face-0': { ...DEFAULT_FACE_RETOUCH } }, G), W, H) !== null) {
    fail(`${p.id}: sliders at 0 still produce a warp`);
  }
  const fb = faces[0]!.bounds;
  const fw = fb.width * W;
  const fh = fb.height * H;
  const near: Box = { x0: Math.floor(fb.x * W - fw * 0.6), y0: Math.floor(fb.y * H - fh * 0.4), x1: Math.ceil(fb.x * W + fw * 1.6), y1: Math.ceil(fb.y * H + fh * 1.5) };
  const far: Box = { x0: fb.x * W - fw, y0: fb.y * H - fh * 0.9, x1: fb.x * W + fw * 2, y1: fb.y * H + fh * 2 };
  const model = buildFaceModel(prepareFaceInputs(faces, { 'face-0': { ...DEFAULT_FACE_RETOUCH, slim: 1 } }, G)[0]!.landmarks, W, H)!;
  const local = { det: Infinity, stretch: 0, bg: 0, feature: 0, worstKey: '' };
  for (const key of FACE_RETOUCH_KEYS) {
    for (const v of [100, -100]) {
      const plan = buildFaceWarp(prepareFaceInputs(faces, { 'face-0': { ...DEFAULT_FACE_RETOUCH, [key]: v } }, G), W, H);
      if (!plan) continue;
      cases++;
      const m = analyse(plan, W, H, near, far);
      const tag = `${p.id} ${key}=${v}`;
      if (m.minDet < MIN_DET) fail(`${tag}: fold risk, det ${m.minDet.toFixed(3)}`);
      if (m.stretch > MAX_STRETCH) fail(`${tag}: stretch ${(m.stretch * 100).toFixed(1)}%`);
      if (m.bg > 0) fail(`${tag}: background moved ${m.bg.toFixed(2)}px`);
      if (m.stretch > local.stretch) local.worstKey = `${key}=${v}`;
      local.det = Math.min(local.det, m.minDet);
      local.stretch = Math.max(local.stretch, m.stretch);
      local.bg = Math.max(local.bg, m.bg);
      if (PROPORTION_KEYS.includes(key)) {
        for (const [name, pt] of [['eye', model.eyes[0].center], ['mouth', model.lips.center], ['nose tip', model.nose.tip]] as const) {
          const d = featureDistortion(plan, pt);
          local.feature = Math.max(local.feature, d);
          if (d > MAX_FEATURE_DISTORTION) fail(`${tag}: ${name} distorted ${(d * 100).toFixed(1)}%`);
        }
      }
    }
  }
  worst.det = Math.min(worst.det, local.det);
  worst.stretch = Math.max(worst.stretch, local.stretch);
  worst.bg = Math.max(worst.bg, local.bg);
  worst.feature = Math.max(worst.feature, local.feature);
  rows.push(
    `${p.id.padEnd(15)} faces=${faces.length}  minDet=${local.det.toFixed(2)}  stretch=${(local.stretch * 100).toFixed(1).padStart(4)}% (${local.worstKey})  ` +
      `features=${(local.feature * 100).toFixed(1)}%  bg=${local.bg.toFixed(1)}px  (${p.note})`,
  );
}

// ── 4. Skin regions sit on their features (real landmarks) ──────
const TONE: Partial<FaceRetouch> = { darkCircle: 100, underEye: 100, wrinkle: 100, redness: 100, teeth: 100, eyeBright: 100 };
let regionCases = 0;
for (const p of photos) {
  const img = decode(join(CACHE, `${p.id}.jpg`));
  const W = img.width();
  const H = img.height();
  img.delete();
  const faces = facesOf(p, W, H);
  const edits = Object.fromEntries(faces.map((f) => [f.id, { ...DEFAULT_FACE_RETOUCH, ...TONE }]));
  const all = buildFaceRegions(prepareRegionInputs(faces, edits, G), W, H, true);
  for (const f of faces) {
    const lm = f.landmarks;
    const at = (q: { x: number; y: number }) => ({ x: q.x * W, y: q.y * H });
    const near = all.filter((q) => Math.hypot(q.c.x - at(lm.nose.tip).x, q.c.y - at(lm.nose.tip).y) < f.bounds.width * W);
    const tag = `${p.id} ${f.id}`;
    regionCases++;
    const inside = (kind: string, q: { x: number; y: number }, limit = 1) => near.some((r) => r.kind === kind && regionRadius(at(q), r) < limit);
    // Features are protected; skin between them is not.
    for (const [name, q] of [['left eye', lm.leftEye.center], ['right eye', lm.rightEye.center], ['mouth', lm.lips.center], ['left nostril', lm.nose.leftNostril]] as const) {
      if (!inside('protect', q, 0.9)) fail(`${tag}: ${name} not protected`);
    }
    if (inside('protect', mid(lm.leftCheek, lm.nose.leftWing), 1)) fail(`${tag}: cheek protected (smoothing would skip it)`);
    // Eye tools: on the eye opening, not the brow.
    if (!inside('eye', lm.leftEye.center, 0.8) || !inside('eye', lm.rightEye.center, 0.8)) fail(`${tag}: eye region misses the iris`);
    if (lm.leftEyebrow.some((q) => inside('eye', q))) fail(`${tag}: eye region reaches the brow`);
    // Dark circle: below each eye, not on it. Where the hollow is gets
    // checked on faces turned less than ~50° (eye widths within 1.6×); on a
    // near-profile face the far side's landmarks are too sparse to say.
    const ew = (e: typeof lm.leftEye) => Math.hypot((e.outer.x - e.inner.x) * W, (e.outer.y - e.inner.y) * H);
    const ratio = Math.max(ew(lm.leftEye), ew(lm.rightEye)) / Math.max(1e-6, Math.min(ew(lm.leftEye), ew(lm.rightEye)));
    for (const e of [lm.leftEye, lm.rightEye]) {
      if (inside('underEye', e.center)) fail(`${tag}: under-eye region covers the eye`);
      if (ratio > 1.6) continue;
      // The hollow: a quarter of the way from the lowest lid point down to
      // the alae, along the face's own vertical (tilted faces).
      const a = at(lm.leftEye.center);
      const b = at(lm.rightEye.center);
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      let down = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
      const m = at(lm.lips.center);
      if ((m.x - a.x) * down.x + (m.y - a.y) * down.y < 0) down = { x: -down.x, y: -down.y };
      const depth = (q: { x: number; y: number }) => at(q).x * down.x + at(q).y * down.y;
      const lid = e.lowerLid.reduce((p, q) => (depth(q) > depth(p) ? q : p), e.center);
      const step = (depth(mid(lm.nose.leftWing, lm.nose.rightWing)) - depth(lid)) * 0.25;
      const below = { x: (at(lid).x + down.x * step) / W, y: (at(lid).y + down.y * step) / H };
      if (!inside('underEye', below)) fail(`${tag}: under-eye region misses the hollow`);
    }
    // Teeth: inside the lips, never past them.
    const mouth = near.filter((r) => r.kind === 'mouth');
    for (const r of mouth) {
      if (regionRadius(at(lm.nose.base), r) < 1 || regionRadius(at(lm.chin), r) < 1) fail(`${tag}: teeth region leaves the mouth`);
    }
  }
}

// ── 5. Shader compiles and matches the TS mirror ────────────────
const effect = CK.RuntimeEffect.Make(LUMI_SKSL, (e: string) => fail(`SkSL: ${e}`));
let mirrorError = -1;
if (effect) {
  const img = decode(frontal);
  const W = img.width();
  const H = img.height();
  img.delete();
  const faces = facesOf(photos[0]!, W, H);
  const r = { ...DEFAULT_FACE_RETOUCH, slim: 100, jaw: 60, noseWing: 100, eyeWidth: 100, eyeAngle: 100, nostril: -60, lipWidth: 100, mouthCorner: 60, midface: -100 };
  const plan = buildFaceWarp(prepareFaceInputs(faces, { 'face-0': r }, G), W, H)!;
  const values = { ...buildUniforms(resolveProcessing({ filter: getFilter('original'), intensity: 0 }), W, H, faceWarpUniforms(plan)), uReshape: 0 } as Record<string, number | number[]>;
  const flat = new Float32Array(effect.getUniformFloatCount());
  for (let i = 0; i < effect.getUniformCount(); i++) {
    const v = values[effect.getUniformName(i)];
    if (v === undefined) fail(`uniform ${effect.getUniformName(i)} missing`);
    else flat.set(typeof v === 'number' ? [v] : v, effect.getUniform(i).slot);
  }
  const info = { alphaType: CK.AlphaType.Opaque, colorType: CK.ColorType.RGBA_8888, colorSpace: CK.ColorSpace.SRGB };
  const neutral = CK.MakeImage({ width: 1, height: 1, ...info }, new Uint8Array([128, 0, 0, 255]), 4);
  // Coordinate images: R = high byte, G = low byte of x (or y), sampled nearest.
  const sampled = (axis: 0 | 1) => {
    const px = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const v = axis ? y : x;
        const k = (y * W + x) * 4;
        px[k] = v >> 8;
        px[k + 1] = v & 255;
        px[k + 3] = 255;
      }
    }
    const coords = CK.MakeImage({ width: W, height: H, ...info }, px, W * 4);
    const n = neutral.makeShaderCubic(CK.TileMode.Clamp, CK.TileMode.Clamp, 1, 0);
    const shader = effect.makeShaderWithChildren(flat, [coords.makeShaderOptions(CK.TileMode.Clamp, CK.TileMode.Clamp, CK.FilterMode.Nearest, CK.MipmapMode.None), n, n, n, n, n, n]);
    const surface = CK.MakeSurface(W, H);
    const paint = new CK.Paint();
    paint.setShader(shader);
    surface.getCanvas().drawRect(CK.XYWHRect(0, 0, W, H), paint);
    surface.flush();
    const out = surface.makeImageSnapshot().readPixels(0, 0, { width: W, height: H, ...info, alphaType: CK.AlphaType.Unpremul }) as Uint8Array;
    surface.delete();
    return out;
  };
  const gx = sampled(0);
  const gy = sampled(1);
  mirrorError = 0;
  for (let y = 0; y < H; y += 3) {
    for (let x = 0; x < W; x += 3) {
      const k = (y * W + x) * 4;
      const q = warpBackward({ x: x + 0.5, y: y + 0.5 }, plan);
      const e = Math.max(Math.abs(Math.floor(q.x) - (gx[k]! * 256 + gx[k + 1]!)), Math.abs(Math.floor(q.y) - (gy[k]! * 256 + gy[k + 1]!)));
      mirrorError = Math.max(mirrorError, e);
    }
  }
  if (mirrorError > MAX_MIRROR_ERROR) fail(`shader and TS mirror disagree by ${mirrorError}px`);
}

// ── Report ──────────────────────────────────────────────────────
console.log(rows.join('\n'));
console.log(
  `\n${cases} cases · minDet ${worst.det.toFixed(2)} (> ${MIN_DET}) · stretch ${(worst.stretch * 100).toFixed(1)}% (≤ ${MAX_STRETCH * 100}%) · ` +
    `features ${(worst.feature * 100).toFixed(1)}% (≤ ${MAX_FEATURE_DISTORTION * 100}%) · background ${worst.bg.toFixed(1)}px · shader↔TS ${mirrorError}px · ` +
    `skin regions on ${regionCases} faces`,
);
if (failures.length) {
  console.error(`\n✗ ${failures.length} failure(s):\n  ${failures.slice(0, 30).join('\n  ')}`);
  process.exit(1);
}
console.log('✓ face warp checks passed');
