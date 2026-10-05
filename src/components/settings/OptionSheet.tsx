import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/common/BottomSheet';
import { colors, spacing, typography } from '@/constants/theme';
import { feedback } from '@/services/feedback';

interface Option<T> {
  value: T;
  label: string;
  caption?: string;
  /** Custom left content, e.g. a preview. */
  render?: ReactNode;
}

interface Props<T> {
  visible: boolean;
  title: string;
  options: readonly Option<T>[];
  value: T;
  onSelect: (value: T) => void;
  onClose: () => void;
  footer?: ReactNode;
}

/** Single-choice list in a bottom sheet, iOS-style check mark. */
export function OptionSheet<T extends string | number>({ visible, title, options, value, onSelect, onClose, footer }: Props<T>) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <ScrollView style={styles.list} bounces={false}>
        {options.map((o, i) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={String(o.value)}
              onPress={() => {
                feedback.selection();
                onSelect(o.value);
                onClose();
              }}
              style={({ pressed }) => [styles.row, i < options.length - 1 && styles.divider, pressed && styles.pressed]}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={o.label}
            >
              <View style={styles.texts}>
                {o.render ?? <Text style={[styles.label, selected && styles.labelSelected]}>{o.label}</Text>}
                {o.caption ? <Text style={styles.caption}>{o.caption}</Text> : null}
              </View>
              {selected ? <Ionicons name="checkmark-circle" size={22} color={colors.accent} /> : <View style={styles.dot} />}
            </Pressable>
          );
        })}
      </ScrollView>
      {footer}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: {
    maxHeight: 420,
  },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pressed: {
    opacity: 0.6,
  },
  texts: {
    flex: 1,
  },
  label: {
    ...typography.body,
  },
  labelSelected: {
    fontWeight: '600',
  },
  caption: {
    ...typography.caption,
    marginTop: 2,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
});
