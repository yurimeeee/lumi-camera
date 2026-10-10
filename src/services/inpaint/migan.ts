import type { Inpainter } from './objectRemoval';

/**
 * MI-GAN (learned inpainting) runs only in the browser, through ONNX Runtime
 * Web (see migan.web.ts). On iOS there is no ONNX / Core ML runtime in this
 * build yet, so object removal uses PatchMatch.
 */
export const MIGAN_SUPPORTED = false;
export const MIGAN_SIZE = '28MB';

export function miganInpainter(): Inpainter | null {
  return null;
}
