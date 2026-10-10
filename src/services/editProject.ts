import AsyncStorage from '@react-native-async-storage/async-storage';

import { createEditState, useEditorStore } from '@/stores/editorStore';
import type { EditState, SourceImage } from '@/types/editing';

import { fileExists, pruneMaskFiles, pruneOriginals } from './appFiles';

/**
 * Non-destructive edit project. The photo being edited is an app-owned copy
 * (appFiles.storeOriginal) that is never written to; the edit itself is pure
 * data (EditState). The last committed state is saved as the user works, so
 * it can be restored after the app is closed or killed. Undo history is not
 * persisted.
 */
export interface EditProject {
  version: 1;
  id: string;
  originalUri: string;
  createdAt: number;
  updatedAt: number;
  source: SourceImage;
  document: EditState;
}

const KEY = 'lumi.project';
const DEBOUNCE_MS = 400;

export function serializeProject(p: EditProject): string {
  return JSON.stringify(p);
}

/** Parses and repairs a stored project (fields added in later versions get defaults). */
export function parseProject(json: string | null): EditProject | null {
  if (!json) return null;
  try {
    const raw = JSON.parse(json) as Partial<EditProject>;
    if (raw?.version !== 1 || !raw.source?.uri || !raw.document) return null;
    return { ...(raw as EditProject), document: createEditState(raw.document) };
  } catch {
    return null;
  }
}

/** The saved project, if its original file still exists. */
export async function loadProject(): Promise<EditProject | null> {
  const project = parseProject(await AsyncStorage.getItem(KEY));
  if (!project) return null;
  if (!fileExists(project.source.uri)) {
    await AsyncStorage.removeItem(KEY);
    return null;
  }
  return project;
}

export async function clearProject(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

let current: { id: string; createdAt: number } | null = null;

/** Re-opens a saved project in the editor (same id, so autosave keeps updating it). */
export function restoreProject(p: EditProject): void {
  useEditorStore.getState().open(p.source, p.document);
  useEditorStore.setState({ restored: true });
  // After open(): the store listener resets `current` for a new source.
  current = { id: p.id, createdAt: p.createdAt };
}

/**
 * Saves the committed edit (debounced) whenever it changes; clears the saved
 * project when the editor closes. Returns an unsubscribe function.
 */
export function startAutosave(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const unsubscribe = useEditorStore.subscribe((state, prev) => {
    if (state.source === prev.source && state.committed === prev.committed) return;
    if (timer) clearTimeout(timer);
    if (!state.source) {
      current = null;
      void clearProject();
      return;
    }
    if (state.source !== prev.source) current = null;
    timer = setTimeout(() => {
      const { source, committed, past, restored } = useEditorStore.getState();
      // Nothing to recover until the first edit.
      if (!source || (past.length === 0 && !restored)) return;
      const now = Date.now();
      current ??= { id: `p${now.toString(36)}`, createdAt: now };
      const project: EditProject = {
        version: 1,
        id: current.id,
        originalUri: source.uri,
        createdAt: current.createdAt,
        updatedAt: now,
        source,
        document: committed,
      };
      AsyncStorage.setItem(KEY, serializeProject(project)).catch(() => undefined);
    }, DEBOUNCE_MS);
  });
  return () => {
    if (timer) clearTimeout(timer);
    unsubscribe();
  };
}

/** Files an edit references (AI masks, subject mask, object-removal patches and tap selections). */
export function documentFiles(d: EditState | null | undefined): string[] {
  if (!d) return [];
  const out: string[] = [];
  for (const m of d.masks ?? []) if (m.shape.kind === 'ai') out.push(m.shape.image.uri);
  if (d.background?.subject) out.push(d.background.subject.uri);
  for (const r of d.removals ?? []) {
    out.push(r.patch.uri);
    if (r.selection.kind === 'tap') out.push(r.selection.image.uri);
  }
  return out;
}

/**
 * Removes stored originals and mask / patch files no longer used by the saved
 * project, the open edit (including its undo / redo history) or `alsoKeep`.
 */
export async function pruneStoredOriginals(alsoKeep: readonly (string | null | undefined)[]): Promise<void> {
  const project = parseProject(await AsyncStorage.getItem(KEY));
  const { source, present, past, future } = useEditorStore.getState();
  pruneOriginals([project?.source.uri, source?.uri, ...alsoKeep]);
  const keep = [project?.document, present, ...past, ...future].flatMap(documentFiles);
  pruneMaskFiles(keep);
}
