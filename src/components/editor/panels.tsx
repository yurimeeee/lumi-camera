import { Ionicons } from '@expo/vector-icons';
import type { SkImage } from '@shopify/react-native-skia';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { IconButton } from '@/components/common/IconButton';
import { PressableScale } from '@/components/common/PressableScale';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { SliderControl } from '@/components/common/SliderControl';
import { FilterCarousel } from '@/components/filters/FilterCarousel';
import { ADJUST_TOOLS, EFFECT_TOOLS, FACE_RETOUCH_KEYS, RETOUCH_TOOLS } from '@/constants/adjustments';
import { aspectRatioOf, CROP_ASPECTS } from '@/constants/crop';
import { getFilter } from '@/constants/filters';
import { colors, radius, spacing, typography, WEB_SWITCH } from '@/constants/theme';
import type { FaceStatus } from '@/hooks/useFaceGeometry';
import { FACE_DETECTION_SUPPORTED } from '@/services/faceLandmarks';
import { feedback } from '@/services/feedback';
import { centeredCrop, rotatedSize } from '@/services/imagePipeline';
import { useEditorStore } from '@/stores/editorStore';
import { useIsFavorite, useFilterStore } from '@/stores/filterStore';
import type { CropAspectId, RetouchKey, SourceImage } from '@/types/editing';
import type { FilterTab } from '@/types/filters';

import type { Brush } from './EditorCanvas';
import { ToolSliderPanel } from './ToolSliderPanel';

export function FilterPanel({ thumbImage }: { thumbImage: SkImage | null }) {
  const filterId = useEditorStore((s) => s.present.filterId);
  const intensity = useEditorStore((s) => s.present.intensity);
  const { setFilter, setIntensity, commit } = useEditorStore.getState();
  const [tab, setTab] = useState<FilterTab>('all');
  const favorite = useIsFavorite(filterId);
  const filter = getFilter(filterId);

  return (
    <View>
      {filterId !== 'original' ? (
        <View style={styles.intensityRow}>
          <Text style={styles.filterName}>{filter.name}</Text>
          <View style={styles.flex}>
            <SliderControl
              value={intensity}
              onChange={setIntensity}
              onComplete={commit}
              resetValue={80}
              accessibilityLabel="필터 강도"
            />
          </View>
          <IconButton
            icon={favorite ? 'heart' : 'heart-outline'}
            color={favorite ? colors.accent : colors.textSecondary}
            size={18}
            accessibilityLabel={favorite ? '즐겨찾기 해제' : '즐겨찾기'}
            onPress={() => {
              feedback.light();
              useFilterStore.getState().toggleFavorite(filterId);
            }}
          />
        </View>
      ) : (
        <Text style={styles.hint}>필터를 골라 분위기를 입혀보세요</Text>
      )}
      <FilterCarousel
        selectedId={filterId}
        onSelect={setFilter}
        image={thumbImage}
        tab={tab}
        onTabChange={setTab}
        thumbWidth={56}
        thumbHeight={70}
      />
    </View>
  );
}

export function AdjustPanel() {
  const values = useEditorStore((s) => s.present.adjustments);
  const { setAdjustment, commit, resetAdjustment } = useEditorStore.getState();
  return (
    <ToolSliderPanel tools={ADJUST_TOOLS} values={values} onChange={setAdjustment} onCommit={commit} onReset={resetAdjustment} />
  );
}

export function EffectsPanel() {
  const values = useEditorStore((s) => s.present.adjustments);
  const dateStamp = useEditorStore((s) => s.present.dateStamp);
  const { setAdjustment, commit, resetAdjustment, setDateStamp } = useEditorStore.getState();
  return (
    <ToolSliderPanel
      tools={EFFECT_TOOLS}
      values={values}
      onChange={setAdjustment}
      onCommit={commit}
      onReset={resetAdjustment}
      footer={
        <View style={styles.stampRow}>
          <Ionicons name="calendar-outline" size={18} color={colors.text} />
          <Text style={styles.stampLabel}>날짜 스탬프</Text>
          <Switch
            value={dateStamp}
            onValueChange={setDateStamp}
            trackColor={{ true: '#8FAE7F', false: colors.border }}
            thumbColor={colors.white}
            {...WEB_SWITCH}
            ios_backgroundColor={colors.border}
            accessibilityLabel="날짜 스탬프"
          />
        </View>
      }
    />
  );
}

// Face-shape tools need landmarks, which only web can detect for now.
const RETOUCH_PANEL_TOOLS = FACE_DETECTION_SUPPORTED
  ? RETOUCH_TOOLS
  : RETOUCH_TOOLS.filter((t) => !FACE_RETOUCH_KEYS.includes(t.key));

const FACE_NOTE: Record<FaceStatus, string> = {
  unsupported: '',
  idle: '얼굴 윤곽을 찾아 자연스럽게 다듬어요.',
  detecting: '얼굴을 찾는 중이에요…',
  found: '사진에서 가장 크게 나온 얼굴에 적용돼요.',
  none: '얼굴을 찾지 못했어요. 정면 얼굴이 잘 보이는 사진에서 써보세요.',
  error: '얼굴 인식을 불러오지 못했어요. 네트워크 연결을 확인해 주세요.',
};

export function RetouchPanel({ faceStatus }: { faceStatus: FaceStatus }) {
  const values = useEditorStore((s) => s.present.retouch);
  const { setRetouch, commit, resetRetouch } = useEditorStore.getState();
  const note = (key: RetouchKey) =>
    FACE_RETOUCH_KEYS.includes(key)
      ? FACE_NOTE[faceStatus]
      : '피부색 영역만 골라 결을 정돈해요. 눈·머리카락·윤곽선은 선명하게 유지돼요.';
  return (
    <ToolSliderPanel
      tools={RETOUCH_PANEL_TOOLS}
      values={values}
      onChange={setRetouch}
      onCommit={commit}
      onReset={resetRetouch}
      note={note}
    />
  );
}

export type TouchMode = 'push' | 'spot';

export interface BrushSettings {
  mode: TouchMode;
  /** 밀기 brush size, 0…100 */
  size: number;
  /** 밀기 strength, 0…100 */
  strength: number;
  /** 잡티 size, 0…100 */
  spotSize: number;
}

export const DEFAULT_BRUSH: BrushSettings = { mode: 'push', size: 45, strength: 40, spotSize: 20 };

/**
 * Panel sliders → brush. 밀기: radius 3…15 % of the short side, content
 * follows 4…30 % of the finger. 잡티: radius 0.5…3.5 %.
 */
export function toBrush({ mode, size, strength, spotSize }: BrushSettings): Brush {
  if (mode === 'spot') return { mode, radius: 0.005 + (spotSize / 100) * 0.03, strength: 0 };
  return { mode, radius: 0.03 + (size / 100) * 0.12, strength: 0.04 + (strength / 100) * 0.26 };
}

const TOUCH_MODES = [
  { value: 'push', label: '밀기' },
  { value: 'spot', label: '잡티 제거' },
] as const;

export function TouchPanel({ brush, onChange }: { brush: BrushSettings; onChange: (b: BrushSettings) => void }) {
  const strokes = useEditorStore((s) => s.present.reshape.length);
  const spots = useEditorStore((s) => s.present.spots.length);
  const { clearReshape, clearSpots } = useEditorStore.getState();
  const spot = brush.mode === 'spot';
  const count = spot ? spots : strokes;

  const trash = (
    <IconButton
      icon="trash-outline"
      size={18}
      disabled={count === 0}
      color={colors.textSecondary}
      accessibilityLabel={spot ? '잡티 제거 모두 지우기' : '밀기 보정 모두 지우기'}
      onPress={() => {
        feedback.light();
        if (spot) clearSpots();
        else clearReshape();
      }}
    />
  );

  return (
    <View>
      <View style={styles.touchModes}>
        <SegmentedControl
          options={TOUCH_MODES}
          value={brush.mode}
          onChange={(mode) => onChange({ ...brush, mode })}
          accessibilityLabel="터치 보정 종류"
        />
      </View>
      <View style={styles.intensityRow}>
        <Text style={styles.filterName}>크기</Text>
        <View style={styles.flex}>
          <SliderControl
            value={spot ? brush.spotSize : brush.size}
            min={0}
            max={100}
            onChange={(v) => onChange(spot ? { ...brush, spotSize: v } : { ...brush, size: v })}
            resetValue={spot ? DEFAULT_BRUSH.spotSize : DEFAULT_BRUSH.size}
            accessibilityLabel="브러시 크기"
          />
        </View>
        {spot ? trash : <View style={styles.trashSpacer} />}
      </View>
      {spot ? (
        <Text style={styles.reshapeHint}>
          잡티보다 조금 크게 맞추고 톡 눌러 주세요.{'\n'}주변 피부결로 자연스럽게 채워져요.
        </Text>
      ) : (
        <>
          <View style={styles.intensityRow}>
            <Text style={styles.filterName}>강도</Text>
            <View style={styles.flex}>
              <SliderControl
                value={brush.strength}
                min={0}
                max={100}
                onChange={(strength) => onChange({ ...brush, strength })}
                resetValue={DEFAULT_BRUSH.strength}
                accessibilityLabel="브러시 강도"
              />
            </View>
            {trash}
          </View>
          <Text style={styles.reshapeHint}>
            브러시를 넉넉하게 키우고 짧게 여러 번 밀면 자연스러워요.{'\n'}턱선·볼은 바깥에서 안쪽으로 조금씩 밀어 주세요.
          </Text>
        </>
      )}
    </View>
  );
}

export function CropPanel({ source }: { source: SourceImage }) {
  const geometry = useEditorStore((s) => s.present.geometry);
  const { setAspect, rotate, flip, setCrop } = useEditorStore.getState();

  const choose = useCallback(
    (id: CropAspectId) => {
      feedback.selection();
      const ratio = aspectRatioOf(id);
      if (id === 'original') return setAspect(id, null);
      if (!ratio) return setAspect(id, geometry.crop);
      const turned = rotatedSize(source.width, source.height, geometry.rotation);
      // Normalised crop must yield `ratio` in pixels.
      setAspect(id, centeredCrop(turned.width, turned.height, ratio));
    },
    [geometry.crop, geometry.rotation, setAspect, source.height, source.width],
  );

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.aspects}>
        {CROP_ASPECTS.map((a) => {
          const selected = geometry.aspect === a.id;
          return (
            <PressableScale
              key={a.id}
              onPress={() => choose(a.id)}
              style={[styles.aspect, selected && styles.aspectSelected]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`비율 ${a.label}`}
            >
              <Text style={[styles.aspectText, selected && styles.aspectTextSelected]}>{a.label}</Text>
            </PressableScale>
          );
        })}
      </ScrollView>
      <View style={styles.geoRow}>
        <IconButton icon="refresh-outline" label="회전" accessibilityLabel="90도 회전" onPress={rotate} />
        <IconButton
          icon="swap-horizontal-outline"
          label="좌우 반전"
          active={geometry.flipH}
          accessibilityLabel="좌우 반전"
          onPress={() => flip('h')}
        />
        <IconButton
          icon="swap-vertical-outline"
          label="상하 반전"
          active={geometry.flipV}
          accessibilityLabel="상하 반전"
          onPress={() => flip('v')}
        />
        <IconButton
          icon="scan-outline"
          label="자르기 해제"
          disabled={!geometry.crop}
          accessibilityLabel="자르기 해제"
          onPress={() => setCrop(null)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  intensityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    gap: spacing.sm,
  },
  filterName: {
    ...typography.filterName,
    color: colors.text,
    width: 64,
  },
  touchModes: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xs,
  },
  trashSpacer: {
    width: 44,
  },
  reshapeHint: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    lineHeight: 18,
  },
  hint: {
    ...typography.caption,
    textAlign: 'center',
    height: 44,
    lineHeight: 44,
  },
  stampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
  },
  stampLabel: {
    ...typography.callout,
    flex: 1,
  },
  aspects: {
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  aspect: {
    minHeight: 36,
    minWidth: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aspectSelected: {
    backgroundColor: colors.text,
  },
  aspectText: {
    ...typography.filterName,
    fontSize: 12,
  },
  aspectTextSelected: {
    color: colors.white,
    fontWeight: '600',
  },
  geoRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
});
