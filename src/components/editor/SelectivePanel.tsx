import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { BottomSheet } from '@/components/common/BottomSheet';
import type { IconName } from '@/components/common/IconButton';
import { IconButton } from '@/components/common/IconButton';
import { PressableScale } from '@/components/common/PressableScale';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { SliderControl } from '@/components/common/SliderControl';
import { TextPromptDialog } from '@/components/common/TextPromptDialog';
import { AI_TARGET_LABEL, completeMask, defaultShape, MASK_ADJUST_TOOLS, MASK_KIND_LABEL, MAX_MASKS } from '@/constants/masks';
import { colors, radius, spacing, typography, WEB_SWITCH } from '@/constants/theme';
import { useAiJob } from '@/hooks/useAiJob';
import { ensureModelConsent } from '@/services/aiConsent';
import { feedback } from '@/services/feedback';
import { aiTargetSupport, kindOf, segment } from '@/services/segmentation/Segmenter';
import { useEditorStore } from '@/stores/editorStore';
import { showToast } from '@/stores/toastStore';
import type { AiMaskTarget, MaskKind, MaskShape, SelectiveMask } from '@/types/phase4';
import { confirmAction } from '@/utils/dialogs';

import { AiJobRow } from './AiJobRow';
import type { SelectiveUi } from './maskTool';
import { ToolSliderPanel } from './ToolSliderPanel';

type ManualKind = Exclude<MaskKind, 'ai'>;

const ADD_KINDS: readonly { kind: ManualKind; icon: IconName }[] = [
  { kind: 'brush', icon: 'brush-outline' },
  { kind: 'radial', icon: 'ellipse-outline' },
  { kind: 'linear', icon: 'reorder-three-outline' },
  { kind: 'color', icon: 'color-palette-outline' },
  { kind: 'luminance', icon: 'contrast-outline' },
];

let seq = 0;
export const newMaskId = () => `mask-${Date.now().toString(36)}${(seq++).toString(36)}`;

interface Props {
  ui: SelectiveUi;
  onUiChange: (ui: SelectiveUi) => void;
}

const AI_TARGETS: readonly { target: AiMaskTarget; icon: IconName }[] = [
  { target: 'subject', icon: 'person-outline' },
  { target: 'background', icon: 'image-outline' },
  { target: 'person', icon: 'people-outline' },
  { target: 'skin', icon: 'hand-left-outline' },
  { target: 'sky', icon: 'cloud-outline' },
];

const AI_UNAVAILABLE: Record<AiMaskTarget, string> = {
  subject: '이 기기에서는 피사체 인식을 지원하지 않아요',
  background: '이 기기에서는 피사체 인식을 지원하지 않아요',
  person: '이 기기에서는 인물 인식을 지원하지 않아요',
  skin: '피부 영역 인식은 아직 웹에서만 지원해요',
  sky: '하늘을 정확히 나누는 모델이 아직 없어 지원하지 않아요',
};

/**
 * 조정 › 선택 보정: masks (brush, radial, linear, colour range, luminance
 * range, AI) each with their own adjustments. The panel edits the list and
 * the selected mask's values; the photo itself is where areas are drawn
 * (EditorCanvas: brush, handles, colour pick).
 */
export function SelectivePanel({ ui, onUiChange }: Props) {
  const masks = useEditorStore((s) => s.present.masks);
  const source = useEditorStore((s) => s.source);
  const [aiMenu, setAiMenu] = useState(false);
  const job = useAiJob();
  const support = aiTargetSupport();
  const [lastAi, setLastAi] = useState<AiMaskTarget | null>(null);

  const addAi = (target: AiMaskTarget) => {
    setAiMenu(false);
    if (!source || !support[target]) return;
    if (!ensureModelConsent('segmentation', 'AI 영역 선택', target === 'subject' || target === 'background' ? '19MB' : '16MB')) return;
    setLastAi(target);
    void job.start(
      () => segment(source, kindOf(target)),
      (image) => {
        feedback.success();
        const id = newMaskId();
        useEditorStore.getState().addMask(
          completeMask({ id, name: AI_TARGET_LABEL[target], shape: { kind: 'ai', target, image }, invert: target === 'background' }),
        );
        onUiChange({ ...ui, maskId: id, view: 'adjust', refine: false });
      },
      `${AI_TARGET_LABEL[target]} 영역을 찾지 못했어요`,
    );
  };
  const selected = masks.find((m) => m.id === ui.maskId) ?? null;
  const [menu, setMenu] = useState(false);
  const [naming, setNaming] = useState(false);
  const patchUi = (p: Partial<SelectiveUi>) => onUiChange({ ...ui, ...p });

  const add = (kind: ManualKind) => {
    if (masks.length >= MAX_MASKS * 2) {
      showToast(`마스크는 ${MAX_MASKS * 2}개까지 만들 수 있어요`);
      return;
    }
    feedback.selection();
    const id = newMaskId();
    const count = masks.filter((m) => m.shape.kind === kind).length + 1;
    useEditorStore.getState().addMask(completeMask({ id, name: `${MASK_KIND_LABEL[kind]} ${count}`, shape: defaultShape(kind) }));
    onUiChange({ ...ui, maskId: id, view: 'area', refine: false, brush: { ...ui.brush, mode: 'add' } });
  };

  const list = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.list}>
      {masks.map((m) => {
        const on = m.id === ui.maskId;
        return (
          <PressableScale
            key={m.id}
            style={[styles.chip, on && styles.chipOn]}
            onPress={() => {
              feedback.selection();
              onUiChange({ ...ui, maskId: on ? null : m.id, refine: false });
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`마스크 ${m.name}${m.visible ? '' : ' (숨김)'}`}
          >
            {!m.visible ? <Ionicons name="eye-off-outline" size={12} color={on ? colors.white : colors.textTertiary} /> : null}
            <Text style={[styles.chipText, on && styles.chipTextOn, !m.visible && !on && styles.chipTextHidden]} numberOfLines={1}>
              {m.name}
            </Text>
          </PressableScale>
        );
      })}
      {selected ? (
        <PressableScale style={styles.addChip} onPress={() => patchUi({ maskId: null })} accessibilityRole="button" accessibilityLabel="마스크 추가">
          <Ionicons name="add" size={16} color={colors.text} />
        </PressableScale>
      ) : null}
    </ScrollView>
  );

  if (!selected) {
    return (
      <View>
        {masks.length ? list : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.addRow}>
          {ADD_KINDS.map((k) => (
            <IconButton key={k.kind} icon={k.icon} label={MASK_KIND_LABEL[k.kind]} size={20} accessibilityLabel={`${MASK_KIND_LABEL[k.kind]} 마스크 추가`} onPress={() => add(k.kind)} />
          ))}
          <IconButton icon="sparkles-outline" label="AI" size={20} accessibilityLabel="AI 자동 선택" onPress={() => setAiMenu(true)} disabled={job.status === 'running'} />
        </ScrollView>
        <AiJobRow
          status={job.status}
          error={job.error}
          runningText="영역을 찾는 중이에요…"
          onCancel={job.cancel}
          onRetry={() => lastAi && addAi(lastAi)}
        />
        <BottomSheet visible={aiMenu} onClose={() => setAiMenu(false)} title="AI 자동 선택">
          {AI_TARGETS.map(({ target, icon }) => (
            <PressableScale
              key={target}
              style={[styles.menuItem, !support[target] && styles.menuDisabled]}
              onPress={() => addAi(target)}
              disabled={!support[target]}
              accessibilityRole="button"
              accessibilityState={{ disabled: !support[target] }}
              accessibilityLabel={`AI ${AI_TARGET_LABEL[target]} 선택`}
            >
              <Ionicons name={icon} size={18} color={colors.text} />
              <View style={styles.flex}>
                <Text style={styles.menuText}>{AI_TARGET_LABEL[target]}</Text>
                {!support[target] ? <Text style={styles.menuNote}>{AI_UNAVAILABLE[target]}</Text> : null}
              </View>
            </PressableScale>
          ))}
          <Text style={styles.privacy}>사진은 기기 안에서만 처리돼요</Text>
        </BottomSheet>
        <Text style={styles.hint}>{masks.length ? '마스크를 골라 영역과 보정을 다듬거나, 새 마스크를 추가해 보세요' : '사진의 일부만 보정할 영역을 만들어 보세요'}</Text>
      </View>
    );
  }

  const { setMask, editMask, commit, removeMask, duplicateMask } = useEditorStore.getState();
  const shape = selected.shape;
  const setShape = (fn: (s: MaskShape) => MaskShape) => setMask(selected.id, (m) => ({ ...m, shape: fn(m.shape) }));
  const canRefine = shape.kind !== 'brush';

  return (
    <View>
      {list}
      <View style={styles.headerRow}>
        <View style={styles.flex}>
          <SegmentedControl
            options={[
              { value: 'area', label: '영역' },
              { value: 'adjust', label: '보정' },
            ]}
            value={ui.view}
            onChange={(view) => patchUi({ view })}
            accessibilityLabel="마스크 편집"
          />
        </View>
        <IconButton
          icon={selected.visible ? 'eye-outline' : 'eye-off-outline'}
          size={18}
          color={colors.textSecondary}
          accessibilityLabel={selected.visible ? '마스크 숨기기' : '마스크 보이기'}
          onPress={() => editMask(selected.id, (m) => ({ ...m, visible: !m.visible }))}
        />
        <IconButton icon="ellipsis-horizontal" size={18} color={colors.textSecondary} accessibilityLabel="마스크 메뉴" onPress={() => setMenu(true)} />
      </View>

      {ui.view === 'adjust' ? (
        <ToolSliderPanel
          key={selected.id}
          tools={MASK_ADJUST_TOOLS}
          values={selected.adjust}
          onChange={(key, v) => setMask(selected.id, (m) => ({ ...m, adjust: { ...m.adjust, [key]: v } }))}
          onCommit={commit}
          onReset={(key) => editMask(selected.id, (m) => ({ ...m, adjust: { ...m.adjust, [key]: 0 } }))}
        />
      ) : (
        <View>
          {shape.kind === 'brush' || ui.refine ? (
            <BrushControls ui={ui} onUiChange={onUiChange} />
          ) : (
            <ShapeControls mask={selected} setShape={setShape} />
          )}
          {canRefine ? (
            <View style={styles.refineRow}>
              <Text style={styles.refineText}>{ui.refine ? '브러시로 더하거나 지워 다듬어요' : '브러시로 다듬기'}</Text>
              <Switch
                value={ui.refine}
                onValueChange={(refine) => patchUi({ refine })}
                trackColor={{ true: colors.accent, false: colors.border }}
                {...WEB_SWITCH}
                accessibilityLabel="브러시로 다듬기"
              />
            </View>
          ) : null}
        </View>
      )}

      <BottomSheet visible={menu} onClose={() => setMenu(false)} title={selected.name}>
        <MenuItem icon="create-outline" label="이름 변경" onPress={() => { setMenu(false); setNaming(true); }} />
        <MenuItem
          icon="copy-outline"
          label="복제"
          onPress={() => {
            setMenu(false);
            const id = newMaskId();
            duplicateMask(selected.id, id, `${selected.name} 복사`);
            patchUi({ maskId: id });
          }}
        />
        <MenuItem icon="swap-horizontal-outline" label={selected.invert ? '반전 해제' : '영역 반전'} onPress={() => { setMenu(false); editMask(selected.id, (m) => ({ ...m, invert: !m.invert })); }} />
        <MenuItem
          icon="color-wand-outline"
          label={ui.overlayAlways ? '보정 중 영역 표시 끄기' : '보정 중에도 영역 표시'}
          onPress={() => { setMenu(false); patchUi({ overlayAlways: !ui.overlayAlways }); }}
        />
        {selected.strokes.length ? (
          <MenuItem icon="brush-outline" label="브러시 다듬기 모두 지우기" onPress={() => { setMenu(false); editMask(selected.id, (m) => ({ ...m, strokes: [] })); }} />
        ) : null}
        <MenuItem
          icon="trash-outline"
          label="삭제"
          danger
          onPress={() => {
            setMenu(false);
            confirmAction({
              title: `‘${selected.name}’ 마스크를 삭제할까요?`,
              confirmText: '삭제',
              destructive: true,
              onConfirm: () => {
                removeMask(selected.id);
                patchUi({ maskId: null });
              },
            });
          }}
        />
      </BottomSheet>
      <TextPromptDialog
        visible={naming}
        title="마스크 이름"
        initialValue={selected.name}
        confirmText="변경"
        maxLength={20}
        onSubmit={(name) => {
          const clean = name.trim();
          if (clean) editMask(selected.id, (m) => ({ ...m, name: clean }));
        }}
        onClose={() => setNaming(false)}
      />
    </View>
  );
}

export function MenuItem({ icon, label, onPress, danger }: { icon: IconName; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <PressableScale style={styles.menuItem} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Ionicons name={icon} size={18} color={danger ? colors.danger : colors.text} />
      <Text style={[styles.menuText, danger && { color: colors.danger }]}>{label}</Text>
    </PressableScale>
  );
}

/** One slider for the selected parameter of a small set (keeps the panel short). */
export function ParamSlider<K extends string>({
  params,
  values,
  onChange,
  onComplete,
}: {
  params: readonly { key: K; label: string; min?: number; max?: number; reset: number }[];
  values: Record<K, number>;
  onChange: (key: K, v: number) => void;
  onComplete?: () => void;
}) {
  const [active, setActive] = useState<K>(params[0]!.key);
  const p = params.find((x) => x.key === active) ?? params[0]!;
  return (
    <View>
      <View style={styles.paramChips}>
        {params.map((x) => (
          <PressableScale
            key={x.key}
            style={[styles.param, x.key === p.key && styles.paramOn]}
            onPress={() => setActive(x.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: x.key === p.key }}
            accessibilityLabel={`${x.label} ${values[x.key]}`}
          >
            <Text style={[styles.paramText, x.key === p.key && styles.paramTextOn]}>{x.label}</Text>
          </PressableScale>
        ))}
      </View>
      <View style={styles.sliderRow}>
        <SliderControl
          value={values[p.key]}
          min={p.min ?? 0}
          max={p.max ?? 100}
          onChange={(v) => onChange(p.key, v)}
          onComplete={onComplete}
          resetValue={p.reset}
          accessibilityLabel={p.label}
        />
      </View>
    </View>
  );
}

const BRUSH_PARAMS = [
  { key: 'size', label: '크기', reset: 30 },
  { key: 'feather', label: '경계', reset: 60 },
  { key: 'flow', label: '흐름', reset: 70 },
  { key: 'opacity', label: '불투명도', reset: 100 },
] as const;

function BrushControls({ ui, onUiChange }: { ui: SelectiveUi; onUiChange: (ui: SelectiveUi) => void }) {
  const b = ui.brush;
  return (
    <View>
      <View style={styles.modeRow}>
        <SegmentedControl
          options={[
            { value: 'add', label: '칠하기' },
            { value: 'erase', label: '지우기' },
          ]}
          value={b.mode}
          onChange={(mode) => onUiChange({ ...ui, brush: { ...b, mode } })}
          accessibilityLabel="브러시 모드"
        />
      </View>
      <ParamSlider params={BRUSH_PARAMS} values={b} onChange={(key, v) => onUiChange({ ...ui, brush: { ...b, [key]: v } })} />
    </View>
  );
}

function ShapeControls({ mask, setShape }: { mask: SelectiveMask; setShape: (fn: (s: MaskShape) => MaskShape) => void }) {
  const commit = useEditorStore.getState().commit;
  const s = mask.shape;
  switch (s.kind) {
    case 'radial':
      return (
        <View>
          <ParamSlider
            params={[
              { key: 'feather', label: '경계', reset: 50 },
              { key: 'angle', label: '회전', min: -90, max: 90, reset: 0 },
            ]}
            values={{ feather: s.feather, angle: Math.round(s.angle) }}
            onChange={(key, v) => setShape((x) => (x.kind === 'radial' ? { ...x, [key]: v } : x))}
            onComplete={commit}
          />
          <Text style={styles.hint}>원 안을 끌어 옮기고, 점을 끌어 크기를 바꿔요</Text>
        </View>
      );
    case 'linear':
      return <Text style={[styles.hint, styles.hintTall]}>첫 번째 선(효과 100%)에서 두 번째 선(0%)까지 점점 약해져요.{'\n'}선의 점을 끌어 방향과 범위를 바꿔요</Text>;
    case 'color':
      return (
        <View>
          <View style={styles.colorRow}>
            <View style={[styles.swatch, { backgroundColor: `rgb(${s.color.map((v) => Math.round(v * 255)).join(',')})` }]} />
            <Text style={styles.colorText}>사진을 눌러 고를 색을 바꿔요</Text>
          </View>
          <View style={styles.sliderRow}>
            <SliderControl
              value={s.range}
              onChange={(range) => setShape((x) => (x.kind === 'color' ? { ...x, range } : x))}
              onComplete={commit}
              resetValue={30}
              accessibilityLabel="색상 허용 범위"
            />
          </View>
        </View>
      );
    case 'luminance':
      return (
        <ParamSlider
          params={[
            { key: 'min', label: '최소 밝기', reset: 70 },
            { key: 'max', label: '최대 밝기', reset: 100 },
            { key: 'feather', label: '경계', reset: 20 },
          ]}
          values={{ min: s.min, max: s.max, feather: s.feather }}
          onChange={(key, v) => setShape((x) => (x.kind === 'luminance' ? { ...x, [key]: v } : x))}
          onComplete={commit}
        />
      );
    case 'ai':
      return <Text style={[styles.hint, styles.hintTall]}>AI가 고른 영역이에요. 아래 ‘브러시로 다듬기’로 더하거나 지울 수 있어요</Text>;
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  list: {
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
    paddingBottom: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 30,
    maxWidth: 140,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  chipOn: {
    backgroundColor: colors.text,
  },
  chipText: {
    ...typography.filterName,
    color: colors.text,
  },
  chipTextOn: {
    color: colors.white,
  },
  chipTextHidden: {
    color: colors.textTertiary,
  },
  addChip: {
    minHeight: 30,
    minWidth: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.textTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addRow: {
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
  },
  hint: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  hintTall: {
    lineHeight: 17,
    marginVertical: spacing.sm,
  },
  modeRow: {
    paddingHorizontal: spacing.xxl,
    marginTop: spacing.xs,
  },
  paramChips: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  param: {
    minHeight: 28,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    justifyContent: 'center',
  },
  paramOn: {
    backgroundColor: colors.accentMuted,
  },
  paramText: {
    ...typography.micro,
  },
  paramTextOn: {
    color: colors.text,
    fontWeight: '600',
  },
  sliderRow: {
    paddingHorizontal: spacing.lg,
  },
  refineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    minHeight: 36,
  },
  refineText: {
    ...typography.caption,
    fontSize: 11,
  },
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
  },
  swatch: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  colorText: {
    ...typography.caption,
    fontSize: 11,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 48,
  },
  menuText: {
    ...typography.body,
  },
  menuDisabled: {
    opacity: 0.45,
  },
  menuNote: {
    ...typography.caption,
    fontSize: 11,
  },
  privacy: {
    ...typography.caption,
    fontSize: 11,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
