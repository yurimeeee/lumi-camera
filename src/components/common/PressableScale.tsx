import { forwardRef } from 'react';
import { Pressable, type PressableProps, type StyleProp, type View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { motion } from '@/constants/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** Scale while pressed. */
  activeScale?: number;
}

/** Pressable with a quiet press-in scale, used for most tappable surfaces. */
export const PressableScale = forwardRef<View, PressableScaleProps>(function PressableScale(
  { activeScale = 0.94, style, onPressIn, onPressOut, children, ...rest },
  ref,
) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      ref={ref}
      {...rest}
      onPressIn={(e) => {
        scale.set(withTiming(activeScale, { duration: motion.fast }));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withTiming(1, { duration: motion.base }));
        onPressOut?.(e);
      }}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
});
