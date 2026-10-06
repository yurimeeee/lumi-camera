import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import type { IconName } from '@/components/common/IconButton';
import { PressableScale } from '@/components/common/PressableScale';
import { colors, spacing, typography } from '@/constants/theme';
import { feedback } from '@/services/feedback';

export type EditorTool = 'filter' | 'adjust' | 'retouch' | 'reshape' | 'crop' | 'effects';

const TOOLS: readonly { id: EditorTool; label: string; icon: IconName; activeIcon: IconName }[] = [
  { id: 'filter', label: '필터', icon: 'color-filter-outline', activeIcon: 'color-filter' },
  { id: 'adjust', label: '조정', icon: 'options-outline', activeIcon: 'options' },
  { id: 'retouch', label: '보정', icon: 'happy-outline', activeIcon: 'happy' },
  { id: 'reshape', label: '터치', icon: 'hand-left-outline', activeIcon: 'hand-left' },
  { id: 'crop', label: '자르기', icon: 'crop-outline', activeIcon: 'crop' },
  { id: 'effects', label: '효과', icon: 'sparkles-outline', activeIcon: 'sparkles' },
];

export function EditorToolbar({ value, onChange }: { value: EditorTool; onChange: (t: EditorTool) => void }) {
  return (
    <View style={styles.root} accessibilityRole="tablist">
      {TOOLS.map((t) => {
        const selected = t.id === value;
        return (
          <PressableScale
            key={t.id}
            style={styles.item}
            onPress={() => {
              if (selected) return;
              feedback.selection();
              onChange(t.id);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={t.label}
          >
            <Ionicons name={selected ? t.activeIcon : t.icon} size={21} color={selected ? colors.text : colors.textSecondary} />
            <Text style={[styles.label, selected && styles.labelSelected]}>{t.label}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  item: {
    minWidth: 56,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  label: {
    ...typography.micro,
  },
  labelSelected: {
    color: colors.text,
    fontWeight: '600',
  },
});
