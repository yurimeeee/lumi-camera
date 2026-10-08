import type { FilterCategory, FilterDefinition, FilterTab } from '@/types/filters';

/**
 * Filter catalogue. A filter is pure data: a set of tone parameters in the
 * same -100…100 space as manual adjustments, an optional split tone and a
 * live-preview approximation for the camera. Add a new look by appending an
 * entry here — no UI or shader changes required.
 */
export const FILTERS: readonly FilterDefinition[] = [
  {
    id: 'original',
    name: 'Original',
    category: 'original',
    description: '있는 그대로의 빛',
    params: {},
    preview: [],
  },

  // Warm
  {
    id: 'mellow',
    name: 'Mellow',
    category: 'warm',
    description: '따뜻하고 부드러운 무드의 필터',
    params: { temperature: 16, warmth: 18, contrast: -10, highlights: -14, shadows: 8, saturation: -6, fade: 12 },
    splitTone: { shadows: [0.52, 0.48, 0.46], highlights: [0.62, 0.52, 0.42], amount: 40 },
    // Soft shoulder: highlights roll off gently, shadows open a touch.
    curves: { rgb: [{ x: 0, y: 0.03 }, { x: 0.3, y: 0.32 }, { x: 0.78, y: 0.76 }, { x: 1, y: 0.96 }] },
    hsl: { orange: { saturation: -6, luminance: 6 }, green: { saturation: -14 } },
    preview: [{ color: '#F2B98A', blend: 'soft-light', opacity: 0.38 }],
  },
  {
    id: 'butter',
    name: 'Butter',
    category: 'warm',
    description: '버터처럼 노르스름한 오후의 햇살',
    params: { temperature: 22, tint: -5, exposure: 6, highlights: -12, saturation: 8, fade: 8 },
    splitTone: { shadows: [0.5, 0.5, 0.46], highlights: [0.62, 0.58, 0.38], amount: 45 },
    preview: [{ color: '#F5D27A', blend: 'soft-light', opacity: 0.42 }],
  },
  {
    id: 'sunday',
    name: 'Sunday',
    category: 'warm',
    description: '늦잠 잔 일요일 아침처럼 나른하게',
    params: { brightness: 12, temperature: 12, contrast: -14, shadows: 16, saturation: -10, fade: 18 },
    splitTone: { shadows: [0.54, 0.5, 0.46], highlights: [0.58, 0.53, 0.46], amount: 30 },
    preview: [
      { color: '#F7D9B8', blend: 'soft-light', opacity: 0.4 },
      { color: '#FFF4E6', blend: 'screen', opacity: 0.12 },
    ],
  },
  {
    id: 'peachy',
    name: 'Peachy',
    category: 'warm',
    description: '복숭아빛 볼처럼 화사한 핑크',
    params: { brightness: 8, temperature: 10, tint: 12, warmth: 10, contrast: -6, saturation: 4 },
    splitTone: { shadows: [0.54, 0.47, 0.5], highlights: [0.62, 0.5, 0.48], amount: 45 },
    // Pink highlights, lifted (low-contrast) blacks, bright skin.
    curves: {
      rgb: [{ x: 0, y: 0.05 }, { x: 0.5, y: 0.52 }, { x: 1, y: 1 }],
      red: [{ x: 0, y: 0 }, { x: 0.7, y: 0.74 }, { x: 1, y: 1 }],
    },
    hsl: { orange: { hue: -6, saturation: -4, luminance: 14 }, red: { hue: 8, luminance: 6 } },
    preview: [{ color: '#F6B3A1', blend: 'soft-light', opacity: 0.42 }],
  },
  {
    id: 'linen',
    name: 'Linen',
    category: 'warm',
    description: '바랜 리넨처럼 차분한 베이지',
    params: { brightness: 6, temperature: 8, contrast: -16, saturation: -22, fade: 22, highlights: -8 },
    splitTone: { shadows: [0.52, 0.5, 0.47], highlights: [0.56, 0.53, 0.47], amount: 40 },
    preview: [
      { color: '#B8A58E', blend: 'saturation', opacity: 0.22 },
      { color: '#EAD8C0', blend: 'soft-light', opacity: 0.4 },
    ],
  },

  // Cool
  {
    id: 'mist',
    name: 'Mist',
    category: 'cool',
    description: '새벽 안개처럼 맑고 서늘하게',
    params: { brightness: 8, temperature: -22, tint: -3, contrast: -14, saturation: -16, fade: 20 },
    splitTone: { shadows: [0.44, 0.5, 0.58], highlights: [0.48, 0.52, 0.56], amount: 45 },
    preview: [
      { color: '#BFD3E0', blend: 'soft-light', opacity: 0.45 },
      { color: '#F2F6F8', blend: 'screen', opacity: 0.12 },
    ],
  },
  {
    id: 'blue-hour',
    name: 'Blue Hour',
    category: 'cool',
    description: '해가 진 직후의 푸른 시간',
    params: { temperature: -34, tint: -2, contrast: 8, shadows: -6, saturation: -8, vignette: 16 },
    splitTone: { shadows: [0.4, 0.47, 0.64], highlights: [0.48, 0.5, 0.6], amount: 60 },
    // Blue lifted into the shadows.
    curves: { blue: [{ x: 0, y: 0.08 }, { x: 0.4, y: 0.45 }, { x: 1, y: 0.97 }] },
    hsl: { blue: { saturation: 10, luminance: -6 }, orange: { saturation: -18 } },
    preview: [{ color: '#7E95C9', blend: 'soft-light', opacity: 0.5 }],
  },
  {
    id: 'breeze',
    name: 'Breeze',
    category: 'cool',
    description: '바닷바람처럼 산뜻한 청량감',
    params: { brightness: 10, temperature: -10, tint: -4, highlights: -10, vibrance: 12, fade: 6 },
    splitTone: { shadows: [0.46, 0.52, 0.54], highlights: [0.52, 0.53, 0.5], amount: 30 },
    hsl: { aqua: { saturation: 16, luminance: 8 }, blue: { hue: -8, saturation: 8 } },
    preview: [{ color: '#A6D8D8', blend: 'soft-light', opacity: 0.4 }],
  },

  // Film
  {
    id: 'film-35',
    name: 'Film 35',
    category: 'film',
    description: '35mm 필름 특유의 입자와 색',
    params: { contrast: 12, temperature: 6, saturation: -6, fade: 14, grain: 28, vignette: 18 },
    splitTone: { shadows: [0.44, 0.52, 0.53], highlights: [0.58, 0.53, 0.45], amount: 50 },
    // Film toe and shoulder: faded black, compressed white, warm highlights.
    curves: {
      rgb: [{ x: 0, y: 0.07 }, { x: 0.25, y: 0.22 }, { x: 0.75, y: 0.8 }, { x: 1, y: 0.94 }],
      red: [{ x: 0, y: 0 }, { x: 0.75, y: 0.78 }, { x: 1, y: 1 }],
      blue: [{ x: 0, y: 0.04 }, { x: 0.75, y: 0.72 }, { x: 1, y: 0.96 }],
    },
    hsl: { green: { hue: 10, saturation: -16 }, blue: { hue: -6, saturation: -10 } },
    preview: [
      { color: '#3E6E6A', blend: 'soft-light', opacity: 0.22 },
      { color: '#F0C48E', blend: 'soft-light', opacity: 0.28 },
    ],
  },
  {
    id: 'dusty',
    name: 'Dusty',
    category: 'film',
    description: '오래된 앨범 속 먼지 쌓인 색감',
    params: { contrast: -10, temperature: 6, tint: 4, saturation: -28, fade: 24, grain: 14 },
    splitTone: { shadows: [0.52, 0.49, 0.48], highlights: [0.55, 0.52, 0.48], amount: 35 },
    curves: { rgb: [{ x: 0, y: 0.08 }, { x: 1, y: 0.92 }] },
    preview: [
      { color: '#9C8C80', blend: 'saturation', opacity: 0.3 },
      { color: '#D9C2AE', blend: 'soft-light', opacity: 0.38 },
    ],
  },
  {
    id: 'portra',
    name: 'Portra',
    category: 'film',
    description: '인물 피부를 곱게 담는 컬러 네거티브',
    params: { warmth: 10, highlights: -14, shadows: 10, contrast: -4, saturation: -6, vibrance: 10, grain: 10 },
    splitTone: { shadows: [0.49, 0.5, 0.52], highlights: [0.6, 0.53, 0.46], amount: 40 },
    curves: { rgb: [{ x: 0, y: 0.04 }, { x: 0.25, y: 0.24 }, { x: 0.75, y: 0.77 }, { x: 1, y: 0.97 }] },
    hsl: { orange: { saturation: -10, luminance: 10 }, red: { saturation: -8 }, green: { hue: 8, saturation: -12 } },
    preview: [{ color: '#EDBE97', blend: 'soft-light', opacity: 0.32 }],
  },
  {
    id: 'fade',
    name: 'Fade',
    category: 'film',
    description: '빛바랜 사진처럼 아련하게',
    params: { contrast: -22, shadows: 12, saturation: -10, fade: 38 },
    preview: [
      { color: '#FFFFFF', blend: 'screen', opacity: 0.18 },
      { color: '#C9C0B5', blend: 'saturation', opacity: 0.2 },
    ],
  },
  {
    id: 'grain',
    name: 'Grain',
    category: 'film',
    description: '거친 입자가 살아있는 필름',
    params: { contrast: 10, saturation: -10, grain: 48, vignette: 12 },
    preview: [{ color: '#8A7E72', blend: 'soft-light', opacity: 0.25 }],
  },

  // Soft
  {
    id: 'cream',
    name: 'Cream',
    category: 'soft',
    description: '크림처럼 포근하고 밝은 톤',
    params: { brightness: 12, temperature: 8, contrast: -18, highlights: -10, saturation: -10, fade: 16, glow: 10 },
    splitTone: { shadows: [0.53, 0.5, 0.47], highlights: [0.57, 0.54, 0.48], amount: 35 },
    curves: { rgb: [{ x: 0, y: 0.06 }, { x: 0.5, y: 0.55 }, { x: 1, y: 0.98 }] },
    hsl: { orange: { luminance: 8 }, yellow: { saturation: -10 } },
    preview: [
      { color: '#FBEBD5', blend: 'soft-light', opacity: 0.5 },
      { color: '#FFF8EE', blend: 'screen', opacity: 0.14 },
    ],
  },
  {
    id: 'haze',
    name: 'Haze',
    category: 'soft',
    description: '아지랑이처럼 몽글한 빛 번짐',
    params: { brightness: 10, contrast: -24, saturation: -14, fade: 28, glow: 18 },
    preview: [{ color: '#FFFFFF', blend: 'screen', opacity: 0.22 }],
  },
  {
    id: 'bloom',
    name: 'Bloom',
    category: 'soft',
    description: '하이라이트가 은은하게 피어나는',
    params: { brightness: 8, temperature: 6, highlights: -8, contrast: -6, saturation: 6, glow: 30 },
    preview: [
      { color: '#FFE7D6', blend: 'screen', opacity: 0.18 },
      { color: '#F4C7A8', blend: 'soft-light', opacity: 0.25 },
    ],
  },

  // B&W
  {
    id: 'noir',
    name: 'Noir',
    category: 'bw',
    description: '깊은 그림자의 하이 콘트라스트 흑백',
    params: { saturation: -100, contrast: 30, shadows: -12, vignette: 22, grain: 12 },
    // Deep S-curve.
    curves: { rgb: [{ x: 0, y: 0 }, { x: 0.25, y: 0.17 }, { x: 0.75, y: 0.85 }, { x: 1, y: 1 }] },
    preview: [
      { color: '#808080', blend: 'saturation', opacity: 1 },
      { color: '#3A3A3A', blend: 'soft-light', opacity: 0.35 },
    ],
  },
  {
    id: 'mono',
    name: 'Mono',
    category: 'bw',
    description: '담백한 클래식 흑백',
    params: { saturation: -100, contrast: 6, fade: 10 },
    preview: [{ color: '#808080', blend: 'saturation', opacity: 1 }],
  },
  {
    id: 'silver',
    name: 'Silver',
    category: 'bw',
    description: '은빛으로 반짝이는 부드러운 흑백',
    params: { saturation: -100, brightness: 8, contrast: -6, highlights: -10, fade: 18 },
    splitTone: { shadows: [0.48, 0.5, 0.53], highlights: [0.51, 0.5, 0.49], amount: 25 },
    curves: { rgb: [{ x: 0, y: 0.05 }, { x: 0.6, y: 0.64 }, { x: 1, y: 0.97 }] },
    preview: [
      { color: '#808080', blend: 'saturation', opacity: 1 },
      { color: '#FFFFFF', blend: 'screen', opacity: 0.12 },
    ],
  },
];

export const ORIGINAL_FILTER_ID = 'original';

const FILTER_MAP = new Map(FILTERS.map((f) => [f.id, f]));

export function getFilter(id: string | null | undefined): FilterDefinition {
  return (id && FILTER_MAP.get(id)) || FILTER_MAP.get(ORIGINAL_FILTER_ID)!;
}

export const FILTER_TABS: readonly { id: FilterTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'warm', label: 'Warm' },
  { id: 'cool', label: 'Cool' },
  { id: 'film', label: 'Film' },
  { id: 'soft', label: 'Soft' },
  { id: 'bw', label: 'B&W' },
];

export const CATEGORY_LABEL: Record<FilterCategory, string> = {
  original: 'Original',
  warm: 'Warm',
  cool: 'Cool',
  film: 'Film',
  soft: 'Soft',
  bw: 'B&W',
};

export function filtersForTab(tab: FilterTab, favorites: readonly string[]): FilterDefinition[] {
  if (tab === 'all') return [...FILTERS];
  if (tab === 'favorites') {
    const set = new Set(favorites);
    // Keep "Original" first so there's always a way back to no filter.
    return FILTERS.filter((f) => f.id === ORIGINAL_FILTER_ID || set.has(f.id));
  }
  return FILTERS.filter((f) => f.id === ORIGINAL_FILTER_ID || f.category === tab);
}

export const DEFAULT_FILTER_INTENSITY = 80;
