import { Ionicons } from '@expo/vector-icons';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '@/constants/theme';

import type { IconName } from './IconButton';
import { PressableScale } from './PressableScale';

interface Props {
  icon: IconName;
  title: string;
  message: string;
  /** When the OS won't show the prompt again, we route to Settings instead. */
  canAskAgain: boolean;
  onRequest: () => void;
  /** Overrides the primary button label (e.g. when no permission is involved). */
  actionLabel?: string;
  secondaryLabel?: string;
  onSecondary?: () => void;
  tone?: 'light' | 'dark';
}

/** Explains why a permission is needed and how to grant it. Never a dead end. */
export function PermissionView({
  icon,
  title,
  message,
  canAskAgain,
  onRequest,
  actionLabel,
  secondaryLabel,
  onSecondary,
  tone = 'light',
}: Props) {
  const dark = tone === 'dark';
  return (
    <View style={styles.root}>
      <View style={[styles.badge, dark && styles.badgeDark]}>
        <Ionicons name={icon} size={28} color={dark ? colors.white : colors.accent} />
      </View>
      <Text style={[styles.title, dark && styles.titleDark]}>{title}</Text>
      <Text style={[styles.message, dark && styles.messageDark]}>{message}</Text>
      {!canAskAgain ? (
        <Text style={[styles.hint, dark && styles.messageDark]}>설정 › Lumi에서 권한을 켤 수 있어요.</Text>
      ) : null}
      <PressableScale
        style={styles.primary}
        onPress={canAskAgain ? onRequest : () => void Linking.openSettings()}
        accessibilityRole="button"
      >
        <Text style={styles.primaryText}>{actionLabel ?? (canAskAgain ? '권한 허용하기' : '설정 열기')}</Text>
      </PressableScale>
      {secondaryLabel && onSecondary ? (
        <PressableScale style={styles.secondary} onPress={onSecondary} accessibilityRole="button">
          <Text style={[styles.secondaryText, dark && styles.messageDark]}>{secondaryLabel}</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxxl,
  },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  badgeDark: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  title: {
    ...typography.title,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  titleDark: {
    color: colors.white,
  },
  message: {
    ...typography.callout,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },
  messageDark: {
    color: colors.whiteMuted,
  },
  hint: {
    ...typography.caption,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  primary: {
    marginTop: spacing.xxl,
    minHeight: 48,
    paddingHorizontal: spacing.xxl,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    ...typography.headline,
    color: colors.white,
  },
  secondary: {
    marginTop: spacing.md,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  secondaryText: {
    ...typography.callout,
    color: colors.textSecondary,
  },
});
