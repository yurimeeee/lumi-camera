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
import { EditorToolbar, type EditorTool } from '@/components/editor/EditorToolbar';
import {
  AdjustPanel,
  CropPanel,
  DEFAULT_BRUSH,
  FilterPanel,
  toBrush,
  TouchPanel,
} from '@/components/editor/panels';
import { CurvesPanel } from '@/components/editor/CurvesPanel';
import { useOpenStudioFromEditor } from '@/features/frame-studio/hooks/useOpenStudioFromEditor';
import { FilmPanel } from '@/components/editor/FilmPanel';
import { HslPanel } from '@/components/editor/HslPanel';
import { RetouchPanel } from '@/components/editor/RetouchPanel';
import { aspectRatioOf } from '@/constants/crop';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useFaces } from '@/hooks/useFaces';
import { anchorOf, assignFaceIds } from '@/services/faceDetection/faceIdentity';
import { focusRect, type FocusTarget } from '@/services/faceDetection/featureFocus';
import { needsFaces } from '@/services/faceWarp/faceRender';
import { sourceToFrame } from '@/services/frameCoords';
import { usePreviewImage } from '@/hooks/usePreviewImage';
import { useSaveEdit } from '@/hooks/useSaveEdit';
import { useWorkingImage } from '@/hooks/useWorkingImage';
import { DATE_STAMP_FONT } from '@/render/DateStampLayer';
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
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [before, setBefore] = useState(false);
  const [brush, setBrush] = useState(DEFAULT_BRUSH);
  const brushTool = useMemo(() => toBrush(brush), [brush]);
  const pastLength = useEditorStore((s) => s.past.length);
  const restored = useEditorStore((s) => s.restored);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const cropping = tool === 'crop';
  // While cropping, show the whole (rotated/flipped) frame with the crop as an overlay.
  const displayGeometry = cropping ? { ...geometry, crop: null } : geometry;
  const working = useWorkingImage(source, displayGeometry);
  const thumbImage = usePreviewImage(source?.uri);
  // Detect as soon as the retouch panel opens so the face tools respond right
  // away (and keep the result while face edits or skin smoothing need it,
  // e.g. after undo or a restore).
  const faceInUse = useEditorStore((s) => needsFaces(s.present));
  const { faces: detected, status: faceStatus } = useFaces(source, faceInUse || tool === 'retouch');
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
    setTool('reshape');
  };

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
    tool === 'retouch' && focusTarget && selectedFace && working
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
          <IconButton
            icon="albums-outline"
            size={20}
            accessibilityLabel="프레임 스튜디오에서 꾸미기"
            disabled={studio.opening}
            onPress={studio.open}
          />
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
              showFaceGuides={tool === 'retouch' && faces.length > 1}
              debugLandmarks={tool === 'retouch' && debugLandmarks}
              brush={tool === 'reshape' ? brushTool : null}
              zoomEnabled={!cropping}
              focus={focus}
              autoFrame={tool === 'retouch'}
              showFrame={!cropping}
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

        {!cropping && working ? (
          <PressableScale
            style={styles.beforeBtn}
            onPressIn={() => setBefore(true)}
            onPressOut={() => setBefore(false)}
            accessibilityRole="button"
            accessibilityLabel="누르는 동안 원본 보기"
          >
            <Text style={styles.beforeText}>{before ? 'Before' : 'After'}</Text>
          </PressableScale>
        ) : null}
      </View>

      <View style={[styles.panel, { paddingBottom: insets.bottom + spacing.xs }]}>
        <Animated.View key={tool} entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={styles.panelBody}>
          {tool === 'filter' ? <FilterPanel thumbImage={thumbImage} /> : null}
          {tool === 'adjust' ? <AdjustPanel /> : null}
          {tool === 'hsl' ? <HslPanel /> : null}
          {tool === 'curves' ? <CurvesPanel /> : null}
          {tool === 'retouch' ? (
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
            />
          ) : null}
          {tool === 'reshape' ? <TouchPanel brush={brush} onChange={setBrush} /> : null}
          {tool === 'crop' ? <CropPanel source={source} /> : null}
          {tool === 'film' ? <FilmPanel /> : null}
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
  beforeBtn: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.lg + spacing.sm,
    minHeight: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(36, 33, 30, 0.42)',
    justifyContent: 'center',
  },
  beforeText: {
    ...typography.micro,
    color: colors.white,
    fontSize: 11,
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
