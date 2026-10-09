# Lumi Frame Assets

27 transparent-hole SVG frames, 8 raster paper textures, 7 decorations, 9 layout JSON templates.

## React Native / Expo
- Use `react-native-svg` or Skia SVG support for frame shapes.
- Use Skia for layer composition and export; PNG textures can be layered using multiply/soft-light or clipped masks.
- SVGs have a transparent photo slot; composite the user photo *under* the frame.
- `manifest.json` supplies normalized photo slot rectangles; resize using canvas width and height.
- All assets are original procedurally generated starting points, not scans of real analog stock. For photorealistic paper, replace textures with licensed high-resolution scans.
- Imported JPG frames require manual masking because they have no alpha channel.
