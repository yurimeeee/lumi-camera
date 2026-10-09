import type { FrameSettings } from '@/types/film';

/**
 * Frame geometry (pure). A frame adds borders around the photo — it never
 * crops or stretches it — so the photo keeps its own aspect ratio and
 * resolution, and the saved image grows by the border. Sizes are relative to
 * the photo's short side, so the preview and the export look the same.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FrameLayout {
  /** Whole output (photo + borders). */
  width: number;
  height: number;
  /** Where the photo goes. */
  photo: Rect;
  /** Photo corner radius (px). */
  radius: number;
  /** Mat (padding) rect around the photo, null without padding. */
  mat: Rect | null;
  /** Outer corner radius (px). */
  outerRadius: number;
  /** Film strip sprocket holes. */
  holes: Rect[];
  /** Small edge marks (35mm border). */
  marks: Rect[];
}

const n = (v: number) => Math.min(100, Math.max(0, v)) / 100;

/**
 * Layout for a photoW×photoH photo. With `round`, every size is a whole
 * pixel (export); the preview keeps fractions.
 */
export function frameLayout(f: FrameSettings, photoW: number, photoH: number, round = true): FrameLayout {
  const S = Math.min(photoW, photoH);
  const r = (v: number) => (round ? Math.round(v) : v);
  const bw = n(f.borderWidth);
  let top = 0;
  let side = 0;
  let bottom = 0;
  let outerRadius = 0;
  switch (f.id) {
    case 'none':
      break;
    case 'polaroid':
      side = top = S * (0.04 + 0.06 * bw);
      bottom = side * 3.4;
      break;
    case 'border35':
      side = top = bottom = S * (0.02 + 0.05 * bw);
      break;
    case 'filmStrip':
      side = S * (0.015 + 0.02 * bw);
      top = bottom = S * (0.08 + 0.08 * bw);
      break;
    case 'white':
    case 'black':
      side = top = bottom = S * (0.015 + 0.085 * bw);
      break;
    case 'retroPrint':
      side = top = bottom = S * (0.03 + 0.06 * bw);
      outerRadius = S * 0.02;
      break;
  }
  const pad = f.id === 'none' ? 0 : S * 0.05 * n(f.padding);
  const left = r(side + pad);
  const right = r(side + pad);
  const t = r(top + pad);
  const b = r(bottom + pad);
  const width = r(photoW) + left + right;
  const height = r(photoH) + t + b;
  const photo = { x: left, y: t, width: r(photoW), height: r(photoH) };
  const radius = f.id === 'none' ? 0 : S * 0.06 * n(f.cornerRadius);
  const mat = pad > 0 ? { x: photo.x - pad, y: photo.y - pad, width: photo.width + 2 * pad, height: photo.height + 2 * pad } : null;

  const holes: Rect[] = [];
  if (f.id === 'filmStrip') {
    // Sprocket holes centred in the top and bottom bands, evenly spaced.
    const hw = S * 0.035;
    const hh = top * 0.42;
    const pitch = hw * 2.1;
    const count = Math.max(2, Math.floor(width / pitch));
    const start = (width - (count - 1) * pitch) / 2;
    for (let i = 0; i < count; i++) {
      const cx = start + i * pitch;
      holes.push({ x: cx - hw / 2, y: (t - pad - hh) / 2, width: hw, height: hh });
      holes.push({ x: cx - hw / 2, y: height - (b - pad + hh) / 2, width: hw, height: hh });
    }
  }
  const marks: Rect[] = [];
  if (f.id === 'border35' && bottom > 2) {
    // Edge code: a row of short dashes in the bottom border.
    const mh = Math.max(1, bottom * 0.18);
    const mw = mh * 3;
    for (let i = 0; i < 6; i++) marks.push({ x: left + S * 0.04 + i * mw * 1.8, y: height - (b - pad) / 2 - mh / 2, width: mw, height: mh });
  }
  return { width, height, photo, radius, mat, outerRadius, holes, marks };
}

/** Lighter or darker shade of `hex` for the mat and decorations. */
export function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const v = parseInt(m[1]!, 16);
  const ch = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) =>
    Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount)),
  );
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Perceived brightness 0…1 of a #RRGGBB colour. */
export function brightness(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 1;
  const v = parseInt(m[1]!, 16);
  return (0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;
}
