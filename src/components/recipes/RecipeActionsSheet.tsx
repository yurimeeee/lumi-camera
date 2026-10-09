import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/common/BottomSheet';
import type { IconName } from '@/components/common/IconButton';
import { PressableScale } from '@/components/common/PressableScale';
import { TextPromptDialog } from '@/components/common/TextPromptDialog';
import { recipeSummary } from '@/utils/recipeSummary';
import { colors, spacing, typography } from '@/constants/theme';
import { feedback } from '@/services/feedback';
import { deleteRecipe } from '@/services/recipes';
import { RECIPE_NAME_MAX, useRecipe, useRecipeStore } from '@/stores/recipeStore';
import { confirmAction } from '@/utils/dialogs';

interface Props {
  recipeId: string | null;
  onClose: () => void;
  /** Extra first action, e.g. "이 사진에 적용". */
  onApply?: (id: string) => void;
  applyLabel?: string;
}

/** iOS can't present a modal or alert while the sheet's modal is still dismissing. */
const AFTER_SHEET = 320;

/** Rename / favourite / delete a My Recipe. */
export function RecipeActionsSheet({ recipeId, onClose, onApply, applyLabel = '이 사진에 적용' }: Props) {
  const recipe = useRecipe(recipeId);
  const [renaming, setRenaming] = useState<string | null>(null);

  const rows: { icon: IconName; label: string; destructive?: boolean; onPress: () => void }[] = recipe
    ? [
        ...(onApply
          ? [{ icon: 'checkmark-circle-outline' as IconName, label: applyLabel, onPress: () => (onApply(recipe.id), onClose()) }]
          : []),
        {
          icon: 'create-outline',
          label: '이름 변경',
          onPress: () => {
            onClose();
            setTimeout(() => setRenaming(recipe.id), AFTER_SHEET);
          },
        },
        {
          icon: recipe.favorite ? 'heart' : 'heart-outline',
          label: recipe.favorite ? '즐겨찾기 해제' : '즐겨찾기',
          onPress: () => {
            feedback.light();
            useRecipeStore.getState().toggleFavorite(recipe.id);
            onClose();
          },
        },
        {
          icon: 'trash-outline',
          label: '삭제',
          destructive: true,
          onPress: () => {
            onClose();
            setTimeout(
              () =>
                confirmAction({
                  title: `‘${recipe.name}’ 레시피를 삭제할까요?`,
                  message: '이미 이 레시피로 편집한 사진은 그대로 유지돼요.',
                  confirmText: '삭제',
                  destructive: true,
                  onConfirm: () => deleteRecipe(recipe.id),
                }),
              AFTER_SHEET,
            );
          },
        },
      ]
    : [];

  const renamingRecipe = useRecipe(renaming);

  return (
    <>
      <BottomSheet visible={!!recipe} onClose={onClose} title={recipe?.name}>
        {recipe ? (
          <Text style={styles.meta}>
            {recipeSummary(recipe)} · {new Date(recipe.createdAt).toLocaleDateString('ko-KR')}
          </Text>
        ) : null}
        <View style={styles.rows}>
          {rows.map((r) => (
            <PressableScale key={r.label} style={styles.row} onPress={r.onPress} accessibilityRole="button" activeScale={0.98}>
              <Ionicons name={r.icon} size={20} color={r.destructive ? colors.danger : colors.text} />
              <Text style={[styles.label, r.destructive && styles.danger]}>{r.label}</Text>
            </PressableScale>
          ))}
        </View>
      </BottomSheet>
      <TextPromptDialog
        visible={!!renamingRecipe}
        title="레시피 이름 변경"
        initialValue={renamingRecipe?.name ?? ''}
        confirmText="변경"
        maxLength={RECIPE_NAME_MAX}
        onSubmit={(name) => {
          if (renaming) useRecipeStore.getState().rename(renaming, name);
        }}
        onClose={() => setRenaming(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  meta: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: -spacing.xs,
    marginBottom: spacing.sm,
  },
  rows: {
    gap: spacing.xxs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 50,
  },
  label: {
    ...typography.body,
  },
  danger: {
    color: colors.danger,
  },
});
