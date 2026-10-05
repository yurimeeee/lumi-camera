import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, MIN_TOUCH, radius, typography } from '@/constants/theme';

import { PressableScale } from './PressableScale';

export type IconName = ComponentProps<typeof Ionicons>['name'];

interface Props {
  icon: IconName;
  onPress?: () => void;
  accessibilityLabel: string;
  size?: number;
  color?: string;
  /** `glass` = translucent dark disc for use over photos. */
  variant?: 'plain' | 'glass' | 'soft';
  label?: string;
  labelColor?: string;
  active?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  size = 22,
  color = colors.text,
  variant = 'plain',
  label,
  labelColor,
  active,
  disabled,
  style,
}: Props) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, selected: active }}
      hitSlop={6}
      style={[styles.base, disabled && styles.disabled, style]}
    >
      <View style={[styles.disc, variant === 'glass' && styles.glass, variant === 'soft' && styles.soft]}>
        <Ionicons name={icon} size={size} color={color} />
      </View>
      {label ? (
        <Text style={[styles.label, { color: labelColor ?? color }]} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    minWidth: MIN_TOUCH,
    minHeight: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disc: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glass: {
    backgroundColor: 'rgba(20, 18, 16, 0.32)',
  },
  soft: {
    backgroundColor: colors.surfaceMuted,
  },
  label: {
    ...typography.micro,
    marginTop: 2,
  },
  disabled: {
    opacity: 0.35,
  },
});
