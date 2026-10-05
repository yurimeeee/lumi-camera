import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import type { IconName } from '@/components/common/IconButton';
import { colors, spacing, typography, WEB_SWITCH } from '@/constants/theme';

const SWITCH_ON = '#8FAE7F';

interface RowProps {
  icon: IconName;
  label: string;
  caption?: string;
  value?: string;
  onPress?: () => void;
  right?: ReactNode;
  last?: boolean;
}

/** iOS Settings-style row: icon · label (+caption) · value/accessory. */
export function SettingRow({ icon, label, caption, value, onPress, right, last }: RowProps) {
  const content = (
    <View style={[styles.row, !last && styles.divider]}>
      <Ionicons name={icon} size={19} color={colors.text} style={styles.icon} />
      <View style={styles.texts}>
        <Text style={styles.label}>{label}</Text>
        {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      </View>
      {right}
      {value !== undefined ? <Text style={styles.value}>{value}</Text> : null}
      {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {content}
    </Pressable>
  );
}

interface ToggleProps extends Omit<RowProps, 'right' | 'value' | 'onPress'> {
  enabled: boolean;
  onChange: (next: boolean) => void;
}

export function SettingToggle({ enabled, onChange, ...row }: ToggleProps) {
  return (
    <SettingRow
      {...row}
      right={
        <Switch
          value={enabled}
          onValueChange={onChange}
          trackColor={{ true: SWITCH_ON, false: colors.border }}
          thumbColor={colors.white}
          {...WEB_SWITCH}
          ios_backgroundColor={colors.border}
          accessibilityLabel={row.label}
        />
      }
    />
  );
}

export function SettingSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.xxl,
  },
  sectionTitle: {
    ...typography.caption,
    fontWeight: '500',
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingLeft: spacing.lg,
  },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: spacing.lg,
    gap: spacing.md,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  icon: {
    width: 22,
  },
  texts: {
    flex: 1,
    paddingVertical: spacing.md,
  },
  label: {
    ...typography.body,
  },
  caption: {
    ...typography.caption,
    marginTop: 2,
  },
  value: {
    ...typography.callout,
    color: colors.textSecondary,
  },
  pressed: {
    opacity: 0.6,
  },
});
