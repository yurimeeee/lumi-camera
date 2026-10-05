import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing, typography } from '@/constants/theme';

import { IconButton } from './IconButton';

interface Props {
  title?: string;
  /** Replaces the title with custom content (e.g. a dropdown). */
  center?: ReactNode;
  right?: ReactNode;
  onBack?: () => void;
  backIcon?: 'chevron-back' | 'close';
  tone?: 'light' | 'dark';
}

export function Header({ title, center, right, onBack, backIcon = 'chevron-back', tone = 'light' }: Props) {
  const insets = useSafeAreaInsets();
  const color = tone === 'dark' ? colors.white : colors.text;
  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.xs }]}>
      <View style={styles.side}>
        <IconButton
          icon={backIcon}
          color={color}
          accessibilityLabel={backIcon === 'close' ? '닫기' : '뒤로'}
          onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
        />
      </View>
      <View style={styles.center}>
        {center ?? (
          <Text style={[styles.title, { color }]} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
        )}
      </View>
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xs,
  },
  side: {
    width: 88,
    flexDirection: 'row',
    alignItems: 'center',
  },
  right: {
    justifyContent: 'flex-end',
  },
  center: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    ...typography.title,
  },
});
