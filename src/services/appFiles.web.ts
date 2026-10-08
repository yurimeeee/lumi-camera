/**
 * Web: no app file system. Originals are kept as data URLs (blob URLs die on
 * reload) so an unfinished edit can be restored; recipe thumbnails are
 * stored inline as data URLs too.
 */

/** localStorage holds ~5M characters per origin; leave room for the rest. */
const MAX_DATA_URL = 3_500_000;

export async function storeOriginal(uri: string): Promise<string> {
  if (!uri.startsWith('blob:')) return uri;
  try {
    const blob = await (await fetch(uri)).blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    // Too big to persist: keep editing from the blob (no restore after reload).
    return dataUrl.length <= MAX_DATA_URL ? dataUrl : uri;
  } catch {
    return uri;
  }
}

export function pruneOriginals(_keep: readonly (string | null | undefined)[]): void {}

/** Blob URLs don't survive a reload; data URLs do. */
export function fileExists(uri: string | null | undefined): boolean {
  return !!uri && uri.startsWith('data:');
}

export function writeRecipeThumbnail(_id: string, jpeg: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < jpeg.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, Array.from(jpeg.subarray(i, i + 0x8000)));
  }
  return `data:image/jpeg;base64,${btoa(bin)}`;
}

export function deleteFileQuietly(_uri: string | null | undefined): void {}
