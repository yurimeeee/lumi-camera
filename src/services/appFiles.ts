import { Directory, File, Paths } from 'expo-file-system';

/**
 * Files Lumi owns (native). Originals of photos being edited are copied into
 * Documents so an edit project keeps working after the cache is purged or
 * the app is restarted; the user's source file is never written to.
 * See appFiles.web.ts for web.
 */

const ORIGINALS = 'originals';
const RECIPES = 'recipes';

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
