import { useRef } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { PressableScale } from '@/components/common/PressableScale';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { SliderControl } from '@/components/common/SliderControl';
import { colors, radius, spacing, typography, WEB_SWITCH } from '@/constants/theme';
import { useAiJob } from '@/hooks/useAiJob';
import { ensureModelConsent } from '@/services/aiConsent';
import { loadSkImage } from '@/services/exportImage';
import { feedback } from '@/services/feedback';
import { MIGAN_SIZE, MIGAN_SUPPORTED, miganInpainter } from '@/services/inpaint/migan';
import { composeRemovals, PATCHMATCH, removeObject, selectionBounds } from '@/services/inpaint/objectRemoval';
import { loadMaskImages } from '@/services/masks/maskRender';
import { segmentAt, TAP_SELECT_SUPPORTED } from '@/services/segmentation/Segmenter';
import { useEditorStore } from '@/stores/editorStore';
import { showToast } from '@/stores/toastStore';
import type { NormalizedPoint } from '@/types/editing';
import type { ObjectRemoval } from '@/types/phase4';

import { AiJobRow } from './AiJobRow';

export interface RemovalUi {
  mode: 'brush' | 'lasso' | 'tap';
  size: number;
  selection: ObjectRemoval['selection'] | null;
  /** Web: MI-GAN instead of PatchMatch. */
  ai: boolean;
  /** Result shown on the photo, waiting for 적용 / 취소. */
  pending: ObjectRemoval | null;
}

export const DEFAULT_REMOVAL_UI: RemovalUi = { mode: 'brush', size: 25, selection: null, ai: false, pending: null };

/** Selections bigger than this share of the photo's area are hard for any inpainting. */
const LARGE = 0.04;

/** The photo the fill copies from: the source with earlier removals already applied. */
async function fillSource(): Promise<{ photo: Awaited<ReturnType<typeof loadSkImage>>; w: number; h: number }> {
  const { source, present } = useEditorStore.getState();
  if (!source) throw new Error('no photo');
  const photo = await loadSkImage(source.uri);
  if (!present.removals.length) return { photo, w: source.width, h: source.height };
  const patches = await loadMaskImages(present.removals.map((r) => r.patch.uri));
  const m = [photo.width() / source.width, 0, 0, 0, photo.height() / source.height, 0, 0, 0, 1];
  return { photo: composeRemovals(photo, present.removals, patches, m, source.width, source.height), w: source.width, h: source.height };
}

/**
 * 터치 › 객체 제거: mark an object (brush, lasso or tap on supported
 * devices), then fill it from its surroundings. PatchMatch everywhere; MI-GAN
 * (learned inpainting) in the browser. The result is previewed before it
 * becomes an edit (one undo step); the original photo is never changed.
 */
export function RemovalPanel({ ui, onChange }: { ui: RemovalUi; onChange: (ui: RemovalUi) => void }) {
  const removals = useEditorStore((s) => s.present.removals.length);
  const job = useAiJob();
  const cancelled = useRef(false);

  const modes = [
    { value: 'brush' as const, label: '브러시' },
    { value: 'lasso' as const, label: '올가미' },
    ...(TAP_SELECT_SUPPORTED ? [{ value: 'tap' as const, label: '탭' }] : []),
  ];

  const run = () => {
    const sel = ui.selection;
    const source = useEditorStore.getState().source;
    if (!sel || !source) return;
    const engine = ui.ai && MIGAN_SUPPORTED ? miganInpainter() : PATCHMATCH;
    if (engine?.engine === 'migan' && !ensureModelConsent('inpainting', 'AI 객체 제거', MIGAN_SIZE)) return;
    cancelled.current = false;
    void job.start(
      async () => {
        const tapImage = sel.kind === 'tap' ? ((await loadMaskImages([sel.image.uri])).get(sel.image.uri) ?? null) : null;
        const b = selectionBounds(sel, source.width, source.height, tapImage);
        if (b && ((b.x1 - b.x0) * (b.y1 - b.y0)) / (source.width * source.height) > LARGE) {
          showToast('큰 영역은 자연스럽게 채워지지 않을 수 있어요');
        }
        const { photo, w, h } = await fillSource();
        return removeObject({
          photo,
          srcW: w,
          srcH: h,
          selection: sel,
          tapImage,
          inpainter: engine ?? PATCHMATCH,
          shouldCancel: () => cancelled.current,
          onProgress: () => undefined,
        });
      },
      (removal) => {
        if (!removal) {
          showToast('지울 영역을 먼저 칠해 주세요');
          return;
        }
        feedback.success();
        onChange({ ...ui, pending: removal });
      },
      '지우지 못했어요',
    );
  };

  if (ui.pending) {
    return (
      <View>
        <Text style={styles.hint}>결과를 확인하고 적용하거나 취소해 주세요</Text>
        <View style={styles.row}>
          <PressableScale style={styles.secondary} onPress={() => onChange({ ...ui, pending: null })} accessibilityRole="button" accessibilityLabel="객체 제거 취소">
            <Text style={styles.secondaryText}>취소</Text>
          </PressableScale>
          <PressableScale
            style={styles.primary}
            onPress={() => {
              useEditorStore.getState().addRemoval(ui.pending!);
              onChange({ ...ui, pending: null, selection: null });
            }}
            accessibilityRole="button"
            accessibilityLabel="객체 제거 적용"
          >
            <Text style={styles.primaryText}>적용</Text>
          </PressableScale>
        </View>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.modes}>
        <SegmentedControl options={modes} value={ui.mode} onChange={(mode) => onChange({ ...ui, mode, selection: null })} accessibilityLabel="객체 선택 방식" />
      </View>
      {ui.mode === 'brush' ? (
        <View style={styles.sliderRow}>
          <Text style={styles.label}>크기</Text>
          <View style={styles.flex}>
            <SliderControl value={ui.size} onChange={(size) => onChange({ ...ui, size })} resetValue={25} accessibilityLabel="객체 제거 브러시 크기" />
          </View>
        </View>
      ) : (
        <Text style={styles.hint}>
          {ui.mode === 'lasso' ? '지울 물체를 손가락으로 둘러 그려 주세요' : ui.selection ? '물체를 찾았어요. 지우기를 눌러 주세요' : '지울 물체를 눌러 주세요'}
        </Text>
      )}
      <AiJobRow status={job.status} error={job.error} runningText="주변으로 자연스럽게 채우는 중이에요…" onCancel={() => { cancelled.current = true; job.cancel(); }} onRetry={run} />
      <View style={styles.row}>
        {MIGAN_SUPPORTED ? (
          <View style={styles.aiRow}>
            <Text style={styles.aiText}>AI 고품질</Text>
            <Switch value={ui.ai} onValueChange={(ai) => onChange({ ...ui, ai })} trackColor={{ true: colors.accent, false: colors.border }} {...WEB_SWITCH} accessibilityLabel="AI 고품질 객체 제거" />
          </View>
        ) : (
          <View style={styles.flex} />
        )}
        <PressableScale
          style={[styles.secondary, !ui.selection && styles.disabled]}
          disabled={!ui.selection}
          onPress={() => onChange({ ...ui, selection: null })}
          accessibilityRole="button"
          accessibilityLabel="선택 지우기"
        >
          <Text style={styles.secondaryText}>다시 선택</Text>
        </PressableScale>
        <PressableScale
          style={[styles.primary, (!ui.selection || job.status === 'running') && styles.disabled]}
          disabled={!ui.selection || job.status === 'running'}
          onPress={run}
          accessibilityRole="button"
          accessibilityLabel="선택한 물체 지우기"
        >
          <Text style={styles.primaryText}>지우기</Text>
        </PressableScale>
      </View>
      {removals ? (
        <PressableScale style={styles.clear} onPress={() => useEditorStore.getState().clearRemovals()} accessibilityRole="button" accessibilityLabel="객체 제거 모두 되돌리기">
          <Text style={styles.clearText}>지운 물체 {removals}개 · 모두 되돌리기</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

/** Tap selection: the object under the finger (on-device segmentation). */
export async function tapSelection(point: NormalizedPoint): Promise<ObjectRemoval['selection'] | null> {
  const source = useEditorStore.getState().source;
  if (!source) return null;
  if (!ensureModelConsent('segmentation', '탭 선택', '6MB')) return null;
  const image = await segmentAt(source, point);
  return image ? { kind: 'tap', image } : null;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  modes: { paddingHorizontal: spacing.lg, marginBottom: spacing.xs },
  sliderRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, gap: spacing.sm },
  label: { ...typography.filterName, color: colors.text, width: 40 },
  hint: { ...typography.caption, textAlign: 'center', marginVertical: spacing.sm, paddingHorizontal: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.xs },
  aiRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  aiText: { ...typography.caption, fontSize: 11 },
  primary: { minHeight: 36, minWidth: 84, paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  primaryText: { ...typography.headline, fontSize: 14, color: colors.white },
  secondary: { minHeight: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { ...typography.filterName, color: colors.text },
  disabled: { opacity: 0.35 },
  clear: { alignSelf: 'center', minHeight: 32, justifyContent: 'center', marginTop: spacing.xs },
  clearText: { ...typography.caption, fontSize: 11, color: colors.textTertiary },
});
