import piexif from 'piexifjs';

import type { GeoPoint } from './location';

/**
 * Writes capture date and (optionally) GPS into a JPEG's EXIF block.
 * Skia's encoder emits bare JPEGs, so without this the edited copy would
 * lose its metadata. Pure JS — works in Expo Go and on web.
 */

function bytesToBinary(bytes: Uint8Array): string {
  let out = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return out;
}

function binaryToBytes(bin: string): Uint8Array {
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
  return out;
}

function exifDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}:${p(d.getMonth() + 1)}:${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

type Rational = [number, number];

function toDms(value: number): [Rational, Rational, Rational] {
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = Math.round((minFloat - min) * 60 * 10000);
  return [
    [deg, 1],
    [min, 1],
    [sec, 10000],
  ];
}

export interface ExifInput {
  takenAt: number;
  location?: GeoPoint | null;
}

export function withExif(jpeg: Uint8Array, { takenAt, location }: ExifInput): Uint8Array {
  try {
    const binary = bytesToBinary(jpeg);
    let existing: piexif.ExifDict = {};
    try {
      existing = piexif.load(binary);
    } catch {
      existing = {};
    }
    const date = exifDate(takenAt);
    const exif: piexif.ExifDict = {
      ...existing,
      '0th': {
        ...existing['0th'],
        [piexif.ImageIFD.Orientation]: 1,
        [piexif.ImageIFD.Software]: 'Lumi',
        [piexif.ImageIFD.DateTime]: date,
      },
      Exif: {
        ...existing.Exif,
        [piexif.ExifIFD.DateTimeOriginal]: date,
        [piexif.ExifIFD.DateTimeDigitized]: date,
      },
      // Thumbnails from the source no longer match the edited image.
      thumbnail: undefined,
      '1st': {},
    };
    if (location) {
      const gps: Record<number, unknown> = {
        [piexif.GPSIFD.GPSLatitudeRef]: location.latitude >= 0 ? 'N' : 'S',
        [piexif.GPSIFD.GPSLatitude]: toDms(location.latitude),
        [piexif.GPSIFD.GPSLongitudeRef]: location.longitude >= 0 ? 'E' : 'W',
        [piexif.GPSIFD.GPSLongitude]: toDms(location.longitude),
      };
      if (location.altitude != null) {
        gps[piexif.GPSIFD.GPSAltitudeRef] = location.altitude >= 0 ? 0 : 1;
        gps[piexif.GPSIFD.GPSAltitude] = [Math.round(Math.abs(location.altitude) * 100), 100];
      }
      exif.GPS = gps;
    }
    const out = piexif.insert(piexif.dump(exif), binary);
    return binaryToBytes(out);
  } catch {
    // Metadata is best-effort; never block saving the photo itself.
    return jpeg;
  }
}
