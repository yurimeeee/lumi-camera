import { Ionicons } from '@expo/vector-icons';
import { useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LIVE_CAMERA, LiveCamera, type LiveCameraHandle } from '@/components/camera/LiveCamera';
import {
  Countdown,
  FocusIndicator,
  GridOverlay,
  ProcessingBadge,
  RatioMask,
  ShutterBlink,
  type Frame,
} from '@/components/camera/overlays';
import { QuickControls } from '@/components/camera/QuickControls';
import { ShutterButton } from '@/components/camera/ShutterButton';
import { IconButton } from '@/components/common/IconButton';
import { PermissionView } from '@/components/common/PermissionView';
import { PressableScale } from '@/components/common/PressableScale';
import { SliderControl } from '@/components/common/SliderControl';
import { FilterCarousel } from '@/components/filters/FilterCarousel';
import { RecipeActionsSheet } from '@/components/recipes/RecipeActionsSheet';
import { FLASH_OPTIONS, labelOf, nextOf, RATIO_OPTIONS, TIMER_OPTIONS } from '@/constants/camera';
import { getFilter } from '@/constants/filters';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useAppDimensions } from '@/hooks/useAppDimensions';
import { useCameraLook } from '@/hooks/useCameraLook';
import { useCapture } from '@/hooks/useCapture';
import { usePreviewImage } from '@/hooks/usePreviewImage';
import { clearProject, loadProject, pruneStoredOriginals, restoreProject, type EditProject } from '@/services/editProject';
import { feedback } from '@/services/feedback';
import { isIdentity } from '@/services/imageProcessing';
import { captureAspect } from '@/services/imagePipeline';
import { useCameraStore, useCaptureRatio } from '@/stores/cameraStore';
import { getRecipe, parseRecipeLookId } from '@/stores/recipeStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { showToast } from '@/stores/toastStore';
import { confirmAction } from '@/utils/dialogs';

const BOTTOM_MIN = 268;
/** Exposure control hides after this long without interaction. */
const EXPOSURE_IDLE_MS = 3500;

function fitFrame(boxW: number, boxH: number, aspect: number | null): Frame {
  if (!aspect) return { x: 0, y: 0, width: boxW, height: boxH };
  let width = boxW;
  let height = boxW / aspect;
  if (height > boxH) {
    height = boxH;
    width = boxH * aspect;
  }
  return { x: (boxW - width) / 2, y: (boxH - height) / 2, width, height };
}

const filterName = (id: string) => getFilter(id).name;

export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useAppDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<LiveCameraHandle>(null);
  const [ready, setReady] = useState(false);
  const [focused, setFocused] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [intensityOpen, setIntensityOpen] = useState(false);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number; id: number } | null>(null);
  const [exposureOpen, setExposureOpen] = useState(false);
  const exposureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [managing, setManaging] = useState<string | null>(null);
  const [project, setProject] = useState<EditProject | null>(null);

  const facing = useCameraStore((s) => s.facing);
  const flash = useCameraStore((s) => s.flash);
  const timer = useCameraStore((s) => s.timer);
  const grid = useCameraStore((s) => s.grid);
  const filterTab = useCameraStore((s) => s.filterTab);
  const lastPhotoUri = useCameraStore((s) => s.lastPhotoUri);
  const exposure = useCameraStore((s) => s.exposureBias);
  const mirrorFront = useSettingsStore((s) => s.mirrorFront);
  const ratio = useCaptureRatio();
  const look = useCameraLook(filterName);
  const { setFilter, setRecipe, setIntensity, setFilterTab, setFlash, setTimer, setGrid, setRatio, toggleFacing, setExposureBias } =
    useCameraStore.getState();

  const previewImage = usePreviewImage(lastPhotoUri);
  const { trigger, cancel, countdown, busy, blink } = useCapture({ cameraRef, ready, ratio, look });

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      // An edit left unfinished (app closed or killed) can be picked up again.
      let alive = true;
      loadProject()
        .then((p) => alive && setProject(p))
        .catch(() => undefined);
      return () => {
        alive = false;
        setFocused(false);
        setPanelOpen(false);
      };
    }, []),
  );

  // Housekeeping once per launch: drop app-owned originals nothing refers to.
  useEffect(() => {
    void pruneStoredOriginals([useCameraStore.getState().lastPhotoUri]);
  }, []);

  useEffect(
    () => () => {
      if (exposureTimer.current) clearTimeout(exposureTimer.current);
    },
    [],
  );

  const previewH = Math.min(Math.round((screenW * 4) / 3), screenH - BOTTOM_MIN - insets.bottom);
  const frame = useMemo(() => fitFrame(screenW, previewH, captureAspect(ratio)), [screenW, previewH, ratio]);
  const granted = permission?.granted ?? false;

  const onSelectLook = useCallback(
    (id: string) => {
      const rid = parseRecipeLookId(id);
      if (rid && getRecipe(rid)) setRecipe(rid);
      else setFilter(id);
      if (id === 'original') setIntensityOpen(false);
    },
    [setFilter, setRecipe],
  );

  const keepExposureOpen = useCallback(() => {
    if (exposureTimer.current) clearTimeout(exposureTimer.current);
    exposureTimer.current = setTimeout(() => setExposureOpen(false), EXPOSURE_IDLE_MS);
  }, []);

  const onPreviewTap = (e: GestureResponderEvent) => {
    if (!LIVE_CAMERA.focus || !ready || countdown > 0) return;
    const { locationX: x, locationY: y } = e.nativeEvent;
    setFocusPoint({ x, y, id: Date.now() });
    feedback.selection();
    cameraRef.current?.focusAt(x, y).catch(() => undefined);
    if (LIVE_CAMERA.exposure) {
      setExposureOpen(true);
      keepExposureOpen();
    }
  };

  const flip = () => {
    feedback.light();
    setExposureBias(0);
    setFocusPoint(null);
    toggleFacing();
  };

  const resume = () => {
    if (!project) return;
    restoreProject(project);
    setProject(null);
    router.push('/editor');
  };

  const discardProject = () =>
    confirmAction({
      title: '편집하던 사진을 지울까요?',
      message: '저장하지 않은 편집 내용이 사라져요. 원본 사진은 그대로예요.',
      confirmText: '지우기',
      destructive: true,
      onConfirm: () => {
        setProject(null);
        void clearProject().then(() => pruneStoredOriginals([useCameraStore.getState().lastPhotoUri]));
      },
    });

  const lookLabel = look.name ? `${look.name}${look.intensity !== 100 ? ` ${look.intensity}` : ''}` : null;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <View style={[styles.preview, { height: previewH }]}>
        {granted ? (
          <>
            <LiveCamera
              ref={cameraRef}
              facing={facing}
              flash={flash}
              mirror={mirrorFront}
              active={focused}
              look={isIdentity(look.processing) ? null : look.processing}
              filterId={look.color.filterId}
              exposure={exposure}
              onReady={() => setReady(true)}
              onError={(m) => showToast(m)}
            />
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={onPreviewTap}
              disabled={!LIVE_CAMERA.focus}
              accessibilityLabel="탭해서 초점 맞추기"
            />
            <RatioMask frame={frame} width={screenW} height={previewH} />
            {grid ? <GridOverlay frame={frame} /> : null}
            <FocusIndicator point={focusPoint} />
            {countdown > 0 ? <Countdown value={countdown} onCancel={cancel} /> : null}
            <ShutterBlink id={blink} />
            {busy ? <ProcessingBadge /> : null}
          </>
        ) : permission ? (
          <PermissionView
            tone="dark"
            icon="camera-outline"
            title="카메라 접근이 필요해요"
            message={'Lumi로 사진을 찍으려면 카메라 권한이 필요해요.\n권한 없이도 앨범 사진은 편집할 수 있어요.'}
            canAskAgain={permission.canAskAgain}
            onRequest={() => void requestPermission()}
            secondaryLabel="앨범에서 편집하기"
            onSecondary={() => router.push('/library')}
          />
        ) : (
          <ActivityIndicator style={StyleSheet.absoluteFill} color={colors.whiteMuted} />
        )}

        <View style={[styles.topBar, { paddingTop: insets.top + spacing.xs }]}>
          <IconButton
            icon={FLASH_OPTIONS.find((o) => o.value === flash)!.icon}
            color={colors.white}
            accessibilityLabel={`플래시 ${labelOf(FLASH_OPTIONS, flash)}`}
            onPress={() => {
              feedback.selection();
              setFlash(nextOf(FLASH_OPTIONS, flash));
            }}
          />
          <PressableScale
            style={styles.textButton}
            onPress={() => {
              feedback.selection();
              setTimer(nextOf(TIMER_OPTIONS, timer));
            }}
            accessibilityRole="button"
            accessibilityLabel={`타이머 ${timer ? `${timer}초` : '끔'}`}
          >
            <Ionicons name="timer-outline" size={20} color={timer ? colors.accentSoft : colors.white} />
            {timer ? <Text style={styles.textButtonValue}>{timer}s</Text> : null}
          </PressableScale>
          <IconButton
            icon={grid ? 'grid' : 'grid-outline'}
            color={grid ? colors.white : colors.whiteMuted}
            size={20}
            accessibilityLabel={`격자 ${grid ? '켜짐' : '꺼짐'}`}
            onPress={() => {
              feedback.selection();
              setGrid(!grid);
            }}
          />
          <PressableScale
            style={styles.textButton}
            onPress={() => {
              feedback.selection();
              setRatio(nextOf(RATIO_OPTIONS, ratio));
            }}
            accessibilityRole="button"
            accessibilityLabel={`촬영 비율 ${labelOf(RATIO_OPTIONS, ratio)}`}
          >
            <Text style={styles.ratioText}>{labelOf(RATIO_OPTIONS, ratio)}</Text>
          </PressableScale>
          <IconButton
            icon={panelOpen ? 'chevron-up' : 'chevron-down'}
            color={colors.white}
            accessibilityLabel={panelOpen ? '촬영 옵션 닫기' : '촬영 옵션 더 보기'}
            onPress={() => setPanelOpen((v) => !v)}
          />
          <IconButton
            icon="settings-outline"
            color={colors.white}
            accessibilityLabel="설정"
            onPress={() => router.push('/settings')}
          />
        </View>

        {panelOpen ? (
          <View style={[styles.panelWrap, { top: insets.top + 56 }]}>
            <QuickControls />
          </View>
        ) : null}

        <View style={styles.previewBottom} pointerEvents="box-none">
          {exposureOpen && !intensityOpen ? (
            <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(200)} style={styles.bar}>
              <Ionicons name="sunny-outline" size={16} color={colors.white} />
              <View style={styles.flex}>
                <SliderControl
                  value={Math.round(exposure * 100)}
                  min={-100}
                  max={100}
                  onChange={(v) => {
                    setExposureBias(v / 100);
                    keepExposureOpen();
                  }}
                  resetValue={0}
                  tone="dark"
                  showValue={false}
                  accessibilityLabel="노출 보정"
                />
              </View>
            </Animated.View>
          ) : null}
          {intensityOpen && look.name ? (
            <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(150)} style={styles.bar}>
              <Text style={styles.barLabel} numberOfLines={1}>
                {look.name}
              </Text>
              <View style={styles.flex}>
                <SliderControl
                  value={look.intensity}
                  onChange={setIntensity}
                  resetValue={useSettingsStore.getState().defaultIntensity}
                  tone="dark"
                  accessibilityLabel="필터 강도"
                />
              </View>
            </Animated.View>
          ) : lookLabel ? (
            <Animated.View key={look.lookId} entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} pointerEvents="none">
              <Text style={styles.filterTagText}>{lookLabel}</Text>
              {!LIVE_CAMERA.frameFilter ? <Text style={styles.approx}>미리보기는 근사치 · 촬영본에 정확히 적용</Text> : null}
            </Animated.View>
          ) : null}
        </View>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.sm }]}>
        {project ? (
          <Animated.View entering={FadeIn.duration(200)} style={styles.resume}>
            <PressableScale style={styles.resumeMain} onPress={resume} accessibilityRole="button" accessibilityLabel="편집하던 사진 이어서 편집">
              <Ionicons name="time-outline" size={16} color={colors.text} />
              <Text style={styles.resumeText}>편집하던 사진이 있어요</Text>
              <Text style={styles.resumeAction}>이어서 편집</Text>
            </PressableScale>
            <IconButton icon="close" size={16} color={colors.textSecondary} accessibilityLabel="편집하던 사진 지우기" onPress={discardProject} />
          </Animated.View>
        ) : null}

        <FilterCarousel
          selectedId={look.lookId}
          onSelect={onSelectLook}
          onReselect={() => setIntensityOpen((v) => !v)}
          onRecipeLongPress={setManaging}
          image={previewImage}
          tab={filterTab}
          onTabChange={setFilterTab}
          thumbWidth={52}
          thumbHeight={64}
        />

        <View style={styles.modes}>
          <Text style={[styles.mode, styles.modeActive]}>PHOTO</Text>
          <PressableScale onPress={() => showToast('동영상은 곧 만나요')} accessibilityRole="button">
            <Text style={styles.mode}>VIDEO</Text>
          </PressableScale>
        </View>

        <View style={styles.controls}>
          <PressableScale
            style={styles.gallery}
            onPress={() => router.push('/library')}
            accessibilityRole="button"
            accessibilityLabel="앨범 열기"
          >
            {lastPhotoUri ? (
              <Image source={{ uri: lastPhotoUri }} style={styles.galleryImage} contentFit="cover" transition={150} />
            ) : (
              <Ionicons name="images-outline" size={22} color={colors.text} />
            )}
          </PressableScale>

          <ShutterButton onPress={trigger} disabled={!granted || busy || !ready} armed={countdown > 0} />

          <IconButton
            icon="camera-reverse-outline"
            variant="soft"
            accessibilityLabel="전면/후면 카메라 전환"
            disabled={!granted}
            onPress={flip}
          />
        </View>
      </View>

      <RecipeActionsSheet recipeId={managing} onClose={() => setManaging(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  preview: {
    width: '100%',
    backgroundColor: colors.ink,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    overflow: 'hidden',
  },
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
  },
  textButton: {
    minWidth: 44,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  textButtonValue: {
    ...typography.micro,
    color: colors.accentSoft,
    fontWeight: '600',
  },
  ratioText: {
    ...typography.caption,
    color: colors.white,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  panelWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  previewBottom: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    gap: spacing.sm,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(28, 26, 24, 0.55)',
  },
  barLabel: {
    ...typography.overline,
    color: colors.whiteSoft,
    maxWidth: 96,
  },
  filterTagText: {
    ...typography.overline,
    color: colors.whiteSoft,
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowRadius: 6,
  },
  approx: {
    ...typography.micro,
    color: colors.whiteMuted,
    marginTop: 2,
  },
  bottom: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: spacing.md,
  },
  resume: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xs,
    paddingLeft: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  resumeMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 40,
  },
  resumeText: {
    ...typography.caption,
    color: colors.text,
    flex: 1,
  },
  resumeAction: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: '600',
  },
  modes: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xxl,
  },
  mode: {
    ...typography.micro,
    fontSize: 12,
    letterSpacing: 1.2,
    color: colors.textTertiary,
    paddingVertical: spacing.xs,
  },
  modeActive: {
    color: colors.text,
    fontWeight: '700',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl,
  },
  gallery: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  galleryImage: {
    width: '100%',
    height: '100%',
  },
});
