import { Directory, File, Paths } from 'expo-file-system';

/**
 * Files Lumi owns (native). Originals of photos being edited are copied into
 * Documents so an edit project keeps working after the cache is purged or
 * the app is restarted; the user's source file is never written to.
 * See appFiles.web.ts for web.
 */

const ORIGINALS = 'originals';
const RECIPES = 'recipes';
const STUDIO = 'studio';
const MASKS = 'masks';

function dir(name: string): Directory {
  const d = new Directory(Paths.document, name);
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

/** Copies `uri` into Lumi's originals folder and returns the copy's URI. */
export async function storeOriginal(uri: string): Promise<string> {
  const src = new File(uri);
  const ext = src.extension || '.jpg';
  const dest = new File(dir(ORIGINALS), `original-${Date.now()}${ext}`);
  await src.copy(dest);
  return dest.uri;
}

/**
 * Copies a Frame Studio image (photo, album frame, background, texture) into
 * Lumi's studio folder. Kept apart from originals, which the editor prunes.
 */
export async function storeStudioFile(uri: string): Promise<string> {
  const src = new File(uri);
  const ext = src.extension || '.jpg';
  const dest = new File(dir(STUDIO), `studio-${Date.now()}-${Math.floor(Math.random() * 1e6)}${ext}`);
  await src.copy(dest);
  return dest.uri;
}

/** Deletes stored originals except `keep` (current project, gallery thumbnail…). */
export function pruneOriginals(keep: readonly (string | null | undefined)[]): void {
  try {
    const keepSet = new Set(keep.filter(Boolean));
    for (const item of dir(ORIGINALS).list()) {
      if (item instanceof File && !keepSet.has(item.uri)) item.delete();
    }
  } catch {
    // Housekeeping only.
  }
}

export function fileExists(uri: string | null | undefined): boolean {
  if (!uri) return false;
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

export function writeRecipeThumbnail(id: string, jpeg: Uint8Array): string {
  const file = new File(dir(RECIPES), `${id}.jpg`);
  file.create({ overwrite: true });
  file.write(jpeg);
  return file.uri;
}

export function deleteFileQuietly(uri: string | null | undefined): void {
  if (!uri || uri.startsWith('data:')) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Already gone.
  }
}

/** Where a new AI mask / inpainting patch file goes (Documents/masks, kept with the project). */
export function newMaskFileUri(prefix: string, ext: 'png' = 'png'): string {
  return new File(dir(MASKS), `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`).uri;
}

/** Writes a PNG produced in JS (inpainting patches) into the masks folder. */
export function writeMaskPng(bytes: Uint8Array, prefix: string): string {
  const file = new File(newMaskFileUri(prefix));
  file.create({ overwrite: true });
  file.write(bytes);
  return file.uri;
}

/** Deletes mask / patch files no edit (project, versions, open editor) references. */
export function pruneMaskFiles(keep: readonly (string | null | undefined)[]): void {
  try {
    const keepSet = new Set(keep.filter(Boolean));
    for (const item of dir(MASKS).list()) {
      if (item instanceof File && !keepSet.has(item.uri)) item.delete();
    }
  } catch {
    // Housekeeping only.
  }
}
