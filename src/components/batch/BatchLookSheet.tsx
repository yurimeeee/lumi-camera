import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/common/BottomSheet';
import { PressableScale } from '@/components/common/PressableScale';
import { colors, radius, spacing, typography } from '@/constants/theme';
import type { Look } from '@/stores/editorStore';
import { useLastLookStore } from '@/stores/lastLookStore';
import { recipeToLook, useRecipeStore } from '@/stores/recipeStore';
import { recipeSummary } from '@/utils/recipeSummary';

interface Props {
  visible: boolean;
  count: number;
  onClose: () => void;
  onChoose: (look: Look, name: string) => void;
}

/** What to apply to the selected photos: the last edit's look, or a My Recipe. */
export function BatchLookSheet({ visible, count, onClose, onChoose }: Props) {
  const recipes = useRecipeStore((s) => s.recipes);
  const last = useLastLookStore((s) => s.look);
  const rows: { key: string; name: string; meta: string; look: Look }[] = [
    ...(last ? [{ key: 'last', name: '최근 편집한 보정', meta: '마지막으로 편집·저장한 사진의 색감과 필름 효과', look: last }] : []),
    ...recipes.map((r) => ({ key: r.id, name: r.name, meta: recipeSummary(r), look: recipeToLook(r) })),
  ];
  return (
    <BottomSheet visible={visible} onClose={onClose} title={`${count}장에 적용할 보정`}>
      {rows.length === 0 ? (
        <Text style={styles.empty}>저장한 레시피가 없어요. 사진을 편집해 레시피로 저장하면 여기서 고를 수 있어요.</Text>
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {rows.map((r) => (
            <PressableScale
              key={r.key}
              style={styles.row}
              onPress={() => {
                onChoose(r.look, r.name);
                onClose();
              }}
              activeScale={0.98}
              accessibilityRole="button"
              accessibilityLabel={`${r.name} 적용`}
            >
              <Ionicons name={r.key === 'last' ? 'time-outline' : 'bookmark-outline'} size={18} color={colors.text} />
              <View style={styles.info}>
                <Text style={styles.name}>{r.name}</Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {r.meta}
                </Text>
              </View>
            </PressableScale>
          ))}
        </ScrollView>
      )}
      <Text style={styles.note}>원본은 그대로 두고, 보정된 사진을 새로 저장해요. 방향·비율·해상도는 사진마다 유지돼요.</Text>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: {
    maxHeight: 360,
  },
  listContent: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
  },
  info: {
    flex: 1,
  },
  name: {
    ...typography.callout,
  },
  meta: {
    ...typography.caption,
    fontSize: 11,
  },
  empty: {
    ...typography.caption,
    paddingVertical: spacing.lg,
  },
  note: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: spacing.md,
  },
});
