import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Header } from '@/components/common/Header';
import { PressableScale } from '@/components/common/PressableScale';
import { RecipeActionsSheet } from '@/components/recipes/RecipeActionsSheet';
import { getFilter } from '@/constants/filters';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { feedback } from '@/services/feedback';
import { useCameraStore } from '@/stores/cameraStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { showToast } from '@/stores/toastStore';
import type { Recipe } from '@/types/recipes';

/** My Recipes: browse, rename, favourite, delete, or shoot with one. */
export default function RecipesScreen() {
  const insets = useSafeAreaInsets();
  const recipes = useRecipeStore((s) => s.recipes);
  const [managing, setManaging] = useState<string | null>(null);

  const useInCamera = (id: string) => {
    const recipe = useRecipeStore.getState().recipes.find((r) => r.id === id);
    if (!recipe) return;
    useCameraStore.getState().setRecipe(id);
    useCameraStore.getState().setFilterTab('my');
    feedback.light();
    showToast(`카메라에 ‘${recipe.name}’를 적용했어요`);
    router.dismissTo('/');
  };

  const renderItem = ({ item }: { item: Recipe }) => (
    <PressableScale
      style={styles.row}
      onPress={() => setManaging(item.id)}
      activeScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${item.name} 레시피`}
    >
      <View style={styles.thumb}>
        {item.thumbnailUri ? (
          <Image source={{ uri: item.thumbnailUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <Ionicons name="color-filter-outline" size={20} color={colors.textTertiary} />
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {getFilter(item.baseFilterId).name} {item.intensity} · {new Date(item.createdAt).toLocaleDateString('ko-KR')}
        </Text>
      </View>
      {item.favorite ? <Ionicons name="heart" size={16} color={colors.accent} /> : null}
      <Ionicons name="ellipsis-horizontal" size={18} color={colors.textSecondary} />
    </PressableScale>
  );

  return (
    <View style={styles.root}>
      <Header title="My Recipes" />
      <FlatList
        data={recipes}
        keyExtractor={(r) => r.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xxl }]}
        ListHeaderComponent={<Text style={styles.caption}>내가 만든 필터. 어떤 사진에도, 카메라에서도 쓸 수 있어요</Text>}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>아직 저장한 레시피가 없어요</Text>
            <Text style={styles.emptyText}>
              사진을 보정한 뒤 편집 화면 필터 탭의 책갈피 버튼(Save as Recipe)을 눌러 저장해 보세요
            </Text>
          </View>
        }
      />
      <RecipeActionsSheet
        recipeId={managing}
        onClose={() => setManaging(null)}
        onApply={useInCamera}
        applyLabel="카메라에서 사용"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  list: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  caption: {
    ...typography.caption,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  thumb: {
    width: 52,
    height: 64,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...typography.headline,
  },
  meta: {
    ...typography.caption,
  },
  empty: {
    alignItems: 'center',
    paddingTop: spacing.xxxl,
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    ...typography.title,
  },
  emptyText: {
    ...typography.caption,
    textAlign: 'center',
    lineHeight: 18,
  },
});
