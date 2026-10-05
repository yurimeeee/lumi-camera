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

LoadSkiaWeb({ locateFile: (file: string) => `/${file}` }).then(() => {
  hideWasmHeapsFromEnumeration();
  require('expo-router/entry');
});
