import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text } from 'react-native';

import type { IconName } from '@/components/common/IconButton';
import { PressableScale } from '@/components/common/PressableScale';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { feedback } from '@/services/feedback';

import type { EditorTool } from './editorNav';

const TOOLS: readonly { id: EditorTool; label: string; icon: IconName; activeIcon: IconName }[] = [
  { id: 'filter', label: '필터', icon: 'color-filter-outline', activeIcon: 'color-filter' },
  { id: 'adjust', label: '조정', icon: 'options-outline', activeIcon: 'options' },
  { id: 'portrait', label: '인물', icon: 'happy-outline', activeIcon: 'happy' },
  { id: 'touch', label: '터치', icon: 'hand-left-outline', activeIcon: 'hand-left' },
  { id: 'effects', label: '효과', icon: 'sparkles-outline', activeIcon: 'sparkles' },
  { id: 'frame', label: '프레임', icon: 'albums-outline', activeIcon: 'albums' },
  { id: 'crop', label: '자르기', icon: 'crop-outline', activeIcon: 'crop' },
];

/** Main editor menu: always at the bottom; the selected menu's tools open above it. */
export function EditorToolbar({ value, onChange }: { value: EditorTool; onChange: (t: EditorTool) => void }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.root}
      contentContainerStyle={styles.content}
      accessibilityRole="tablist"
    >
      {TOOLS.map((t) => {
        const selected = t.id === value;
        return (
          <PressableScale
            key={t.id}
            style={[styles.item, selected && styles.itemSelected]}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flexGrow: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'space-around',
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.xs,
    gap: 2,
  },
  item: {
    minWidth: 50,
    paddingHorizontal: 6,
    minHeight: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  itemSelected: {
    backgroundColor: colors.surfaceMuted,
  },
  label: {
    ...typography.micro,
  },
  labelSelected: {
    color: colors.text,
    fontWeight: '600',
  },
});
