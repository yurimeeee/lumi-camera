import type { CameraView } from 'expo-camera';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import { DEFAULT_RETOUCH } from '@/constants/adjustments';
import { feedback } from '@/services/feedback';
import {
  applyGeometry,
  captureAspect,
  centeredCrop,
  EXPORT_MAX_SIDE_HQ,
  EXPORT_MAX_SIDE_STD,
  normalizeImage,
} from '@/services/imagePipeline';
import { getPhotoLocation } from '@/services/location';
import { useCameraStore } from '@/stores/cameraStore';
import { DEFAULT_GEOMETRY, useEditorStore } from '@/stores/editorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { showToast } from '@/stores/toastStore';
import type { CaptureRatio } from '@/types/settings';

interface Options {
  cameraRef: RefObject<CameraView | null>;
  ready: boolean;
  ratio: CaptureRatio;
  filterId: string;
}

/**
 * Capture flow: optional countdown → takePicture → upright/resize →
 * ratio crop → open the editor with the camera's look pre-applied.
 */
export function useCapture({ cameraRef, ready, ratio, filterId }: Options) {
  const [countdown, setCountdown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [blink, setBlink] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setCountdown(0);
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const shoot = useCallback(async () => {
    const camera = cameraRef.current;
    if (!camera) return;
    const settings = useSettingsStore.getState();
    const { skin, setLastPhoto } = useCameraStore.getState();

    setBusy(true);
    feedback.shutter();
    setBlink((b) => b + 1);
    try {
      const locationPromise = settings.saveLocation ? getPhotoLocation() : Promise.resolve(null);
      // The system shutter sound is left to iOS (it is mandatory in some
      // regions); Lumi does not try to mute it.
      const picture = await camera.takePictureAsync({ quality: 1, imageType: 'jpg', exif: false });
      const takenAt = Date.now();
      const maxSide = settings.highQuality ? EXPORT_MAX_SIDE_HQ : EXPORT_MAX_SIDE_STD;

      let image = await normalizeImage(picture.uri, maxSide);
      const aspect = captureAspect(ratio);
      if (aspect) {
        image = await applyGeometry(
          image,
          { ...DEFAULT_GEOMETRY, crop: centeredCrop(image.width, image.height, aspect) },
          maxSide,
        );
      }
      const location = await locationPromise;

      setLastPhoto(image.uri);
      useEditorStore.getState().open(
        { ...image, origin: 'camera', takenAt, location },
        {
          filterId,
          intensity: settings.defaultIntensity,
          retouch: { ...DEFAULT_RETOUCH, skin },
          dateStamp: settings.dateStamp,
        },
      );
      router.push('/editor');
    } catch (e) {
      feedback.error();
      showToast('사진을 찍지 못했어요');
      if (__DEV__) console.warn('[capture]', e);
    } finally {
      setBusy(false);
    }
  }, [cameraRef, ratio, filterId]);

  const trigger = useCallback(() => {
    if (busy || !ready) return;
    if (countdown > 0) {
      clearTimer();
      return;
    }
    const seconds = useCameraStore.getState().timer;
    if (!seconds) {
      void shoot();
      return;
    }
    let remaining = seconds;
    setCountdown(remaining);
    feedback.light();
    timerRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearTimer();
        void shoot();
      } else {
        setCountdown(remaining);
      }
    }, 1000);
  }, [busy, ready, countdown, clearTimer, shoot]);

  return { trigger, countdown, busy, blink };
}
