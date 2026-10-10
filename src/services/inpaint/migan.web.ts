import type { Inpainter } from './objectRemoval';

type Ort = typeof import('onnxruntime-web');

/**
 * Web: MI-GAN (Picsart AI Research, ICCV 2023; code and weights MIT) — a
 * mobile-size inpainting GAN, as the published ONNX "pipeline" model
 * (28 MB) that crops around the hole, runs at 512 px and blends back. Run by
 * ONNX Runtime Web (WASM, served from public/ort). The model is downloaded
 * once from Hugging Face (after the user agrees) and kept in the browser's
 * Cache Storage. Nothing leaves the device.
 */
export const MIGAN_SUPPORTED = true;
export const MIGAN_SIZE = '28MB';

const MODEL_URL = 'https://huggingface.co/andraniksargsyan/migan/resolve/main/migan_pipeline_v2.onnx';
const CACHE = 'lumi-models-v1';

const importNative = new Function('url', 'return import(url)') as (url: string) => Promise<Ort>;

let session: Promise<{ ort: Ort; session: import('onnxruntime-web').InferenceSession }> | null = null;

async function modelBytes(): Promise<ArrayBuffer> {
  try {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(MODEL_URL);
    if (hit) return hit.arrayBuffer();
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`model ${res.status}`);
    await cache.put(MODEL_URL, res.clone());
    return res.arrayBuffer();
  } catch {
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`model ${res.status}`);
    return res.arrayBuffer();
  }
}

function getSession() {
  if (!session) {
    session = (async () => {
      const ort = await importNative('/ort/ort.wasm.min.mjs');
      ort.env.wasm.wasmPaths = '/ort/';
      // Threads need cross-origin isolation, which a static host doesn't give.
      ort.env.wasm.numThreads = 1;
      const s = await ort.InferenceSession.create(new Uint8Array(await modelBytes()), { executionProviders: ['wasm'] });
      return { ort, session: s };
    })();
    session.catch(() => {
      session = null;
    });
  }
  return session;
}

export function miganInpainter(): Inpainter {
  return {
    engine: 'migan',
    // MI-GAN works at 512 internally; give it the region at a bit more so its blend keeps detail.
    workSide: 1024,
    async run(input, opts) {
      const { ort, session: s } = await getSession();
      if (opts.shouldCancel()) throw new Error('cancelled');
      opts.onProgress(0.3);
      const { width: w, height: h } = input;
      const image = new Uint8Array(3 * w * h);
      const mask = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) {
        for (let c = 0; c < 3; c++) image[c * w * h + i] = input.rgb[i * 3 + c]!;
        mask[i] = input.mask[i] ? 0 : 255;
      }
      const out = await s.run({ image: new ort.Tensor('uint8', image, [1, 3, h, w]), mask: new ort.Tensor('uint8', mask, [1, 1, h, w]) });
      if (opts.shouldCancel()) throw new Error('cancelled');
      const res = out.result!.data as Uint8Array;
      const rgb = Uint8Array.from(input.rgb);
      for (let i = 0; i < w * h; i++) {
        if (!input.mask[i]) continue;
        for (let c = 0; c < 3; c++) rgb[i * 3 + c] = res[c * w * h + i]!;
      }
      opts.onProgress(1);
      return rgb;
    },
  };
}
