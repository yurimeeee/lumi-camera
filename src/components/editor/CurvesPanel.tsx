import { Ionicons } from '@expo/vector-icons';
import { Canvas, Circle, Line, Path, Rect, Skia, vec } from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { PressableScale } from '@/components/common/PressableScale';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { feedback } from '@/services/feedback';
import {
  CURVE_CHANNELS,
  CURVE_LABEL,
  curveSampler,
  insertCurvePoint,
  isLinearCurve,
  moveCurvePoint,
  removeCurvePoint,
  sanitizeCurve,
} from '@/services/color/curves';
import { useEditorStore } from '@/stores/editorStore';
import type { CurveChannel, CurvePoint } from '@/types/editing';

const SIZE = 156;
/** Touch radius for grabbing a point (px). */
const GRAB = 22;
/** Dragging an inner point this far outside the graph removes it. */
const REMOVE_DISTANCE = 30;

const CHANNEL_COLOR: Record<CurveChannel, string> = {
  rgb: colors.text,
  red: '#D9604C',
  green: '#5E9E5A',
  blue: '#4F7BC9',
};

function curvePath(points: readonly CurvePoint[]) {
  const f = curveSampler(points);
  const path = Skia.Path.Make();
  for (let i = 0; i <= 64; i++) {
    const x = i / 64;
    const px = x * SIZE;
    const py = (1 - f(x)) * SIZE;
    if (i === 0) path.moveTo(px, py);
    else path.lineTo(px, py);
  }
  return path;
}

/**
 * Tone curve editor. Tap the graph to add a point on the curve, drag points
 * to bend it, double tap (or drag out of the graph) to remove one. End points
 * slide vertically only. One undo step per gesture.
 */
export function CurvesPanel() {
  const curves = useEditorStore((s) => s.present.curves);
  const { setCurve, commit, resetCurve } = useEditorStore.getState();
  const [channel, setChannel] = useState<CurveChannel>('rgb');
  const points = useMemo(() => sanitizeCurve(curves[channel]), [curves, channel]);
  // Drag state lives in a shared value (gesture callbacks hand off to these JS handlers).
  const drag = useSharedValue<{ index: number; removing: boolean } | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);

  const nearest = (x: number, y: number, pts: readonly CurvePoint[]) => {
    let best = -1;
    let bestD = GRAB;
    pts.forEach((p, i) => {
      const d = Math.hypot(p.x * SIZE - x, (1 - p.y) * SIZE - y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  };

  const current = () => sanitizeCurve(useEditorStore.getState().present.curves[channel]);

  const dragStart = (x: number, y: number) => {
    let pts = current();
    let index = nearest(x, y, pts);
    if (index < 0) {
      const added = insertCurvePoint(pts, x / SIZE);
      if (!added) return;
      pts = added.points;
      index = added.index;
      setCurve(channel, pts);
    }
    drag.set({ index, removing: false });
  };

  const dragMove = (x: number, y: number) => {
    const d = drag.get();
    if (!d) return;
    const pts = current();
    const inner = d.index > 0 && d.index < pts.length - 1;
    const outside = Math.max(-x, x - SIZE, -y, y - SIZE);
    const removingNow = inner && outside > REMOVE_DISTANCE;
    if (removingNow !== d.removing) {
      drag.set({ ...d, removing: removingNow });
      setRemoving(removingNow ? d.index : null);
      if (removingNow) feedback.selection();
    }
    setCurve(channel, moveCurvePoint(pts, d.index, x / SIZE, 1 - y / SIZE));
  };

  const dragEnd = () => {
    const d = drag.get();
    drag.set(null);
    setRemoving(null);
    if (!d) return;
    if (d.removing) setCurve(channel, removeCurvePoint(current(), d.index));
    commit();
  };

  const removeAt = (x: number, y: number) => {
    const pts = current();
    const index = nearest(x, y, pts);
    if (index > 0 && index < pts.length - 1) {
      feedback.light();
      setCurve(channel, removeCurvePoint(pts, index));
      commit();
    }
  };

  const addAt = (x: number, y: number) => {
    const pts = current();
    if (nearest(x, y, pts) >= 0) return;
    const added = insertCurvePoint(pts, x / SIZE);
    if (!added) return;
    feedback.selection();
    setCurve(channel, added.points);
    commit();
  };

  const pan = Gesture.Pan()
    .minDistance(2)
    .onStart((e) => scheduleOnRN(dragStart, e.x, e.y))
    .onUpdate((e) => scheduleOnRN(dragMove, e.x, e.y))
    .onFinalize(() => scheduleOnRN(dragEnd));

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => scheduleOnRN(removeAt, e.x, e.y));

  const tap = Gesture.Tap().onEnd((e) => scheduleOnRN(addAt, e.x, e.y));

  const gesture = Gesture.Race(pan, Gesture.Exclusive(doubleTap, tap));

  const color = CHANNEL_COLOR[channel];
  const linear = isLinearCurve(curves[channel]);
  const others = CURVE_CHANNELS.filter((c) => c !== channel && !isLinearCurve(curves[c]));
  const activePath = useMemo(() => curvePath(points), [points]);
  const otherPaths = useMemo(() => others.map((c) => ({ c, path: curvePath(curves[c]) })), [others, curves]);

  return (
    <View style={styles.root}>
      <GestureDetector gesture={gesture}>
        <View style={styles.graph} accessibilityLabel={`${CURVE_LABEL[channel]} 톤 커브`}>
          <Canvas style={{ width: SIZE, height: SIZE }}>
            <Rect x={0} y={0} width={SIZE} height={SIZE} color={colors.background} />
            {[1, 2, 3].map((i) => (
              <Line key={`v${i}`} p1={vec((SIZE * i) / 4, 0)} p2={vec((SIZE * i) / 4, SIZE)} color={colors.border} strokeWidth={1} />
            ))}
            {[1, 2, 3].map((i) => (
              <Line key={`h${i}`} p1={vec(0, (SIZE * i) / 4)} p2={vec(SIZE, (SIZE * i) / 4)} color={colors.border} strokeWidth={1} />
            ))}
            <Line p1={vec(0, SIZE)} p2={vec(SIZE, 0)} color={colors.textTertiary} strokeWidth={0.75} opacity={0.6} />
            {otherPaths.map(({ c, path }) => (
              <Path key={c} path={path} style="stroke" strokeWidth={1} color={CHANNEL_COLOR[c]} opacity={0.35} />
            ))}
            <Path path={activePath} style="stroke" strokeWidth={2} color={color} />
            {points.map((p, i) => (
              <Circle
                key={i}
                cx={p.x * SIZE}
                cy={(1 - p.y) * SIZE}
                r={i === removing ? 4 : 5.5}
                color={i === removing ? colors.textTertiary : colors.white}
              />
            ))}
            {points.map((p, i) => (
              <Circle
                key={`o${i}`}
                cx={p.x * SIZE}
                cy={(1 - p.y) * SIZE}
                r={i === removing ? 4 : 5.5}
                style="stroke"
                strokeWidth={1.5}
                color={color}
                opacity={i === removing ? 0.4 : 1}
              />
            ))}
          </Canvas>
        </View>
      </GestureDetector>

      <View style={styles.side}>
        <View style={styles.channels} accessibilityRole="tablist">
          {CURVE_CHANNELS.map((c) => {
            const selected = c === channel;
            const changed = !isLinearCurve(curves[c]);
            return (
              <PressableScale
                key={c}
                onPress={() => {
                  feedback.selection();
                  setChannel(c);
                }}
                style={[styles.channel, selected && styles.channelSelected]}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={`${CURVE_LABEL[c]} 채널${changed ? ', 보정됨' : ''}`}
              >
                <View style={[styles.channelDot, { backgroundColor: CHANNEL_COLOR[c] }]} />
                <Text style={[styles.channelText, selected && styles.channelTextSelected]}>{CURVE_LABEL[c]}</Text>
                {changed ? <View style={styles.changed} /> : null}
              </PressableScale>
            );
          })}
        </View>
        <PressableScale
          onPress={() => resetCurve(channel)}
          disabled={linear}
          style={[styles.reset, linear && styles.dim]}
          accessibilityRole="button"
          accessibilityLabel={`${CURVE_LABEL[channel]} 커브 초기화`}
        >
          <Ionicons name="refresh" size={14} color={colors.textSecondary} />
          <Text style={styles.resetText}>{CURVE_LABEL[channel]} 초기화</Text>
        </PressableScale>
        <Text style={styles.hint}>탭해서 점 추가 · 드래그로 조절{'\n'}두 번 탭하거나 밖으로 끌면 삭제</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
    alignItems: 'center',
  },
  graph: {
    width: SIZE,
    height: SIZE,
    borderRadius: radius.sm,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  side: {
    flex: 1,
    gap: spacing.sm,
  },
  channels: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  channel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 32,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
  },
  channelSelected: {
    backgroundColor: colors.accentMuted,
  },
  channelDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  channelText: {
    ...typography.filterName,
  },
  channelTextSelected: {
    color: colors.text,
    fontWeight: '600',
  },
  changed: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  reset: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 32,
  },
  resetText: {
    ...typography.caption,
  },
  dim: {
    opacity: 0.35,
  },
  hint: {
    ...typography.caption,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textTertiary,
  },
});
