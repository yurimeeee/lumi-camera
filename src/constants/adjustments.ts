import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import type { AdjustmentKey, Adjustments, Retouch } from '@/types/editing';

type IconName = ComponentProps<typeof Ionicons>['name'];

export interface ControlSpec<K extends string> {
  key: K;
  label: string;
  icon: IconName;
  min: number;
  max: number;
}

export const ADJUST_TOOLS: readonly ControlSpec<AdjustmentKey>[] = [
  { key: 'brightness', label: '밝기', icon: 'sunny-outline', min: -100, max: 100 },
  { key: 'exposure', label: '노출', icon: 'aperture-outline', min: -100, max: 100 },
  { key: 'contrast', label: '대비', icon: 'contrast-outline', min: -100, max: 100 },
  { key: 'highlights', label: '하이라이트', icon: 'partly-sunny-outline', min: -100, max: 100 },
  { key: 'shadows', label: '그림자', icon: 'cloudy-night-outline', min: -100, max: 100 },
  { key: 'saturation', label: '채도', icon: 'water-outline', min: -100, max: 100 },
  { key: 'vibrance', label: '생동감', icon: 'color-palette-outline', min: -100, max: 100 },
  { key: 'warmth', label: '따뜻함', icon: 'flame-outline', min: -100, max: 100 },
  { key: 'temperature', label: '색온도', icon: 'thermometer-outline', min: -100, max: 100 },
  { key: 'tint', label: '색조', icon: 'color-filter-outline', min: -100, max: 100 },
  { key: 'sharpness', label: '선명도', icon: 'triangle-outline', min: 0, max: 100 },
  { key: 'definition', label: '정의', icon: 'prism-outline', min: -100, max: 100 },
];

export const EFFECT_TOOLS: readonly ControlSpec<AdjustmentKey>[] = [
  { key: 'fade', label: '페이드', icon: 'cloud-outline', min: 0, max: 100 },
  { key: 'vignette', label: '비네팅', icon: 'ellipse-outline', min: -100, max: 100 },
  { key: 'grain', label: '그레인', icon: 'grid-outline', min: 0, max: 100 },
];

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  brightness: 0,
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  saturation: 0,
  vibrance: 0,
  warmth: 0,
  temperature: 0,
  tint: 0,
  sharpness: 0,
  definition: 0,
  fade: 0,
  vignette: 0,
  grain: 0,
};

export const DEFAULT_RETOUCH: Retouch = {
  skin: 0,
  smooth: 0,
  tone: 0,
  glow: 0,
  detail: 0,
};
