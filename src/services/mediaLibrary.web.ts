import * as ImagePicker from 'expo-image-picker';

import type { LibraryAccess, LibraryPhoto, PickedImage, SaveResult } from '@/types/library';

/**
 * Web implementation. Browsers have no photo library API, so browsing is
 * replaced by the file picker and "save" downloads the JPEG.
 */

export type { LibraryAccess, LibraryPhoto, PickedImage, SaveResult };

export const LUMI_ALBUM = 'Lumi';
export const LUMI_ORIGINALS_ALBUM = 'Lumi Originals';

export async function getLibraryAccess(): Promise<LibraryAccess> {
  return 'unavailable';
}

export async function requestLibraryAccess(): Promise<LibraryAccess> {
  return 'unavailable';
}

export async function presentLimitedLibraryPicker(): Promise<void> {}

export async function fetchRecentPhotos(): Promise<LibraryPhoto[]> {
  return [];
}

export async function resolvePhotoFile(id: string): Promise<{ uri: string; takenAt: number }> {
  return { uri: id, takenAt: Date.now() };
}

export async function pickImageFromSystem(): Promise<PickedImage | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (result.canceled || !result.assets[0]) return null;
  const a = result.assets[0];
  return { uri: a.uri, width: a.width, height: a.height, takenAt: Date.now() };
}

export async function saveToLibrary(fileUri: string): Promise<SaveResult> {
  const a = document.createElement('a');
  a.href = fileUri;
  a.download = `lumi-${Date.now()}.${fileUri.startsWith('data:image/png') ? 'png' : 'jpg'}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return { ok: true };
}
