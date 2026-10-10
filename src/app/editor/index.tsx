import { useTypeface } from '@shopify/react-native-skia';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/common/IconButton';
import { PressableScale } from '@/components/common/PressableScale';
import { CropOverlay } from '@/components/editor/CropOverlay';
import { EditorCanvas, fitContain } from '@/components/editor/EditorCanvas';
import { DEFAULT_NAV, type EditorNav, type EditorTool } from '@/components/editor/editorNav';
import { EditorToolbar } from '@/components/editor/EditorToolbar';
import { EffectsPanel } from '@/components/editor/FilmPanel';
import { FramePanel } from '@/components/editor/FramePanel';
import { AdjustMenu, CropPanel, DEFAULT_BRUSH, FilterPanel, toBrush, TouchPanel } from '@/components/editor/panels';
import { DEFAULT_SELECTIVE_UI, maskToolOf, type SelectiveUi } from '@/components/editor/maskTool';
import { DEFAULT_REMOVAL_UI, tapSelection, type RemovalUi } from '@/components/editor/RemovalPanel';
import { RetouchPanel } from '@/components/editor/RetouchPanel';
import { useOpenStudioFromEditor } from '@/features/frame-studio/hooks/useOpenStudioFromEditor';
import { aspectRatioOf } from '@/constants/crop';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useFaces } from '@/hooks/useFaces';
import { anchorOf, assignFaceIds } from '@/services/faceDetection/faceIdentity';
import { focusRect, type FocusTarget } from '@/services/faceDetection/featureFocus';
import { needsFaces } from '@/services/faceWarp/faceRender';
import { sourceToFrame } from '@/services/frameCoords';
import { usePreviewImage } from '@/hooks/usePreviewImage';
import { useSaveEdit } from '@/hooks/useSaveEdit';
import { useRemovalBase } from '@/hooks/useRemovalBase';
import { useWorkingImage } from '@/hooks/useWorkingImage';
import { showToast } from '@/stores/toastStore';
import { DATE_STAMP_FONT } from '@/render/DateStampLayer';
import { readSmallPixels } from '@/render/readPixels';
import type { NormalizedPoint } from '@/types/editing';
import { lookOf, useCanRedo, useCanUndo, useEditorStore } from '@/stores/editorStore';
import { useLastLookStore } from '@/stores/lastLookStore';
import { confirmAction } from '@/utils/dialogs';

export default function EditorScreen() {
  const insets = useSafeAreaInsets();
  const source = useEditorStore((s) => s.source);
  const geometry = useEditorStore((s) => s.present.geometry);
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();
  const { undo, redo, resetAll, setCrop } = useEditorStore.getState();

  const [tool, setTool] = useState<EditorTool>('filter');
  // Sub-tab of each menu, remembered while the editor is open.
  const [nav, setNav] = useState<EditorNav>(DEFAULT_NAV);
  const navTo = useCallback(<K extends keyof EditorNav>(key: K) => (value: EditorNav[K]) => setNav((n) => ({ ...n, [key]: value })), []);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [before, setBefore] = useState(false);
  const [brush, setBrush] = useState(DEFAULT_BRUSH);
  const brushTool = useMemo(() => toBrush(brush), [brush]);
  const pastLength = useEditorStore((s) => s.past.length);
  const restored = useEditorStore((s) => s.restored);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const cropping = tool === 'crop';
  // While cropping, show the whole (rotated/flipped) frame with the crop as an overlay.
  const displayGeometry = useMemo(() => (cropping ? { ...geometry, crop: null } : geometry), [cropping, geometry]);
  const working = useWorkingImage(source, displayGeometry);
  const thumbImage = usePreviewImage(source?.uri);
  // Detect as soon as the retouch panel opens so the face tools respond right
  // away (and keep the result while face edits or skin smoothing need it,
  // e.g. after undo or a restore).
  const faceInUse = useEditorStore((s) => needsFaces(s.present));
  // 필터 › 추천 also needs to know whether there are people.
  const { faces: detected, status: faceStatus } = useFaces(source, faceInUse || tool === 'portrait' || (tool === 'filter' && nav.filter === 'recommend'));
  // Ids follow the faces the edit was made on (anchors), not detection order.
  const faceAnchors = useEditorStore((s) => s.present.faceAnchors);
  const faces = useMemo(
    () => (source ? assignFaceIds(detected, faceAnchors, source.width, source.height) : detected),
    [detected, faceAnchors, source],
  );
  const [pickedFaceId, setPickedFaceId] = useState<string | null>(null);
  // The largest face until the user picks another one.
  const selectedFace = faces.find((f) => f.id === pickedFaceId) ?? faces[0] ?? null;
  const selectedFaceId = selectedFace?.id ?? null;
  const selectedAnchor = useMemo(
    () => (selectedFace && source ? anchorOf(selectedFace, source.width, source.height) : null),
    [selectedFace, source],
  );
  // Which detector eye is on the left of the photo as shown (a flip swaps them).
  const leftEye: 'L' | 'R' =
    selectedFace &&
    sourceToFrame(selectedFace.landmarks.leftEye.center, geometry).x > sourceToFrame(selectedFace.landmarks.rightEye.center, geometry).x
      ? 'R'
      : 'L';
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  const [debugLandmarks, setDebugLandmarks] = useState(false);
  const [selective, setSelective] = useState<SelectiveUi>(DEFAULT_SELECTIVE_UI);
  const selectiveOpen = tool === 'adjust' && nav.adjust === 'selective';
  const selectedMaskKind = useEditorStore((s) => s.present.masks.find((m) => m.id === selective.maskId)?.shape.kind ?? null);
  const maskTool = selectiveOpen ? maskToolOf(selective, selectedMaskKind) : null;
  // 객체 제거: selection + pending result (shown before it becomes an edit).
  const [removal, setRemoval] = useState<RemovalUi>(DEFAULT_REMOVAL_UI);
  const removing = tool === 'touch' && brush.mode === 'remove';
  const removals = useEditorStore((s) => s.present.removals);
  const shownRemovals = useMemo(() => (removal.pending && removing ? [...removals, removal.pending] : removals), [removals, removal.pending, removing]);
  const baseImage = useRemovalBase(working?.image ?? null, shownRemovals, displayGeometry, source);
  const removalTool = useMemo(
    () =>
      removing && !removal.pending
        ? {
            mode: removal.mode,
            size: removal.size,
            selection: removal.selection,
            onSelection: (selection: RemovalUi['selection']) => setRemoval((r) => ({ ...r, selection })),
            onTap: (pt: NormalizedPoint) => {
              tapSelection(pt)
                .then((selection) => {
                  if (selection) setRemoval((r) => ({ ...r, selection }));
                  else showToast('물체를 찾지 못했어요. 브러시로 칠해 보세요');
                })
                .catch(() => showToast('물체를 찾지 못했어요'));
            },
          }
        : null,
    [removing, removal.mode, removal.size, removal.selection, removal.pending],
  );
  const typeface = useTypeface(DATE_STAMP_FONT);
  const { save, saving } = useSaveEdit(typeface);
  const studio = useOpenStudioFromEditor(typeface);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox({ width: Math.floor(width - spacing.lg * 2), height: Math.floor(height - spacing.md * 2) });
  };

  const leave = useCallback(() => {
    const done = () => {
      const { present, past, restored: wasRestored } = useEditorStore.getState();
      if (past.length > 0 || wasRestored) useLastLookStore.getState().set(lookOf(present));
      useEditorStore.getState().close();
      if (router.canGoBack()) router.back();
      else router.replace('/');
    };
    if ((canUndo || restored) && savedAt !== pastLength) {
      confirmAction({
        title: '편집을 그만할까요?',
        message: '저장하지 않은 편집 내용은 사라져요.',
        cancelText: '계속 편집',
        confirmText: '나가기',
        destructive: true,
        onConfirm: done,
      });
    } else {
      done();
    }
  }, [canUndo, restored, savedAt, pastLength]);

  const openBlemish = () => {
    setBrush((b) => ({ ...b, mode: 'spot' }));
    setTool('touch');
  };

  /** Colour-range masks: the colour under a tap (3×3 average of the photo as shown). */
  const pickMaskColor = useCallback(
    (pt: NormalizedPoint) => {
      const id = selective.maskId;
      if (!working || !id) return;
      const px = readSmallPixels(working.image, 512);
      if (!px) return;
      const f = sourceToFrame(pt, displayGeometry);
      const cx = Math.round(f.x * (px.width - 1));
      const cy = Math.round(f.y * (px.height - 1));
      const sum = [0, 0, 0];
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = Math.min(px.width - 1, Math.max(0, cx + dx));
          const y = Math.min(px.height - 1, Math.max(0, cy + dy));
          const i = (y * px.width + x) * 4;
          for (let c = 0; c < 3; c++) sum[c]! += px.data[i + c]!;
          n++;
        }
      }
      const color = [sum[0]! / n / 255, sum[1]! / n / 255, sum[2]! / n / 255] as const;
      useEditorStore.getState().editMask(id, (m) => (m.shape.kind === 'color' ? { ...m, shape: { ...m.shape, color, at: pt } } : m));
    },
    [selective.maskId, working, displayGeometry],
  );

  const onSave = async () => {
    if (await save()) setSavedAt(useEditorStore.getState().past.length);
  };

  if (!source) {
    return (
      <View style={[styles.root, styles.empty, { paddingTop: insets.top }]}>
        <Text style={styles.emptyText}>편집할 사진이 없어요</Text>
        <PressableScale style={styles.save} onPress={() => router.replace('/library')} accessibilityRole="button">
          <Text style={styles.saveText}>사진 고르기</Text>
        </PressableScale>
      </View>
    );
  }

  const fitted = working && box.width > 0 ? fitContain(working.width, working.height, box.width, box.height) : null;
  const focus =
    tool === 'portrait' && focusTarget && selectedFace && working
      ? focusRect(selectedFace, focusTarget, displayGeometry, working.width, working.height)
      : null;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <IconButton icon="chevron-back" accessibilityLabel="뒤로" onPress={leave} />
        <View style={styles.history}>
          <IconButton icon="arrow-undo-outline" size={20} accessibilityLabel="실행 취소" disabled={!canUndo} onPress={undo} />
          <IconButton icon="arrow-redo-outline" size={20} accessibilityLabel="다시 실행" disabled={!canRedo} onPress={redo} />
          <IconButton
            icon="refresh-circle-outline"
            size={21}
            accessibilityLabel="모든 편집 초기화"
            // A restored project has edits but no history yet.
            disabled={!canUndo && !restored}
            onPress={() =>
              confirmAction({ title: '모든 편집을 초기화할까요?', confirmText: '초기화', destructive: true, onConfirm: resetAll })
            }
          />
          <PressableScale
            style={[styles.compare, before && styles.compareOn, (!working || cropping) && styles.compareOff]}
            disabled={!working || cropping}
            onPressIn={() => setBefore(true)}
            onPressOut={() => setBefore(false)}
            accessibilityRole="button"
            accessibilityLabel="누르는 동안 원본 보기"
          >
            <Text style={[styles.compareText, before && styles.compareTextOn]}>{before ? 'Before' : 'After'}</Text>
          </PressableScale>
        </View>
        <PressableScale
          style={[styles.save, saving && styles.saveBusy]}
          onPress={onSave}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="사진에 저장"
        >
          {saving ? <ActivityIndicator size="small" color={colors.white} /> : <Text style={styles.saveText}>저장</Text>}
        </PressableScale>
      </View>

      <View style={styles.stage} onLayout={onLayout}>
        {working && box.width > 0 ? (
          <View>
            <EditorCanvas
              working={working}
              source={source}
              geometry={displayGeometry}
              boxWidth={box.width}
              boxHeight={box.height}
              showOriginal={before}
              onBeforeChange={setBefore}
              typeface={typeface}
              faces={faces}
              selectedFaceId={selectedFaceId}
              onSelectFace={setPickedFaceId}
              showFaceGuides={tool === 'portrait' && faces.length > 1}
              debugLandmarks={tool === 'portrait' && debugLandmarks}
              brush={tool === 'touch' ? brushTool : null}
              zoomEnabled={!cropping}
              focus={focus}
              autoFrame={tool === 'portrait'}
              showFrame={!cropping}
              maskTool={maskTool}
              onMaskTap={pickMaskColor}
              baseImage={baseImage}
              removalTool={removalTool}
            />
            {cropping && fitted ? (
              <View style={[styles.cropLayer, { width: fitted.width, height: fitted.height, left: (box.width - fitted.width) / 2, top: (box.height - fitted.height) / 2 }]}>
                <CropOverlay
                  width={fitted.width}
                  height={fitted.height}
                  aspect={aspectRatioOf(geometry.aspect)}
                  crop={geometry.crop}
                  onCommit={setCrop}
                />
              </View>
            ) : null}
          </View>
        ) : (
          <ActivityIndicator color={colors.textSecondary} />
        )}
      </View>

      <View style={[styles.panel, { paddingBottom: insets.bottom + spacing.xs }]}>
        <Animated.View key={tool} entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={styles.panelBody}>
          {tool === 'filter' ? (
            <FilterPanel
              thumbImage={thumbImage}
              faceStatus={faceStatus}
              faceCount={faces.length}
              view={nav.filter}
              onViewChange={navTo('filter')}
              tab={nav.filterTab}
              onTabChange={navTo('filterTab')}
            />
          ) : null}
          {tool === 'adjust' ? (
            <AdjustMenu
              view={nav.adjust}
              onViewChange={navTo('adjust')}
              image={working?.image ?? null}
              selective={selective}
              onSelectiveChange={setSelective}
            />
          ) : null}
          {tool === 'portrait' ? (
            <RetouchPanel
              faceStatus={faceStatus}
              faceCount={faces.length}
              selectedFaceId={selectedFaceId}
              selectedAnchor={selectedAnchor}
              leftEye={leftEye}
              debugLandmarks={debugLandmarks}
              onDebugLandmarks={setDebugLandmarks}
              onFocusChange={setFocusTarget}
              onOpenBlemish={openBlemish}
              category={nav.portrait}
              onCategoryChange={navTo('portrait')}
            />
          ) : null}
          {tool === 'touch' ? <TouchPanel brush={brush} onChange={setBrush} removal={removal} onRemovalChange={setRemoval} /> : null}
          {tool === 'effects' ? <EffectsPanel view={nav.effects} onViewChange={navTo('effects')} /> : null}
          {tool === 'frame' ? (
            <FramePanel view={nav.frame} onViewChange={navTo('frame')} onOpenStudio={studio.open} opening={studio.opening} />
          ) : null}
          {tool === 'crop' ? <CropPanel source={source} /> : null}
        </Animated.View>
        <EditorToolbar value={tool} onChange={setTool} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    height: 52,
  },
  history: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  save: {
    minWidth: 64,
    minHeight: 36,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  saveBusy: {
    opacity: 0.7,
  },
  saveText: {
    ...typography.headline,
    fontSize: 14,
    color: colors.white,
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cropLayer: {
    position: 'absolute',
  },
  compare: {
    minHeight: 30,
    minWidth: 54,
    marginLeft: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compareOn: {
    backgroundColor: colors.text,
  },
  compareOff: {
    opacity: 0.35,
  },
  compareText: {
    ...typography.micro,
    fontSize: 11,
    color: colors.text,
  },
  compareTextOn: {
    color: colors.white,
  },
  panel: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.md,
  },
  panelBody: {
    minHeight: 168,
    justifyContent: 'center',
    paddingBottom: spacing.sm,
  },
});
