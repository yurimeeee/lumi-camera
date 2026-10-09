export type LibraryAccess = 'granted' | 'limited' | 'denied' | 'undetermined' | 'unavailable';

export interface LibraryPhoto {
  id: string;
  /** Displayable URI (ph:// on iOS — expo-image renders it natively and efficiently). */
  previewUri: string;
  width: number;
  height: number;
  createdAt: number | null;
}

export interface PickedImage {
  uri: string;
  width: number;
  height: number;
  /** Capture date from the photo's EXIF, null when unknown. */
  takenAt: number | null;
}

export type SaveResult = { ok: true } | { ok: false; reason: 'permission' | 'error'; message?: string };
