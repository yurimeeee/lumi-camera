import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import type { LiveCameraHandle } from '@/components/camera/LiveCamera';
import { DEFAULT_RETOUCH } from '@/constants/adjustments';
import { storeOriginal } from '@/services/appFiles';
import { pruneStoredOriginals } from '@/services/editProject';
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

import type { CameraLook } from './useCameraLook';

interface Options {
  cameraRef: RefObject<LiveCameraHandle | null>;
  ready: boolean;
  ratio: CaptureRatio;
  look: CameraLook;
}

/**
 * Capture flow: optional countdown → take photo → upright/resize → mirror
 * fix → ratio crop → app-owned original → open the result in the editor with
 * the camera's look (filter or recipe, same intensity) applied
 * non-destructively. From there the user saves or keeps editing.
 */
export function useCapture({ cameraRef, ready, ratio, look }: Options) {
  const [countdown, setCountdown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [blink, setBlink] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Blocks a second shot before React re-renders with `busy`.
  const shooting = useRef(false);
  // A countdown shot uses the look selected when it fires.
  const lookRef = useRef(look);
  useEffect(() => {
    lookRef.current = look;
  }, [look]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setCountdown(0);
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const shoot = useCallback(async () => {
    const camera = cameraRef.current;
    if (!camera || shooting.current) return;
    shooting.current = true;
    const settings = useSettingsStore.getState();
    const { skin, setLastPhoto, facing, rerollSeed } = useCameraStore.getState();
    const current = lookRef.current;

    setBusy(true);
    feedback.shutter();
    setBlink((b) => b + 1);
    try {
      const locationPromise = settings.saveLocation ? getPhotoLocation() : Promise.resolve(null);
      const picture = await camera.takePhoto();
      const takenAt = Date.now();
      const maxSide = settings.highQuality ? EXPORT_MAX_SIDE_HQ : EXPORT_MAX_SIDE_STD;

      // EXIF orientation is applied here, so everything after works upright.
      let image = await normalizeImage(picture.uri, maxSide);
      const wantMirror = facing === 'front' && settings.mirrorFront;
      const aspect = captureAspect(ratio);
      const crop = aspect ? centeredCrop(image.width, image.height, aspect) : null;
      if (picture.mirrored !== wantMirror || crop) {
        image = await applyGeometry(image, { ...DEFAULT_GEOMETRY, flipH: picture.mirrored !== wantMirror, crop }, maxSide);
      }
      const location = await locationPromise;
      const uri = await storeOriginal(image.uri);

      setLastPhoto(uri);
      const { look } = current;
      useEditorStore.getState().open(
        { ...image, uri, origin: 'camera', takenAt, dateKnown: true, location },
        {
          filterId: look.filterId,
          intensity: look.intensity,
          mix: look.mix ?? null,
          adjustments: look.adjustments,
          hsl: look.hsl,
          curves: look.curves,
          // Same seed as the preview: the capture shows the grain/dust it showed.
          film: look.film,
          frame: look.frame,
          dateStamp: look.dateStamp,
          stamp: look.stamp,
          recipeId: current.recipeId,
          retouch: { ...DEFAULT_RETOUCH, skin },
        },
      );
      rerollSeed();
      router.push('/editor');
      void pruneStoredOriginals([uri]);
    } catch (e) {
      feedback.error();
      showToast('사진을 찍지 못했어요');
      if (__DEV__) console.warn('[capture]', e);
    } finally {
      shooting.current = false;
      setBusy(false);
    }
  }, [cameraRef, ratio]);

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

  return { trigger, cancel: clearTimer, countdown, busy, blink };
}
