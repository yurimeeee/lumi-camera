import { plugin } from 'bun';
import { join } from 'path';

/**
 * Frame Studio tests run the app's real drawing code: `@shopify/react-native-skia`
 * resolves to React Native Skia's own web implementation (JsiSkApi) on top of
 * CanvasKit — the same backend the web build uses — so the compositor, paper
 * shader and Lumi shader are executed, not mocked. Expo / RN modules that
 * only matter on device are stubbed.
 */
(globalThis as { __DEV__?: boolean }).__DEV__ = false;

const ROOT = join(import.meta.dir, '..', '..');
const SKIA = join(ROOT, 'node_modules/@shopify/react-native-skia/lib/module');
const CK_DIR = join(ROOT, 'node_modules/canvaskit-wasm/bin/full/');
const { default: CanvasKitInit } = await import(join(CK_DIR, 'canvaskit.js'));
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- CanvasKit's bundled types aren't loaded here
export const CK: any = await CanvasKitInit({ locateFile: (f: string) => CK_DIR + f });
const { JsiSkApi } = await import(join(SKIA, 'skia/web/JsiSkia.js'));
const types = await import(join(SKIA, 'skia/types/index.js'));
const Skia = JsiSkApi(CK);
(globalThis as { CanvasKit?: unknown }).CanvasKit = CK;

const memory = new Map<string, string>();
export const asyncStorageMemory = memory;

const skiaModule = {
  ...types,
  Skia,
  vec: (x = 0, y = 0) => Skia.Point(x, y),
  loadData: async () => null,
};

plugin({
  name: 'frame-studio-env',
  setup(build) {
    build.module('@shopify/react-native-skia', () => ({ exports: skiaModule, loader: 'object' }));
    const stub = {
      ImageManipulator: {},
      SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
      Platform: { OS: 'web', select: (o: Record<string, unknown>) => o.web ?? o.default },
      Paths: {},
      File: class {},
      Directory: class {},
      default: {},
    };
    for (const m of ['expo-image-manipulator', 'react-native', 'expo-file-system']) {
      build.module(m, () => ({ exports: stub, loader: 'object' }));
    }
    const storage = {
      getItem: async (k: string) => memory.get(k) ?? null,
      setItem: async (k: string, v: string) => void memory.set(k, v),
      removeItem: async (k: string) => void memory.delete(k),
    };
    build.module('@react-native-async-storage/async-storage', () => ({ exports: { default: storage, ...storage }, loader: 'object' }));
    // Metro asset modules → their file path.
    build.onLoad({ filter: /\.(png|jpe?g|ttf)$/ }, (args) => ({ exports: { default: args.path }, loader: "object" }));
  },
});
