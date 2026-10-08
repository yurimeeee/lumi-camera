import { plugin } from 'bun';

/**
 * Native-only modules on the engine's import chain. The tests exercise the
 * pure engine code and render the real SkSL with CanvasKit instead.
 */
(globalThis as { __DEV__?: boolean }).__DEV__ = false;

const memory = new Map<string, string>();
export const asyncStorageMemory = memory;

plugin({
  name: 'rn-stubs',
  setup(build) {
    const stub = {
      Skia: {},
      AlphaType: {},
      ImageFormat: { JPEG: 3, PNG: 4 },
      ColorType: {},
      ImageManipulator: {},
      SaveFormat: {},
      Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios ?? o.default },
      Paths: {},
      File: class {},
      Directory: class {},
      default: {},
    };
    for (const m of ['@shopify/react-native-skia', 'expo-image-manipulator', 'react-native', 'expo-file-system']) {
      build.module(m, () => ({ exports: stub, loader: 'object' }));
    }
    const storage = {
      getItem: async (k: string) => memory.get(k) ?? null,
      setItem: async (k: string, v: string) => void memory.set(k, v),
      removeItem: async (k: string) => void memory.delete(k),
    };
    build.module('@react-native-async-storage/async-storage', () => ({
      exports: { default: storage, ...storage },
      loader: 'object',
    }));
  },
});
