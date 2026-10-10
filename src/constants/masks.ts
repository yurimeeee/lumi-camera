import { DEFAULT_BG_ADJUST } from '@/features/frame-studio/model/document';
import type { AiMaskTarget, BackgroundEdit, MaskAdjust, MaskAdjustKey, MaskKind, MaskShape, SelectiveMask } from '@/types/phase4';

import type { ControlSpec } from './adjustments';

/** Masks the shader evaluates at once (atlas channels; keep in sync with services/masks). */
export const MAX_MASKS = 8;
/** Atlas channel of the background stage's subject mask (after the selective masks). */
export const SUBJECT_CHANNEL = MAX_MASKS;

export const MASK_ADJUST_TOOLS: readonly ControlSpec<MaskAdjustKey>[] = [
  { key: 'exposure', label: '노출', icon: 'aperture-outline', min: -100, max: 100 },
  { key: 'brightness', label: '밝기', icon: 'sunny-outline', min: -100, max: 100 },
  { key: 'contrast', label: '대비', icon: 'contrast-outline', min: -100, max: 100 },
  { key: 'highlights', label: '하이라이트', icon: 'partly-sunny-outline', min: -100, max: 100 },
  { key: 'shadows', label: '그림자', icon: 'cloudy-night-outline', min: -100, max: 100 },
  { key: 'saturation', label: '채도', icon: 'water-outline', min: -100, max: 100 },
  { key: 'temperature', label: '색온도', icon: 'thermometer-outline', min: -100, max: 100 },
  { key: 'tint', label: '색조', icon: 'color-filter-outline', min: -100, max: 100 },
  { key: 'clarity', label: '명료도', icon: 'prism-outline', min: -100, max: 100 },
  { key: 'sharpness', label: '선명도', icon: 'triangle-outline', min: 0, max: 100 },
];

export const DEFAULT_MASK_ADJUST: MaskAdjust = {
  exposure: 0,
  brightness: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  saturation: 0,
  temperature: 0,
  tint: 0,
  clarity: 0,
  sharpness: 0,
};

export const MASK_KIND_LABEL: Record<MaskKind, string> = {
  brush: '브러시',
  radial: '원형',
  linear: '선형',
  color: '색상 범위',
  luminance: '밝기 범위',
  ai: 'AI',
};

export const AI_TARGET_LABEL: Record<AiMaskTarget, string> = {
  subject: '피사체',
  background: '배경',
  sky: '하늘',
  person: '인물',
  skin: '피부',
};

export const DEFAULT_BRUSH_MASK = { size: 30, feather: 60, flow: 60, opacity: 100 } as const;

/** A new shape of `kind`, centred on the photo (source-normalised). */
export function defaultShape(kind: Exclude<MaskKind, 'ai'>): MaskShape {
  switch (kind) {
    case 'brush':
      return { kind: 'brush' };
    case 'radial':
      return { kind: 'radial', cx: 0.5, cy: 0.5, rx: 0.3, ry: 0.3, angle: 0, feather: 50 };
    case 'linear':
      return { kind: 'linear', x0: 0.5, y0: 0.2, x1: 0.5, y1: 0.55 };
    case 'color':
      return { kind: 'color', color: [0.5, 0.5, 0.5], at: { x: 0.5, y: 0.5 }, range: 30 };
    case 'luminance':
      return { kind: 'luminance', min: 70, max: 100, feather: 20 };
  }
}

export function isNeutralMaskAdjust(a: MaskAdjust): boolean {
  return (Object.keys(DEFAULT_MASK_ADJUST) as MaskAdjustKey[]).every((k) => (a[k] ?? 0) === 0);
}

/** Fills fields missing from stored masks (older documents, partial copies). */
export function completeMask(m: Partial<SelectiveMask> & Pick<SelectiveMask, 'id' | 'shape'>): SelectiveMask {
  return {
    name: MASK_KIND_LABEL[m.shape.kind],
    visible: true,
    invert: false,
    strokes: [],
    ...m,
    adjust: { ...DEFAULT_MASK_ADJUST, ...m.adjust },
  };
}

export const NO_BACKGROUND: BackgroundEdit = {
  mode: 'none',
  subject: null,
  blur: { strength: 100, radius: 45 },
  replace: { fill: { kind: 'color', color: '#F7F4EF' }, adjust: { ...DEFAULT_BG_ADJUST } },
  brightness: 0,
  saturation: 0,
  edge: 30,
};

export function completeBackground(b: Partial<BackgroundEdit> | null | undefined): BackgroundEdit {
  if (!b) return NO_BACKGROUND;
  return {
    ...NO_BACKGROUND,
    ...b,
    blur: { ...NO_BACKGROUND.blur, ...b.blur },
    replace: b.replace ? { fill: b.replace.fill, adjust: { ...DEFAULT_BG_ADJUST, ...b.replace.adjust } } : NO_BACKGROUND.replace,
  };
}

/** Whether the background stage changes any pixel. */
export function backgroundActive(b: BackgroundEdit): boolean {
  if (!b.subject) return false;
  return b.mode !== 'none' || b.brightness !== 0 || b.saturation !== 0;
}
