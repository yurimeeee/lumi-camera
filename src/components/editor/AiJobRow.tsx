import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/common/PressableScale';
import { colors, radius, spacing, typography } from '@/constants/theme';
import type { AiJobStatus } from '@/hooks/useAiJob';

/** Progress (with 취소) or a failure (with 다시 시도) for an AI operation; nothing while idle. */
export function AiJobRow({
  status,
  error,
  runningText,
  onCancel,
  onRetry,
}: {
  status: AiJobStatus;
  error: string | null;
  runningText: string;
  onCancel: () => void;
  onRetry: () => void;
}) {
  if (status === 'idle') return null;
  const running = status === 'running';
  return (
    <View style={styles.row} accessibilityLiveRegion="polite">
      {running ? <ActivityIndicator size="small" color={colors.textSecondary} /> : <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />}
      <Text style={styles.text} numberOfLines={2}>
        {running ? runningText : error}
      </Text>
      <PressableScale
        style={styles.button}
        onPress={running ? onCancel : onRetry}
        accessibilityRole="button"
        accessibilityLabel={running ? '취소' : '다시 시도'}
      >
        <Text style={styles.buttonText}>{running ? '취소' : '다시 시도'}</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    minHeight: 40,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
  },
  text: {
    ...typography.caption,
    flex: 1,
  },
  button: {
    minHeight: 30,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    justifyContent: 'center',
  },
  buttonText: {
    ...typography.filterName,
    color: colors.text,
  },
});
