import { create } from 'zustand';

import { DEFAULT_ADJUSTMENTS, DEFAULT_RETOUCH } from '@/constants/adjustments';
import { DEFAULT_FACE_RETOUCH, isNeutralFace } from '@/constants/faceRetouch';
import { aspectRatioOf } from '@/constants/crop';
import { DEFAULT_FILTER_INTENSITY, ORIGINAL_FILTER_ID } from '@/constants/filters';
import { centeredCrop, rotatedSize } from '@/services/imagePipeline';
import type {
  AdjustmentKey,
  CropAspectId,
  EditState,
  FaceRetouch,
  FaceRetouchKey,
  Geometry,
  BlemishSpot,
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
    spots: [],
    faces: {},
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
  /** Face retouch for one detected face (live; `commit()` when the slider is released). */
  setFaceRetouch: (faceId: string, key: FaceRetouchKey, value: number) => void;
  commit: () => void;

  /** 터치 보정: live while dragging; `commit()` on release (one undo step per stroke). */
  beginStroke: (point: NormalizedPoint, radius: number, strength: number, kind: ReshapeStroke['kind']) => void;
  extendStroke: (point: NormalizedPoint) => void;
  /** Drops the live (uncommitted) stroke, e.g. when a second finger starts a pinch. */
  cancelStroke: () => void;
  clearReshape: () => void;
  /** 잡티 제거: one undo step per tap. */
  addSpot: (spot: Omit<BlemishSpot, 'id'>) => void;
  clearSpots: () => void;

  /** Discrete updates — committed immediately. */
  setFilter: (id: string) => void;
  resetAdjustment: (key: AdjustmentKey) => void;
  resetRetouch: (key: RetouchKey) => void;
  /** Clears `keys` for one face (a single control or a whole category). */
  resetFaceRetouch: (faceId: string, keys: readonly FaceRetouchKey[]) => void;
  /** Clears face retouch on every face. */
  resetAllFaces: () => void;
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
    setFaceRetouch: (faceId, key, value) =>
      set((s) => {
        const prev: FaceRetouch = s.present.faces[faceId] ?? DEFAULT_FACE_RETOUCH;
        if (prev[key] === value) return s;
        return { present: { ...s.present, faces: { ...s.present.faces, [faceId]: { ...prev, [key]: value } } } };
      }),
    commit: () => commitState(get().present),

    beginStroke: (point, radius, strength, kind) =>
      set((s) => ({
        present: { ...s.present, reshape: [...s.present.reshape, { id: nextStrokeId++, radius, strength, kind, points: [point] }] },
      })),
    extendStroke: (point) =>
      set((s) => {
        const strokes = s.present.reshape;
        const last = strokes[strokes.length - 1];
        if (!last) return s;
        const stroke: ReshapeStroke = { ...last, points: [...last.points, point] };
        return { present: { ...s.present, reshape: [...strokes.slice(0, -1), stroke] } };
      }),
    addSpot: (spot) => update((s) => ({ ...s, spots: [...s.spots, { ...spot, id: nextStrokeId++ }] })),
    clearSpots: () => {
      if (get().present.spots.length === 0) return;
      update((s) => ({ ...s, spots: [] }));
    },
    cancelStroke: () => set((s) => (s.present === s.committed ? s : { present: s.committed })),
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
    resetFaceRetouch: (faceId, keys) => {
      const prev = get().present.faces[faceId];
      if (!prev || keys.every((k) => prev[k] === 0)) return;
      update((s) => {
        const next: FaceRetouch = { ...prev };
        for (const k of keys) next[k] = 0;
        const faces = { ...s.faces };
        if (isNeutralFace(next)) delete faces[faceId];
        else faces[faceId] = next;
        return { ...s, faces };
      });
    },
    resetAllFaces: () => {
      if (Object.keys(get().present.faces).length === 0) return;
      update((s) => ({ ...s, faces: {} }));
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
