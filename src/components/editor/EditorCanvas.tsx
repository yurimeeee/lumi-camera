import { Ionicons } from '@expo/vector-icons';
import { Canvas, Group, rect, rrect, type SkTypeface } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo, useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { getFilter } from '@/constants/filters';
import { colors, radius, typography } from '@/constants/theme';
import { useReshapeField } from '@/hooks/useReshapeField';
import type { WorkingImage } from '@/hooks/useWorkingImage';
import { useZoom } from '@/hooks/useZoom';
import { DateStampLayer } from '@/render/DateStampLayer';
import { LumiLayer } from '@/render/LumiLayer';
import { buildUniforms, isIdentity, resolveProcessing } from '@/services/imageProcessing';
import { frameSize, frameToSource } from '@/services/reshape';
import { useEditorStore } from '@/stores/editorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { MAX_SPOTS, spotUniforms } from '@/services/blemish';
import { showToast } from '@/stores/toastStore';
import type { FaceGeometry, Geometry, SourceImage } from '@/types/editing';
import { formatDateStamp } from '@/utils/dateStamp';

interface Props {
  working: WorkingImage;
  source: SourceImage;
  /** Geometry baked into `working` (the crop tool shows the uncropped frame). */
  geometry: Geometry;
  boxWidth: number;
  boxHeight: number;
  showOriginal: boolean;
  onBeforeChange: (on: boolean) => void;
  typeface: SkTypeface | null;
  /** Landmarks of `working.image` for 눈 크게 / 얼굴 갸름. */
  face: FaceGeometry | null;
  /** 터치 보정 brush; null when the tool is off. */
  brush: Brush | null;
  /** Pinch / wheel zoom (off while cropping, where the overlay maps the unzoomed frame). */
  zoomEnabled: boolean;
}

export interface Brush {
  /** push = 밀기 (drag), spot = 잡티 제거 (tap). */
  mode: 'push' | 'spot';
  /** Radius as a fraction of the photo's short side. */
  radius: number;
  /** Share of the finger's travel the content follows (0…1). */
  strength: number;
}

export function fitContain(imgW: number, imgH: number, boxW: number, boxH: number) {
  const s = Math.min(boxW / imgW, boxH / imgH);
  return { width: Math.round(imgW * s), height: Math.round(imgH * s) };
}

/** Points closer than this (display px) to the previous one are skipped. */
const MIN_STEP = 1.5;
/** Finger path smoothing (0…1, lower = smoother); removes jitter that would ripple the push. */
const SMOOTHING = 0.35;

/**
 * Live preview. Subscribes only to colour/reshape state, so slider drags
 * re-render this canvas and nothing else. Long-press shows the original;
 * with the 터치 보정 brush active, dragging pushes the photo instead.
 */
export const EditorCanvas = memo(function EditorCanvas({
  working,
  source,
  geometry,
  boxWidth,
  boxHeight,
  showOriginal,
  onBeforeChange,
  typeface,
  face,
  brush,
  zoomEnabled,
}: Props) {
  const filterId = useEditorStore((s) => s.present.filterId);
  const intensity = useEditorStore((s) => s.present.intensity);
  const adjustments = useEditorStore((s) => s.present.adjustments);
  const retouch = useEditorStore((s) => s.present.retouch);
  const strokes = useEditorStore((s) => s.present.reshape);
  const spots = useEditorStore((s) => s.present.spots);
  const dateStamp = useEditorStore((s) => s.present.dateStamp);
  const takenAt = useEditorStore((s) => s.source?.takenAt ?? 0);
  const dateFormat = useSettingsStore((s) => s.dateFormat);

  const { width, height } = fitContain(working.width, working.height, boxWidth, boxHeight);
  const offsetX = (boxWidth - width) / 2;
  const offsetY = (boxHeight - height) / 2;
  const reshape = useReshapeField(strokes, geometry, source);

  const last = useRef<{ x: number; y: number } | null>(null);
  const smoothed = useRef<{ x: number; y: number } | null>(null);
  const cancelStroke = () => {
    if (!last.current) return;
    last.current = null;
    smoothed.current = null;
    useEditorStore.getState().cancelStroke();
  };
  const zoom = useZoom(width, height, offsetX, offsetY, zoomEnabled, cancelStroke);
  const photoTransform = useDerivedValue(() => [
    { translateX: offsetX + zoom.x.value },
    { translateY: offsetY + zoom.y.value },
    { scale: zoom.scale.value },
  ]);
  const photoClip = useMemo(() => rrect(rect(0, 0, width, height), radius.sm, radius.sm), [width, height]);

  const uniforms = useMemo(() => {
    const p = resolveProcessing({ filter: getFilter(filterId), intensity, adjustments, retouch });
    if (isIdentity(p) && !reshape && spots.length === 0) return null;
    return buildUniforms(p, width, height, face, spotUniforms(spots, geometry, source, width, height));
  }, [filterId, intensity, adjustments, retouch, width, height, face, reshape, spots, geometry, source]);

  // ── 터치 보정 ────────────────────────────────────────────
  const brushPx = brush ? brush.radius * Math.min(width, height) : 0;
  const brushRadius = brush?.radius ?? null;
  const cursorX = useSharedValue(0);
  const cursorY = useSharedValue(0);
  const cursorOpacity = useSharedValue(0);

  // Show the brush size in the middle of the photo whenever it changes.
  useEffect(() => {
    if (!brushRadius) return;
    cursorX.set(offsetX + width / 2);
    cursorY.set(offsetY + height / 2);
    cursorOpacity.set(withSequence(withTiming(1, { duration: 80 }), withDelay(500, withTiming(0, { duration: 200 }))));
  }, [brushRadius, cursorOpacity, cursorX, cursorY, height, offsetX, offsetY, width]);

  const toSource = (x: number, y: number) => {
    const p = zoom.toPhoto(x, y);
    const u = Math.min(1, Math.max(0, p.x / width));
    const v = Math.min(1, Math.max(0, p.y / height));
    return frameToSource({ x: u, y: v }, geometry);
  };

  /**
   * Brush radius → fraction of the source short side. 밀기 keeps its on-screen
   * size, so zooming in makes it finer on the photo; 잡티 size means the
   * blemish's size on the photo, so zooming only helps aim.
   */
  const frameShortOfSource = () => {
    const frame = frameSize(source.width, source.height, geometry);
    const perPhoto = Math.min(frame.width, frame.height) / Math.min(source.width, source.height);
    return brush?.mode === 'spot' ? perPhoto : perPhoto / zoom.scale.get();
  };

  const spotTap = (x: number, y: number) => {
    if (!brush) return;
    if (useEditorStore.getState().present.spots.length >= MAX_SPOTS) {
      showToast(`잡티는 한 사진에 ${MAX_SPOTS}개까지 지울 수 있어요`);
      return;
    }
    useEditorStore.getState().addSpot({ ...toSource(x, y), radius: brush.radius * frameShortOfSource() });
  };

  const strokeStart = (x: number, y: number) => {
    if (!brush) return;
    const radiusOfSource = brush.radius * frameShortOfSource();
    last.current = { x, y };
    smoothed.current = { x, y };
    useEditorStore.getState().beginStroke(toSource(x, y), radiusOfSource, brush.strength);
  };
  const strokeMove = (x: number, y: number) => {
    const prev = last.current;
    const s = smoothed.current;
    if (!prev || !s) return;
    s.x += (x - s.x) * SMOOTHING;
    s.y += (y - s.y) * SMOOTHING;
    if (Math.hypot(s.x - prev.x, s.y - prev.y) < MIN_STEP) return;
    last.current = { x: s.x, y: s.y };
    useEditorStore.getState().extendStroke(toSource(s.x, s.y));
  };
  const strokeEnd = () => {
    if (!last.current) return;
    last.current = null;
    smoothed.current = null;
    useEditorStore.getState().commit();
  };

  const push = Gesture.Pan()
    .minDistance(0)
    .maxPointers(1)
    .onBegin((e) => {
      cursorX.set(e.x);
      cursorY.set(e.y);
      cursorOpacity.set(withTiming(1, { duration: 80 }));
      scheduleOnRN(strokeStart, e.x, e.y);
    })
    .onUpdate((e) => {
      cursorX.set(e.x);
      cursorY.set(e.y);
      scheduleOnRN(strokeMove, e.x, e.y);
    })
    .onFinalize((_e, success) => {
      cursorOpacity.set(withTiming(0, { duration: 150 }));
      // A second finger (pinch) cancels the pan: drop the stroke instead of keeping it.
      scheduleOnRN(success ? strokeEnd : cancelStroke);
    });

  const tap = Gesture.Tap()
    .maxDistance(12)
    .onEnd((e) => {
      cursorX.set(e.x);
      cursorY.set(e.y);
      cursorOpacity.set(withSequence(withTiming(1, { duration: 60 }), withDelay(250, withTiming(0, { duration: 200 }))));
      scheduleOnRN(spotTap, e.x, e.y);
    });

  const hold = Gesture.LongPress()
    .minDuration(220)
    .onStart(() => scheduleOnRN(onBeforeChange, true))
    .onFinalize(() => scheduleOnRN(onBeforeChange, false));

  const gesture = brush
    ? Gesture.Simultaneous(zoom.pinch, brush.mode === 'spot' ? tap : push)
    : Gesture.Simultaneous(zoom.pinch, zoom.pan, Gesture.Exclusive(zoom.doubleTap, hold));

  // Web: trackpad pinch / ctrl(⌘)+wheel zooms at the pointer, plain wheel pans while zoomed.
  const boxRef = useRef<View>(null);
  const { zoomBy, panBy, zoomed } = zoom;
  useEffect(() => {
    const el = boxRef.current as unknown as HTMLElement | null;
    if (Platform.OS !== 'web' || !zoomEnabled || !el?.addEventListener) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey) && !zoomed) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) zoomBy(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
      else panBy(-e.deltaX, -e.deltaY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomEnabled, zoomed, zoomBy, panBy]);

  const spotMode = brush?.mode === 'spot';
  const cursorStyle = useAnimatedStyle(() => {
    // 잡티 circles follow the zoom (photo-sized); 밀기 stays screen-sized.
    const k = spotMode ? zoom.scale.value : 1;
    return {
      opacity: cursorOpacity.value,
      transform: [
        { translateX: cursorX.value - brushPx },
        { translateY: cursorY.value - brushPx },
        { scale: k },
      ],
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      <View
        ref={boxRef}
        style={[styles.box, { width: boxWidth, height: boxHeight }]}
        accessible
        accessibilityLabel={
          brush
            ? brush.mode === 'spot'
              ? '편집 중인 사진. 잡티를 눌러 지우기'
              : '편집 중인 사진. 드래그해 밀어서 다듬기'
            : '편집 중인 사진. 길게 눌러 원본 보기'
        }
      >
        <Canvas style={StyleSheet.absoluteFill}>
          <Group transform={photoTransform}>
            <Group clip={photoClip}>
              <LumiLayer
                image={working.image}
                width={width}
                height={height}
                uniforms={showOriginal ? null : uniforms}
                reshape={reshape}
              />
              {dateStamp && typeface && !showOriginal ? (
                <DateStampLayer
                  text={formatDateStamp(takenAt, dateFormat)}
                  typeface={typeface}
                  width={width}
                  height={height}
                />
              ) : null}
            </Group>
          </Group>
        </Canvas>
        {brush ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.cursor, { width: brushPx * 2, height: brushPx * 2, borderRadius: brushPx }, cursorStyle]}
          />
        ) : null}
        {zoomed ? (
          <Pressable
            style={[styles.fit, { left: offsetX + 8, bottom: offsetY + 8 }]}
            onPress={zoom.reset}
            accessibilityRole="button"
            accessibilityLabel="원래 크기로 보기"
          >
            <Ionicons name="contract-outline" size={14} color={colors.white} />
            <Text style={styles.fitText}>원래 크기</Text>
          </Pressable>
        ) : null}
      </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fit: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(36, 33, 30, 0.55)',
  },
  fitText: {
    ...typography.micro,
    color: colors.white,
    fontSize: 11,
  },
  cursor: {
    position: 'absolute',
    left: 0,
    top: 0,
    borderWidth: 1.5,
    borderColor: colors.white,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.25)',
  },
});
