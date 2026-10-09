import { Canvas, Picture } from '@shopify/react-native-skia';
import { memo, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import type { AssetBank } from '@/image-engine/frame/bank';
import { recordDocument } from '@/image-engine/frame/FrameExport';
import { printGeometry } from '@/image-engine/frame/FrameRenderer';
import { feedback } from '@/services/feedback';

import { hitTest, scaleLayer } from '../model/document';
import { useStudioStore } from '../stores/studioStore';
import type { PhotoLayer, StudioDocument, StudioLayer } from '../types/document';

interface Props {
  doc: StudioDocument;
  bank: AssetBank;
  boxWidth: number;
  boxHeight: number;
}

/** Fit of the document in the stage (points per canvas unit). */
export function canvasFit(doc: Pick<StudioDocument, 'width' | 'height'>, boxWidth: number, boxHeight: number) {
  const scale = Math.min(boxWidth / doc.width, boxHeight / doc.height);
  return { scale, width: doc.width * scale, height: doc.height * scale };
}

const snapAngle = (deg: number) => {
  const nearest = Math.round(deg / 90) * 90;
  return Math.abs(deg - nearest) < 2.5 ? nearest : deg;
};

/**
 * The studio canvas: the document recorded as one Skia picture (the same
 * drawing the export does, at screen scale) under a gesture layer.
 *
 * Tap selects the top layer under the finger (empty space clears). Drag
 * moves, pinch scales, two-finger twist rotates the selected layer. Double-tap
 * a photo to edit inside its window (crop mode): the same gestures then pan,
 * zoom and turn the photo instead of the print. Every gesture is one undo step.
 */
export const StudioCanvas = memo(function StudioCanvas({ doc, bank, boxWidth, boxHeight }: Props) {
  const selection = useStudioStore((s) => s.selection);
  const { scale, width, height } = canvasFit(doc, boxWidth, boxHeight);
  const picture = useMemo(() => recordDocument(doc, bank, scale, selection), [doc, bank, scale, selection]);

  // Gesture session: the layer as it was when the first finger went down.
  const session = useRef<{ id: string; start: StudioLayer; content: boolean; active: number; pan: { x: number; y: number }; pinch: number; turn: number } | null>(
    null,
  );

  const toCanvas = (x: number, y: number) => ({ x: x / scale, y: y / scale });

  const begin = (x: number, y: number) => {
    const st = useStudioStore.getState();
    const d = st.doc;
    if (!d) return;
    if (session.current) {
      session.current.active++;
      return;
    }
    const p = toCanvas(x, y);
    const sel = st.selection;
    let target = sel ? d.layers.find((l) => l.id === sel.id) ?? null : null;
    const content = sel?.mode === 'content' && target?.kind === 'photo';
    if (!content) {
      // Start on another layer → that layer; on the selected one (or empty space) → keep the selection.
      const hit = hitTest(d, p.x, p.y, 8 / scale);
      if (hit && hit.id !== target?.id) {
        target = hit;
        st.select({ id: hit.id, mode: 'layer' });
      }
    }
    if (!target || target.locked) return;
    session.current = { id: target.id, start: target, content: !!content, active: 1, pan: { x: 0, y: 0 }, pinch: 1, turn: 0 };
  };

  const update = () => {
    const s = session.current;
    if (!s) return;
    const { start } = s;
    useStudioStore.getState().live((d) => ({
      ...d,
      layers: d.layers.map((l) => {
        if (l.id !== s.id) return l;
        if (s.content && start.kind === 'photo') {
          const g = printGeometry(start);
          // Finger movement in the print's own (rotated) axes, as a share of the window.
          const a = (-start.rotation * Math.PI) / 180;
          const dx = s.pan.x * Math.cos(a) - s.pan.y * Math.sin(a);
          const dy = s.pan.x * Math.sin(a) + s.pan.y * Math.cos(a);
          const c = start.content;
          return {
            ...(l as PhotoLayer),
            content: {
              ...c,
              x: c.x + dx / g.windowBox.width,
              y: c.y + dy / g.windowBox.height,
              scale: Math.min(8, Math.max(1, c.scale * s.pinch)),
              rotation: snapAngle(c.rotation + s.turn),
            },
          };
        }
        const moved = { ...start, x: start.x + s.pan.x, y: start.y + s.pan.y, rotation: snapAngle(start.rotation + s.turn) };
        return s.pinch !== 1 ? scaleLayer(moved, s.pinch) : moved;
      }),
    }));
  };

  const end = () => {
    const s = session.current;
    if (!s) return;
    s.active--;
    if (s.active > 0) return;
    session.current = null;
    useStudioStore.getState().commit();
  };

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(4)
    .onStart((e) => begin(e.x - e.translationX, e.y - e.translationY))
    .onUpdate((e) => {
      if (!session.current) return;
      session.current.pan = { x: e.translationX / scale, y: e.translationY / scale };
      update();
    })
    .onEnd(end);

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onStart((e) => begin(e.focalX, e.focalY))
    .onUpdate((e) => {
      if (!session.current) return;
      session.current.pinch = e.scale;
      update();
    })
    .onEnd(end);

  const rotate = Gesture.Rotation()
    .runOnJS(true)
    .onStart((e) => begin(e.anchorX, e.anchorY))
    .onUpdate((e) => {
      if (!session.current) return;
      session.current.turn = (e.rotation * 180) / Math.PI;
      update();
    })
    .onEnd(end);

  const tap = Gesture.Tap()
    .runOnJS(true)
    .maxDistance(10)
    .onEnd((e) => {
      const st = useStudioStore.getState();
      if (!st.doc) return;
      const p = toCanvas(e.x, e.y);
      const hit = hitTest(st.doc, p.x, p.y, 8 / scale);
      if (st.selection?.mode === 'content' && hit?.id === st.selection.id) return;
      if ((hit?.id ?? null) !== (st.selection?.id ?? null)) feedback.selection();
      st.select(hit ? { id: hit.id, mode: 'layer' } : null);
    });

  const doubleTap = Gesture.Tap()
    .runOnJS(true)
    .numberOfTaps(2)
    .maxDistance(12)
    .onEnd((e) => {
      const st = useStudioStore.getState();
      if (!st.doc) return;
      const p = toCanvas(e.x, e.y);
      const hit = hitTest(st.doc, p.x, p.y, 8 / scale);
      if (hit?.kind !== 'photo' || !hit.photo) return;
      feedback.selection();
      const editing = st.selection?.id === hit.id && st.selection.mode === 'content';
      st.select({ id: hit.id, mode: editing ? 'layer' : 'content' });
    });

  const gesture = Gesture.Simultaneous(pan, pinch, rotate, Gesture.Exclusive(doubleTap, tap));

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ width, height }} accessibilityLabel="프레임 캔버스" testID="studio-canvas">
        <Canvas style={StyleSheet.absoluteFill}>
          <Picture picture={picture} />
        </Canvas>
      </View>
    </GestureDetector>
  );
});
