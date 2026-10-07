import { useEffect, useState } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  useAnimatedReaction,
  useSharedValue,
  withDecay,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

export const MAX_ZOOM = 6;
const DOUBLE_TAP_ZOOM = 2.5;

/**
 * Pinch-zoom state for a width×height photo placed at (ox, oy) inside the
 * gesture view. A photo point p is shown at (ox, oy) + p·scale + (x, y); the
 * photo always covers its own frame (no zooming out below 1×, no panning past
 * an edge). Gesture-view coordinates go in, photo coordinates come out.
 */
export interface Zoom {
  scale: SharedValue<number>;
  x: SharedValue<number>;
  y: SharedValue<number>;
  zoomed: boolean;
  /** Pinch (focal point follows the fingers, so two-finger drags pan too). */
  pinch: ReturnType<typeof Gesture.Pinch>;
  /** One-finger pan while zoomed in (for tools that don't draw on the photo). */
  pan: ReturnType<typeof Gesture.Pan>;
  /** Double tap: zoom in at the tap, or back to fit. */
  doubleTap: ReturnType<typeof Gesture.Tap>;
  /** Gesture-view point → photo point. */
  toPhoto: (x: number, y: number) => { x: number; y: number };
  /** Zooms by `factor` around a gesture-view point (wheel / trackpad on web). */
  zoomBy: (factor: number, fx: number, fy: number) => void;
  panBy: (dx: number, dy: number) => void;
  reset: () => void;
}

function clampOffset(t: number, size: number, scale: number) {
  'worklet';
  return Math.min(0, Math.max(size - size * scale, t));
}

/** Rubber band past an edge: follows the finger with growing resistance (iOS-style). */
function rubber(v: number, min: number, max: number, dim: number) {
  'worklet';
  const band = (over: number) => (1 - 1 / ((over * 0.55) / dim + 1)) * dim;
  if (v < min) return min - band(min - v);
  if (v > max) return max + band(v - max);
  return v;
}

/** Scale past 1× or MAX_ZOOM resists instead of stopping dead. */
function softScale(s: number) {
  'worklet';
  if (s < 1) return 1 - (1 - s) * 0.35;
  if (s > MAX_ZOOM) return MAX_ZOOM + (s - MAX_ZOOM) * 0.25;
  return s;
}

const SPRING = { damping: 24, stiffness: 240, mass: 0.7 };

export function useZoom(
  width: number,
  height: number,
  ox: number,
  oy: number,
  enabled: boolean,
  onPinchStart?: () => void,
): Zoom {
  const scale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const start = useSharedValue({ scale: 1, x: 0, y: 0, fx: 0, fy: 0 });
  /** Last pinch focal point (photo-view coords), to settle around it. */
  const focal = useSharedValue({ x: 0, y: 0 });
  const [zoomed, setZoomed] = useState(false);

  useAnimatedReaction(
    () => scale.value > 1.01,
    (now, before) => {
      if (now !== before) scheduleOnRN(setZoomed, now);
    },
  );

  // A new frame size (rotate/crop, layout) or a tool without zoom starts at fit.
  useEffect(() => {
    scale.set(1);
    x.set(0);
    y.set(0);
  }, [width, height, enabled, scale, x, y]);

  const apply = (s: number, tx: number, ty: number) => {
    'worklet';
    scale.set(s);
    x.set(clampOffset(tx, width, s));
    y.set(clampOffset(ty, height, s));
  };

  /** Follows the gesture, rubber-banding past the edges instead of clamping. */
  const follow = (s: number, tx: number, ty: number) => {
    'worklet';
    scale.set(s);
    x.set(rubber(tx, width - width * Math.max(1, s), 0, width));
    y.set(rubber(ty, height - height * Math.max(1, s), 0, height));
  };

  const animateTo = (s: number, tx: number, ty: number) => {
    'worklet';
    scale.set(withSpring(s, SPRING));
    x.set(withSpring(clampOffset(tx, width, s), SPRING));
    y.set(withSpring(clampOffset(ty, height, s), SPRING));
  };

  /** Springs back inside the limits, keeping the point under `focal` in place. */
  const settle = (fx: number, fy: number) => {
    'worklet';
    const s0 = scale.value;
    const s = Math.min(MAX_ZOOM, Math.max(1, s0));
    animateTo(s, fx - ((fx - x.value) / s0) * s, fy - ((fy - y.value) / s0) * s);
  };

  const pinch = Gesture.Pinch()
    .enabled(enabled)
    .onStart((e) => {
      start.set({ scale: scale.value, x: x.value, y: y.value, fx: e.focalX - ox, fy: e.focalY - oy });
      if (onPinchStart) scheduleOnRN(onPinchStart);
    })
    .onUpdate((e) => {
      const st = start.value;
      const s = softScale(st.scale * e.scale);
      // Keep the photo point that was under the fingers under the fingers.
      const px = (st.fx - st.x) / st.scale;
      const py = (st.fy - st.y) / st.scale;
      const fx = e.focalX - ox;
      const fy = e.focalY - oy;
      focal.set({ x: fx, y: fy });
      follow(s, fx - px * s, fy - py * s);
    })
    .onEnd(() => settle(focal.value.x, focal.value.y));

  const pan = Gesture.Pan()
    .enabled(enabled)
    .maxPointers(1)
    .minDistance(4)
    .onStart(() => {
      start.set({ scale: scale.value, x: x.value, y: y.value, fx: 0, fy: 0 });
    })
    .onUpdate((e) => {
      if (scale.value <= 1) return;
      const st = start.value;
      follow(scale.value, st.x + e.translationX, st.y + e.translationY);
    })
    .onEnd((e) => {
      if (scale.value <= 1) return;
      // Glide on with the finger's speed, bouncing softly off the edges.
      const s = scale.value;
      x.set(withDecay({ velocity: e.velocityX, clamp: [width - width * s, 0], rubberBandEffect: true }));
      y.set(withDecay({ velocity: e.velocityY, clamp: [height - height * s, 0], rubberBandEffect: true }));
    });

  const doubleTap = Gesture.Tap()
    .enabled(enabled)
    .numberOfTaps(2)
    .onEnd((e) => {
      if (scale.value > 1.01) {
        animateTo(1, 0, 0);
        return;
      }
      const s = DOUBLE_TAP_ZOOM;
      const fx = e.x - ox;
      const fy = e.y - oy;
      animateTo(s, fx - ((fx - x.value) / scale.value) * s, fy - ((fy - y.value) / scale.value) * s);
    });

  return {
    scale,
    x,
    y,
    zoomed,
    pinch,
    pan,
    doubleTap,
    toPhoto: (px, py) => ({ x: (px - ox - x.get()) / scale.get(), y: (py - oy - y.get()) / scale.get() }),
    zoomBy: (factor, gx, gy) => {
      const fx = gx - ox;
      const fy = gy - oy;
      const s0 = scale.get();
      const s = Math.min(MAX_ZOOM, Math.max(1, s0 * factor));
      apply(s, fx - ((fx - x.get()) / s0) * s, fy - ((fy - y.get()) / s0) * s);
    },
    panBy: (dx, dy) => apply(scale.get(), x.get() + dx, y.get() + dy),
    reset: () => animateTo(1, 0, 0),
  };
}
