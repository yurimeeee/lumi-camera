import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';

import type { LibraryAccess, LibraryPhoto, PickedImage, SaveResult } from '@/types/library';

export type { LibraryAccess, LibraryPhoto, PickedImage, SaveResult };

/** Native (iOS/Android) implementation. See mediaLibrary.web.ts for web. */

export const LUMI_ALBUM = 'Lumi';
export const LUMI_ORIGINALS_ALBUM = 'Lumi Originals';

function toAccess(res: MediaLibrary.PermissionResponse): LibraryAccess {
  if (res.status === 'granted') return res.accessPrivileges === 'limited' ? 'limited' : 'granted';
  if (res.status === 'denied') return 'denied';
  return 'undetermined';
}

export async function getLibraryAccess(): Promise<LibraryAccess> {
  return toAccess(await MediaLibrary.getPermissionsAsync());
}

export async function requestLibraryAccess(): Promise<LibraryAccess> {
  return toAccess(await MediaLibrary.requestPermissionsAsync());
}

/** Lets the user extend a "limited" selection (iOS 14+). */
export async function presentLimitedLibraryPicker(): Promise<void> {
  await MediaLibrary.presentPermissionsPicker(['photo']);
}

export async function fetchRecentPhotos(limit = 120, offset = 0): Promise<LibraryPhoto[]> {
  const rows = await new MediaLibrary.Query()
    .eq(MediaLibrary.AssetField.MEDIA_TYPE, MediaLibrary.MediaType.IMAGE)
    .orderBy({ key: MediaLibrary.AssetField.CREATION_TIME, ascending: false })
    .limit(limit)
    .offset(offset)
    .exeForMetadata();
  return rows.map((m) => ({
    id: m.id,
    previewUri: m.id,
    width: m.width ?? 0,
    height: m.height ?? 0,
    createdAt: m.creationTime,
  }));
}

/** Resolves a library asset to a local file URI that image processing can read. */
export async function resolvePhotoFile(id: string): Promise<{ uri: string; takenAt: number | null }> {
  const asset = new MediaLibrary.Asset(id);
  const [uri, created] = await Promise.all([asset.getUri(), asset.getCreationTime()]);
  return { uri, takenAt: created ?? null };
}

/** EXIF "YYYY:MM:DD HH:MM:SS" (local time) → ms, or null. */
export function parseExifDate(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const d = new Date(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!);
  return Number.isFinite(d.getTime()) && d.getFullYear() > 1900 ? d.getTime() : null;
}

function toPicked(a: ImagePicker.ImagePickerAsset): PickedImage {
  const exif = a.exif as Record<string, unknown> | null | undefined;
  return { uri: a.uri, width: a.width, height: a.height, takenAt: parseExifDate(exif?.DateTimeOriginal ?? exif?.DateTime) };
}

/**
 * System photo picker. Needs no library permission on iOS 14+ (runs out of
 * process), so it is also the fallback when access was denied and on web.
 */
export async function pickImageFromSystem(): Promise<PickedImage | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    // Only to read the capture date for the date stamp.
    exif: true,
    allowsEditing: false,
  });
  if (result.canceled || !result.assets[0]) return null;
  return toPicked(result.assets[0]);
}

/** Several photos at once (일괄 보정), in the order picked. */
export async function pickImagesFromSystem(limit: number): Promise<PickedImage[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    exif: true,
    allowsMultipleSelection: true,
    selectionLimit: limit,
    orderedSelection: true,
  });
  if (result.canceled) return [];
  return result.assets.map(toPicked);
}

async function ensureWriteAccess(): Promise<boolean> {
  const current = await MediaLibrary.getPermissionsAsync(true);
  if (current.status === 'granted') return true;
  if (!current.canAskAgain) return false;
  const next = await MediaLibrary.requestPermissionsAsync(true);
  return next.status === 'granted';
}

async function addToAlbum(asset: MediaLibrary.Asset, albumName: string): Promise<void> {
  // Album management needs read access; with add-only access the photo still
  // lands in Recents, which is what matters.
  try {
    const full = await MediaLibrary.getPermissionsAsync(false);
    if (full.status !== 'granted' || full.accessPrivileges === 'limited') return;
    const album = await MediaLibrary.Album.get(albumName);
    if (album) await album.add(asset);
    else await MediaLibrary.Album.create(albumName, [asset]);
  } catch {
    // Non-fatal: the asset itself is already saved.
  }
}

export async function saveToLibrary(fileUri: string, albumName: string = LUMI_ALBUM): Promise<SaveResult> {
  try {
    if (!(await ensureWriteAccess())) return { ok: false, reason: 'permission' };
    const asset = await MediaLibrary.Asset.create(fileUri);
    await addToAlbum(asset, albumName);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}
