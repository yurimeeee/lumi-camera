import { create } from 'zustand';

import { DEFAULT_ADJUSTMENTS, DEFAULT_RETOUCH } from '@/constants/adjustments';
import { aspectRatioOf } from '@/constants/crop';
import { DEFAULT_FILTER_INTENSITY, ORIGINAL_FILTER_ID } from '@/constants/filters';
import { centeredCrop, rotatedSize } from '@/services/imagePipeline';
import type {
  AdjustmentKey,
  CropAspectId,
  EditState,
  Geometry,
  NormalizedPoint,
  NormalizedRect,
  ReshapeStroke,
  RetouchKey,
  SourceImage,
} from '@/types/editing';

export const HISTORY_LIMIT = 40;

let nextStrokeId = 1;

export const DEFAULT_GEOMETRY: Geometry = {
  rotation: 0,
  flipH: false,
  flipV: false,
  crop: null,
  aspect: 'original',
};

export function createEditState(partial?: Partial<EditState>): EditState {
  return {
    filterId: ORIGINAL_FILTER_ID,
    intensity: DEFAULT_FILTER_INTENSITY,
    adjustments: { ...DEFAULT_ADJUSTMENTS },
    retouch: { ...DEFAULT_RETOUCH },
    geometry: { ...DEFAULT_GEOMETRY },
    reshape: [],
    dateStamp: false,
    ...partial,
  };
}

interface EditorState {
  source: SourceImage | null;
  present: EditState;
  /** Last state pushed to history; live slider changes diverge from it until committed. */
  committed: EditState;
  past: EditState[];
  future: EditState[];
}

interface EditorActions {
  open: (source: SourceImage, initial?: Partial<EditState>) => void;
  close: () => void;

  /** Live updates (sliders). Call `commit()` when the gesture ends. */
  setIntensity: (value: number) => void;
  setAdjustment: (key: AdjustmentKey, value: number) => void;
  setRetouch: (key: RetouchKey, value: number) => void;
  commit: () => void;

  /** 터치 보정: live while dragging; `commit()` on release (one undo step per stroke). */
  beginStroke: (point: NormalizedPoint, radius: number, strength: number) => void;
  extendStroke: (point: NormalizedPoint) => void;
  clearReshape: () => void;

  /** Discrete updates — committed immediately. */
  setFilter: (id: string) => void;
  resetAdjustment: (key: AdjustmentKey) => void;
  resetRetouch: (key: RetouchKey) => void;
  resetAll: () => void;
  rotate: () => void;
  flip: (axis: 'h' | 'v') => void;
  setAspect: (aspect: CropAspectId, crop: NormalizedRect | null) => void;
  setCrop: (crop: NormalizedRect | null) => void;
  setDateStamp: (on: boolean) => void;

  undo: () => void;
  redo: () => void;
}

const initial: EditorState = {
  source: null,
  present: createEditState(),
  committed: createEditState(),
  past: [],
  future: [],
};

export const useEditorStore = create<EditorState & EditorActions>()((set, get) => {
  /** Push the previous committed snapshot to history and make `next` the new baseline. */
  const commitState = (next: EditState) => {
    const { committed, past } = get();
    if (next === committed) return;
    set({
      present: next,
      committed: next,
      past: [...past, committed].slice(-HISTORY_LIMIT),
      future: [],
    });
  };

  const update = (fn: (s: EditState) => EditState) => commitState(fn(get().present));

  return {
    ...initial,

    open: (source, partial) => {
      const state = createEditState(partial);
      set({ source, present: state, committed: state, past: [], future: [] });
    },
    close: () => set(initial),

    setIntensity: (intensity) => set((s) => ({ present: { ...s.present, intensity } })),
    setAdjustment: (key, value) =>
      set((s) => ({ present: { ...s.present, adjustments: { ...s.present.adjustments, [key]: value } } })),
    setRetouch: (key, value) =>
      set((s) => ({ present: { ...s.present, retouch: { ...s.present.retouch, [key]: value } } })),
    commit: () => commitState(get().present),

    beginStroke: (point, radius, strength) =>
      set((s) => ({
        present: { ...s.present, reshape: [...s.present.reshape, { id: nextStrokeId++, radius, strength, points: [point] }] },
      })),
    extendStroke: (point) =>
      set((s) => {
        const strokes = s.present.reshape;
        const last = strokes[strokes.length - 1];
        if (!last) return s;
        const stroke: ReshapeStroke = { ...last, points: [...last.points, point] };
        return { present: { ...s.present, reshape: [...strokes.slice(0, -1), stroke] } };
      }),
    clearReshape: () => {
      if (get().present.reshape.length === 0) return;
      update((s) => ({ ...s, reshape: [] }));
    },

    setFilter: (filterId) => {
      if (get().present.filterId === filterId) return;
      update((s) => ({ ...s, filterId }));
    },
    resetAdjustment: (key) => {
      if (get().present.adjustments[key] === 0) return;
      update((s) => ({ ...s, adjustments: { ...s.adjustments, [key]: 0 } }));
    },
    resetRetouch: (key) => {
      if (get().present.retouch[key] === 0) return;
      update((s) => ({ ...s, retouch: { ...s.retouch, [key]: 0 } }));
    },
    resetAll: () =>
      update((s) =>
        createEditState({ dateStamp: s.dateStamp }),
      ),
    rotate: () =>
      update((s) => {
        const rotation = ((s.geometry.rotation + 90) % 360) as Geometry['rotation'];
        // A crop drawn for the old orientation no longer applies: keep a locked
        // ratio by re-centring it, otherwise fall back to the full frame.
        const ratio = aspectRatioOf(s.geometry.aspect);
        const src = get().source;
        const turned = src ? rotatedSize(src.width, src.height, rotation) : null;
        const crop = ratio && turned ? centeredCrop(turned.width, turned.height, ratio) : null;
        return {
          ...s,
          geometry: { ...s.geometry, rotation, crop, aspect: crop ? s.geometry.aspect : 'original' },
        };
      }),
    flip: (axis) =>
      update((s) => ({
        ...s,
        geometry: {
          ...s.geometry,
          flipH: axis === 'h' ? !s.geometry.flipH : s.geometry.flipH,
          flipV: axis === 'v' ? !s.geometry.flipV : s.geometry.flipV,
          crop: s.geometry.crop && flipRect(s.geometry.crop, axis),
        },
      })),
    setAspect: (aspect, crop) => update((s) => ({ ...s, geometry: { ...s.geometry, aspect, crop } })),
    setCrop: (crop) => update((s) => ({ ...s, geometry: { ...s.geometry, crop } })),
    setDateStamp: (dateStamp) => update((s) => ({ ...s, dateStamp })),

    undo: () => {
      const { past, present, future } = get();
      const prev = past[past.length - 1];
      if (!prev) return;
      set({ present: prev, committed: prev, past: past.slice(0, -1), future: [present, ...future] });
    },
    redo: () => {
      const { past, present, future } = get();
      const next = future[0];
      if (!next) return;
      set({ present: next, committed: next, past: [...past, present].slice(-HISTORY_LIMIT), future: future.slice(1) });
    },
  };
});

function flipRect(r: NormalizedRect, axis: 'h' | 'v'): NormalizedRect {
  return axis === 'h' ? { ...r, x: 1 - r.x - r.width } : { ...r, y: 1 - r.y - r.height };
}

export const useCanUndo = () => useEditorStore((s) => s.past.length > 0);
export const useCanRedo = () => useEditorStore((s) => s.future.length > 0);
