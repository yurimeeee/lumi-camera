import { plugin } from 'bun';

// Native-only modules on the shader's import chain; never called by the check.
plugin({
  name: 'rn-stubs',
  setup(build) {
    const stub = { Skia: {}, AlphaType: {}, ColorType: {}, ImageManipulator: {}, SaveFormat: {}, Platform: { OS: 'ios' }, default: {} };
    for (const m of ['@shopify/react-native-skia', 'expo-image-manipulator', 'react-native', 'expo-file-system']) {
      build.module(m, () => ({ exports: stub, loader: 'object' }));
    }
  },
});
