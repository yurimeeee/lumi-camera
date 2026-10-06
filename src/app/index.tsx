import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Countdown,
  GridOverlay,
  LiveFilterOverlay,
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
import { FilterCarousel } from '@/components/filters/FilterCarousel';
import { FLASH_OPTIONS, labelOf, nextOf, RATIO_OPTIONS } from '@/constants/camera';
import { getFilter } from '@/constants/filters';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useAppDimensions } from '@/hooks/useAppDimensions';
import { useCapture } from '@/hooks/useCapture';
import { usePreviewImage } from '@/hooks/usePreviewImage';
import { feedback } from '@/services/feedback';
import { captureAspect } from '@/services/imagePipeline';
import { useCameraFilterId, useCameraStore, useCaptureRatio } from '@/stores/cameraStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { showToast } from '@/stores/toastStore';

const BOTTOM_MIN = 268;

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

export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useAppDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [focused, setFocused] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);

  const facing = useCameraStore((s) => s.facing);
  const flash = useCameraStore((s) => s.flash);
  const grid = useCameraStore((s) => s.grid);
  const filterTab = useCameraStore((s) => s.filterTab);
  const lastPhotoUri = useCameraStore((s) => s.lastPhotoUri);
  const mirrorFront = useSettingsStore((s) => s.mirrorFront);
  const ratio = useCaptureRatio();
  const filterId = useCameraFilterId();
  const filter = getFilter(filterId);
  const { setFilter, setFilterTab, setFlash, setRatio, toggleFacing } = useCameraStore.getState();

  const previewImage = usePreviewImage(lastPhotoUri);
  const { trigger, countdown, busy, blink } = useCapture({ cameraRef, ready, ratio, filterId });

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => {
        setFocused(false);
        setPanelOpen(false);
      };
    }, []),
  );

  const previewH = Math.min(Math.round((screenW * 4) / 3), screenH - BOTTOM_MIN - insets.bottom);
  const frame = useMemo(() => fitFrame(screenW, previewH, captureAspect(ratio)), [screenW, previewH, ratio]);
  const granted = permission?.granted ?? false;

  const onSelectFilter = useCallback((id: string) => setFilter(id), [setFilter]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <View style={[styles.preview, { height: previewH }]}>
        {granted ? (
          <>
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing={facing}
              flash={flash}
              mirror={facing === 'front' && mirrorFront}
              active={focused}
              animateShutter={false}
              onCameraReady={() => setReady(true)}
              onMountError={() => showToast('카메라를 시작하지 못했어요')}
            />
            <View pointerEvents="none" style={[styles.frameClip, frame]}>
              <LiveFilterOverlay key={filter.id} layers={filter.preview} />
            </View>
            <RatioMask frame={frame} width={screenW} height={previewH} />
            {grid ? <GridOverlay frame={frame} /> : null}
            {countdown > 0 ? <Countdown value={countdown} /> : null}
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
          <IconButton
            icon={panelOpen ? 'chevron-up' : 'chevron-down'}
            color={colors.white}
            accessibilityLabel={panelOpen ? '촬영 옵션 닫기' : '촬영 옵션 열기'}
            onPress={() => setPanelOpen((v) => !v)}
          />
          <PressableScale
            style={styles.ratioPill}
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

        {filter.id !== 'original' ? (
          <Animated.View
            key={filter.id}
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(150)}
            style={styles.filterTag}
            pointerEvents="none"
          >
            <Text style={styles.filterTagText}>{filter.name}</Text>
          </Animated.View>
        ) : null}
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.sm }]}>
        <FilterCarousel
          selectedId={filter.id}
          onSelect={onSelectFilter}
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
            onPress={() => {
              feedback.light();
              toggleFacing();
            }}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  preview: {
    width: '100%',
    backgroundColor: colors.ink,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    overflow: 'hidden',
  },
  frameClip: {
    position: 'absolute',
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
    paddingHorizontal: spacing.md,
  },
  ratioPill: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
  filterTag: {
    position: 'absolute',
    bottom: spacing.lg,
    left: spacing.lg,
  },
  filterTagText: {
    ...typography.overline,
    color: colors.whiteSoft,
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowRadius: 6,
  },
  bottom: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: spacing.md,
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
