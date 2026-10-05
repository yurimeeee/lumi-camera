import type { SkImage } from '@shopify/react-native-skia';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { FlatList, StyleSheet, Text, View, type ListRenderItem } from 'react-native';

import { ChipTabs } from '@/components/common/ChipTabs';
import { FILTER_TABS, filtersForTab } from '@/constants/filters';
import { colors, spacing, typography } from '@/constants/theme';
import { feedback } from '@/services/feedback';
import { useFilterStore } from '@/stores/filterStore';
import type { FilterDefinition, FilterTab } from '@/types/filters';

import { FilterThumbnail } from './FilterThumbnail';

interface Props {
  selectedId: string;
  onSelect: (id: string) => void;
  image: SkImage | null;
  tab: FilterTab;
  onTabChange: (tab: FilterTab) => void;
  tone?: 'light' | 'dark';
  thumbWidth?: number;
  thumbHeight?: number;
}

/** Category chips + horizontally scrolling, shader-rendered filter thumbnails. */
export const FilterCarousel = memo(function FilterCarousel({
  selectedId,
  onSelect,
  image,
  tab,
  onTabChange,
  tone = 'light',
  thumbWidth = 60,
  thumbHeight = 76,
}: Props) {
  const favorites = useFilterStore((s) => s.favorites);
  const data = useMemo(() => filtersForTab(tab, favorites), [tab, favorites]);
  const listRef = useRef<FlatList<FilterDefinition>>(null);
  const itemWidth = thumbWidth + 6 + spacing.sm;

  const handleSelect = useCallback(
    (id: string) => {
      if (id === selectedId) return;
      feedback.selection();
      onSelect(id);
    },
    [onSelect, selectedId],
  );

  // Keep the selection in view when switching tabs or selecting externally.
  useEffect(() => {
    const index = data.findIndex((f) => f.id === selectedId);
    if (index > 2) listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
  }, [data, selectedId]);

  const renderItem: ListRenderItem<FilterDefinition> = useCallback(
    ({ item }) => (
      <FilterThumbnail
        filter={item}
        image={image}
        selected={item.id === selectedId}
        onPress={handleSelect}
        width={thumbWidth}
        height={thumbHeight}
        tone={tone}
      />
    ),
    [image, selectedId, handleSelect, thumbWidth, thumbHeight, tone],
  );

  return (
    <View>
      <ChipTabs tabs={FILTER_TABS} value={tab} onChange={onTabChange} tone={tone} />
      <FlatList
        ref={listRef}
        horizontal
        data={data}
        keyExtractor={(f) => f.id}
        renderItem={renderItem}
        extraData={selectedId}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={Separator}
        getItemLayout={(_, index) => ({ length: itemWidth, offset: spacing.lg + itemWidth * index, index })}
        onScrollToIndexFailed={() => undefined}
        initialNumToRender={8}
        windowSize={5}
        ListEmptyComponent={
          <Text style={[styles.empty, tone === 'dark' && styles.emptyDark]}>즐겨찾기한 필터가 없어요</Text>
        }
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
});
