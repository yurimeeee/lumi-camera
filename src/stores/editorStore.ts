import { create } from 'zustand';

import { DEFAULT_ADJUSTMENTS, DEFAULT_RETOUCH } from '@/constants/adjustments';
import { completeFaceRetouch, DEFAULT_FACE_RETOUCH, isNeutralFace } from '@/constants/faceRetouch';
import { completeFilm, completeFrame, DEFAULT_FILM, DEFAULT_STAMP_STYLE, NO_FRAME } from '@/constants/film';
import { aspectRatioOf } from '@/constants/crop';
import { completeBackground, completeMask } from '@/constants/masks';
import { DEFAULT_FILTER_INTENSITY, ORIGINAL_FILTER_ID } from '@/constants/filters';
import { DEFAULT_CURVES } from '@/services/color/curves';
import { DEFAULT_HSL } from '@/services/color/hsl';
import { applyAutoShare } from '@/services/autoEnhance';
import { centeredCrop, rotatedSize } from '@/services/imagePipeline';
import type { DateStampStyle, FilmEffects, FilterMix, FrameSettings } from '@/types/film';
import type { AutoValues, BackgroundEdit, ImageStats, MaskStroke, ObjectRemoval, SelectiveMask } from '@/types/phase4';
import type {
  AdjustmentKey,
  Adjustments,
  CurveChannel,
  CurvePoint,
  CurveSettings,
  HslAdjust,
  HslColor,
  HslSettings,
  CropAspectId,
  EditState,
  FaceAnchor,
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
    recipeId: null,
    adjustments: { ...DEFAULT_ADJUSTMENTS },
    hsl: DEFAULT_HSL,
    curves: DEFAULT_CURVES,
    retouch: { ...DEFAULT_RETOUCH },
    geometry: { ...DEFAULT_GEOMETRY },
    reshape: [],
    spots: [],
    faces: {},
    faceAnchors: {},
    mix: null,
    film: DEFAULT_FILM,
    frame: NO_FRAME,
    dateStamp: false,
    stamp: DEFAULT_STAMP_STYLE,
    stampDate: null,
    ...partial,
    // Fields added in later versions (restored projects) get their defaults.
    ...(partial?.retouch ? { retouch: { ...DEFAULT_RETOUCH, ...partial.retouch } } : null),
    ...(partial?.faces
      ? { faces: Object.fromEntries(Object.entries(partial.faces).map(([id, r]) => [id, completeFaceRetouch(r)])) }
      : null),
    ...(partial?.faceAnchors ? null : { faceAnchors: {} }),
    ...(partial?.film ? { film: completeFilm(partial.film) } : null),
    ...(partial?.frame ? { frame: completeFrame(partial.frame) } : null),
    ...(partial?.stamp ? { stamp: { ...DEFAULT_STAMP_STYLE, ...partial.stamp } } : null),
    // Phase 4 fields: null/undefined in older documents.
    autoEnhance: partial?.autoEnhance ?? null,
    masks: (partial?.masks ?? []).map(completeMask),
    removals: partial?.removals ?? [],
    background: completeBackground(partial?.background),
  } as EditState;
}

/** The colour part of an edit. */
export interface ColorLook {
  filterId: string;
  intensity: number;
  /** Filter B (applied after A); absent = no mix. */
  mix?: FilterMix | null;
  adjustments: Adjustments;
  hsl: HslSettings;
  curves: CurveSettings;
}

/**
 * Everything a My Recipe or a camera look carries: colour, film effects,
 * frame and the date stamp's style (never the date itself, the crop, face
 * edits or anything else that belongs to one photo).
 */
export interface Look extends ColorLook {
  film: FilmEffects;
  frame: FrameSettings;
  dateStamp: boolean;
  stamp: DateStampStyle;
}

export function colorLookOf(s: EditState): ColorLook {
  return { filterId: s.filterId, intensity: s.intensity, mix: s.mix, adjustments: s.adjustments, hsl: s.hsl, curves: s.curves };
}

export function lookOf(s: EditState): Look {
  return { ...colorLookOf(s), film: s.film, frame: s.frame, dateStamp: s.dateStamp, stamp: s.stamp };
}

interface EditorState {
  source: SourceImage | null;
  present: EditState;
  /** Last state pushed to history; live slider changes diverge from it until committed. */
  committed: EditState;
  past: EditState[];
  future: EditState[];
  /** Opened from an autosaved project: leaving should still ask before discarding. */
  restored: boolean;
}

interface EditorActions {
  open: (source: SourceImage, initial?: Partial<EditState>) => void;
  close: () => void;

  /** Live updates (sliders). Call `commit()` when the gesture ends. */
  setIntensity: (value: number) => void;
  setAdjustment: (key: AdjustmentKey, value: number) => void;
  setRetouch: (key: RetouchKey, value: number) => void;
  /**
   * Face retouch for one detected face (live; `commit()` when the slider is
   * released). `anchor` records where the face is the first time it's edited,
   * so a later re-detection can find it again (services/faceDetection/faceIdentity).
   */
  setFaceRetouch: (faceId: string, key: FaceRetouchKey, value: number, anchor?: FaceAnchor) => void;
  /** HSL for one colour band (live; `commit()` on release). */
  setHsl: (color: HslColor, key: keyof HslAdjust, value: number) => void;
  /** Curve points for one channel (live while dragging; `commit()` on release). */
  setCurve: (channel: CurveChannel, points: readonly CurvePoint[]) => void;
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
  /**
   * Applies a look (My Recipe) as one undo step: filter, mix, every colour
   * value and — when the look has them — film effects, frame and date stamp
   * style are replaced by copies of the recipe's. Retouch, geometry, touch
   * edits and the stamp's date are photo-specific and stay as they are.
   */
  applyLook: (look: ColorLook | Look, recipeId: string | null) => void;
  /** Filter B of a mix (null removes it). One undo step. */
  setMix: (mix: FilterMix | null) => void;
  /** Filter B strength (live; `commit()` on release). */
  setMixIntensity: (value: number) => void;
  /** Film effects (live while dragging; `commit()` on release). */
  setFilm: (update: (f: FilmEffects) => FilmEffects) => void;
  /** Frame (live; `commit()` on release — style changes commit themselves). */
  setFrame: (update: (f: FrameSettings) => FrameSettings) => void;
  setStamp: (update: (s: DateStampStyle) => DateStampStyle) => void;
  /** Date for the stamp when the capture date is unknown. One undo step. */
  setStampDate: (ms: number | null) => void;
  resetHslColor: (color: HslColor) => void;
  resetHsl: () => void;
  resetCurve: (channel: CurveChannel) => void;
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

  /** Auto Enhance: adds the suggestion (at the current strength, 100 the first time). One undo step. */
  runAutoEnhance: (suggested: AutoValues, stats: ImageStats) => void;
  /** Auto strength 0…100 (live; `commit()` on release). Manual edits made since stay. */
  setAutoStrength: (strength: number) => void;
  /** Removes Auto's share of the adjustments. One undo step. */
  clearAutoEnhance: () => void;
  /** Drops uncommitted live changes (e.g. a press-and-hold comparison). */
  revertLive: () => void;

  // ── 선택 보정 masks ──
  /** Adds a mask on top (one undo step). */
  addMask: (mask: SelectiveMask) => void;
  /** Live change to one mask (`commit()` when the gesture / slider ends). */
  setMask: (id: string, fn: (m: SelectiveMask) => SelectiveMask) => void;
  /** Discrete change to one mask (one undo step). */
  editMask: (id: string, fn: (m: SelectiveMask) => SelectiveMask) => void;
  removeMask: (id: string) => void;
  /** Copies a mask right above the original; returns the copy's id. */
  duplicateMask: (id: string, newId: string, name: string) => void;
  /** Brush on a mask: live while dragging, `commit()` on release (one undo step per stroke). */
  beginMaskStroke: (id: string, stroke: Omit<MaskStroke, 'id'>) => void;
  extendMaskStroke: (id: string, point: MaskStroke['points'][number]) => void;

  // ── 객체 제거 / 배경 ──
  addRemoval: (removal: ObjectRemoval) => void;
  removeRemoval: (id: string) => void;
  clearRemovals: () => void;
  /** Live background change (`commit()` on release). */
  setBackground: (fn: (b: BackgroundEdit) => BackgroundEdit) => void;
  /** Discrete background change (one undo step). */
  editBackground: (fn: (b: BackgroundEdit) => BackgroundEdit) => void;

  undo: () => void;
  redo: () => void;
}

const initial: EditorState = {
  source: null,
  present: createEditState(),
  committed: createEditState(),
  past: [],
  future: [],
  restored: false,
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
      // Restored edits keep their ids; new strokes/spots must not collide.
      for (const item of [...state.reshape, ...state.spots, ...state.masks.flatMap((m) => m.strokes)]) nextStrokeId = Math.max(nextStrokeId, item.id + 1);
      set({ source, present: state, committed: state, past: [], future: [], restored: false });
    },
    close: () => set(initial),

    setIntensity: (intensity) => set((s) => ({ present: { ...s.present, intensity } })),
    setAdjustment: (key, value) =>
      set((s) => ({ present: { ...s.present, adjustments: { ...s.present.adjustments, [key]: value } } })),
    setRetouch: (key, value) =>
      set((s) => ({ present: { ...s.present, retouch: { ...s.present.retouch, [key]: value } } })),
    setFaceRetouch: (faceId, key, value, anchor) =>
      set((s) => {
        const prev: FaceRetouch = s.present.faces[faceId] ?? DEFAULT_FACE_RETOUCH;
        if (prev[key] === value) return s;
        const anchors = s.present.faceAnchors;
        const faceAnchors = anchor && !anchors[faceId] ? { ...anchors, [faceId]: anchor } : anchors;
        return { present: { ...s.present, faces: { ...s.present.faces, [faceId]: { ...prev, [key]: value } }, faceAnchors } };
      }),
    setHsl: (color, key, value) =>
      set((s) => {
        const prev = s.present.hsl[color];
        if (prev[key] === value) return s;
        return { present: { ...s.present, hsl: { ...s.present.hsl, [color]: { ...prev, [key]: value } } } };
      }),
    setCurve: (channel, points) =>
      set((s) => ({ present: { ...s.present, curves: { ...s.present.curves, [channel]: points } } })),
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
      update((s) => ({ ...s, filterId, recipeId: null }));
    },
    applyLook: (look, recipeId) =>
      update((s) => ({
        ...s,
        filterId: look.filterId,
        intensity: look.intensity,
        recipeId,
        mix: look.mix ? { ...look.mix } : null,
        adjustments: { ...DEFAULT_ADJUSTMENTS, ...look.adjustments },
        hsl: { ...DEFAULT_HSL, ...look.hsl },
        curves: { ...DEFAULT_CURVES, ...look.curves },
        ...('film' in look
          ? {
              film: completeFilm(look.film),
              frame: completeFrame(look.frame),
              dateStamp: look.dateStamp,
              stamp: { ...DEFAULT_STAMP_STYLE, ...look.stamp },
            }
          : null),
      })),
    setMix: (mix) => update((s) => ({ ...s, mix, recipeId: null })),
    setMixIntensity: (value) =>
      set((s) => (s.present.mix ? { present: { ...s.present, mix: { ...s.present.mix, intensity: value } } } : s)),
    setFilm: (fn) => set((s) => ({ present: { ...s.present, film: fn(s.present.film) } })),
    setFrame: (fn) => set((s) => ({ present: { ...s.present, frame: fn(s.present.frame) } })),
    setStamp: (fn) => set((s) => ({ present: { ...s.present, stamp: fn(s.present.stamp) } })),
    setStampDate: (stampDate) => update((s) => ({ ...s, stampDate })),
    resetHslColor: (color) => {
      const a = get().present.hsl[color];
      if (a.hue === 0 && a.saturation === 0 && a.luminance === 0) return;
      update((s) => ({ ...s, hsl: { ...s.hsl, [color]: DEFAULT_HSL[color] } }));
    },
    resetHsl: () => {
      if (get().present.hsl === DEFAULT_HSL) return;
      update((s) => ({ ...s, hsl: DEFAULT_HSL }));
    },
    resetCurve: (channel) => {
      if (get().present.curves[channel] === DEFAULT_CURVES[channel]) return;
      update((s) => ({ ...s, curves: { ...s.curves, [channel]: DEFAULT_CURVES[channel] } }));
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

    runAutoEnhance: (suggested, stats) =>
      update((s) => {
        const prev = s.autoEnhance;
        const strength = prev?.strength ?? 100;
        const { adjustments, applied } = applyAutoShare(s.adjustments, prev?.applied ?? {}, suggested, strength);
        return { ...s, adjustments, autoEnhance: { suggested, applied, strength, stats }, recipeId: null };
      }),
    setAutoStrength: (strength) =>
      set((st) => {
        const auto = st.present.autoEnhance;
        if (!auto || auto.strength === strength) return st;
        const { adjustments, applied } = applyAutoShare(st.present.adjustments, auto.applied, auto.suggested, strength);
        return { present: { ...st.present, adjustments, autoEnhance: { ...auto, applied, strength } } };
      }),
    clearAutoEnhance: () => {
      const auto = get().present.autoEnhance;
      if (!auto) return;
      update((s) => ({ ...s, adjustments: applyAutoShare(s.adjustments, auto.applied, {}, 0).adjustments, autoEnhance: null }));
    },
    revertLive: () => set((s) => (s.present === s.committed ? s : { present: s.committed })),

    addMask: (mask) => update((s) => ({ ...s, masks: [...s.masks, mask] })),
    setMask: (id, fn) =>
      set((st) => {
        const masks = st.present.masks.map((m) => (m.id === id ? fn(m) : m));
        return { present: { ...st.present, masks } };
      }),
    editMask: (id, fn) => {
      if (!get().present.masks.some((m) => m.id === id)) return;
      update((s) => ({ ...s, masks: s.masks.map((m) => (m.id === id ? fn(m) : m)) }));
    },
    removeMask: (id) => {
      if (!get().present.masks.some((m) => m.id === id)) return;
      update((s) => ({ ...s, masks: s.masks.filter((m) => m.id !== id) }));
    },
    duplicateMask: (id, newId, name) =>
      update((s) => {
        const i = s.masks.findIndex((m) => m.id === id);
        if (i < 0) return s;
        const copy: SelectiveMask = { ...s.masks[i]!, id: newId, name, strokes: [...s.masks[i]!.strokes], adjust: { ...s.masks[i]!.adjust } };
        return { ...s, masks: [...s.masks.slice(0, i + 1), copy, ...s.masks.slice(i + 1)] };
      }),
    beginMaskStroke: (id, stroke) =>
      set((st) => ({
        present: {
          ...st.present,
          masks: st.present.masks.map((m) => (m.id === id ? { ...m, strokes: [...m.strokes, { ...stroke, id: nextStrokeId++ }] } : m)),
        },
      })),
    extendMaskStroke: (id, point) =>
      set((st) => ({
        present: {
          ...st.present,
          masks: st.present.masks.map((m) => {
            if (m.id !== id) return m;
            const last = m.strokes[m.strokes.length - 1];
            if (!last) return m;
            return { ...m, strokes: [...m.strokes.slice(0, -1), { ...last, points: [...last.points, point] }] };
          }),
        },
      })),

    addRemoval: (removal) => update((s) => ({ ...s, removals: [...s.removals, removal] })),
    removeRemoval: (id) => {
      if (!get().present.removals.some((r) => r.id === id)) return;
      update((s) => ({ ...s, removals: s.removals.filter((r) => r.id !== id) }));
    },
    clearRemovals: () => {
      if (get().present.removals.length === 0) return;
      update((s) => ({ ...s, removals: [] }));
    },
    setBackground: (fn) => set((st) => ({ present: { ...st.present, background: fn(st.present.background) } })),
    editBackground: (fn) => update((s) => ({ ...s, background: fn(s.background) })),

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
