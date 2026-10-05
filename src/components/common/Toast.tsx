import { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { FadeInUp, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing, typography } from '@/constants/theme';
import { useToastStore } from '@/stores/toastStore';

const DURATION = 1800;

/** Minimal floating toast, mounted once in the root layout. */
export function Toast() {
  const message = useToastStore((s) => s.message);
  const key = useToastStore((s) => s.key);
  const hide = useToastStore((s) => s.hide);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(hide, DURATION);
    return () => clearTimeout(t);
  }, [message, key, hide]);

  if (!message) return null;

  return (
    <Animated.View
      key={key}
      entering={FadeInUp.duration(220)}
      exiting={FadeOutDown.duration(180)}
      style={[styles.toast, { bottom: insets.bottom + 120 }]}
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(36, 33, 30, 0.88)',
  },
  text: {
    ...typography.callout,
    color: colors.white,
    fontWeight: '500',
  },
});
