import type { RetouchCategory } from '@/constants/faceRetouch';
import type { LookTab } from '@/types/filters';

/** Main editor menus (bottom toolbar). */
export type EditorTool = 'filter' | 'adjust' | 'portrait' | 'touch' | 'effects' | 'frame' | 'crop';

export type FilterView = 'presets' | 'mix' | 'recipes';
export type AdjustView = 'basic' | 'hsl' | 'curves';
export type EffectsView = 'film' | 'grain' | 'leak' | 'bloom';
export type FrameView = 'frames' | 'layouts' | 'background' | 'decorate';

/**
 * Where the user is inside each menu. Kept by the editor screen (not the
 * panels, which unmount when another menu opens) so coming back to a menu
 * shows the tab it was left on. Edit values live in the editor store.
 */
export interface EditorNav {
  filter: FilterView;
  /** Preset category in Filters › Presets. */
  filterTab: LookTab;
  adjust: AdjustView;
  portrait: RetouchCategory;
  effects: EffectsView;
  frame: FrameView;
}

export const DEFAULT_NAV: EditorNav = {
  filter: 'presets',
  filterTab: 'all',
  adjust: 'basic',
  portrait: 'skin',
  effects: 'film',
  frame: 'frames',
};

export const FILTER_VIEWS: readonly { value: FilterView; label: string }[] = [
  { value: 'presets', label: 'Presets' },
  { value: 'mix', label: 'Mix' },
  { value: 'recipes', label: 'My Recipe' },
];

export const ADJUST_VIEWS: readonly { value: AdjustView; label: string }[] = [
  { value: 'basic', label: '기본' },
  { value: 'hsl', label: 'HSL' },
  { value: 'curves', label: '커브' },
];

export const EFFECTS_VIEWS: readonly { value: EffectsView; label: string }[] = [
  { value: 'film', label: '필름' },
  { value: 'grain', label: '그레인' },
  { value: 'leak', label: '빛샘' },
  { value: 'bloom', label: 'Bloom' },
];

export const FRAME_VIEWS: readonly { value: FrameView; label: string }[] = [
  { value: 'frames', label: '프레임' },
  { value: 'layouts', label: '레이아웃' },
  { value: 'background', label: '배경' },
  { value: 'decorate', label: '꾸미기' },
];
