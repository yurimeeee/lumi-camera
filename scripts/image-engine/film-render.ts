/**
 * Film contact sheets on real photos: `npm run render:film [photo ids…]`.
 *
 * Renders, with the real Lumi SkSL (CanvasKit), every film camera and every
 * film effect at a clear setting on the test photos downloaded by
 * `npm run check:face-warp` (.face-warp-cache/), and writes labelled-by-order
 * sheets to .face-warp-cache/renders/film-*.png for a human to look at.
 */
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { DEFAULT_ADJUSTMENTS } from '@/constants/adjustments';
import { completeFilm, DEFAULT_FILM, DEFAULT_STAMP_STYLE } from '@/constants/film';
import { FILM_CAMERAS } from '@/constants/filmCameras';
import { getFilter } from '@/constants/filters';
import { filmCameraLook } from '@/services/film/looks';
import { resolveProcessing, type ProcessingInput } from '@/services/imageProcessing';
import type { FilmEffects } from '@/types/film';

import { CK, encodePng, renderLumi, type Pixels } from './canvaskit';

const ROOT = join(import.meta.dir, '..', '..');
const CACHE = join(ROOT, '.face-warp-cache');
const OUT = join(CACHE, 'renders');
const LONG = Number(process.env.LONG_SIDE ?? 720);
const TILE = 300;
const COLS = 4;

if (!existsSync(join(CACHE, 'frontal.jpg'))) throw new Error('Run `npm run check:face-warp` first (downloads the test photos).');
mkdirSync(OUT, { recursive: true });

function load(path: string): Pixels {
  const img = CK.MakeImageFromEncoded(readFileSync(path));
  const s = Math.min(1, LONG / Math.max(img.width(), img.height()));
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

/** Fit the whole image into a TILE×TILE tile (letterboxed on white). */
function tile(p: Pixels): Pixels {
  const s = TILE / Math.max(p.width, p.height);
  const w = Math.round(p.width * s);
  const h = Math.round(p.height * s);
  const ox = Math.floor((TILE - w) / 2);
  const oy = Math.floor((TILE - h) / 2);
  const data = new Uint8Array(TILE * TILE * 4).fill(255);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.min(p.width - 1, Math.floor(x / s));
      const sy = Math.min(p.height - 1, Math.floor(y / s));
      data.set(p.data.subarray((sy * p.width + sx) * 4, (sy * p.width + sx) * 4 + 4), ((oy + y) * TILE + ox + x) * 4);
    }
  }
  return { width: TILE, height: TILE, data };
}

async function sheet(name: string, tiles: Pixels[], labels: string[]) {
  const rows = Math.ceil(tiles.length / COLS);
  const W = COLS * TILE;
  const out: Pixels = { width: W, height: rows * TILE, data: new Uint8Array(W * rows * TILE * 4).fill(255) };
  tiles.forEach((t, i) => {
    const ox = (i % COLS) * TILE;
    const oy = Math.floor(i / COLS) * TILE;
    for (let y = 0; y < TILE; y++) out.data.set(t.data.subarray(y * TILE * 4, (y + 1) * TILE * 4), ((oy + y) * W + ox) * 4);
  });
  const file = join(OUT, `film-${name}.png`);
  await Bun.write(file, encodePng(out));
  console.log(`${file}\n  ${labels.join(' · ')}`);
}

const film = (f: Partial<FilmEffects>): FilmEffects => completeFilm({ ...DEFAULT_FILM, seed: 3, ...f });
const base = (o: Partial<ProcessingInput> = {}) => resolveProcessing({ filter: getFilter('original'), intensity: 0, ...o });

const photos = process.argv.slice(2).length ? process.argv.slice(2) : ['frontal', 'three-quarter', 'long-hair'];
for (const id of photos) {
  const src = load(join(CACHE, `${id}.jpg`));

  // Film cameras
  const camTiles = [tile(renderLumi(src, base()))];
  const camLabels = ['Original'];
  for (const cam of FILM_CAMERAS) {
    const look = filmCameraLook(cam, { intensity: 100, grainScale: 100, frame: 'none', dateStamp: false, stamp: DEFAULT_STAMP_STYLE, seed: 5 });
    camTiles.push(tile(renderLumi(src, resolveProcessing({ ...look, filter: getFilter(look.filterId) }))));
    camLabels.push(cam.name);
  }
  await sheet(`${id}-cameras`, camTiles, camLabels);

  if (id !== photos[0]) continue;
  // Effects
  const cases: [string, ProcessingInput][] = [
    ['Original', { filter: getFilter('original'), intensity: 0 }],
    ['Grain 60 (size 60, rough 60)', { filter: getFilter('original'), intensity: 0, adjustments: { ...DEFAULT_ADJUSTMENTS, grain: 60 }, film: film({ grain: { size: 60, roughness: 60, color: 0 } }) }],
    ['Bloom 70', { filter: getFilter('original'), intensity: 0, film: film({ bloom: { intensity: 70, threshold: 55, radius: 60 } }) }],
    ['Halation 80', { filter: getFilter('original'), intensity: 0, film: film({ halation: { intensity: 80, radius: 50, warmth: 50 } }) }],
    ['Leak Warm', { filter: getFilter('original'), intensity: 0, film: film({ leak: { style: 'warm', intensity: 80, position: 8, rotation: 15, scale: 60 } }) }],
    ['Leak Red', { filter: getFilter('original'), intensity: 0, film: film({ leak: { style: 'red', intensity: 80, position: 30, rotation: 0, scale: 50 } }) }],
    ['Leak Orange', { filter: getFilter('original'), intensity: 0, film: film({ leak: { style: 'orange', intensity: 80, position: 55, rotation: -20, scale: 55 } }) }],
    ['Leak Soft', { filter: getFilter('original'), intensity: 0, film: film({ leak: { style: 'soft', intensity: 80, position: 80, rotation: 0, scale: 70 } }) }],
    ['Leak Rainbow', { filter: getFilter('original'), intensity: 0, film: film({ leak: { style: 'rainbow', intensity: 80, position: 92, rotation: 30, scale: 60 } }) }],
    ['Burn Soft', { filter: getFilter('original'), intensity: 0, film: film({ burn: { style: 'soft', intensity: 80, spread: 50, position: 62 } }) }],
    ['Burn Edge', { filter: getFilter('original'), intensity: 0, film: film({ burn: { style: 'edge', intensity: 80, spread: 50, position: 37 } }) }],
    ['Burn Warm', { filter: getFilter('original'), intensity: 0, film: film({ burn: { style: 'warm', intensity: 80, spread: 50, position: 87 } }) }],
    ['Dust 80', { filter: getFilter('original'), intensity: 0, film: film({ dust: 80 }) }],
    ['Scratch 90', { filter: getFilter('original'), intensity: 0, film: film({ scratch: 90 }) }],
    ['Fringing 100', { filter: getFilter('original'), intensity: 0, film: film({ fringing: 100 }) }],
    ['Soft focus 80', { filter: getFilter('original'), intensity: 0, film: film({ softFocus: 80 }) }],
    ['Flash 80', { filter: getFilter('original'), intensity: 0, film: film({ flash: 80 }) }],
    ['Drift 90', { filter: getFilter('original'), intensity: 0, film: film({ drift: 90 }) }],
    ['Mellow 100', { filter: getFilter('mellow'), intensity: 100 }],
    ['Mellow 60 → Film 35 40', { filter: getFilter('mellow'), intensity: 60, mix: { filterId: 'film-35', intensity: 40 } }],
  ];
  const fxTiles: Pixels[] = [];
  for (const [, input] of cases) fxTiles.push(tile(renderLumi(src, resolveProcessing(input))));
  for (let i = 0; i < fxTiles.length; i += 8) {
    await sheet(`${id}-effects-${i / 8 + 1}`, fxTiles.slice(i, i + 8), cases.slice(i, i + 8).map((c) => c[0]));
  }
}
