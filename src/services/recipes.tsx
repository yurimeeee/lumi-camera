import { ImageFormat, type SkImage } from '@shopify/react-native-skia';

import { LumiLayer } from '@/render/LumiLayer';
import { renderOffscreen } from '@/render/offscreen';
import type { Look } from '@/stores/editorStore';
import { getRecipe, useRecipeStore } from '@/stores/recipeStore';

import { deleteFileQuietly, writeRecipeThumbnail } from './appFiles';
import { lookRender } from './imageProcessing';

const THUMB_W = 192;
const THUMB_H = 240;

async function renderThumbnail(image: SkImage, look: Look): Promise<Uint8Array | null> {
  const { uniforms, curves, mixCurves } = lookRender(look, THUMB_W, THUMB_H);
  const out = await renderOffscreen(
    <LumiLayer image={image} width={THUMB_W} height={THUMB_H} fit="cover" uniforms={uniforms} curves={curves} mixCurves={mixCurves} />,
    THUMB_W,
    THUMB_H,
  );
  const raster = out?.makeNonTextureImage() ?? out;
  return raster?.encodeToBytes(ImageFormat.JPEG, 85) ?? null;
}

/**
 * Saves the look (colour, film effects, frame, stamp style) as a My Recipe. The thumbnail (the look on the photo
 * it was made from) is best effort — a recipe without one still works.
 */
export async function saveRecipe(name: string, look: Look, image: SkImage | null): Promise<string> {
  const id = useRecipeStore.getState().add(name, look);
  if (image) {
    try {
      const jpeg = await renderThumbnail(image, look);
      if (jpeg?.length) useRecipeStore.getState().setThumbnail(id, writeRecipeThumbnail(id, jpeg));
    } catch (e) {
      if (__DEV__) console.warn('[recipe thumbnail]', e);
    }
  }
  return id;
}

export function deleteRecipe(id: string): void {
  const recipe = getRecipe(id);
  useRecipeStore.getState().remove(id);
  deleteFileQuietly(recipe?.thumbnailUri);
}
