import { plugin } from 'bun';

// Native-only modules on the shader's import chain; never called by the check.
plugin({
  name: 'rn-stubs',
  setup(build) {
    const stub = { Skia: {}, AlphaType: {}, ColorType: {}, ImageManipulator: {}, SaveFormat: {}, Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios ?? o.default }, default: {} };
    for (const m of ['@shopify/react-native-skia', 'expo-image-manipulator', 'react-native', 'expo-file-system']) {
      build.module(m, () => ({ exports: stub, loader: 'object' }));
    }
    // Metro asset modules (frame kit textures, fonts) → their file path.
    build.onLoad({ filter: /\.(png|jpe?g|ttf)$/ }, (args) => ({ exports: { default: args.path }, loader: 'object' }));
  },
});
