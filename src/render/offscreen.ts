import { drawAsImage, drawAsPicture, Skia, type SkImage, type SkSurface } from '@shopify/react-native-skia';
import type { ReactElement } from 'react';
import { Platform } from 'react-native';

/**
 * Renders Skia nodes to an image without a visible canvas.
 *
 * Native: GPU offscreen surface (fast, also for full-resolution export).
 * Web: CPU raster surface. Each GPU offscreen render on web creates a new
 * WebGL context and browsers only keep ~16 alive, so GPU renders for
 * thumbnails would eventually kill the editor's on-screen canvas.
 */
export async function renderOffscreen(element: ReactElement, width: number, height: number): Promise<SkImage | null> {
  if (Platform.OS !== 'web') return drawAsImage(element, { width, height });
  const picture = await drawAsPicture(element, { x: 0, y: 0, width, height });
  const surface = Skia.Surface.Make(width, height);
  if (!surface) return null;
  surface.getCanvas().drawPicture(picture);
  surface.flush();
  const image = surface.makeImageSnapshot();
  surface.dispose();
  return image;
}

const SHEET_MIN_WIDTH = 2048;
const SHEET_MIN_HEIGHT = 512;
let sheetSurface: SkSurface | null = null;
/** Web: null until the hardware-WebGL probe answers (CPU until then). */
let sheetGpu: boolean | null = Platform.OS === 'web' ? null : true;

/**
 * Whether renderSheet draws on the GPU. On the CPU path a sheet costs the
 * same per pixel as separate renders, so callers should keep batches small
 * and show results as they arrive.
 */
export function sheetUsesGpu(): boolean {
  return sheetGpu === true;
}

/**
 * Renders a batch of thumbnails (laid out as one sheet) on the GPU and
 * returns a CPU-readable copy.
 *
 * On web this reuses a single long-lived WebGL surface instead of creating a
 * context per render (see renderOffscreen), so thumbnails get GPU speed while
 * using just one extra context. Falls back to the CPU raster path if WebGL
 * is unavailable.
 */
export async function renderSheet(element: ReactElement, width: number, height: number): Promise<SkImage | null> {
  if (Platform.OS !== 'web') return drawAsImage(element, { width, height });
  const picture = await drawAsPicture(element, { x: 0, y: 0, width, height });
  if (sheetUsesGpu()) {
    try {
      if (!sheetSurface || sheetSurface.width() < width || sheetSurface.height() < height) {
        // Sized generously: a new surface means a new context and shader compile.
        const w = Math.max(width, sheetSurface?.width() ?? SHEET_MIN_WIDTH);
        const h = Math.max(height, sheetSurface?.height() ?? SHEET_MIN_HEIGHT);
        sheetSurface?.dispose();
        sheetSurface = null;
        sheetSurface = Skia.Surface.MakeOffscreen(w, h);
      }
      if (sheetSurface) {
        const canvas = sheetSurface.getCanvas();
        canvas.clear(Skia.Color('transparent'));
        canvas.drawPicture(picture);
        sheetSurface.flush();
        const snapshot = sheetSurface.makeImageSnapshot(Skia.XYWHRect(0, 0, width, height));
        const image = snapshot.makeNonTextureImage();
        snapshot.dispose();
        if (image) return image;
      }
    } catch {
      // Lost or unavailable WebGL context: stay on the CPU path from now on.
    }
    sheetSurface?.dispose();
    sheetSurface = null;
    sheetGpu = false;
  }
  const surface = Skia.Surface.Make(width, height);
  if (!surface) return null;
  surface.getCanvas().drawPicture(picture);
  surface.flush();
  const image = surface.makeImageSnapshot();
  surface.dispose();
  return image;
}

/**
 * Software WebGL (SwiftShader, llvmpipe — e.g. no GPU or a blocklisted one)
 * takes many seconds to compile the look shader; the CPU raster path is far
 * quicker there. Probed in a worker: on the main thread the query waits for
 * the GPU process (over a second while the camera preview starts up there).
 */
const PROBE_SOURCE = `
let ok = false;
try {
  const c = new OffscreenCanvas(1, 1);
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  if (gl) {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    ok = !/swiftshader|llvmpipe|software|basic render/i.test(renderer);
  }
} catch (e) {}
postMessage(ok);
`;

function probeHardwareWebGL(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(new Blob([PROBE_SOURCE], { type: 'text/javascript' }));
      const worker = new Worker(url);
      const done = (ok: boolean) => {
        worker.terminate();
        URL.revokeObjectURL(url);
        resolve(ok);
      };
      worker.onmessage = (e) => done(e.data === true);
      worker.onerror = () => done(false);
    } catch {
      resolve(false);
    }
  });
}

if (Platform.OS === 'web') probeHardwareWebGL().then((ok) => (sheetGpu ??= ok));
