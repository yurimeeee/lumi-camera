import { Ionicons } from '@expo/vector-icons';
import type { SkImage } from '@shopify/react-native-skia';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { FlatList, StyleSheet, Text, View, type ListRenderItem } from 'react-native';

import { ChipTabs } from '@/components/common/ChipTabs';
import { PressableScale } from '@/components/common/PressableScale';
import { FILTER_TABS, FILTERS, filtersForTab, ORIGINAL_FILTER_ID } from '@/constants/filters';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { feedback } from '@/services/feedback';
import { useFilterStore } from '@/stores/filterStore';
import { recipeLookId, recipeToLook, useRecipeStore } from '@/stores/recipeStore';
import type { FilterDefinition, LookTab } from '@/types/filters';
import type { Recipe } from '@/types/recipes';

import { FilterThumbnail, LookThumbnail } from './FilterThumbnail';

type Item =
  | { kind: 'filter'; key: string; filter: FilterDefinition }
  | { kind: 'recipe'; key: string; recipe: Recipe }
  | { kind: 'add'; key: string };

const LOOK_TABS: readonly { id: LookTab; label: string }[] = [
  FILTER_TABS[0]!,
  FILTER_TABS[1]!,
  { id: 'my', label: 'My' },
  ...FILTER_TABS.slice(2),
];

interface Props {
  /** Filter id, or recipe:<id> (see recipeLookId). */
  selectedId: string;
  onSelect: (id: string) => void;
  image: SkImage | null;
  tab: LookTab;
  onTabChange: (tab: LookTab) => void;
  tone?: 'light' | 'dark';
  thumbWidth?: number;
  thumbHeight?: number;
  /** Shows My Recipes (the "My" tab, and recipes in All / Favorites). */
  showRecipes?: boolean;
  /** Long press on a recipe (rename / favourite / delete). */
  onRecipeLongPress?: (recipeId: string) => void;
  /** Adds a "save current look" card to the My tab. */
  onAddRecipe?: () => void;
  /** Tap on the already selected look (e.g. to show its intensity slider). */
  onReselect?: () => void;
  /** Hides the category chips (the parent picks the tab, e.g. the editor's My Recipe view). */
  hideTabs?: boolean;
}

const filterItem = (f: FilterDefinition): Item => ({ kind: 'filter', key: f.id, filter: f });
const recipeItem = (r: Recipe): Item => ({ kind: 'recipe', key: recipeLookId(r.id), recipe: r });

/** Category chips + horizontally scrolling, shader-rendered filter and recipe thumbnails. */
export const FilterCarousel = memo(function FilterCarousel({
  selectedId,
  onSelect,
  image,
  tab,
  onTabChange,
  tone = 'light',
  thumbWidth = 60,
  thumbHeight = 76,
  showRecipes = true,
  onRecipeLongPress,
  onAddRecipe,
  onReselect,
  hideTabs = false,
}: Props) {
  const favorites = useFilterStore((s) => s.favorites);
  const recipes = useRecipeStore((s) => s.recipes);
  const activeTab: LookTab = !showRecipes && tab === 'my' ? 'all' : tab;

  const data = useMemo<Item[]>(() => {
    if (!showRecipes) return filtersForTab(activeTab === 'my' ? 'all' : activeTab, favorites).map(filterItem);
    const original = FILTERS.find((f) => f.id === ORIGINAL_FILTER_ID)!;
    switch (activeTab) {
      case 'my':
        return [...(onAddRecipe ? [{ kind: 'add', key: '__add' } as const] : []), ...recipes.map(recipeItem)];
      case 'all':
        return [filterItem(original), ...recipes.map(recipeItem), ...FILTERS.filter((f) => f !== original).map(filterItem)];
      case 'favorites':
        return [
          filterItem(original),
          ...recipes.filter((r) => r.favorite).map(recipeItem),
          ...filtersForTab('favorites', favorites)
            .filter((f) => f !== original)
            .map(filterItem),
        ];
      default:
        return filtersForTab(activeTab, favorites).map(filterItem);
    }
  }, [activeTab, favorites, recipes, showRecipes, onAddRecipe]);

  const listRef = useRef<FlatList<Item>>(null);
  const itemWidth = thumbWidth + 6 + spacing.sm;

  const handleSelect = useCallback(
    (id: string) => {
      if (id === selectedId) {
        if (onReselect) {
          feedback.selection();
          onReselect();
        }
        return;
      }
      feedback.selection();
      onSelect(id);
    },
    [onSelect, onReselect, selectedId],
  );

  const handleLongPress = useCallback(
    (id: string) => {
      if (!onRecipeLongPress || !id.startsWith('recipe:')) return;
      feedback.light();
      onRecipeLongPress(id.slice(7));
    },
    [onRecipeLongPress],
  );

  // Keep the selection in view when switching tabs or selecting externally.
  useEffect(() => {
    const index = data.findIndex((f) => f.key === selectedId);
    if (index > 2) listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
  }, [data, selectedId]);

  const dark = tone === 'dark';

  const renderItem: ListRenderItem<Item> = useCallback(
    ({ item }) => {
      if (item.kind === 'add') {
        return (
          <PressableScale
            onPress={onAddRecipe}
            style={styles.addRoot}
            accessibilityRole="button"
            accessibilityLabel="지금 보정을 레시피로 저장"
          >
            <View style={[styles.add, { width: thumbWidth, height: thumbHeight }, dark && styles.addDark]}>
              <Ionicons name="add" size={22} color={dark ? colors.whiteSoft : colors.text} />
            </View>
            <Text style={[styles.addLabel, dark && styles.addLabelDark]} numberOfLines={1}>
              Save
            </Text>
          </PressableScale>
        );
      }
      if (item.kind === 'recipe') {
        return (
          <LookThumbnail
            id={item.key}
            name={item.recipe.name}
            kindLabel="레시피"
            look={recipeToLook(item.recipe)}
            badge="recipe"
            image={image}
            selected={item.key === selectedId}
            onPress={handleSelect}
            onLongPress={onRecipeLongPress ? handleLongPress : undefined}
            width={thumbWidth}
            height={thumbHeight}
            tone={tone}
          />
        );
      }
      return (
        <FilterThumbnail
          filter={item.filter}
          image={image}
          selected={item.key === selectedId}
          onPress={handleSelect}
          width={thumbWidth}
          height={thumbHeight}
          tone={tone}
        />
      );
    },
    [image, selectedId, handleSelect, handleLongPress, onRecipeLongPress, onAddRecipe, thumbWidth, thumbHeight, tone, dark],
  );

  const emptyText =
    activeTab === 'my'
      ? '사진을 보정한 뒤 편집 화면의 My 탭에서 레시피로 저장해 보세요'
      : '즐겨찾기한 필터가 없어요';

  return (
    <View>
      {hideTabs ? null : <ChipTabs tabs={showRecipes ? LOOK_TABS : FILTER_TABS} value={activeTab} onChange={onTabChange} tone={tone} />}
      <FlatList
        ref={listRef}
        horizontal
        data={data}
        keyExtractor={(f) => f.key}
        renderItem={renderItem}
        extraData={selectedId}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={Separator}
        getItemLayout={(_, index) => ({ length: itemWidth, offset: spacing.lg + itemWidth * index, index })}
        onScrollToIndexFailed={() => undefined}
        initialNumToRender={8}
        windowSize={5}
        ListEmptyComponent={<Text style={[styles.empty, dark && styles.emptyDark]}>{emptyText}</Text>}
      />
    </View>
  );
});

function Separator() {
  return <View style={{ width: spacing.sm }} />;
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  empty: {
    ...typography.caption,
    paddingVertical: spacing.xl,
  },
  emptyDark: {
    color: colors.whiteMuted,
  },
  addRoot: {
    alignItems: 'center',
  },
  add: {
    margin: 3,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.textTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addDark: {
    borderColor: colors.whiteMuted,
  },
  addLabel: {
    ...typography.filterName,
    marginTop: 4,
  },
  addLabelDark: {
    color: colors.whiteMuted,
  },
});
