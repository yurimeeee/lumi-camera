/**
 * Face retouch contact sheets on real photos (macOS + Bun):
 * `npm run render:face-retouch [photo ids…]`.
 *
 * Uses the photos and Apple Vision landmarks of `npm run check:face-warp`
 * (run it once first) and renders, with the real Lumi SkSL (CanvasKit), the
 * first face before and after each control at a strong setting, framed on
 * the feature the control acts on. Writes one PNG per photo to
 * .face-warp-cache/renders/ — before/after pairs, left to right, top to
 * bottom in the order printed — for a human to look at.
 *
 * Env: ONLY=<label substring> renders only matching cases; FOCUS=<target>
 * frames every case on one feature (eyeL, eyeR, eyes, nose, mouth, face).
 *
 * Also checks that tone-only tools (dark circle, wrinkle, redness, teeth,
 * eye brightness, 애교살) change nothing outside their landmark regions.
 */
import { $ } from 'bun';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { DEFAULT_RETOUCH } from '@/constants/adjustments';
import { DEFAULT_FACE_RETOUCH } from '@/constants/faceRetouch';
import { getFilter } from '@/constants/filters';
import { focusRect, type FocusTarget } from '@/services/faceDetection/featureFocus';
import type { DetectedFace } from '@/services/faceDetection/types';
import { mapVisionFace } from '@/services/faceDetection/visionMapping';
import { faceRender } from '@/services/faceWarp/faceRender';
import { buildFaceRegions, prepareRegionInputs, regionRadius, type Region } from '@/services/faceWarp/regions';
import { resolveProcessing } from '@/services/imageProcessing';
import type { FaceRetouch, Geometry, Retouch } from '@/types/editing';

import { CK, encodePng, renderLumi, type Pixels } from '../image-engine/canvaskit';

const ROOT = join(import.meta.dir, '..', '..');
const CACHE = join(ROOT, '.face-warp-cache');
const OUT = join(CACHE, 'renders');
const G: Geometry = { rotation: 0, flipH: false, flipV: false, crop: null, aspect: 'original' };
/** Renders at this long side (the shader is resolution-independent). */
const LONG_SIDE = Number(process.env.LONG_SIDE ?? 900);
const TILE = 300;
/** Before/after pairs per row. */
const PAIRS = 2;

interface Case {
  label: string;
  focus: FocusTarget;
  face?: Partial<FaceRetouch>;
  skin?: Partial<Retouch>;
}

const CASES: Case[] = [
  { label: '갸름하게 100', focus: 'face', face: { slim: 100 } },
  { label: '턱 100', focus: 'face', face: { jaw: 100 } },
  { label: 'V라인 100', focus: 'face', face: { vLine: 100 } },
  { label: '중안부 -100', focus: 'face', face: { midface: -100 } },
  { label: '중안부 +100', focus: 'face', face: { midface: 100 } },
  { label: '콧볼 100', focus: 'nose', face: { noseWing: 100 } },
  { label: '콧구멍 -100', focus: 'nose', face: { nostril: -100 } },
  { label: '눈 길이 100', focus: 'eyes', face: { eyeWidth: 100 } },
  { label: '눈 각도 +100', focus: 'eyes', face: { eyeAngle: 100 } },
  { label: '눈 각도 -100', focus: 'eyes', face: { eyeAngle: -100 } },
  { label: '눈 크기 (L만) 100', focus: 'eyes', face: { eyeSizeL: 100 } },
  { label: '입 너비 100', focus: 'mouth', face: { lipWidth: 100 } },
  { label: '입 위치 100', focus: 'face', face: { mouthPosition: 100 } },
  { label: '입꼬리 +100', focus: 'mouth', face: { mouthCorner: 100 } },
  { label: '인중 -100', focus: 'mouth', face: { philtrum: -100 } },
  { label: '매끈하게 100 (보호)', focus: 'face', skin: { skin: 100, smooth: 60 } },
  { label: '피부결 -100', focus: 'eyes', skin: { texture: -100 } },
  { label: '다크서클 100', focus: 'eyes', face: { darkCircle: 100 } },
  { label: '애교살 100', focus: 'eyes', face: { underEye: 100 } },
  { label: '주름 100', focus: 'face', face: { wrinkle: 100 } },
  { label: '홍조 100', focus: 'face', face: { redness: 100 } },
  { label: '치아 미백 100', focus: 'mouth', face: { teeth: 100 } },
  { label: '눈 밝게 100', focus: 'eyes', face: { eyeBright: 100 } },
];

const ONLY = process.env.ONLY;
const FOCUS = process.env.FOCUS as FocusTarget | undefined;
const SELECTED = ONLY ? CASES.filter((c) => ONLY.split(',').some((o) => c.label.includes(o))) : CASES;

const TONE_ONLY = new Set(['darkCircle', 'underEye', 'wrinkle', 'redness', 'teeth', 'eyeBright']);

const bin = join(CACHE, 'vision-detect');
if (!existsSync(bin)) throw new Error('Run `npm run check:face-warp` first (downloads photos, builds the detector).');
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['frontal', 'three-quarter', 'group', 'glasses', 'looking-up'];
const vision = JSON.parse(await $`${bin} ${ids.map((id) => join(CACHE, `${id}.jpg`))}`.text());
mkdirSync(OUT, { recursive: true });

function load(path: string): Pixels {
  const img = CK.MakeImageFromEncoded(readFileSync(path));
  const s = Math.min(1, LONG_SIDE / Math.max(img.width(), img.height()));
  const w = Math.round(img.width() * s);
  const h = Math.round(img.height() * s);
  const surface = CK.MakeSurface(w, h);
  surface.getCanvas().drawImageRectCubic(img, CK.XYWHRect(0, 0, img.width(), img.height()), CK.XYWHRect(0, 0, w, h), 1 / 3, 1 / 3, null);
  surface.flush();
  const info = { width: w, height: h, alphaType: CK.AlphaType.Unpremul, colorType: CK.ColorType.RGBA_8888, colorSpace: CK.ColorSpace.SRGB };
  const data = surface.makeImageSnapshot().readPixels(0, 0, info) as Uint8Array;
  surface.delete();
  img.delete();
  return { width: w, height: h, data };
}

function crop(p: Pixels, x0: number, y0: number, size: number): Pixels {
  const data = new Uint8Array(TILE * TILE * 4);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const sx = Math.min(p.width - 1, Math.max(0, Math.round(x0 + (x / TILE) * size)));
      const sy = Math.min(p.height - 1, Math.max(0, Math.round(y0 + (y / TILE) * size)));
      data.set(p.data.subarray((sy * p.width + sx) * 4, (sy * p.width + sx) * 4 + 4), (y * TILE + x) * 4);
    }
  }
  return { width: TILE, height: TILE, data };
}

function inAnyRegion(x: number, y: number, regions: readonly Region[]): boolean {
  for (const q of regions) {
    if (regionRadius({ x, y }, q) < 1) return true;
    // 애교살 also shades a band just below its ellipse.
    if (q.kind === 'aegyo') {
      const ay = { x: -q.axis.y, y: q.axis.x };
      if (regionRadius({ x: x - ay.x * q.ry * 1.8, y: y - ay.y * q.ry * 1.8 }, q) < 1) return true;
    }
  }
  return false;
}

let failures = 0;
for (const id of ids) {
  const src = load(join(CACHE, `${id}.jpg`));
  const W = src.width;
  const H = src.height;
  const raw = vision[`${id}.jpg`];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON from the Swift CLI
  const faces: DetectedFace[] = (raw.faces as any[]).flatMap((f) => mapVisionFace(f, H / W) ?? []).map((f, i) => ({ ...f, id: `face-${i}` }));
  if (!faces.length) {
    console.log(`${id}: no face`);
    continue;
  }
  const tiles: Pixels[] = [];
  const frame = (target: FocusTarget) => {
    const r = focusRect(faces[0]!, target, G, W, H);
    const size = Math.max(r.width * W, r.height * H);
    return { x0: (r.x + r.width / 2) * W - size / 2, y0: (r.y + r.height / 2) * H - size / 2, size };
  };
  const base = renderLumi(src, resolveProcessing({ filter: getFilter('original'), intensity: 0 }));
  for (const c of SELECTED) {
    const edit: { faces: Record<string, FaceRetouch>; retouch: Retouch } = {
      faces: c.face ? { 'face-0': { ...DEFAULT_FACE_RETOUCH, ...c.face } } : {},
      retouch: { ...DEFAULT_RETOUCH, ...c.skin },
    };
    const fr = faceRender(faces, edit, G, W, H);
    const p = resolveProcessing({ filter: getFilter('original'), intensity: 0, retouch: edit.retouch });
    const out = renderLumi(src, p, { ...fr.warp, ...fr.regions });
    const f = frame(FOCUS ?? c.focus);
    tiles.push(crop(base, f.x0, f.y0, f.size), crop(out, f.x0, f.y0, f.size));

    // Tone tools: nothing may change outside their regions.
    const key = c.face ? Object.keys(c.face)[0]! : '';
    if (TONE_ONLY.has(key)) {
      const regions = buildFaceRegions(prepareRegionInputs(faces, edit.faces, G), W, H, false).filter((q) => q.kind !== 'protect');
      let outside = 0;
      let inside = 0;
      const hist = new Array<number>(256).fill(0);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const k = (y * W + x) * 4;
          const d = Math.max(Math.abs(out.data[k]! - base.data[k]!), Math.abs(out.data[k + 1]! - base.data[k + 1]!), Math.abs(out.data[k + 2]! - base.data[k + 2]!));
          if (inAnyRegion(x + 0.5, y + 0.5, regions)) {
            inside = Math.max(inside, d);
            hist[d]!++;
          } else outside = Math.max(outside, d);
        }
      }
      const ok = outside === 0;
      if (!ok) failures++;
      const changed = hist.slice(1).reduce((a, b) => a + b, 0);
      let acc = 0;
      let p99 = 0;
      for (let v = 1; v < 256 && changed; v++) {
        acc += hist[v]!;
        if (acc >= changed * 0.99) {
          p99 = v;
          break;
        }
      }
      console.log(
        `${id.padEnd(14)} ${c.label.padEnd(14)} inside: ${String(changed).padStart(6)} px changed, p99 ${String(p99).padStart(3)}, max ${String(inside).padStart(3)}  outside: max ${outside} ${ok ? '✓' : '✗'}`,
      );
    }
  }
  // Sheets of a few rows each, so they stay legible.
  const columns = PAIRS * 2;
  const gap = 12;
  const perSheet = columns * 3;
  for (let n = 0; n * perSheet < tiles.length; n++) {
    const part = tiles.slice(n * perSheet, (n + 1) * perSheet);
    const rows = Math.ceil(part.length / columns);
    const sheetW = columns * TILE + (PAIRS - 1) * gap;
    const sheet: Pixels = { width: sheetW, height: rows * TILE, data: new Uint8Array(sheetW * rows * TILE * 4).fill(255) };
    part.forEach((t, i) => {
      const col = i % columns;
      const ox = col * TILE + Math.floor(col / 2) * gap;
      const oy = Math.floor(i / columns) * TILE;
      for (let y = 0; y < TILE; y++) sheet.data.set(t.data.subarray(y * TILE * 4, (y + 1) * TILE * 4), ((oy + y) * sheet.width + ox) * 4);
    });
    const file = join(OUT, `${id}-${n + 1}.png`);
    await Bun.write(file, encodePng(sheet));
    console.log(`${id}: ${file}  (${SELECTED.slice(n * perSheet / 2, (n + 1) * perSheet / 2).map((c) => c.label).join(' · ')})`);
  }
}
if (failures) {
  console.error(`✗ ${failures} tone tool(s) changed pixels outside their regions`);
  process.exit(1);
}
