import { ADJUST_TOOLS, EFFECT_TOOLS } from '@/constants/adjustments';
import { FACE_TOOLS, SKIN_TOOLS } from '@/constants/faceRetouch';
import { getFilter } from '@/constants/filters';
import { AI_TARGET_LABEL, MASK_ADJUST_TOOLS } from '@/constants/masks';
import { getFramePreset } from '@/image-engine/frame/registry';
import { HSL_LABEL } from '@/services/color/hsl';
import type { EditState, HslColor } from '@/types/editing';

/**
 * Names for edit history steps ("필터 — Mellow", "노출 +15", "HSL — Orange",
 * "얼굴 · 갸름하게 +10", "배경 흐림", "프레임 — Vintage Polaroid").
 *
 * History stores whole snapshots (stores/editorStore), so a step's name is
 * worked out by comparing it with the step before — no action has to
 * remember to label itself, and restored projects get names too.
 */

const signed = (v: number) => (v > 0 ? `+${v}` : `${v}`);
const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

const LABELS: Record<string, string> = Object.fromEntries(
  [...ADJUST_TOOLS, ...EFFECT_TOOLS, ...SKIN_TOOLS, ...Object.values(FACE_TOOLS).flat()].map((t) => [t.key, t.label]),
);
const MASK_LABELS: Record<string, string> = Object.fromEntries(MASK_ADJUST_TOOLS.map((t) => [t.key, t.label]));

function changedKeys<T extends object>(a: T, b: T): (keyof T)[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)] as (keyof T)[]);
  return [...keys].filter((k) => !same(a[k], b[k]));
}

/** What changed from `prev` to `next`, as a short label. */
export function describeChange(prev: EditState, next: EditState): string {
  if (prev.autoEnhance !== next.autoEnhance && !same(prev.autoEnhance, next.autoEnhance)) {
    if (!next.autoEnhance) return '자동 보정 해제';
    if (!prev.autoEnhance || !same(prev.autoEnhance.suggested, next.autoEnhance.suggested)) return '자동 보정';
    return `자동 보정 강도 ${next.autoEnhance.strength}`;
  }
  if (prev.recipeId !== next.recipeId && next.recipeId) return '레시피 적용';
  if (prev.filterId !== next.filterId) return `필터 — ${getFilter(next.filterId).name}`;
  if (prev.intensity !== next.intensity) return `필터 강도 ${next.intensity}`;
  if (!same(prev.mix, next.mix)) return next.mix ? `혼합 — ${getFilter(next.mix.filterId).name}` : '혼합 해제';

  const adj = changedKeys(prev.adjustments, next.adjustments);
  if (adj.length === 1) return `${LABELS[adj[0]!] ?? adj[0]} ${signed(next.adjustments[adj[0]!])}`;
  if (adj.length > 1) return '조정 여러 항목';

  const hsl = changedKeys(prev.hsl, next.hsl) as HslColor[];
  if (hsl.length) return hsl.length === 1 ? `HSL — ${HSL_LABEL[hsl[0]!]}` : 'HSL';
  const curves = changedKeys(prev.curves, next.curves);
  if (curves.length) return `커브 — ${curves[0] === 'rgb' ? 'RGB' : curves[0] === 'red' ? 'Red' : curves[0] === 'green' ? 'Green' : 'Blue'}`;

  const rt = changedKeys(prev.retouch, next.retouch);
  if (rt.length) return `${LABELS[rt[0]!] ?? '피부'} ${signed(next.retouch[rt[0]!])}`;
  if (!same(prev.faces, next.faces)) {
    for (const id of new Set([...Object.keys(prev.faces), ...Object.keys(next.faces)])) {
      const a = prev.faces[id];
      const b = next.faces[id];
      if (!b) return '얼굴 보정 초기화';
      const k = a ? changedKeys(a, b) : (Object.keys(b) as (keyof typeof b)[]).filter((x) => b[x] !== 0);
      if (k.length) return `얼굴 · ${LABELS[k[0] as string] ?? k[0]} ${signed(b[k[0]!])}`;
    }
    return '얼굴 보정';
  }
  if (prev.reshape.length !== next.reshape.length || !same(prev.reshape, next.reshape)) return next.reshape.length > prev.reshape.length ? '밀기' : '밀기 지우기';
  if (prev.spots.length !== next.spots.length) return next.spots.length > prev.spots.length ? '잡티 제거' : '잡티 제거 지우기';

  if (!same(prev.masks, next.masks)) {
    if (next.masks.length > prev.masks.length) {
      const m = next.masks[next.masks.length - 1]!;
      return m.shape.kind === 'ai' ? `마스크 추가 — AI ${AI_TARGET_LABEL[m.shape.target]}` : `마스크 추가 — ${m.name}`;
    }
    if (next.masks.length < prev.masks.length) return '마스크 삭제';
    for (const m of next.masks) {
      const p = prev.masks.find((x) => x.id === m.id);
      if (!p || same(p, m)) continue;
      const k = changedKeys(p.adjust, m.adjust);
      if (k.length) return `${m.name} · ${MASK_LABELS[k[0]!]} ${signed(m.adjust[k[0]!])}`;
      if (p.strokes.length !== m.strokes.length) return `${m.name} · 브러시`;
      if (p.visible !== m.visible) return `${m.name} ${m.visible ? '보이기' : '숨기기'}`;
      if (p.invert !== m.invert) return `${m.name} 반전`;
      if (p.name !== m.name) return `마스크 이름 — ${m.name}`;
      return `${m.name} · 영역`;
    }
    return '선택 보정';
  }
  if (!same(prev.removals, next.removals)) return next.removals.length > prev.removals.length ? '객체 제거' : '객체 제거 되돌리기';
  if (!same(prev.background, next.background)) {
    const b = next.background;
    if (!prev.background.subject && b.subject) return '피사체 분리';
    if (prev.background.mode !== b.mode) return b.mode === 'blur' ? '배경 흐림' : b.mode === 'replace' ? '배경 교체' : '배경 원래대로';
    return b.mode === 'blur' ? '배경 흐림 조절' : b.mode === 'replace' ? '배경 교체 조절' : '배경 조절';
  }
  if (!same(prev.film, next.film)) return '필름 효과';
  if (!same(prev.frame, next.frame)) {
    if (prev.frame.id !== next.frame.id) return next.frame.id === 'none' ? '프레임 해제' : `프레임 — ${getFramePreset(next.frame.id)?.name ?? next.frame.id}`;
    return '프레임 조절';
  }
  if (prev.dateStamp !== next.dateStamp) return next.dateStamp ? '날짜 표시' : '날짜 숨기기';
  if (!same(prev.stamp, next.stamp) || prev.stampDate !== next.stampDate) return '날짜 스타일';
  if (!same(prev.geometry, next.geometry)) {
    const a = prev.geometry;
    const b = next.geometry;
    if (a.rotation !== b.rotation) return '회전';
    if (a.flipH !== b.flipH || a.flipV !== b.flipV) return '반전';
    return '자르기';
  }
  return '편집';
}

export interface HistoryEntry {
  /** Position in [...past, committed, ...future]. */
  index: number;
  label: string;
  /** The step currently shown. */
  current: boolean;
  /** Undone steps (redo would bring them back; a new edit drops them). */
  undone: boolean;
}

/**
 * The timeline: the oldest kept state ("원본" when history reaches back to the
 * open, otherwise "이전 편집"), then one entry per step.
 */
export function historyEntries(past: readonly EditState[], present: EditState, future: readonly EditState[], reachesStart: boolean): HistoryEntry[] {
  const all = [...past, present, ...future];
  return all.map((s, i) => ({
    index: i,
    label: i === 0 ? (reachesStart ? '원본' : '이전 편집') : describeChange(all[i - 1]!, s),
    current: i === past.length,
    undone: i > past.length,
  }));
}
