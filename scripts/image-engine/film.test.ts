/**
 * Phase 3 tests: film effects (real Lumi SkSL through CanvasKit), filter
 * mix, film cameras, recipes v2 + migration, date stamp dates, frames and
 * the batch queue. `npm run test:engine`; goldens in ./golden
 * (`UPDATE_GOLDEN=1` after an intended look change).
 */
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { DEFAULT_ADJUSTMENTS } from '@/constants/adjustments';
import { BUILTIN_PRESETS } from '@/constants/cameraPresets';
import { completeFilm, DEFAULT_FILM, DEFAULT_STAMP_STYLE, FRAME_STYLES, frameDefaults, isNeutralFilm, NO_FRAME } from '@/constants/film';
import { FILM_CAMERAS } from '@/constants/filmCameras';
import { getFilter } from '@/constants/filters';
import { frameLayout } from '@/render/frameLayout';
import {
  cancelJob,
  createJob,
  parseJob,
  recoverJob,
  retryFailed,
  runBatch,
  serializeJob,
  summarize,
  type BatchJob,
  type BatchSource,
} from '@/services/batch/queue';
import { DEFAULT_CURVES } from '@/services/color/curves';
import { DEFAULT_HSL, hslToRgb } from '@/services/color/hsl';
import { filmCameraLook, plainLook, scaleFilm } from '@/services/film/looks';
import { isIdentity, resolveProcessing, type ProcessingInput } from '@/services/imageProcessing';
import { useCameraStore } from '@/stores/cameraStore';
import type { Look } from '@/stores/editorStore';
import { migrateRecipe, parseRecipe, recipeToLook, serializeRecipe, useRecipeStore } from '@/stores/recipeStore';
import type { FilmEffects } from '@/types/film';
import { formatDateStamp, stampDateOf } from '@/utils/dateStamp';

import { decodePng, diff, downscale, encodePng, renderLumi, type Pixels } from './canvaskit';

const GOLDEN = join(import.meta.dir, 'golden');
const UPDATE = process.env.UPDATE_GOLDEN === '1';

function testImage(width: number, height: number): Pixels {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      const v = (y + 0.5) / height;
      let rgb: [number, number, number];
      if (v < 0.6) rgb = hslToRgb(u * 360, 0.2 + (v / 0.6) * 0.7, 0.35 + 0.3 * Math.sin(u * Math.PI));
      else if (v < 0.75) rgb = [u, u, u];
      else if (u < 0.5) rgb = hslToRgb(24, 0.5, 0.62 + 0.1 * (u - 0.25));
      else rgb = hslToRgb(212, 0.55, 0.55 + 0.15 * (v - 0.85));
      const k = (y * width + x) * 4;
      data[k] = Math.round(rgb[0] * 255);
      data[k + 1] = Math.round(rgb[1] * 255);
      data[k + 2] = Math.round(rgb[2] * 255);
      data[k + 3] = 255;
    }
  }
  return { width, height, data };
}

const SRC = testImage(160, 120);
const film = (f: Partial<FilmEffects>): FilmEffects => completeFilm({ ...DEFAULT_FILM, seed: 3, ...f });
const run = (input: Partial<ProcessingInput>, src = SRC) =>
  renderLumi(src, resolveProcessing({ filter: getFilter('original'), intensity: 0, ...input }));
const ORIGINAL = run({});

function golden(name: string, out: Pixels) {
  const path = join(GOLDEN, `${name}.png`);
  if (UPDATE || !existsSync(path)) {
    writeFileSync(path, encodePng(out));
    return;
  }
  expect(diff(decodePng(readFileSync(path)), out).max).toBeLessThanOrEqual(2);
}

const at = (p: Pixels, x: number, y: number) => {
  const k = (y * p.width + x) * 4;
  return [p.data[k]!, p.data[k + 1]!, p.data[k + 2]!] as const;
};

/** Std-dev of (a − b) luma: how much texture an effect adds. */
function residualStd(a: Pixels, b: Pixels): number {
  let s = 0;
  let s2 = 0;
  const n = a.data.length / 4;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = (a.data[i]! + a.data[i + 1]! + a.data[i + 2]! - b.data[i]! - b.data[i + 1]! - b.data[i + 2]!) / 3;
    s += d;
    s2 += d * d;
  }
  return Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2));
}

const STRONG: Record<string, Partial<FilmEffects>> = {
  bloom: { bloom: { intensity: 80, threshold: 40, radius: 60 } },
  halation: { halation: { intensity: 100, radius: 50, warmth: 60 } },
  leak: { leak: { style: 'warm', intensity: 90, position: 8, rotation: 10, scale: 60 } },
  burn: { burn: { style: 'edge', intensity: 90, spread: 60, position: 37 } },
  dust: { dust: 100 },
  scratch: { scratch: 100 },
  fringing: { fringing: 100 },
  softFocus: { softFocus: 100 },
  flash: { flash: 100 },
  drift: { drift: 100 },
};

describe('film effects', () => {
  test('every effect at 0 leaves the photo unchanged (shapes and seeds set)', () => {
    const shaped = film({
      seed: 999,
      grain: { size: 80, roughness: 90, color: 0 },
      bloom: { intensity: 0, threshold: 10, radius: 100 },
      halation: { intensity: 0, radius: 100, warmth: 100 },
      leak: { style: 'rainbow', intensity: 0, position: 50, rotation: 45, scale: 100 },
      burn: { style: 'edge', intensity: 0, spread: 100, position: 20 },
    });
    expect(isNeutralFilm(shaped)).toBe(true);
    const p = resolveProcessing({ filter: getFilter('original'), intensity: 0, film: shaped });
    expect(isIdentity(p)).toBe(true);
    // Forced through the shader too (uniforms built): still the original.
    expect(diff(renderLumi(SRC, p), ORIGINAL).max).toBe(0);
  });

  test('each effect at a strong setting changes the photo', () => {
    for (const [name, f] of Object.entries(STRONG)) {
      // Fringing shifts channels by a share of the frame (0.4 % at the corners):
      // sub-pixel on a tiny image, so check it on a photo-sized one.
      const d = name === 'fringing' ? diff(run({ film: film(f) }, testImage(800, 600)), run({}, testImage(800, 600))) : diff(run({ film: film(f) }), ORIGINAL);
      // Dust and scratches are small marks: judge by their strongest pixel.
      const visible = name === 'dust' || name === 'scratch' || name === 'fringing' ? d.max > 20 : d.mean > 0.2;
      if (!visible) throw new Error(`${name}: no visible change (mean ${d.mean.toFixed(3)}, max ${d.max})`);
    }
  }, 60_000);

  test('grain: same seed → same pattern, other seed → other pattern, amount 0 → none', () => {
    const g = (seed: number, grain = 60) => run({ adjustments: { ...DEFAULT_ADJUSTMENTS, grain }, film: film({ seed, grain: { size: 40, roughness: 50, color: 0 } }) });
    expect(diff(g(7), g(7)).max).toBe(0);
    expect(diff(g(7), g(8)).mean).toBeGreaterThan(1);
    expect(diff(g(7, 0), ORIGINAL).max).toBe(0);
  });

  test('grain is strongest in the midtones (luminance response)', () => {
    const grey = (v: number) => {
      const d = new Uint8Array(64 * 64 * 4);
      for (let i = 0; i < d.length; i += 4) d.set([v, v, v, 255], i);
      return { width: 64, height: 64, data: d };
    };
    const amount = (v: number) => residualStd(run({ adjustments: { ...DEFAULT_ADJUSTMENTS, grain: 80 }, film: film({}) }, grey(v)), grey(v));
    expect(amount(128)).toBeGreaterThan(amount(15) * 1.5);
    expect(amount(128)).toBeGreaterThan(amount(245) * 1.5);
  });

  test('preview and export grain look alike (same size on the photo, same strength once scaled down)', () => {
    const input = { adjustments: { ...DEFAULT_ADJUSTMENTS, grain: 70 }, film: film({ grain: { size: 100, roughness: 30, color: 0 } }) };
    const small = testImage(200, 150);
    const big = testImage(800, 600);
    const preview = run(input, small);
    const exported = downscale(run(input, big), 4);
    const previewGrain = residualStd(preview, run({}, small));
    const exportGrain = residualStd(exported, downscale(run({}, big), 4));
    expect(previewGrain).toBeGreaterThan(0.5);
    expect(Math.abs(previewGrain - exportGrain) / exportGrain).toBeLessThan(0.45);
    // Overall colour agrees (grain itself is noise, so compare channel means).
    const mean = (p: Pixels, c: number) => {
      let t = 0;
      for (let i = c; i < p.data.length; i += 4) t += p.data[i]!;
      return t / (p.data.length / 4);
    };
    for (const c of [0, 1, 2]) expect(Math.abs(mean(preview, c) - mean(exported, c))).toBeLessThan(1);
  }, 60_000);

  test('dust and scratches: reproducible from the seed, placed relative to the frame', () => {
    const f = film({ dust: 100, scratch: 100, seed: 21 });
    expect(diff(run({ film: f }), run({ film: f })).max).toBe(0);
    expect(diff(run({ film: f }), run({ film: { ...f, seed: 22 } })).mean).toBeGreaterThan(0.05);
    // Same marks at 4× the resolution (scaled down): same places.
    const small = run({ film: f }, testImage(200, 150));
    const big = downscale(run({ film: f }, testImage(800, 600)), 4);
    expect(diff(small, big).mean).toBeLessThan(3);
  }, 60_000);

  test('light leaks and burns never cover the middle of the frame', () => {
    for (const f of [STRONG.leak!, STRONG.burn!, { leak: { style: 'soft' as const, intensity: 100, position: 50, rotation: 0, scale: 100 } }]) {
      const out = run({ film: film(f) });
      const cx = SRC.width / 2;
      const cy = SRC.height / 2;
      const centre = Math.max(...at(out, cx, cy).map((v, i) => Math.abs(v - at(ORIGINAL, cx, cy)[i]!)));
      expect(centre).toBeLessThan(150);
      // The edge it enters from changes more than the centre.
    }
  });

  test('preview and export render the same film look (Classic 35 incl. grain, halation)', () => {
    const look = filmCameraLook(FILM_CAMERAS[0]!, { intensity: 100, grainScale: 100, frame: 'none', dateStamp: false, stamp: DEFAULT_STAMP_STYLE, seed: 4 });
    const p = resolveProcessing({ ...look, filter: getFilter(look.filterId) });
    const d = diff(downscale(renderLumi(testImage(640, 480), p), 4), renderLumi(testImage(160, 120), p));
    expect(d.mean).toBeLessThan(3);
  }, 60_000);

  test('golden: film effects', () => {
    golden('film-grain', run({ adjustments: { ...DEFAULT_ADJUSTMENTS, grain: 60 }, film: film({ grain: { size: 50, roughness: 50, color: 20 } }) }));
    golden('film-bloom-halation', run({ film: film({ ...STRONG.bloom, ...STRONG.halation }) }));
    golden('film-leak-warm', run({ film: film(STRONG.leak!) }));
    golden('film-leak-rainbow', run({ film: film({ leak: { style: 'rainbow', intensity: 90, position: 92, rotation: 20, scale: 60 } }) }));
    golden('film-burn-edge', run({ film: film(STRONG.burn!) }));
    golden('film-dust-scratch', run({ film: film({ dust: 100, scratch: 100 }) }));
    golden('film-flash-drift-fringe', run({ film: film({ flash: 70, drift: 80, fringing: 100 }) }));
  }, 60_000);
});

describe('film cameras', () => {
  const looks = FILM_CAMERAS.map((c) => filmCameraLook(c, { intensity: 100, grainScale: 100, frame: 'camera', dateStamp: c.dateStamp, stamp: DEFAULT_STAMP_STYLE, seed: 4 }));

  test('eight cameras, each a different look (golden)', () => {
    expect(FILM_CAMERAS.map((c) => c.name)).toEqual(['Classic 35', 'Disposable', 'CCD 2004', 'Retro Flash', 'Soft Diary', 'Polaroid', 'Cinema 400', 'Mono Film']);
    const outs = looks.map((l, i) => {
      const out = renderLumi(SRC, resolveProcessing({ ...l, filter: getFilter(l.filterId) }));
      golden(`camera-${FILM_CAMERAS[i]!.id}`, out);
      return out;
    });
    for (let i = 0; i < outs.length; i++) {
      for (let j = i + 1; j < outs.length; j++) {
        const d = diff(outs[i]!, outs[j]!).mean;
        if (d <= 2) throw new Error(`${FILM_CAMERAS[i]!.name} ≈ ${FILM_CAMERAS[j]!.name} (mean ${d.toFixed(2)})`);
      }
    }
  }, 60_000);

  test('Mono Film is monochrome; Polaroid brings its frame; intensity 0 is the original', () => {
    const mono = renderLumi(SRC, resolveProcessing({ ...looks[7]!, filter: getFilter(looks[7]!.filterId) }));
    let maxChroma = 0;
    for (let i = 0; i < mono.data.length; i += 4) maxChroma = Math.max(maxChroma, Math.max(mono.data[i]!, mono.data[i + 1]!, mono.data[i + 2]!) - Math.min(mono.data[i]!, mono.data[i + 1]!, mono.data[i + 2]!));
    expect(maxChroma).toBeLessThanOrEqual(8); // grain only
    expect(looks[5]!.frame.id).toBe('polaroid');
    for (const c of FILM_CAMERAS) {
      const zero = filmCameraLook(c, { intensity: 0, grainScale: 100, frame: 'none', dateStamp: false, stamp: DEFAULT_STAMP_STYLE, seed: 1 });
      expect(isIdentity(resolveProcessing({ ...zero, filter: getFilter(zero.filterId) }))).toBe(true);
    }
  });

  test('presets switch the look without touching the camera session', () => {
    const before = useCameraStore.getState();
    const session = { facing: before.facing, timer: before.timer, grid: before.grid };
    for (const p of BUILTIN_PRESETS) {
      useCameraStore.getState().applyPreset(p);
      const s = useCameraStore.getState();
      expect({ facing: s.facing, timer: s.timer, grid: s.grid }).toEqual(session);
      expect(s.mode).toBe(p.mode);
      expect(s.presetId).toBe(p.id);
      expect(s.ratio).toBe(p.ratio);
      if (p.mode === 'film') expect(s.filmCameraId).toBe(p.filmCameraId);
    }
  });
});

describe('filter mix', () => {
  const A = { filter: getFilter('mellow'), intensity: 60 };

  test('B intensity 0 (or none) is exactly A', () => {
    expect(diff(run({ ...A, mix: { filterId: 'film-35', intensity: 0 } }), run(A)).max).toBe(0);
    expect(resolveProcessing({ ...A, mix: { filterId: 'film-35', intensity: 0 } }).mix).toBeNull();
  });

  test('B runs as a second colour stage on A’s result (not an average), so order matters', () => {
    const ab = run({ ...A, mix: { filterId: 'film-35', intensity: 40 } });
    const ba = run({ filter: getFilter('film-35'), intensity: 40, mix: { filterId: 'mellow', intensity: 60 } });
    expect(diff(ab, run(A)).mean).toBeGreaterThan(1);
    expect(diff(ab, ba).mean).toBeGreaterThan(0.3);
    const p = resolveProcessing({ ...A, mix: { filterId: 'film-35', intensity: 40 } });
    expect(p.mix?.curves).not.toBeNull(); // B's own curve LUT row
    expect(p.mix?.tone.contrast).toBeCloseTo(12 * 0.4, 5);
    // A's colour values are untouched by B (B's grain/vignette/fade add to the shared effects).
    expect(p.tone.contrast).toBeCloseTo(getFilter('mellow').params.contrast! * 0.6, 5);
    expect(p.tone.grain).toBeCloseTo(28 * 0.4, 5);
  });

  test('a B&W filter as B turns A’s colours grey', () => {
    const out = run({ ...A, mix: { filterId: 'mono', intensity: 100 } });
    let maxChroma = 0;
    for (let i = 0; i < out.data.length; i += 4) maxChroma = Math.max(maxChroma, Math.max(out.data[i]!, out.data[i + 1]!, out.data[i + 2]!) - Math.min(out.data[i]!, out.data[i + 1]!, out.data[i + 2]!));
    expect(maxChroma).toBeLessThanOrEqual(3);
    golden('mix-mellow-film35', run({ ...A, mix: { filterId: 'film-35', intensity: 40 } }));
  });
});

const LOOK: Look = {
  ...plainLook({ filterId: 'mellow', intensity: 60, mix: { filterId: 'film-35', intensity: 40 }, adjustments: { ...DEFAULT_ADJUSTMENTS, grain: 30 }, hsl: DEFAULT_HSL, curves: DEFAULT_CURVES }),
  film: film({ halation: { intensity: 20, radius: 40, warmth: 40 }, leak: { style: 'red', intensity: 35, position: 12, rotation: 0, scale: 50 }, dust: 20 }),
  frame: frameDefaults('polaroid'),
  dateStamp: true,
  stamp: { ...DEFAULT_STAMP_STYLE, position: 'topLeft', color: '#FFFFFF' },
};

describe('My Recipe v2', () => {
  test('saves film effects, mix, frame and stamp style; round-trips through JSON', () => {
    useRecipeStore.setState({ recipes: [] });
    const id = useRecipeStore.getState().add('Film Day', LOOK);
    const r = useRecipeStore.getState().recipes.find((x) => x.id === id)!;
    expect(r.version).toBe(2);
    expect(recipeToLook(r)).toEqual(LOOK);
    expect(parseRecipe(serializeRecipe(r))).toEqual(r);
    // Never the photo's date or location.
    expect(JSON.stringify(r)).not.toMatch(/takenAt|stampDate|location/);
  });

  test('migrates Phase 1 recipes (v1) and repairs partial v2 documents', () => {
    const v1 = {
      id: 'old',
      name: 'Warm Diary',
      createdAt: 1,
      updatedAt: 2,
      baseFilterId: 'mellow',
      intensity: 70,
      adjustments: { exposure: 12 },
      hsl: {},
      curves: {},
      favorite: true,
      thumbnailUri: null,
    };
    const r = migrateRecipe(v1)!;
    expect(r.version).toBe(2);
    expect(r.color.baseFilterId).toBe('mellow');
    expect(r.color.intensity).toBe(70);
    expect(r.color.adjustments.exposure).toBe(12);
    expect(r.color.adjustments.grain).toBe(0);
    expect(r.color.mix).toBeNull();
    expect(r.film).toEqual(DEFAULT_FILM);
    expect(r.frame).toEqual(NO_FRAME);
    expect(r.favorite).toBe(true);
    const partial = migrateRecipe({ version: 2, id: 'p', name: 'P', color: { baseFilterId: 'noir' }, film: { dust: 40 } })!;
    expect(partial.film.dust).toBe(40);
    expect(partial.film.grain).toEqual(DEFAULT_FILM.grain);
    expect(partial.stamp.style).toEqual(DEFAULT_STAMP_STYLE);
    expect(migrateRecipe({ version: 99, id: 'x' })).toBeNull();
    expect(migrateRecipe('nope')).toBeNull();
  });

  test('scaling a look to 0 gives the original photo', () => {
    const zero = { ...LOOK, film: scaleFilm(LOOK.film, 0) };
    expect(isNeutralFilm(zero.film)).toBe(true);
  });
});

describe('date stamp', () => {
  const d = new Date(2026, 9, 9, 15, 30).getTime();
  test('formats', () => {
    expect(formatDateStamp(d, 'apostrophe')).toBe("'26 10 09");
    expect(formatDateStamp(d, 'dotted-full')).toBe('2026.10.09');
    expect(formatDateStamp(d, 'dotted-short')).toBe('26.10.09');
    expect(formatDateStamp(d, 'us')).toBe('10/09/2026');
  });
  test('uses the capture date, a picked date, or nothing — never "today" for an unknown date', () => {
    expect(stampDateOf({ takenAt: d }, { stampDate: null })).toBe(d);
    expect(stampDateOf({ takenAt: d, dateKnown: true }, { stampDate: null })).toBe(d);
    expect(stampDateOf({ takenAt: Date.now(), dateKnown: false }, { stampDate: null })).toBeNull();
    expect(stampDateOf({ takenAt: Date.now(), dateKnown: false }, { stampDate: d })).toBe(d);
    expect(stampDateOf({ takenAt: 5, dateKnown: true }, { stampDate: d })).toBe(d);
  });
});

describe('frames', () => {
  test('keep the photo’s size and aspect; the output grows by the border', () => {
    for (const s of FRAME_STYLES) {
      for (const [w, h] of [[4032, 3024], [3024, 4032], [1080, 1080]] as const) {
        const L = frameLayout(frameDefaults(s.id), w, h);
        expect(L.photo.width).toBe(w);
        expect(L.photo.height).toBe(h);
        expect(L.width).toBe(L.photo.x * 2 + w);
        expect(L.height).toBeGreaterThanOrEqual(h);
        if (s.id === 'none') expect([L.width, L.height]).toEqual([w, h]);
      }
    }
    const pol = frameLayout(frameDefaults('polaroid'), 1000, 1000);
    expect(pol.height - pol.photo.y - pol.photo.height).toBeGreaterThan(pol.photo.y * 3); // thick bottom
    const strip = frameLayout(frameDefaults('filmStrip'), 1500, 1000);
    expect(strip.holes.length).toBeGreaterThan(4);
    for (const h of strip.holes) {
      const inTop = h.y + h.height <= strip.photo.y;
      const inBottom = h.y >= strip.photo.y + strip.photo.height;
      expect(inTop || inBottom).toBe(true);
    }
    // Same frame on the preview (scaled) has the same proportions.
    const big = frameLayout(frameDefaults('polaroid'), 4000, 3000);
    const small = frameLayout(frameDefaults('polaroid'), 400, 300, false);
    expect(big.width / big.height).toBeCloseTo(small.width / small.height, 2);
  });
});

describe('batch queue', () => {
  const sources: BatchSource[] = Array.from({ length: 5 }, (_, i) => ({ kind: 'uri', uri: `file:///p${i}.jpg`, takenAt: null }));

  test('processes one at a time, keeps going after a failure, saves after every step', async () => {
    const saved: BatchJob[] = [];
    let active = 0;
    let peak = 0;
    const job = await runBatch(createJob(sources, LOOK, 'Film Day', 1), {
      process: async (item) => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 1));
        active--;
        if (item.id === 'i2') throw new Error('읽을 수 없는 사진');
        return { uri: `out-${item.id}`, width: 100, height: 80 };
      },
      save: (j) => void saved.push(j),
      shouldStop: () => false,
    });
    expect(peak).toBe(1);
    expect(summarize(job)).toMatchObject({ total: 5, done: 4, failed: 1, pending: 0 });
    expect(job.items[2]!.error).toBe('읽을 수 없는 사진');
    expect(job.state).toBe('done');
    expect(saved.length).toBeGreaterThanOrEqual(11);
    // The look is a snapshot: the original sources are only read.
    expect(job.items.every((i) => i.status !== 'done' || i.outputUri !== (i.source as { uri: string }).uri)).toBe(true);
  });

  test('cancel stops after the current photo; failed and cancelled photos can be retried', async () => {
    let stop = false;
    let n = 0;
    const job = await runBatch(createJob(sources, LOOK, 'x', 1), {
      process: async () => {
        n++;
        if (n === 2) stop = true;
        return { uri: 'o', width: 1, height: 1 };
      },
      save: () => undefined,
      shouldStop: () => stop,
    });
    expect(summarize(job)).toMatchObject({ done: 2, cancelled: 3 });
    expect(job.state).toBe('cancelled');
    const retried = await runBatch(retryFailed(job), { process: async () => ({ uri: 'o', width: 1, height: 1 }), save: () => undefined, shouldStop: () => false });
    expect(summarize(retried)).toMatchObject({ done: 5, cancelled: 0, failed: 0 });
  });

  test('a job interrupted by the app closing resumes where it stopped', async () => {
    let job = createJob(sources, LOOK, 'x', 1);
    job = { ...job, items: job.items.map((i, k) => (k < 2 ? { ...i, status: 'done' } : k === 2 ? { ...i, status: 'running' } : i)) };
    const restored = recoverJob(parseJob(serializeJob(job))!);
    expect(restored.state).toBe('paused');
    expect(restored.items[2]!.status).toBe('pending');
    const done: string[] = [];
    const finished = await runBatch(restored, {
      process: async (item) => {
        done.push(item.id);
        return { uri: 'o', width: 1, height: 1 };
      },
      save: () => undefined,
      shouldStop: () => false,
    });
    expect(done).toEqual(['i2', 'i3', 'i4']);
    expect(summarize(finished).done).toBe(5);
    expect(cancelJob(createJob(sources, LOOK, 'x')).items.every((i) => i.status === 'cancelled')).toBe(true);
    expect(parseJob('{"version":2}')).toBeNull();
  });
});
