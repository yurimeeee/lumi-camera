import type { ComponentType, Ref } from 'react';
import { Platform } from 'react-native';

import { ExpoLiveCamera } from './ExpoLiveCamera';
import type { LiveCameraCapabilities, LiveCameraHandle, LiveCameraProps } from './liveCamera.types';

export type { CapturedPhoto, LiveCameraHandle } from './liveCamera.types';

type Backend = ComponentType<LiveCameraProps & { ref?: Ref<LiveCameraHandle> }>;

/**
 * VisionCamera needs its native modules (Development Build). In Expo Go they
 * are missing and importing it throws, so it is loaded defensively here and
 * the app falls back to expo-camera.
 */
function loadFrameCamera(): Backend | null {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- must not load (and throw) at import time
    const mod = require('./SkiaLiveCamera') as { SkiaLiveCamera: Backend | null };
    return mod.SkiaLiveCamera;
  } catch (e) {
    if (__DEV__) console.info('[camera] VisionCamera unavailable, using expo-camera fallback:', String(e));
    return null;
  }
}

const FrameCamera = loadFrameCamera();

export const LIVE_CAMERA: LiveCameraCapabilities = FrameCamera
  ? { frameFilter: true, focus: true, exposure: true }
  : { frameFilter: false, focus: false, exposure: false };

/** Camera preview with the live Lumi look; see SkiaLiveCamera / ExpoLiveCamera. */
export function LiveCamera(props: LiveCameraProps & { ref?: Ref<LiveCameraHandle> }) {
  const Backend = FrameCamera ?? ExpoLiveCamera;
  return <Backend {...props} />;
}
