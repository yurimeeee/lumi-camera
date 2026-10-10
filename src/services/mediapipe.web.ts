type VisionModule = typeof import('@mediapipe/tasks-vision');

/**
 * Web: MediaPipe Tasks Vision runtime. The JS bundle and WASM are served
 * from `public/mediapipe/` (copied by postinstall) and imported by the
 * browser itself: Metro cannot bundle the package. Models are fetched from
 * Google's model storage on first use. Shared by face detection and
 * segmentation.
 */
export const RUNTIME_BASE = '/mediapipe';

// A native import() Metro doesn't see, so the module is loaded as-is.
const importNative = new Function('url', 'return import(url)') as (url: string) => Promise<VisionModule>;

let runtime: Promise<{ vision: VisionModule; fileset: Awaited<ReturnType<VisionModule['FilesetResolver']['forVisionTasks']>> }> | null = null;

export function mediapipe() {
  if (!runtime) {
    runtime = (async () => {
      const vision = await importNative(`${RUNTIME_BASE}/vision_bundle.mjs`);
      const fileset = await vision.FilesetResolver.forVisionTasks(RUNTIME_BASE);
      return { vision, fileset };
    })();
    runtime.catch(() => {
      runtime = null;
    });
  }
  return runtime;
}

/**
 * MediaPipe's WASM routes its INFO/glog lines to console.error, which the
 * dev error toast picks up (and it covers the editor toolbar). Drop those
 * lines while MediaPipe runs.
 */
const NOISE = /^(INFO:|[IW]\d{4} |Graph successfully)/;
export async function quiet<T>(fn: () => T | Promise<T>): Promise<T> {
  const { error, warn, log } = console;
  const filter =
    (out: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      if (typeof args[0] === 'string' && NOISE.test(args[0])) return;
      out(...args);
    };
  console.error = filter(error);
  console.warn = filter(warn);
  console.log = filter(log);
  try {
    return await fn();
  } finally {
    console.error = error;
    console.warn = warn;
    console.log = log;
  }
}

export async function loadImageElement(uri: string): Promise<HTMLImageElement> {
  const img = new window.Image();
  img.crossOrigin = 'anonymous';
  img.src = uri;
  await img.decode();
  return img;
}
