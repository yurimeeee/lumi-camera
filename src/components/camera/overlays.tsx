import { memo, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';

import { colors } from '@/constants/theme';
import type { LivePreviewLayer } from '@/types/filters';

export interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Hairline rule-of-thirds grid. */
export const GridOverlay = memo(function GridOverlay({ frame }: { frame: Frame }) {
  const line = StyleSheet.hairlineWidth;
  return (
    <View pointerEvents="none" style={[styles.abs, frame]}>
      {[1, 2].map((i) => (
        <View key={`v${i}`} style={[styles.line, { left: (frame.width * i) / 3, top: 0, bottom: 0, width: line }]} />
      ))}
      {[1, 2].map((i) => (
        <View key={`h${i}`} style={[styles.line, { top: (frame.height * i) / 3, left: 0, right: 0, height: line }]} />
      ))}
    </View>
  );
});

/** Dims the parts of the sensor frame that the selected ratio will crop away. */
export const RatioMask = memo(function RatioMask({ frame, width, height }: { frame: Frame; width: number; height: number }) {
  if (frame.width >= width - 1 && frame.height >= height - 1) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.mask, { left: 0, right: 0, top: 0, height: frame.y }]} />
      <View style={[styles.mask, { left: 0, right: 0, top: frame.y + frame.height, bottom: 0 }]} />
      <View style={[styles.mask, { left: 0, width: frame.x, top: frame.y, height: frame.height }]} />
      <View style={[styles.mask, { left: frame.x + frame.width, right: 0, top: frame.y, height: frame.height }]} />
    </View>
  );
});

/**
 * Live look approximation over the native camera preview using compositing
 * blend modes. The captured photo is processed by the full Skia pipeline.
 */
export const LiveFilterOverlay = memo(function LiveFilterOverlay({ layers }: { layers: readonly LivePreviewLayer[] }) {
  if (!layers.length) return null;
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    >
      {layers.map((l, i) => (
        <View
          key={i}
          style={[StyleSheet.absoluteFill, { backgroundColor: l.color, opacity: l.opacity, mixBlendMode: l.blend }]}
        />
      ))}
    </Animated.View>
  );
});

/** Big countdown; tapping anywhere on it cancels the shot. */
export function Countdown({ value, onCancel }: { value: number; onCancel: () => void }) {
  return (
    <Pressable
      onPress={onCancel}
      style={[StyleSheet.absoluteFill, styles.center]}
      accessibilityRole="button"
      accessibilityLabel={`${value}초 후 촬영, 눌러서 취소`}
    >
      <Animated.Text key={value} entering={ZoomIn.duration(220)} exiting={FadeOut.duration(150)} style={styles.count}>
        {value}
      </Animated.Text>
      <Text style={styles.hint}>탭해서 취소</Text>
    </Pressable>
  );
}

/** Focus square at the tapped point; re-animates whenever `id` changes. */
export function FocusIndicator({ point }: { point: { x: number; y: number; id: number } | null }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0);
  useEffect(() => {
    if (!point) return;
    scale.set(1.35);
    scale.set(withTiming(1, { duration: 220 }));
    opacity.set(withSequence(withTiming(1, { duration: 80 }), withTiming(1, { duration: 1100 }), withTiming(0, { duration: 300 })));
  }, [point, scale, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  if (!point) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.focus, { left: point.x - FOCUS / 2, top: point.y - FOCUS / 2 }, style]}
    />
  );
}

const FOCUS = 68;

/** Brief white blink on capture; re-triggers whenever `id` changes. */
export function ShutterBlink({ id }: { id: number }) {
  const opacity = useSharedValue(0);
  useEffect(() => {
    if (id) opacity.set(withSequence(withTiming(1, { duration: 60 }), withTiming(0, { duration: 220 })));
  }, [id, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.blink, style]} />;
}

export function ProcessingBadge() {
  return (
    <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={styles.badge}>
      <Text style={styles.badgeText}>현상 중…</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  abs: {
    position: 'absolute',
  },
  line: {
    position: 'absolute',
    backgroundColor: colors.gridLine,
  },
  mask: {
    position: 'absolute',
    backgroundColor: 'rgba(20, 18, 16, 0.62)',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {
    fontSize: 96,
    fontWeight: '200',
    color: colors.white,
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowRadius: 12,
  },
  focus: {
    position: 'absolute',
    width: FOCUS,
    height: FOCUS,
    borderWidth: 1.5,
    borderColor: '#F6D98A',
    borderRadius: 4,
  },
  hint: {
    marginTop: 4,
    fontSize: 12,
    color: colors.whiteSoft,
    letterSpacing: 0.4,
  },
  blink: {
    backgroundColor: 'rgba(255,255,255,0.75)',
  },
  badge: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(20,18,16,0.5)',
  },
  badgeText: {
    fontSize: 12,
    color: colors.white,
    letterSpacing: 0.4,
  },
});
