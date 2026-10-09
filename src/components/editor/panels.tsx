import type { SkImage } from '@shopify/react-native-skia';
import { useCallback, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { IconButton } from '@/components/common/IconButton';
import { PressableScale } from '@/components/common/PressableScale';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { SliderControl } from '@/components/common/SliderControl';
import { TextPromptDialog } from '@/components/common/TextPromptDialog';
import { FilterCarousel } from '@/components/filters/FilterCarousel';
import { RecipeActionsSheet } from '@/components/recipes/RecipeActionsSheet';
import { ADJUST_TOOLS } from '@/constants/adjustments';
import { aspectRatioOf, CROP_ASPECTS } from '@/constants/crop';
import { getFilter } from '@/constants/filters';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { feedback } from '@/services/feedback';
import { centeredCrop, rotatedSize } from '@/services/imagePipeline';
import { saveRecipe } from '@/services/recipes';
import { lookOf, useEditorStore } from '@/stores/editorStore';
import { useIsFavorite, useFilterStore } from '@/stores/filterStore';
import {
  getRecipe,
  parseRecipeLookId,
  RECIPE_NAME_MAX,
  recipeLookId,
  recipeToLook,
  useRecipe,
  useRecipeStore,
} from '@/stores/recipeStore';
import { showToast } from '@/stores/toastStore';
import type { CropAspectId, SourceImage } from '@/types/editing';
import type { LookTab } from '@/types/filters';

import { CurvesPanel } from './CurvesPanel';
import type { Brush } from './EditorCanvas';
import { ADJUST_VIEWS, FILTER_VIEWS, type AdjustView, type FilterView } from './editorNav';
import { HslPanel } from './HslPanel';
import { SubTabs } from './SubTabs';
import { ToolSliderPanel } from './ToolSliderPanel';

interface FilterPanelProps {
  thumbImage: SkImage | null;
  view: FilterView;
  onViewChange: (view: FilterView) => void;
  /** Preset category (shared by Presets and Mix). */
  tab: LookTab;
  onTabChange: (tab: LookTab) => void;
}

/**
 * 필터: Presets (filter categories, favourites), Mix (filter B layered on
 * the selected look) and My Recipe (saved looks: apply, long press to manage,
 * + to save the current edit).
 */
export function FilterPanel({ thumbImage, view, onViewChange, tab, onTabChange }: FilterPanelProps) {
  const filterId = useEditorStore((s) => s.present.filterId);
  const intensity = useEditorStore((s) => s.present.intensity);
  const recipeId = useEditorStore((s) => s.present.recipeId);
  const recipe = useRecipe(recipeId);
  const mix = useEditorStore((s) => s.present.mix);
  const { setFilter, setIntensity, commit, applyLook, setMix, setMixIntensity } = useEditorStore.getState();
  const [managing, setManaging] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const filterFavorite = useIsFavorite(filterId);
  const filter = getFilter(filterId);
  const favorite = recipe ? recipe.favorite : filterFavorite;
  const selectedLook = recipe ? recipeLookId(recipe.id) : filterId;
  const lookName = recipe ? recipe.name : filter.name;

  const onSelect = useCallback(
    (id: string) => {
      const rid = parseRecipeLookId(id);
      const r = rid ? getRecipe(rid) : null;
      if (r) applyLook(recipeToLook(r), r.id);
      else setFilter(id);
    },
    [applyLook, setFilter],
  );

  const onSelectMix = useCallback(
    (id: string) => setMix(id === 'original' ? null : { filterId: id, intensity: mix?.intensity ?? 50 }),
    [setMix, mix],
  );

  const saveAsRecipe = async (name: string) => {
    const { present } = useEditorStore.getState();
    const id = await saveRecipe(name, lookOf(present), thumbImage);
    // The photo now uses this recipe; highlight it without adding an undo step.
    useEditorStore.setState((s) => ({ present: { ...s.present, recipeId: id }, committed: { ...s.committed, recipeId: id } }));
    feedback.success();
    showToast(`‘${name}’ 레시피를 저장했어요`);
  };

  const saveButton = (
    <IconButton
      icon="bookmark-outline"
      color={colors.textSecondary}
      size={18}
      accessibilityLabel="지금 보정을 레시피로 저장 (Save as Recipe)"
      onPress={() => setNaming(true)}
    />
  );

  const lookRow =
    filterId !== 'original' || recipe ? (
      <View style={styles.intensityRow}>
        <Text style={styles.filterName} numberOfLines={1}>
          {lookName}
        </Text>
        <View style={styles.flex}>
          <SliderControl
            value={intensity}
            onChange={setIntensity}
            onComplete={commit}
            resetValue={recipe ? recipe.color.intensity : 80}
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
            if (recipe) useRecipeStore.getState().toggleFavorite(recipe.id);
            else useFilterStore.getState().toggleFavorite(filterId);
          }}
        />
        {saveButton}
      </View>
    ) : (
      <View style={styles.intensityRow}>
        <Text style={[styles.hint, styles.flex]}>
          {view === 'recipes' ? '저장한 레시피를 골라 한 번에 적용해 보세요' : '필터를 골라 분위기를 입혀보세요'}
        </Text>
        {saveButton}
      </View>
    );

  let body: ReactNode;
  if (view === 'mix') {
    body = (
      <>
        <View style={styles.intensityRow}>
          {mix ? (
            <>
              <Text style={styles.filterName} numberOfLines={1}>
                {getFilter(mix.filterId).name}
              </Text>
              <View style={styles.flex}>
                <SliderControl value={mix.intensity} onChange={setMixIntensity} onComplete={commit} resetValue={50} accessibilityLabel="혼합 필터 강도" />
              </View>
              <IconButton icon="close-circle-outline" size={18} color={colors.textSecondary} accessibilityLabel="혼합 해제" onPress={() => setMix(null)} />
            </>
          ) : (
            <Text style={[styles.hint, styles.flex]} numberOfLines={1}>
              {filterId !== 'original' || recipe ? `‘${lookName}’ 위에 겹칠 필터를 골라 주세요` : '지금 사진 위에 겹칠 필터를 골라 주세요'}
            </Text>
          )}
        </View>
        <FilterCarousel
          selectedId={mix?.filterId ?? 'original'}
          onSelect={onSelectMix}
          image={thumbImage}
          tab={tab}
          onTabChange={onTabChange}
          thumbWidth={56}
          thumbHeight={70}
          showRecipes={false}
        />
      </>
    );
  } else if (view === 'recipes') {
    body = (
      <>
        {lookRow}
        <FilterCarousel
          selectedId={selectedLook}
          onSelect={onSelect}
          image={thumbImage}
          tab="my"
          onTabChange={onTabChange}
          thumbWidth={56}
          thumbHeight={70}
          hideTabs
          onRecipeLongPress={setManaging}
          onAddRecipe={() => setNaming(true)}
        />
        <Text style={styles.recipeNote}>길게 눌러 이름 변경 · 즐겨찾기 · 삭제</Text>
      </>
    );
  } else {
    body = (
      <>
        {lookRow}
        <FilterCarousel
          selectedId={selectedLook}
          onSelect={onSelect}
          image={thumbImage}
          tab={tab}
          onTabChange={onTabChange}
          thumbWidth={56}
          thumbHeight={70}
          showRecipes={false}
        />
      </>
    );
  }

  return (
    <View>
      <SubTabs options={FILTER_VIEWS} value={view} onChange={onViewChange} accessibilityLabel="필터 메뉴" />
      {body}
      <RecipeActionsSheet recipeId={managing} onClose={() => setManaging(null)} onApply={(id) => onSelect(recipeLookId(id))} />
      <TextPromptDialog
        visible={naming}
        title="레시피로 저장"
        message="필터·혼합·조정·HSL·커브·필름 효과·프레임·날짜 스타일을 저장해 다른 사진에도 쓸 수 있어요. 자르기·얼굴 보정·촬영 날짜는 포함되지 않아요."
        initialValue={`My Recipe ${useRecipeStore.getState().recipes.length + 1}`}
        placeholder="예: Warm Diary"
        confirmText="저장"
        maxLength={RECIPE_NAME_MAX}
        onSubmit={saveAsRecipe}
        onClose={() => setNaming(false)}
      />
    </View>
  );
}

/** 조정: 기본 (light & colour sliders), HSL and 커브 — same edit data, grouped in one menu. */
export function AdjustMenu({ view, onViewChange }: { view: AdjustView; onViewChange: (view: AdjustView) => void }) {
  return (
    <View>
      <SubTabs options={ADJUST_VIEWS} value={view} onChange={onViewChange} accessibilityLabel="조정 메뉴" />
      {view === 'basic' ? <AdjustPanel /> : null}
      {view === 'hsl' ? <HslPanel /> : null}
      {view === 'curves' ? <CurvesPanel /> : null}
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
  recipeNote: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
