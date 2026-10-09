import { create } from 'zustand';

import type { Selection } from '@/image-engine/frame/FrameCompositor';

import type { StudioDocument } from '../types/document';

/**
 * Frame Studio editing state: the canvas document with undo / redo. Like the
 * photo editor, gestures and sliders update `doc` live and `commit()` pushes
 * one history step when they end; discrete actions commit immediately.
 * Selection is UI state and never part of history.
 */

export const STUDIO_HISTORY_LIMIT = 50;

interface StudioState {
  doc: StudioDocument | null;
  /** Last committed document (live edits diverge from it until commit). */
  committed: StudioDocument | null;
  past: StudioDocument[];
  future: StudioDocument[];
  selection: Selection | null;
}

interface StudioActions {
  open: (doc: StudioDocument) => void;
  close: () => void;
  /** One undo step. */
  apply: (fn: (doc: StudioDocument) => StudioDocument) => void;
  /** Live change (no history until `commit`). */
  live: (fn: (doc: StudioDocument) => StudioDocument) => void;
  commit: () => void;
  /** Drops uncommitted live changes. */
  cancel: () => void;
  undo: () => void;
  redo: () => void;
  select: (selection: Selection | null) => void;
}

const initial: StudioState = { doc: null, committed: null, past: [], future: [], selection: null };

export const useStudioStore = create<StudioState & StudioActions>()((set, get) => {
  const push = (next: StudioDocument) => {
    const { committed, past } = get();
    if (!committed || next === committed) {
      set({ doc: next, committed: next });
      return;
    }
    set({ doc: next, committed: next, past: [...past, committed].slice(-STUDIO_HISTORY_LIMIT), future: [] });
  };
  /** Selection must point at an existing layer. */
  const validSelection = (doc: StudioDocument | null) => {
    const sel = get().selection;
    return sel && doc?.layers.some((l) => l.id === sel.id) ? sel : null;
  };
  return {
    ...initial,
    open: (doc) => set({ ...initial, doc, committed: doc }),
    close: () => set(initial),
    apply: (fn) => {
      const { doc } = get();
      if (!doc) return;
      push(fn(doc));
      set({ selection: validSelection(get().doc) });
    },
    live: (fn) => {
      const { doc } = get();
      if (doc) set({ doc: fn(doc) });
    },
    commit: () => {
      const { doc } = get();
      if (doc) push(doc);
    },
    cancel: () => set((s) => ({ doc: s.committed })),
    undo: () => {
      const { past, committed, future } = get();
      const prev = past[past.length - 1];
      if (!prev || !committed) return;
      set({ doc: prev, committed: prev, past: past.slice(0, -1), future: [committed, ...future] });
      set({ selection: validSelection(prev) });
    },
    redo: () => {
      const { past, committed, future } = get();
      const next = future[0];
      if (!next || !committed) return;
      set({ doc: next, committed: next, past: [...past, committed].slice(-STUDIO_HISTORY_LIMIT), future: future.slice(1) });
      set({ selection: validSelection(next) });
    },
    select: (selection) => set({ selection }),
  };
});

export const useStudioCanUndo = () => useStudioStore((s) => s.past.length > 0);
export const useStudioCanRedo = () => useStudioStore((s) => s.future.length > 0);
