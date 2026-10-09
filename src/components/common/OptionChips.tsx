import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '@/constants/theme';
import { feedback } from '@/services/feedback';

import { PressableScale } from './PressableScale';

interface Option<T> {
  value: T;
  label: string;
  /** Optional colour dot before the label. */
  swatch?: string;
}

interface Props<T> {
  options: readonly Option<T>[];
  /** null = nothing selected. */
  value: T | null;
  onChange: (value: T) => void;
  accessibilityLabel: string;
  tone?: 'light' | 'dark';
}

/** Small, horizontally scrolling single-choice chips (styles, positions, formats). */
export function OptionChips<T extends string | number>({ options, value, onChange, accessibilityLabel, tone = 'light' }: Props<T>) {
  const dark = tone === 'dark';
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <PressableScale
            key={String(o.value)}
            onPress={() => {
              if (selected) return;
              feedback.selection();
              onChange(o.value);
            }}
            style={[styles.chip, dark && styles.chipDark, selected && (dark ? styles.selectedDark : styles.selected)]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${accessibilityLabel} ${o.label}`}
          >
            {o.swatch ? <View style={[styles.swatch, { backgroundColor: o.swatch }]} /> : null}
            <Text style={[styles.label, dark && styles.labelDark, selected && (dark ? styles.labelSelectedDark : styles.labelSelected)]}>
              {o.label}
            </Text>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

/** A row of colour swatches. */
export function ColorSwatches({
  colors: list,
  value,
  onChange,
  accessibilityLabel,
}: {
  colors: readonly string[];
  value: string;
  onChange: (c: string) => void;
  accessibilityLabel: string;
}) {
  return (
    <View style={styles.swatches} accessibilityLabel={accessibilityLabel}>
      {list.map((c) => {
        const selected = c.toLowerCase() === value.toLowerCase();
        return (
          <PressableScale
            key={c}
            onPress={() => onChange(c)}
            style={[styles.swatchButton, selected && styles.swatchSelected]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${accessibilityLabel} ${c}`}
          >
            <View style={[styles.swatchBig, { backgroundColor: c }]} />
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  chipDark: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  selected: {
    backgroundColor: colors.text,
  },
  selectedDark: {
    backgroundColor: colors.white,
  },
  label: {
    ...typography.filterName,
    fontSize: 12,
  },
  labelDark: {
    color: colors.whiteSoft,
  },
  labelSelected: {
    color: colors.white,
    fontWeight: '600',
  },
  labelSelectedDark: {
    color: colors.ink,
    fontWeight: '600',
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.2)',
  },
  swatches: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    flexWrap: 'wrap',
  },
  swatchButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  swatchSelected: {
    borderColor: colors.accent,
  },
  swatchBig: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.25)',
  },
});
