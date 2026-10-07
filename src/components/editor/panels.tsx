import { Ionicons } from '@expo/vector-icons';
import type { SkImage } from '@shopify/react-native-skia';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { IconButton } from '@/components/common/IconButton';
import { PressableScale } from '@/components/common/PressableScale';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { SliderControl } from '@/components/common/SliderControl';
import { FilterCarousel } from '@/components/filters/FilterCarousel';
import { ADJUST_TOOLS, EFFECT_TOOLS } from '@/constants/adjustments';
import { aspectRatioOf, CROP_ASPECTS } from '@/constants/crop';
import { getFilter } from '@/constants/filters';
import { colors, radius, spacing, typography, WEB_SWITCH } from '@/constants/theme';
import { feedback } from '@/services/feedback';
import { centeredCrop, rotatedSize } from '@/services/imagePipeline';
import { useEditorStore } from '@/stores/editorStore';
import { useIsFavorite, useFilterStore } from '@/stores/filterStore';
import type { CropAspectId, SourceImage } from '@/types/editing';
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

export type TouchMode = 'push' | 'restore' | 'spot';

export interface BrushSettings {
  mode: TouchMode;
  /** 밀기 / 복원 brush size, 0…100 */
  size: number;
  /** 밀기 strength, 0…100 */
  strength: number;
  /** 잡티 size, 0…100 */
  spotSize: number;
}

export const DEFAULT_BRUSH: BrushSettings = { mode: 'push', size: 35, strength: 40, spotSize: 20 };

/**
 * Panel sliders → brush. 밀기 / 복원: radius 3…25 % of the short side (a big
 * soft brush spreads the same change wider, so less bending); 밀기 content
 * follows 4…30 % of the finger. 잡티: radius 0.5…3.5 %.
 */
export function toBrush({ mode, size, strength, spotSize }: BrushSettings): Brush {
  if (mode === 'spot') return { mode, radius: 0.005 + (spotSize / 100) * 0.03, strength: 0 };
  return { mode, radius: 0.03 + (size / 100) * 0.22, strength: 0.04 + (strength / 100) * 0.26 };
}

const TOUCH_MODES = [
  { value: 'push', label: '밀기' },
  { value: 'restore', label: '복원' },
  { value: 'spot', label: '잡티 제거' },
] as const;

const TOUCH_HINT: Record<TouchMode, string> = {
  push: '브러시를 넉넉하게 키우고 짧게 여러 번 밀면 자연스러워요.\n과하게 밀린 곳은 복원으로 살짝 문질러 주세요.',
  restore: '문지른 곳이 조금씩 원래 모습으로 돌아와요.\n밀기가 과한 부분만 살살 문질러 주세요.',
  spot: '잡티보다 조금 크게 맞추고 톡 눌러 주세요.\n주변 피부결로 자연스럽게 채워져요.',
};

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
        {brush.mode === 'push' ? <View style={styles.trashSpacer} /> : trash}
      </View>
      {brush.mode === 'push' ? (
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
      ) : null}
      <Text style={styles.reshapeHint}>{TOUCH_HINT[brush.mode]}</Text>
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
