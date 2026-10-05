import { useCallback, useEffect } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { colors, motion, typography } from '@/constants/theme';
import { feedback } from '@/services/feedback';

interface Props {
  value: number;
  min?: number;
  max?: number;
  /** Fired continuously while dragging (integer steps only). */
  onChange: (value: number) => void;
  /** Fired once when the gesture ends — commit to history here. */
  onComplete?: (value: number) => void;
  /** Double tap resets to this value. */
  resetValue?: number;
  tone?: 'light' | 'dark';
  showValue?: boolean;
  accessibilityLabel: string;
}

const THUMB = 22;

/**
 * Thin, quiet slider. Bipolar ranges (min < 0) fill from the centre, the way
 * photo apps show ± adjustments. Gesture math runs on the UI thread; React
 * only hears about integer changes.
 */
export function SliderControl({
  value,
  min = 0,
  max = 100,
  onChange,
  onComplete,
  resetValue,
  tone = 'light',
  showValue = true,
  accessibilityLabel,
}: Props) {
  const span = max - min;
  const width = useSharedValue(0);
  const progress = useSharedValue((value - min) / span);
  const dragging = useSharedValue(false);
  const lastSent = useSharedValue(value);
  const startProgress = useSharedValue(0);
  const bipolar = min < 0;
  const origin = bipolar ? (0 - min) / span : 0;

  // Follow external changes (undo, reset, filter switch) when not dragging.
  useEffect(() => {
    if (!dragging.value) {
      progress.set(withTiming((value - min) / span, { duration: motion.fast }));
      lastSent.set(value);
    }
  }, [value, min, span, progress, dragging, lastSent]);

  const emit = useCallback((v: number) => onChange(v), [onChange]);
  const complete = useCallback((v: number) => onComplete?.(v), [onComplete]);
  const tick = useCallback(() => feedback.selection(), []);

  const toValue = (p: number) => {
    'worklet';
    return Math.round(min + Math.min(1, Math.max(0, p)) * span);
  };

  const pan = Gesture.Pan()
    .minDistance(2)
    .onBegin(() => {
      dragging.set(true);
      startProgress.set(progress.value);
    })
    .onUpdate((e) => {
      if (width.value <= 0) return;
      const p = Math.min(1, Math.max(0, startProgress.value + e.translationX / width.value));
      progress.set(p);
      const v = toValue(p);
      if (v !== lastSent.value) {
        // Gentle detent when crossing the neutral point.
        if (bipolar && (v === 0 || Math.sign(v) !== Math.sign(lastSent.value))) scheduleOnRN(tick);
        lastSent.set(v);
        scheduleOnRN(emit, v);
      }
    })
    .onFinalize(() => {
      dragging.set(false);
      scheduleOnRN(complete, toValue(progress.value));
    });

  const reset = Gesture.Tap()
    .numberOfTaps(2)
    .maxDistance(8)
    .onEnd(() => {
      if (resetValue === undefined) return;
      progress.set(withTiming((resetValue - min) / span, { duration: motion.base }));
      lastSent.set(resetValue);
      scheduleOnRN(emit, resetValue);
      scheduleOnRN(complete, resetValue);
    });

  // Race: dragging starts immediately; a double tap (without movement) resets.
  const gesture = Gesture.Race(pan, reset);

  const fillStyle = useAnimatedStyle(() => {
    const from = Math.min(origin, progress.value);
    const to = Math.max(origin, progress.value);
    return { left: from * width.value, width: (to - from) * width.value };
  });
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * width.value - THUMB / 2 }, { scale: dragging.value ? 1.12 : 1 }],
  }));

  const onLayout = (e: LayoutChangeEvent) => {
    width.set(e.nativeEvent.layout.width);
  };

  const dark = tone === 'dark';
  const label = value > 0 && bipolar ? `+${value}` : `${value}`;

  return (
    <View style={styles.row}>
      <GestureDetector gesture={gesture}>
        <View
          style={styles.hit}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={accessibilityLabel}
          accessibilityValue={{ min, max, now: value }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => {
            const step = Math.max(1, Math.round(span / 20));
            const next = Math.min(max, Math.max(min, value + (e.nativeEvent.actionName === 'increment' ? step : -step)));
            onChange(next);
            onComplete?.(next);
          }}
        >
          <View style={styles.trackArea} onLayout={onLayout}>
            <View style={[styles.track, dark && styles.trackDark]} />
            {bipolar ? <View style={[styles.centerTick, { left: `${origin * 100}%` }, dark && styles.centerTickDark]} /> : null}
            <Animated.View style={[styles.fill, dark && styles.fillDark, fillStyle]} />
            <Animated.View style={[styles.thumb, thumbStyle]} />
          </View>
        </View>
      </GestureDetector>
      {showValue ? (
        <Text style={[styles.value, dark && styles.valueDark]} accessibilityElementsHidden>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  hit: {
    flex: 1,
    height: 44,
    justifyContent: 'center',
  },
  trackArea: {
    height: THUMB,
    justifyContent: 'center',
    marginHorizontal: THUMB / 2,
  },
  track: {
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.border,
  },
  trackDark: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  centerTick: {
    position: 'absolute',
    width: 2,
    height: 8,
    marginLeft: -1,
    borderRadius: 1,
    backgroundColor: colors.textTertiary,
  },
  centerTickDark: {
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  fill: {
    position: 'absolute',
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.accent,
  },
  fillDark: {
    backgroundColor: colors.white,
  },
  thumb: {
    position: 'absolute',
    left: 0,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  value: {
    ...typography.caption,
    width: 36,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  valueDark: {
    color: colors.whiteSoft,
  },
});
