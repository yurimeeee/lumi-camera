import type { SkImage, SkTypeface } from '@shopify/react-native-skia';

/**
 * Decoded images a render needs. The preview and the export draw the same
 * document with different banks: the preview's photos are screen-sized
 * copies, the export's are decoded at the resolution they are printed at.
 */
export interface TextureImage {
  image: SkImage;
  /** Average colour (0…1), the texture's "neutral" for relief. */
  mean: [number, number, number];
}

export interface AssetBank {
  /** Kit textures by id, imported textures by `import:<n>`. */
  textures: Map<string, TextureImage>;
  /** Bitmap decorations by id. */
  decorations: Map<string, SkImage>;
  /** Photos and imported images by URI. */
  images: Map<string, SkImage>;
  /** Caption font (frame captions, text layers). */
  typeface: SkTypeface | null;
}

export function emptyBank(): AssetBank {
  return { textures: new Map(), decorations: new Map(), images: new Map(), typeface: null };
}
