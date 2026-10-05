import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChipTabs } from '@/components/common/ChipTabs';
import { Header } from '@/components/common/Header';
import { IconButton } from '@/components/common/IconButton';
import { FilterGrid } from '@/components/filters/FilterGrid';
import { FILTER_TABS, filtersForTab } from '@/constants/filters';
import { colors, spacing, typography } from '@/constants/theme';
import { usePreviewImage } from '@/hooks/usePreviewImage';
import { useCameraStore } from '@/stores/cameraStore';
import { useFilterStore } from '@/stores/filterStore';
import type { FilterTab } from '@/types/filters';

export default function FiltersScreen() {
  const [tab, setTab] = useState<FilterTab>('all');
  const favorites = useFilterStore((s) => s.favorites);
  const lastPhotoUri = useCameraStore((s) => s.lastPhotoUri);
  const image = usePreviewImage(lastPhotoUri);
  const data = useMemo(() => filtersForTab(tab, favorites), [tab, favorites]);
  const open = useCallback((id: string) => router.push({ pathname: '/filters/[id]', params: { id } }), []);

  return (
    <View style={styles.root}>
      <Header
        title="Filters"
        right={<IconButton icon="heart-outline" accessibilityLabel="즐겨찾기 필터" onPress={() => router.push('/favorites')} />}
      />
      <View style={styles.tabs}>
        <ChipTabs tabs={FILTER_TABS} value={tab} onChange={setTab} />
      </View>
      <FilterGrid
        filters={data}
        image={image}
        onPress={open}
        header={<Text style={styles.caption}>{data.length}개의 필터 · 하트를 눌러 즐겨찾기에 담아보세요</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabs: {
    paddingVertical: spacing.sm,
  },
  caption: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
});
