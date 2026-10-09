import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';

import { BottomSheet } from '@/components/common/BottomSheet';
import { OptionChips } from '@/components/common/OptionChips';
import { PressableScale } from '@/components/common/PressableScale';
import { colors, radius, spacing, typography } from '@/constants/theme';
import type { AssetBank } from '@/image-engine/frame/bank';
import { containBox } from '@/image-engine/frame/frameGeometry';
import { pointsBox, slotPath } from '@/image-engine/frame/FrameMask';
import { drawPrint } from '@/image-engine/frame/FrameRenderer';

import { renderThumbnail } from '../hooks/useStudioAssets';
import { updateFrame } from '../model/document';
import { useStudioStore } from '../stores/studioStore';
import type { CustomFrame, PhotoLayer, SlotMask, SlotShape, StudioDocument } from '../types/document';
import { PanelScroll, StudioSlider } from './controls';

const SHAPES: readonly { value: SlotShape; label: string }[] = [
  { value: 'rect', label: '사각형' },
  { value: 'rounded', label: '둥근 사각형' },
  { value: 'ellipse', label: '타원' },
  { value: 'freeform', label: '자유형' },
];

const PREVIEW_MAX = 220;
const MIN_SLOT = 0.06;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));


/**
 * Album frame editor: where the photo goes (rectangle, rounded, ellipse or a
 * hand-drawn outline) and how the frame image sits (size, position,
 * rotation, opacity — scaling + moving is the crop).
 */
export function CustomFrameSheet({ visible, onClose, bank }: { visible: boolean; onClose: () => void; bank: AssetBank | null }) {
  const layer = useStudioStore((s) => {
    const sel = s.selection?.id;
    const prints = (s.doc?.layers ?? []).filter((l): l is PhotoLayer => l.kind === 'photo' && l.frame.presetId === 'custom');
    return prints.find((p) => p.id === sel) ?? prints[0];
  });
  const custom = layer?.frame.custom ?? null;
  const box = layer ? containBox(layer.width / layer.height, { x: 0, y: 0, width: PREVIEW_MAX * 1.4, height: PREVIEW_MAX }) : null;
  const [dragging, setDragging] = useState(false);
  const [drawn, setDrawn] = useState<{ x: number; y: number }[] | null>(null);

  // Rendered print (same renderer as the canvas); held still while a drag runs
  // (the outline follows the finger), refreshed when it ends.
  const [frozen, setFrozen] = useState<string | null>(null);
  const live = useMemo(() => {
    if (!visible || !layer || !bank || !box) return null;
    const key = `custom:${JSON.stringify(layer.frame.custom)}:${layer.photo?.uri}:${JSON.stringify(layer.content)}:${layer.look.filterId}:${layer.width}x${layer.height}`;
    return renderThumbnail(key, box.width, box.height, (canvas, sc) => {
      const k = (box.width * sc) / layer.width;
      canvas.scale(k, k);
      drawPrint(canvas, { ...layer, rotation: 0 }, bank, { pixel: 1 / k });
    });
  }, [visible, layer, bank, box]);
  const preview = dragging ? frozen : live;

  const update = (patch: Partial<CustomFrame>, commit = false) => {
    if (!layer || !custom) return;
    const fn = (d: StudioDocument) => updateFrame(d, [layer.id], { custom: { ...custom, ...patch } });
    if (commit) useStudioStore.getState().apply(fn);
    else useStudioStore.getState().live(fn);
  };
  const setSlot = (slot: SlotMask, commit = false) => update({ slot }, commit);


  // Slot drag in progress (gesture callbacks only).
  const drag = useSharedValue<{ mode: 'move' | 'resize' | 'draw'; start: SlotMask } | null>(null);

  function beginDrag(x: number, y: number) {
    if (!custom || !box) return;
    const sl = custom.slot;
    const nx = x / box.width;
    const ny = y / box.height;
    setFrozen(live);
    setDragging(true);
    if (sl.shape === 'freeform') {
      drag.set({ mode: 'draw', start: sl });
      setDrawn([{ x: clamp01(nx), y: clamp01(ny) }]);
      return;
    }
    const nearCorner = Math.hypot((nx - (sl.x + sl.width)) * box.width, (ny - (sl.y + sl.height)) * box.height) < 28;
    drag.set({ mode: nearCorner ? 'resize' : 'move', start: sl });
  }

  function moveDrag(x: number, y: number, tx: number, ty: number) {
    const d = drag.get();
    if (!d || !box) return;
    if (d.mode === 'draw') {
      setDrawn((pts) => [...(pts ?? []), { x: clamp01(x / box.width), y: clamp01(y / box.height) }]);
      return;
    }
    const dx = tx / box.width;
    const dy = ty / box.height;
    const sl = d.start;
    if (d.mode === 'move') {
      setSlot({ ...sl, x: Math.min(1 - sl.width, Math.max(0, sl.x + dx)), y: Math.min(1 - sl.height, Math.max(0, sl.y + dy)) });
    } else {
      setSlot({ ...sl, width: Math.max(MIN_SLOT, Math.min(1 - sl.x, sl.width + dx)), height: Math.max(MIN_SLOT, Math.min(1 - sl.y, sl.height + dy)) });
    }
  }

  function endDrag() {
    const d = drag.get();
    drag.set(null);
    setDragging(false);
    if (!d || !custom) return;
    if (d.mode !== 'draw') {
      useStudioStore.getState().commit();
      return;
    }
    const pts = drawn;
    setDrawn(null);
    if (pts && pts.length >= 8) {
      // Thin the outline (keeps the document small); the path closes itself.
      const step = Math.max(1, Math.floor(pts.length / 80));
      const points = pts.filter((_, i) => i % step === 0);
      const b = pointsBox(points);
      if (b.width > MIN_SLOT && b.height > MIN_SLOT) setSlot({ ...custom.slot, ...b, shape: 'freeform', points }, true);
    }
  }

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(1)
    .onBegin((e) => beginDrag(e.x, e.y))
    .onUpdate((e) => moveDrag(e.x, e.y, e.translationX, e.translationY))
    .onFinalize(endDrag);

  const outline = useMemo(() => {
    if (!custom || !box) return null;
    if (drawn && drawn.length > 1) {
      return Skia.PathBuilder.Make()
        .addPoly(drawn.map((p) => Skia.Point(p.x * box.width, p.y * box.height)), false)
        .build();
    }
    return slotPath(custom.slot, box.width, box.height);
  }, [custom, box, drawn]);

  if (!layer || !custom || !box) {
    return (
      <BottomSheet visible={visible} onClose={onClose} title="앨범 프레임">
        <Text style={styles.note}>앨범 프레임을 쓰는 사진이 없어요.</Text>
      </BottomSheet>
    );
  }
  const t = custom.transform;
  const s = custom.slot;
  return (
    <BottomSheet visible={visible} onClose={onClose} title="앨범 프레임">
      <View style={styles.previewWrap}>
        <GestureDetector gesture={pan}>
          <View style={{ width: box.width, height: box.height }} accessibilityLabel="사진 영역 편집" testID="slot-editor">
            {preview ? <Image source={{ uri: preview }} style={StyleSheet.absoluteFill} contentFit="fill" transition={0} /> : null}
            <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
              {outline ? <Path path={outline} style="stroke" strokeWidth={2} color={colors.accent} /> : null}
            </Canvas>
            {s.shape !== 'freeform' ? (
              <View pointerEvents="none" style={[styles.handle, { left: (s.x + s.width) * box.width - 9, top: (s.y + s.height) * box.height - 9 }]} />
            ) : null}
          </View>
        </GestureDetector>
      </View>
      <Text style={styles.note}>
        {s.shape === 'freeform'
          ? '손가락으로 사진이 들어갈 영역을 그려요.'
          : custom.image.hasAlpha
            ? '투명한 부분을 찾아 사진 영역으로 잡았어요. 끌어서 옮기고 모서리 점으로 크기를 바꿔요.'
            : '끌어서 옮기고 오른쪽 아래 점으로 크기를 바꿔요.'}
      </Text>
      <View style={styles.controls}>
        <OptionChips options={SHAPES} value={s.shape} onChange={(shape) => setSlot({ ...s, shape, points: shape === 'freeform' ? s.points : undefined }, true)} accessibilityLabel="사진 영역 모양" />
        <PanelScroll>
          {s.shape === 'rounded' ? <StudioSlider label="모서리" value={s.radius} onChange={(radius) => setSlot({ ...s, radius })} /> : null}
          <StudioSlider label="프레임 크기" value={Math.round(t.scale * 100)} min={100} max={300} reset={100} onChange={(v) => update({ transform: { ...t, scale: v / 100 } })} />
          <StudioSlider label="가로 위치" value={Math.round(t.x * 200)} min={-100} max={100} onChange={(v) => update({ transform: { ...t, x: v / 200 } })} />
          <StudioSlider label="세로 위치" value={Math.round(t.y * 200)} min={-100} max={100} onChange={(v) => update({ transform: { ...t, y: v / 200 } })} />
          <StudioSlider label="회전" value={t.rotation} min={-45} max={45} onChange={(rotation) => update({ transform: { ...t, rotation } })} />
          <StudioSlider label="투명도" value={t.opacity} reset={100} onChange={(opacity) => update({ transform: { ...t, opacity } })} />
        </PanelScroll>
      </View>
      <PressableScale style={styles.done} onPress={onClose} accessibilityRole="button" accessibilityLabel="완료">
        <Text style={styles.doneText}>완료</Text>
      </PressableScale>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  previewWrap: { alignItems: 'center', marginBottom: spacing.sm },
  handle: { position: 'absolute', width: 18, height: 18, borderRadius: 9, backgroundColor: colors.white, borderWidth: 2, borderColor: colors.accent },
  note: { ...typography.caption, fontSize: 11, textAlign: 'center', marginBottom: spacing.sm },
  controls: { marginHorizontal: -spacing.xl, gap: spacing.sm },
  done: { marginTop: spacing.md, minHeight: 46, borderRadius: radius.pill, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  doneText: { ...typography.headline, color: colors.white },
});
