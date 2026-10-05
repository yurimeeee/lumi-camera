import { memo } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { colors, radius, spacing, typography } from '@/constants/theme';
import { feedback } from '@/services/feedback';

import { PressableScale } from './PressableScale';

interface Props<T extends string> {
  tabs: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  tone?: 'light' | 'dark';
}

function ChipTabsInner<T extends string>({ tabs, value, onChange, tone = 'light' }: Props<T>) {
  const dark = tone === 'dark';
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      accessibilityRole="tablist"
    >
      {tabs.map((t) => {
        const selected = t.id === value;
        return (
          <PressableScale
            key={t.id}
            activeScale={0.96}
            onPress={() => {
              if (!selected) {
                feedback.selection();
                onChange(t.id);
              }
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={[styles.chip, selected && (dark ? styles.chipSelectedDark : styles.chipSelected)]}
          >
            <Text
              style={[
                styles.label,
                dark && styles.labelDark,
                selected && (dark ? styles.labelSelectedDark : styles.labelSelected),
              ]}
            >
              {t.label}
            </Text>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

export const ChipTabs = memo(ChipTabsInner) as typeof ChipTabsInner;

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
    alignItems: 'center',
  },
  chip: {
    minHeight: 32,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    justifyContent: 'center',
  },
  chipSelected: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  chipSelectedDark: {
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  label: {
    ...typography.filterName,
    fontSize: 12,
  },
  labelDark: {
    color: colors.whiteMuted,
  },
  labelSelected: {
    color: colors.text,
    fontWeight: '600',
  },
  labelSelectedDark: {
    color: colors.ink,
    fontWeight: '600',
  },
});
