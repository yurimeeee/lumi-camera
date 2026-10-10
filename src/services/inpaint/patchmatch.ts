/**
 * Exemplar-based inpainting: multi-scale PatchMatch with EM voting
 * (Wexler, Shechtman & Irani 2007 "Space-Time Completion"; Barnes et al. 2009
 * "PatchMatch") — the family of algorithms behind content-aware fill.
 *
 * The hole is filled with real patches copied from the rest of the image,
 * coarse to fine: at each scale every patch touching the hole finds its most
 * similar patch in the known area (PatchMatch: random init, propagation,
 * random search), then each hole pixel becomes the weighted vote of the
 * patches covering it. Structure is settled at coarse scales, texture at
 * fine ones. Pure TypeScript (typed arrays), deterministic for a seed — it
 * runs the same on iOS (Hermes), in the browser and in the tests.
 *
 * Works best for small and medium objects on texture / repeating
 * backgrounds; it cannot invent structure that appears nowhere else in the
 * image (large objects over complex scenes need a learned model).
 */

export interface InpaintImage {
  width: number;
  height: number;
  /** RGB, 3 bytes per pixel. */
  rgb: Uint8Array;
  /** 1 = hole (to fill), 0 = known. */
  mask: Uint8Array;
}

export interface InpaintOptions {
  seed?: number;
  /** 0…1, called between steps. */
  onProgress?: (p: number) => void;
  /** Return true to stop (throws `InpaintCancelled`). */
  shouldCancel?: () => boolean;
}

export class InpaintCancelled extends Error {
  constructor() {
    super('cancelled');
  }
}

interface Level {
  w: number;
  h: number;
  /** Float RGB. */
  img: Float32Array;
  hole: Uint8Array;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 2× downsample: colour averages known pixels; a cell is a hole if more than a quarter of it is. */
function downsample(l: Level): Level {
  const w = Math.max(1, l.w >> 1);
  const h = Math.max(1, l.h >> 1);
  const img = new Float32Array(w * h * 3);
  const hole = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      let holes = 0;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const sx = Math.min(l.w - 1, x * 2 + dx);
          const sy = Math.min(l.h - 1, y * 2 + dy);
          const i = sy * l.w + sx;
          if (l.hole[i]) {
            holes++;
            continue;
          }
          r += l.img[i * 3]!;
          g += l.img[i * 3 + 1]!;
          b += l.img[i * 3 + 2]!;
          n++;
        }
      }
      const o = y * w + x;
      hole[o] = holes > 1 || n === 0 ? 1 : 0;
      if (n) {
        img[o * 3] = r / n;
        img[o * 3 + 1] = g / n;
        img[o * 3 + 2] = b / n;
      }
    }
  }
  return { w, h, img, hole };
}

/** Fills the hole by repeated averaging of known / filled neighbours (coarsest-level start). */
function diffuse(l: Level) {
  const { w, h, img, hole } = l;
  const filled = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) filled[i] = hole[i] ? 0 : 1;
  let remaining = hole.reduce((a, v) => a + v, 0);
  // Onion-peel: fill the hole's rim first, inward.
  while (remaining > 0) {
    const next: number[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (filled[i]) continue;
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const j = ny * w + nx;
            if (!filled[j]) continue;
            r += img[j * 3]!;
            g += img[j * 3 + 1]!;
            b += img[j * 3 + 2]!;
            n++;
          }
        }
        if (n) next.push(i, r / n, g / n, b / n);
      }
    }
    if (next.length === 0) break;
    for (let k = 0; k < next.length; k += 4) {
      const i = next[k]!;
      img[i * 3] = next[k + 1]!;
      img[i * 3 + 1] = next[k + 2]!;
      img[i * 3 + 2] = next[k + 3]!;
      filled[i] = 1;
      remaining--;
    }
  }
  // Smooth the interior a little so the first NN search isn't fooled by flat plateaus.
  for (let it = 0; it < 4; it++) {
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (!hole[i]) continue;
        for (let c = 0; c < 3; c++) {
          img[i * 3 + c] = (img[(i - 1) * 3 + c]! + img[(i + 1) * 3 + c]! + img[(i - w) * 3 + c]! + img[(i + w) * 3 + c]!) / 4;
        }
      }
    }
  }
}

/**
 * Confidence per pixel (Wexler et al.): 1 where known, γ^−d inside the hole
 * (d = distance to the known area). Patch distances weigh pixels by it, so
 * the hole's border — real content — decides what fills the interior,
 * instead of the blurry first guess there.
 */
function confidence(l: Level): Float32Array {
  const { w, h, hole } = l;
  const INF = 1 << 20;
  const d = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = hole[i] ? INF : 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x > 0) d[i] = Math.min(d[i]!, d[i - 1]! + 1);
      if (y > 0) d[i] = Math.min(d[i]!, d[i - w]! + 1);
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (x < w - 1) d[i] = Math.min(d[i]!, d[i + 1]! + 1);
      if (y < h - 1) d[i] = Math.min(d[i]!, d[i + w]! + 1);
    }
  }
  const conf = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) conf[i] = hole[i] ? Math.pow(1.3, -d[i]!) : 1;
  return conf;
}

/** Pixels whose (2r+1)² patch lies entirely in the known area and inside the image. */
function validSources(l: Level, r: number): Uint8Array {
  const { w, h, hole } = l;
  // Distance to the nearest hole pixel (Chebyshev), by two passes.
  const INF = 1 << 20;
  const d = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = hole[i] ? 0 : INF;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let v = d[i]!;
      if (x > 0) v = Math.min(v, d[i - 1]! + 1);
      if (y > 0) v = Math.min(v, d[i - w]! + 1);
      if (x > 0 && y > 0) v = Math.min(v, d[i - w - 1]! + 1);
      if (x < w - 1 && y > 0) v = Math.min(v, d[i - w + 1]! + 1);
      d[i] = v;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      let v = d[i]!;
      if (x < w - 1) v = Math.min(v, d[i + 1]! + 1);
      if (y < h - 1) v = Math.min(v, d[i + w]! + 1);
      if (x < w - 1 && y < h - 1) v = Math.min(v, d[i + w + 1]! + 1);
      if (x > 0 && y < h - 1) v = Math.min(v, d[i + w - 1]! + 1);
      d[i] = v;
    }
  }
  const valid = new Uint8Array(w * h);
  for (let y = r; y < h - r; y++) for (let x = r; x < w - r; x++) if (d[y * w + x]! > r) valid[y * w + x] = 1;
  return valid;
}

/**
 * One scale: PatchMatch NN field for every patch touching the hole, then
 * voting, repeated `em` times. `nnf` (target index → source index) is
 * reused / updated in place.
 */
function* solveLevel(l: Level, r: number, em: number, nnf: Int32Array, rand: () => number, check: () => void): Generator<void> {
  const { w, h, img, hole } = l;
  const valid = validSources(l, r);
  const sources: number[] = [];
  for (let i = 0; i < w * h; i++) if (valid[i]) sources.push(i);
  if (sources.length === 0) return;

  // Targets: patch centres whose patch touches the hole (hole dilated by r), kept inside the image.
  const targets: number[] = [];
  const isTarget = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!hole[y * w + x]) continue;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const tx = Math.min(w - 1 - r, Math.max(r, x + dx));
          const ty = Math.min(h - 1 - r, Math.max(r, y + dy));
          const t = ty * w + tx;
          if (!isTarget[t]) {
            isTarget[t] = 1;
            targets.push(t);
          }
        }
      }
    }
  }
  targets.sort((a, b) => a - b);

  const conf = confidence(l);
  const dist = (t: number, s: number, best: number) => {
    let sum = 0;
    const tx = t % w;
    const ty = (t / w) | 0;
    const sx = s % w;
    const sy = (s / w) | 0;
    for (let dy = -r; dy <= r; dy++) {
      let tp = (ty + dy) * w + tx - r;
      let si = ((sy + dy) * w + sx - r) * 3;
      for (let dx = -r; dx <= r; dx++) {
        const ti = tp * 3;
        const a = img[ti]! - img[si]!;
        const b = img[ti + 1]! - img[si + 1]!;
        const c = img[ti + 2]! - img[si + 2]!;
        sum += (a * a + b * b + c * c) * conf[tp]!;
        tp++;
        si += 3;
      }
      if (sum >= best) return sum;
    }
    return sum;
  };

  const dists = new Float64Array(w * h);
  const randomSource = () => sources[(rand() * sources.length) | 0]!;
  const maxRadius = Math.max(w, h);

  for (let iter = 0; iter < em; iter++) {
    yield;
    check();
    // (Re)initialise and score.
    for (const t of targets) {
      let s = nnf[t]!;
      if (s < 0 || !valid[s]) s = randomSource();
      nnf[t] = s;
      dists[t] = dist(t, s, Infinity);
    }
    // PatchMatch passes, alternating scan order.
    for (let pass = 0; pass < 4; pass++) {
      const forward = pass % 2 === 0;
      const step = forward ? 1 : -1;
      for (let k = 0; k < targets.length; k++) {
        const t = targets[forward ? k : targets.length - 1 - k]!;
        let best = nnf[t]!;
        let bestD = dists[t]!;
        // Propagation: the neighbour visited just before (left / up, or right /
        // down on reverse passes) suggests its match shifted by one pixel.
        const tx = t % w;
        const tryCandidate = (c: number) => {
          if (c < 0 || c >= w * h || !valid[c] || c === best) return;
          const d = dist(t, c, bestD);
          if (d < bestD) {
            best = c;
            bestD = d;
          }
        };
        const hx = tx - step;
        if (hx >= 0 && hx < w && isTarget[t - step]) {
          const ns = nnf[t - step]!;
          const nsx = (ns % w) + step;
          if (ns >= 0 && nsx >= 0 && nsx < w) tryCandidate(ns + step);
        }
        const v = t - step * w;
        if (v >= 0 && v < w * h && isTarget[v]) {
          const ns = nnf[v]!;
          if (ns >= 0) tryCandidate(ns + step * w);
        }
        // Random search around the current best, halving the window.
        const bx = best % w;
        const by = (best / w) | 0;
        for (let rad = maxRadius; rad >= 1; rad >>= 1) {
          const cx = Math.round(bx + (rand() * 2 - 1) * rad);
          const cy = Math.round(by + (rand() * 2 - 1) * rad);
          if (cx < r || cy < r || cx >= w - r || cy >= h - r) continue;
          const c = cy * w + cx;
          if (!valid[c] || c === best) continue;
          const d = dist(t, c, bestD);
          if (d < bestD) {
            best = c;
            bestD = d;
          }
        }
        nnf[t] = best;
        dists[t] = bestD;
      }
    }
    // Voting: each hole pixel = weighted mean of the source pixels the overlapping patches propose.
    let sigma2 = 0;
    {
      const ds = targets.map((t) => dists[t]!).sort((a, b) => a - b);
      sigma2 = Math.max(1e-6, ds[Math.floor(ds.length * 0.75)]! / ((2 * r + 1) ** 2));
    }
    const acc = new Float64Array(w * h * 3);
    const wsum = new Float64Array(w * h);
    for (const t of targets) {
      const s = nnf[t]!;
      const wgt = Math.exp(-dists[t]! / ((2 * r + 1) ** 2) / (2 * sigma2)) * conf[t]!;
      const tx = t % w;
      const ty = (t / w) | 0;
      const sx = s % w;
      const sy = (s / w) | 0;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const q = (ty + dy) * w + tx + dx;
          if (!hole[q]) continue;
          const sq = ((sy + dy) * w + sx + dx) * 3;
          acc[q * 3] += img[sq]! * wgt;
          acc[q * 3 + 1] += img[sq + 1]! * wgt;
          acc[q * 3 + 2] += img[sq + 2]! * wgt;
          wsum[q] += wgt;
        }
      }
    }
    for (let q = 0; q < w * h; q++) {
      if (!hole[q] || wsum[q] === 0) continue;
      img[q * 3] = acc[q * 3]! / wsum[q]!;
      img[q * 3 + 1] = acc[q * 3 + 1]! / wsum[q]!;
      img[q * 3 + 2] = acc[q * 3 + 2]! / wsum[q]!;
    }
  }
}

/** Fills `mask` in `input`; returns the completed RGB (known pixels unchanged). */
export function inpaintPatchMatch(input: InpaintImage, opts: InpaintOptions = {}): Uint8Array {
  const steps = inpaintSteps(input, opts);
  for (;;) {
    const n = steps.next();
    if (n.done) return n.value;
  }
}

/** Same as inpaintPatchMatch, yielding to the event loop between steps (UI stays responsive, cancel works). */
export async function inpaintPatchMatchAsync(input: InpaintImage, opts: InpaintOptions = {}): Promise<Uint8Array> {
  const steps = inpaintSteps(input, opts);
  let last = Date.now();
  for (;;) {
    const n = steps.next();
    if (n.done) return n.value;
    if (Date.now() - last > 30) {
      await new Promise((r) => setTimeout(r, 0));
      last = Date.now();
    }
  }
}

function* inpaintSteps(input: InpaintImage, opts: InpaintOptions): Generator<void, Uint8Array> {
  const { width: w, height: h } = input;
  const rand = mulberry32(opts.seed ?? 1);
  const check = () => {
    if (opts.shouldCancel?.()) throw new InpaintCancelled();
  };
  const img = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h * 3; i++) img[i] = input.rgb[i]!;
  const hole = Uint8Array.from(input.mask, (v) => (v ? 1 : 0));
  if (!hole.some((v) => v)) return Uint8Array.from(input.rgb);

  // Pyramid down to ~32 px on the short side.
  const levels: Level[] = [{ w, h, img, hole }];
  while (Math.min(levels[levels.length - 1]!.w, levels[levels.length - 1]!.h) >= 64) levels.push(downsample(levels[levels.length - 1]!));
  diffuse(levels[levels.length - 1]!);

  let nnf: Int32Array | null = null;
  const total = levels.length;
  for (let li = levels.length - 1; li >= 0; li--) {
    check();
    const l = levels[li]!;
    if (li < levels.length - 1) {
      // Hole pixels start from the coarser solution (bilinear), the NNF from its upscaled copy.
      const c = levels[li + 1]!;
      for (let y = 0; y < l.h; y++) {
        for (let x = 0; x < l.w; x++) {
          const i = y * l.w + x;
          if (!l.hole[i]) continue;
          const fx = Math.min(c.w - 1, Math.max(0, (x + 0.5) / 2 - 0.5));
          const fy = Math.min(c.h - 1, Math.max(0, (y + 0.5) / 2 - 0.5));
          const x0 = Math.floor(fx);
          const y0 = Math.floor(fy);
          const x1 = Math.min(c.w - 1, x0 + 1);
          const y1 = Math.min(c.h - 1, y0 + 1);
          const ax = fx - x0;
          const ay = fy - y0;
          for (let ch = 0; ch < 3; ch++) {
            const v00 = c.img[(y0 * c.w + x0) * 3 + ch]!;
            const v10 = c.img[(y0 * c.w + x1) * 3 + ch]!;
            const v01 = c.img[(y1 * c.w + x0) * 3 + ch]!;
            const v11 = c.img[(y1 * c.w + x1) * 3 + ch]!;
            l.img[i * 3 + ch] = (v00 * (1 - ax) + v10 * ax) * (1 - ay) + (v01 * (1 - ax) + v11 * ax) * ay;
          }
        }
      }
      const up = new Int32Array(l.w * l.h).fill(-1);
      if (nnf) {
        for (let y = 0; y < l.h; y++) {
          for (let x = 0; x < l.w; x++) {
            const cs = nnf[Math.min(c.h - 1, y >> 1) * c.w + Math.min(c.w - 1, x >> 1)]!;
            if (cs < 0) continue;
            const sx = Math.min(l.w - 1, (cs % c.w) * 2 + (x & 1));
            const sy = Math.min(l.h - 1, ((cs / c.w) | 0) * 2 + (y & 1));
            up[y * l.w + x] = sy * l.w + sx;
          }
        }
      }
      nnf = up;
    } else {
      nnf = new Int32Array(l.w * l.h).fill(-1);
    }
    const r = li === 0 ? 3 : 2;
    const em = li === 0 ? 2 : li === levels.length - 1 ? 10 : 5;
    yield* solveLevel(l, r, em, nnf, rand, check);
    opts.onProgress?.((total - li) / total);
  }

  const out = Uint8Array.from(input.rgb);
  for (let i = 0; i < w * h; i++) {
    if (!hole[i]) continue;
    for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.max(0, Math.min(255, Math.round(img[i * 3 + c]!)));
  }
  return out;
}
