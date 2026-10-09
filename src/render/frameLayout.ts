import { frameTextureId } from '@/constants/film';
import { frameAroundPhoto, type FrameGeometry } from '@/image-engine/frame/frameGeometry';
import { getFramePreset, type FramePreset } from '@/image-engine/frame/registry';
import type { FrameSettings } from '@/types/film';

/**
 * Frame geometry (pure). A frame — one of the kit's frames (assets/frames) —
 * adds its borders around the photo; it never crops or stretches it, so the
 * photo keeps its own aspect ratio and resolution and the saved image grows
 * by the border. Sizes follow the photo, so the preview and the export look
 * the same.
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
  preset: FramePreset;
  geometry: FrameGeometry;
}

/**
 * Layout for a photoW×photoH photo, or null without a frame. With `round`,
 * every border is a whole pixel (export); the preview keeps fractions.
 */
export function frameLayout(f: FrameSettings, photoW: number, photoH: number, round = true): FrameLayout | null {
  const preset = f.id === 'none' ? null : getFramePreset(f.id);
  if (!preset) return null;
  const w = round ? Math.round(photoW) : photoW;
  const h = round ? Math.round(photoH) : photoH;
  const g = frameAroundPhoto(preset.spec, f, w, h, round);
  return { width: g.width, height: g.height, photo: g.hole, radius: g.holeRadius, preset, geometry: g };
}

/** The kit renderer's paper settings for an editor frame. */
export function framePaper(f: FrameSettings) {
  return { color: f.color, texture: frameTextureId(f.id), textureIntensity: f.texture, aging: f.aging, edgeWear: f.edgeWear };
}
