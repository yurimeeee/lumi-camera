import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { colors } from '@/constants/theme';

interface Props {
  onPress: () => void;
  disabled?: boolean;
  /** Countdown in progress — shows a stop state. */
  armed?: boolean;
}

const SIZE = 76;

export function ShutterButton({ onPress, disabled, armed }: Props) {
  const scale = useSharedValue(1);
  const inner = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => {
        scale.set(withTiming(0.88, { duration: 120 }));
      }}
      onPressOut={() => {
        scale.set(withSpring(1, { damping: 14, stiffness: 260 }));
      }}
      accessibilityRole="button"
      accessibilityLabel={armed ? '타이머 취소' : '사진 촬영'}
      accessibilityState={{ disabled }}
      style={[styles.ring, disabled && styles.disabled]}
      hitSlop={10}
    >
      <Animated.View style={[styles.inner, armed && styles.innerArmed, inner]}>
        {armed ? <View style={styles.stop} /> : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ring: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 3,
    borderColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    width: SIZE - 14,
    height: SIZE - 14,
    borderRadius: (SIZE - 14) / 2,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  innerArmed: {
    backgroundColor: colors.accentSoft,
  },
  stop: {
    width: 20,
    height: 20,
    borderRadius: 5,
    backgroundColor: colors.accent,
  },
  disabled: {
    opacity: 0.5,
  },
});
