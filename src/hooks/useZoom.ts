import { useEffect, useRef, useState } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  cancelAnimation,
  useAnimatedReaction,
  useSharedValue,
  withDecay,
  withSpring,
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

/** Gesture-time clock (gesture callbacks run on the UI thread, not during render). */
function nowMs() {
  'worklet';
  return Date.now();
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
  const start = useSharedValue({ scale: 1, s0: 1, x: 0, y: 0, fx: 0, fy: 0 });
  /** Last pinch focal point (photo-view coords) and its velocity (px/s), to settle / glide. */
  const focal = useSharedValue({ x: 0, y: 0, t: 0, vx: 0, vy: 0 });
  /** Web wheel zoom glides toward this target instead of jumping per notch. */
  const wheel = useRef({ s: 1, x: 0, y: 0, at: 0 });
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

  /** Grabbing the photo stops any glide or spring where it is. */
  const grab = () => {
    'worklet';
    cancelAnimation(scale);
    cancelAnimation(x);
    cancelAnimation(y);
  };

  /** Glides on with the release speed, bouncing softly off the edges. */
  const glide = (vx: number, vy: number) => {
    'worklet';
    const s = scale.value;
    x.set(withDecay({ velocity: vx, clamp: [width - width * s, 0], rubberBandEffect: true }));
    y.set(withDecay({ velocity: vy, clamp: [height - height * s, 0], rubberBandEffect: true }));
  };

  /** After a pinch: spring back inside the limits around `focal`, or glide on if already inside. */
  const settle = (fx: number, fy: number, vx: number, vy: number) => {
    'worklet';
    const s0 = scale.value;
    const s = Math.min(MAX_ZOOM, Math.max(1, s0));
    const tx = fx - ((fx - x.value) / s0) * s;
    const ty = fy - ((fy - y.value) / s0) * s;
    const inside =
      s === s0 && clampOffset(x.value, width, s) === x.value && clampOffset(y.value, height, s) === y.value;
    if (inside && s > 1.01) glide(vx, vy);
    else animateTo(s, tx, ty);
  };

  const pinch = Gesture.Pinch()
    .enabled(enabled)
    .onBegin(() => grab())
    .onStart((e) => {
      grab();
      // Divide out the scale already reached at activation so nothing jumps.
      start.set({
        scale: scale.value / e.scale,
        s0: scale.value,
        x: x.value,
        y: y.value,
        fx: e.focalX - ox,
        fy: e.focalY - oy,
      });
      focal.set({ x: e.focalX - ox, y: e.focalY - oy, t: nowMs(), vx: 0, vy: 0 });
      if (onPinchStart) scheduleOnRN(onPinchStart);
    })
    .onUpdate((e) => {
      const st = start.value;
      const s = softScale(st.scale * e.scale);
      // Keep the photo point that was under the fingers under the fingers.
      const px = (st.fx - st.x) / st.s0;
      const py = (st.fy - st.y) / st.s0;
      const fx = e.focalX - ox;
      const fy = e.focalY - oy;
      const prev = focal.value;
      const now = nowMs();
      const dt = Math.max(1, now - prev.t) / 1000;
      // Smoothed focal velocity, for the glide after release.
      focal.set({
        x: fx,
        y: fy,
        t: now,
        vx: prev.vx * 0.3 + ((fx - prev.x) / dt) * 0.7,
        vy: prev.vy * 0.3 + ((fy - prev.y) / dt) * 0.7,
      });
      follow(s, fx - px * s, fy - py * s);
    })
    .onEnd(() => {
      const f = focal.value;
      // A pause before lifting the fingers means no glide.
      const fresh = nowMs() - f.t < 80;
      settle(f.x, f.y, fresh ? f.vx : 0, fresh ? f.vy : 0);
    });

  const pan = Gesture.Pan()
    .enabled(enabled)
    .maxPointers(1)
    .minDistance(4)
    .onBegin(() => grab())
    .onStart((e) => {
      grab();
      // Measure from where the finger already is at activation, so nothing jumps.
      start.set({ scale: scale.value, s0: scale.value, x: x.value - e.translationX, y: y.value - e.translationY, fx: 0, fy: 0 });
    })
    .onUpdate((e) => {
      if (scale.value <= 1) return;
      const st = start.value;
      follow(scale.value, st.x + e.translationX, st.y + e.translationY);
    })
    .onEnd((e) => {
      if (scale.value <= 1) return;
      glide(e.velocityX, e.velocityY);
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
      // Steps accumulate on a target the view glides toward; one mouse-wheel
      // notch is capped so it never jumps.
      const fx = gx - ox;
      const fy = gy - oy;
      const now = Date.now();
      const w = wheel.current;
      if (now - w.at > 250) {
        w.s = scale.get();
        w.x = x.get();
        w.y = y.get();
      }
      w.at = now;
      const s0 = w.s;
      const s = Math.min(MAX_ZOOM, Math.max(1, s0 * Math.min(1.18, Math.max(0.85, factor))));
      w.x = clampOffset(fx - ((fx - w.x) / s0) * s, width, s);
      w.y = clampOffset(fy - ((fy - w.y) / s0) * s, height, s);
      w.s = s;
      const config = { duration: 120 };
      scale.set(withTiming(s, config));
      x.set(withTiming(w.x, config));
      y.set(withTiming(w.y, config));
    },
    panBy: (dx, dy) => apply(scale.get(), x.get() + dx, y.get() + dy),
    reset: () => animateTo(1, 0, 0),
  };
}
