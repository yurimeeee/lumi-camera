// On web, Skia is backed by CanvasKit (WASM). It has to be loaded before any
// module that touches the Skia API is evaluated, so the router entry is
// required only after CanvasKit is ready.
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

/**
 * Every Skia web object keeps an enumerable reference to the CanvasKit
 * module, whose WASM heap views hold tens of millions of entries. React 19's
 * dev-only performance tracks enumerate changed props, which then stalls the
 * page for minutes whenever an SkImage is passed as a prop. Hiding the heap
 * views from enumeration keeps their values intact and fixes dev on web.
 */
function hideWasmHeapsFromEnumeration() {
  const ck = (globalThis as unknown as { CanvasKit?: Record<string, unknown> }).CanvasKit;
  if (!ck) return;
  for (const key of Object.keys(ck)) {
    const value = ck[key];
    if (ArrayBuffer.isView(value) || value instanceof WebAssembly.Memory) {
      Object.defineProperty(ck, key, { value, enumerable: false, writable: true, configurable: true });
    }
  }
}

/**
 * react-native-skia's web canvas tags its WebGL drawing buffer as
 * display-p3, but CanvasKit renders plain sRGB values into it. The browser
 * then shows sRGB numbers as P3, so the on-screen preview looks more
 * saturated than the exported file (measured: R +4…+6 /255 on a skin-toned
 * photo, identical greys). Keeping the buffer sRGB makes the preview match the
 * export, which is rendered and encoded in sRGB.
 */
function keepWebGLCanvasesSRGB() {
  if (typeof WebGL2RenderingContext === 'undefined') return;
  const proto = WebGL2RenderingContext.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'drawingBufferColorSpace');
  if (!desc?.set || !desc.get) return;
  Object.defineProperty(proto, 'drawingBufferColorSpace', {
    ...desc,
    set(this: WebGL2RenderingContext, value: PredefinedColorSpace) {
      desc.set!.call(this, value === 'display-p3' ? 'srgb' : value);
    },
  });
}

keepWebGLCanvasesSRGB();

LoadSkiaWeb({ locateFile: (file: string) => `/${file}` }).then(() => {
  hideWasmHeapsFromEnumeration();
  require('expo-router/entry');
});
