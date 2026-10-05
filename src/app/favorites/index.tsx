import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Header } from '@/components/common/Header';
import { PressableScale } from '@/components/common/PressableScale';
import { FilterGrid } from '@/components/filters/FilterGrid';
import { FILTERS } from '@/constants/filters';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { usePreviewImage } from '@/hooks/usePreviewImage';
import { useCameraStore } from '@/stores/cameraStore';
import { useFilterStore } from '@/stores/filterStore';

export default function FavoritesScreen() {
  const favorites = useFilterStore((s) => s.favorites);
  const lastPhotoUri = useCameraStore((s) => s.lastPhotoUri);
  const image = usePreviewImage(lastPhotoUri);
  const [editing, setEditing] = useState(false);
  // Keep catalogue order rather than the order they were favourited.
  const data = useMemo(() => FILTERS.filter((f) => favorites.includes(f.id)), [favorites]);
  const open = useCallback((id: string) => router.push({ pathname: '/filters/[id]', params: { id } }), []);

  return (
    <View style={styles.root}>
      <Header
        title="Favorites"
        right={
          data.length ? (
            <PressableScale onPress={() => setEditing((v) => !v)} style={styles.edit} accessibilityRole="button">
              <Text style={styles.editText}>{editing ? '완료' : '편집'}</Text>
            </PressableScale>
          ) : null
        }
      />
      <FilterGrid
        filters={data}
        image={image}
        onPress={open}
        removable={editing}
        header={<Text style={styles.caption}>자주 쓰는 필터를 모아 빠르게</Text>}
        empty={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>아직 즐겨찾기한 필터가 없어요</Text>
            <Text style={styles.emptyText}>필터의 하트를 눌러 이곳에 모아보세요</Text>
            <PressableScale style={styles.browse} onPress={() => router.push('/filters')} accessibilityRole="button">
              <Text style={styles.browseText}>필터 둘러보기</Text>
            </PressableScale>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  edit: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  editText: {
    ...typography.callout,
    color: colors.textSecondary,
  },
  caption: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  empty: {
    alignItems: 'center',
    paddingTop: spacing.xxxl * 2,
    gap: spacing.sm,
  },
  emptyTitle: {
    ...typography.headline,
  },
  emptyText: {
    ...typography.caption,
  },
  browse: {
    marginTop: spacing.lg,
    minHeight: 44,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  browseText: {
    ...typography.callout,
    fontWeight: '600',
  },
});
