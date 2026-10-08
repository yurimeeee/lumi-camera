import { CameraView } from 'expo-camera';
import { useImperativeHandle, useRef, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';

import { getFilter } from '@/constants/filters';

import type { LiveCameraHandle, LiveCameraProps } from './liveCamera.types';
import { LiveFilterOverlay } from './overlays';

/**
 * Fallback camera (Expo Go, web): expo-camera can't hand frames to Skia, so
 * the look is approximated with RN blend-mode layers. The photo itself still
 * goes through the full Lumi shader. Development builds use SkiaLiveCamera.
 */
export function ExpoLiveCamera({
  ref,
  facing,
  flash,
  mirror,
  active,
  filterId,
  onReady,
  onError,
}: LiveCameraProps & { ref?: Ref<LiveCameraHandle> }) {
  const camera = useRef<CameraView>(null);

  useImperativeHandle(ref, () => ({
    takePhoto: async () => {
      const c = camera.current;
      if (!c) throw new Error('camera not ready');
      // The system shutter sound is left to iOS (mandatory in some regions).
      const picture = await c.takePictureAsync({ quality: 1, imageType: 'jpg', exif: false });
      return { uri: picture.uri, mirrored: facing === 'front' && mirror };
    },
    focusAt: async () => false,
  }));

  return (
    <View style={StyleSheet.absoluteFill}>
      <CameraView
        ref={camera}
        style={StyleSheet.absoluteFill}
        facing={facing}
        flash={flash}
        mirror={facing === 'front' && mirror}
        active={active}
        animateShutter={false}
        onCameraReady={onReady}
        onMountError={() => onError('카메라를 시작하지 못했어요')}
      />
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <LiveFilterOverlay key={filterId} layers={getFilter(filterId).preview} />
      </View>
    </View>
  );
}
