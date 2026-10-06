import { useEffect, useState } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  useAnimatedReaction,
  useSharedValue,
  withTiming,
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

  const animateTo = (s: number, tx: number, ty: number) => {
    'worklet';
    const config = { duration: 220 };
    scale.set(withTiming(s, config));
    x.set(withTiming(clampOffset(tx, width, s), config));
    y.set(withTiming(clampOffset(ty, height, s), config));
  };

  const pinch = Gesture.Pinch()
    .enabled(enabled)
    .onStart((e) => {
      start.set({ scale: scale.value, x: x.value, y: y.value, fx: e.focalX - ox, fy: e.focalY - oy });
      if (onPinchStart) scheduleOnRN(onPinchStart);
    })
    .onUpdate((e) => {
      const st = start.value;
      const s = Math.min(MAX_ZOOM, Math.max(1, st.scale * e.scale));
      // Keep the photo point that was under the fingers under the fingers.
      const px = (st.fx - st.x) / st.scale;
      const py = (st.fy - st.y) / st.scale;
      apply(s, e.focalX - ox - px * s, e.focalY - oy - py * s);
    });

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
      apply(scale.value, st.x + e.translationX, st.y + e.translationY);
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
