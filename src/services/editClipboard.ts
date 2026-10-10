import { DEFAULT_ADJUSTMENTS } from '@/constants/adjustments';
import { completeFilm, completeFrame, DEFAULT_STAMP_STYLE } from '@/constants/film';
import { DEFAULT_CURVES } from '@/services/color/curves';
import { DEFAULT_HSL } from '@/services/color/hsl';
import type { Look } from '@/stores/editorStore';
import type { AdjustmentKey, Adjustments, EditState } from '@/types/editing';

/**
 * 편집 복사 / 붙여넣기. What is copied is a `Look` — the same data a My
 * Recipe stores (filter, mix, adjustments, HSL, curves, film effects, frame,
 * date stamp style) — so it goes to any photo. Edits tied to one photo's
 * pixels or coordinates (face retouch, touch strokes, blemish spots, masks,
 * object removal, background segmentation, crop) are never copied: moving
 * them to another photo would need re-mapping and the user's confirmation.
 */

export type PasteCategory = 'filter' | 'adjust' | 'hsl' | 'curves' | 'film' | 'frame';

export const PASTE_CATEGORIES: readonly { id: PasteCategory; label: string }[] = [
  { id: 'filter', label: '필터 · 혼합' },
  { id: 'adjust', label: '조정' },
  { id: 'hsl', label: 'HSL' },
  { id: 'curves', label: '커브' },
  { id: 'film', label: '필름 효과' },
  { id: 'frame', label: '프레임 · 날짜 스타일' },
];

/** Not copied: listed in the paste sheet so it's clear why. */
export const NOT_COPIED = '얼굴 보정 · 터치 · 잡티 · 선택 보정 마스크 · 객체 제거 · 배경 분리 · 자르기는 사진마다 위치가 달라 복사하지 않아요';

/** Adjustment keys that belong to film effects (grain amount, vignette, fade), not 조정. */
const FILM_ADJUSTMENTS: readonly AdjustmentKey[] = ['grain', 'vignette', 'fade'];

export interface CopiedEdits {
  version: 1;
  copiedAt: number;
  look: Look;
}

export function copyEdits(s: EditState): CopiedEdits {
  return {
    version: 1,
    copiedAt: Date.now(),
    look: {
      filterId: s.filterId,
      intensity: s.intensity,
      mix: s.mix ? { ...s.mix } : null,
      adjustments: { ...s.adjustments },
      hsl: { ...s.hsl },
      curves: { ...s.curves },
      film: s.film,
      frame: s.frame,
      dateStamp: s.dateStamp,
      stamp: { ...s.stamp },
    },
  };
}

/** `target` with the chosen parts of `copied` (everything else, and every photo-specific edit, kept). */
export function pasteEdits(target: EditState, copied: CopiedEdits, categories: ReadonlySet<PasteCategory>): EditState {
  const l = copied.look;
  let next: EditState = { ...target };
  if (categories.has('filter')) next = { ...next, filterId: l.filterId, intensity: l.intensity, mix: l.mix ? { ...l.mix } : null, recipeId: null };
  if (categories.has('adjust') || categories.has('film')) {
    const adjustments: Adjustments = { ...target.adjustments };
    for (const k of Object.keys(DEFAULT_ADJUSTMENTS) as AdjustmentKey[]) {
      const film = FILM_ADJUSTMENTS.includes(k);
      if ((film && categories.has('film')) || (!film && categories.has('adjust'))) adjustments[k] = l.adjustments[k] ?? 0;
    }
    next = { ...next, adjustments };
    // The target's own Auto Enhance share no longer describes its adjustments.
    if (categories.has('adjust')) next.autoEnhance = null;
  }
  if (categories.has('hsl')) next = { ...next, hsl: { ...DEFAULT_HSL, ...l.hsl } };
  if (categories.has('curves')) next = { ...next, curves: { ...DEFAULT_CURVES, ...l.curves } };
  if (categories.has('film')) next = { ...next, film: completeFilm(l.film) };
  if (categories.has('frame')) next = { ...next, frame: completeFrame(l.frame), dateStamp: l.dateStamp, stamp: { ...DEFAULT_STAMP_STYLE, ...l.stamp } };
  return next;
}

/** Stored clipboard (any version) → current, or null. */
export function parseCopied(raw: unknown): CopiedEdits | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<CopiedEdits>;
  if (r.version !== 1 || !r.look || typeof r.look.filterId !== 'string') return null;
  return r as CopiedEdits;
}
