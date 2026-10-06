import type { SkImage } from '@shopify/react-native-skia';
import type { ReactElement } from 'react';
import { FlatList, StyleSheet } from 'react-native';

import { spacing } from '@/constants/theme';
import { useAppDimensions } from '@/hooks/useAppDimensions';
import type { FilterDefinition } from '@/types/filters';

import { FilterCard } from './FilterCard';

const COLUMNS = 3;

interface Props {
  filters: FilterDefinition[];
  image: SkImage | null;
  onPress: (id: string) => void;
  removable?: boolean;
  header?: ReactElement | null;
  empty?: ReactElement | null;
}

export function FilterGrid({ filters, image, onPress, removable, header, empty }: Props) {
  const { width } = useAppDimensions();
  const cell = Math.floor((width - spacing.lg * 2 - spacing.md * (COLUMNS - 1)) / COLUMNS);
  return (
    <FlatList
      data={filters}
      keyExtractor={(f) => f.id}
      numColumns={COLUMNS}
      renderItem={({ item }) => (
        <FilterCard filter={item} image={image} width={cell} onPress={onPress} removable={removable} />
      )}
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.content}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  row: {
    gap: spacing.md,
  },
});
