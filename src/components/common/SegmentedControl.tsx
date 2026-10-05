import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { colors, motion, radius, typography } from '@/constants/theme';
import { feedback } from '@/services/feedback';

interface Option<T> {
  value: T;
  label: string;
}

interface Props<T> {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  tone?: 'light' | 'dark';
  accessibilityLabel: string;
}

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  tone = 'light',
  accessibilityLabel,
}: Props<T>) {
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const segment = options.length ? width / options.length : 0;

  const indicator = useAnimatedStyle(() => ({
    width: segment,
    transform: [{ translateX: withTiming(index * segment, { duration: motion.base }) }],
  }));

  const dark = tone === 'dark';

  return (
    <View
      style={[styles.root, dark && styles.rootDark]}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width - 6)}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
    >
      {width > 0 ? <Animated.View style={[styles.indicator, dark && styles.indicatorDark, indicator]} /> : null}
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            style={styles.item}
            onPress={() => {
              if (!selected) {
                feedback.selection();
                onChange(o.value);
              }
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
          >
            <Text
              style={[
                styles.label,
                dark && styles.labelDark,
                selected && (dark ? styles.labelSelectedDark : styles.labelSelected),
              ]}
              numberOfLines={1}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  rootDark: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  indicator: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  indicatorDark: {
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  item: {
    flex: 1,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  label: {
    ...typography.caption,
    fontWeight: '500',
  },
  labelDark: {
    color: colors.whiteSoft,
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
