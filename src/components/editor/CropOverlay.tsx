import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { colors } from '@/constants/theme';
import type { NormalizedRect } from '@/types/editing';

interface Props {
  /** Size of the displayed (uncropped) image. */
  width: number;
  height: number;
  /** Locked output aspect (w/h) or null for free. */
  aspect: number | null;
  crop: NormalizedRect | null;
  onCommit: (rect: NormalizedRect) => void;
}

const MIN = 48;
const HANDLE = 28;

type Mode = 0 | 1 | 2 | 3 | 4; // move, tl, tr, bl, br

/** Drag inside to move, drag a corner to resize. Ratio-locked when `aspect` is set. */
export function CropOverlay({ width, height, aspect, crop, onCommit }: Props) {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const w = useSharedValue(width);
  const h = useSharedValue(height);
  const start = useSharedValue({ x: 0, y: 0, w: 0, h: 0 });
  const mode = useSharedValue<Mode>(0);

  // The display is a uniform scale of the image, so pixel and display ratios match.
  const displayAspect = aspect;

  useEffect(() => {
    const r = crop ?? { x: 0, y: 0, width: 1, height: 1 };
    x.set(r.x * width);
    y.set(r.y * height);
    w.set(r.width * width);
    h.set(r.height * height);
  }, [crop, width, height, x, y, w, h]);

  const pan = Gesture.Pan()
    .minDistance(1)
    .onBegin((e) => {
      start.set({ x: x.value, y: y.value, w: w.value, h: h.value });
      const nearL = Math.abs(e.x - x.value) < HANDLE;
      const nearR = Math.abs(e.x - (x.value + w.value)) < HANDLE;
      const nearT = Math.abs(e.y - y.value) < HANDLE;
      const nearB = Math.abs(e.y - (y.value + h.value)) < HANDLE;
      mode.set(nearT && nearL ? 1 : nearT && nearR ? 2 : nearB && nearL ? 3 : nearB && nearR ? 4 : 0);
    })
    .onUpdate((e) => {
      const s = start.value;
      if (mode.value === 0) {
        x.set(Math.min(width - s.w, Math.max(0, s.x + e.translationX)));
        y.set(Math.min(height - s.h, Math.max(0, s.y + e.translationY)));
        return;
      }
      const left = mode.value === 1 || mode.value === 3;
      const top = mode.value === 1 || mode.value === 2;
      // Fixed (anchor) corner opposite the dragged one.
      const ax = left ? s.x + s.w : s.x;
      const ay = top ? s.y + s.h : s.y;
      const maxW = left ? ax : width - ax;
      const maxH = top ? ay : height - ay;
      let nw = Math.min(maxW, Math.max(MIN, s.w + (left ? -e.translationX : e.translationX)));
      let nh = Math.min(maxH, Math.max(MIN, s.h + (top ? -e.translationY : e.translationY)));
      if (displayAspect) {
        if (nw / nh > displayAspect) nw = nh * displayAspect;
        else nh = nw / displayAspect;
        if (nw > maxW) {
          nw = maxW;
          nh = nw / displayAspect;
        }
        if (nh > maxH) {
          nh = maxH;
          nw = nh * displayAspect;
        }
      }
      w.set(nw);
      h.set(nh);
      x.set(left ? ax - nw : ax);
      y.set(top ? ay - nh : ay);
    })
    .onEnd(() => {
      scheduleOnRN(onCommit, {
        x: x.value / width,
        y: y.value / height,
        width: w.value / width,
        height: h.value / height,
      });
    });

  const frameStyle = useAnimatedStyle(() => ({ left: x.value, top: y.value, width: w.value, height: h.value }));
  const topShade = useAnimatedStyle(() => ({ height: y.value }));
  const bottomShade = useAnimatedStyle(() => ({ top: y.value + h.value }));
  const leftShade = useAnimatedStyle(() => ({ top: y.value, height: h.value, width: x.value }));
  const rightShade = useAnimatedStyle(() => ({ top: y.value, height: h.value, left: x.value + w.value }));

  return (
    <GestureDetector gesture={pan}>
      <View style={[StyleSheet.absoluteFill]} accessibilityLabel="자르기 영역. 드래그해서 조절">
        <Animated.View style={[styles.shade, { left: 0, right: 0, top: 0 }, topShade]} />
        <Animated.View style={[styles.shade, { left: 0, right: 0, bottom: 0 }, bottomShade]} />
        <Animated.View style={[styles.shade, { left: 0 }, leftShade]} />
        <Animated.View style={[styles.shade, { right: 0 }, rightShade]} />
        <Animated.View style={[styles.frame, frameStyle]} pointerEvents="none">
          {[1, 2].map((i) => (
            <View key={`v${i}`} style={[styles.thirdV, { left: `${(i * 100) / 3}%` }]} />
          ))}
          {[1, 2].map((i) => (
            <View key={`h${i}`} style={[styles.thirdH, { top: `${(i * 100) / 3}%` }]} />
          ))}
          <View style={[styles.corner, styles.tl]} />
          <View style={[styles.corner, styles.tr]} />
          <View style={[styles.corner, styles.bl]} />
          <View style={[styles.corner, styles.br]} />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const C = 18;
const T = 3;

const styles = StyleSheet.create({
  shade: {
    position: 'absolute',
    backgroundColor: 'rgba(247, 244, 239, 0.72)',
  },
  frame: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: colors.white,
  },
  thirdV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  thirdH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  corner: {
    position: 'absolute',
    width: C,
    height: C,
    borderColor: colors.white,
  },
  tl: { left: -T, top: -T, borderLeftWidth: T, borderTopWidth: T },
  tr: { right: -T, top: -T, borderRightWidth: T, borderTopWidth: T },
  bl: { left: -T, bottom: -T, borderLeftWidth: T, borderBottomWidth: T },
  br: { right: -T, bottom: -T, borderRightWidth: T, borderBottomWidth: T },
});
