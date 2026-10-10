import {
  FilterMode,
  MipmapMode,
  Skia,
  TileMode,
  type SkImage,
} from '@shopify/react-native-skia';
import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from 'react';
import { StyleSheet } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useCameraDevice, usePhotoOutput, type Frame } from 'react-native-vision-camera';
import { SkiaCamera, type SkiaCameraRef, type SkiaOnFrameState } from 'react-native-vision-camera-skia';

import { flattenUniforms, uniformSlot } from '@/render/uniformLayout';
import { curveTexture, identityCurveTexture } from '@/services/color/curveTexture';
import { buildUniforms } from '@/services/imageProcessing';
import { neutralReshapeTextures } from '@/services/reshape';
import { neutralMaskAtlas } from '@/services/masks/maskRaster';
import { getLumiEffect } from '@/shaders/lumiShader';

import type { LiveCameraHandle, LiveCameraProps } from './liveCamera.types';

/**
 * Live camera with the real Lumi look on every frame (Development Build).
 *
 * VisionCamera streams frames into a Skia surface (react-native-vision-camera-
 * skia); the frame worklet draws each frame through the same SkSL effect,
 * uniforms (buildUniforms) and curve LUT the editor and the exporter use, so
 * the preview is the shader math of the saved photo, not an approximation.
 * Changing the look only swaps shared values — the camera session is never
 * reconfigured. Photos come from a separate full-resolution photo output.
 *
 * SkiaCamera always mirrors the front camera (preview and photo); the capture
 * flow un-mirrors the photo when 거울 모드 is off (see CapturedPhoto.mirrored).
 */
export function SkiaLiveCamera({
  ref,
  facing,
  flash,
  active,
  look,
  exposure,
  onReady,
  onError,
}: LiveCameraProps & { ref?: Ref<LiveCameraHandle> }) {
  const camera = useRef<SkiaCameraRef>(null);
  const device = useCameraDevice(facing);
  const photoOutput = usePhotoOutput({ containerFormat: 'jpeg', quality: 0.95, qualityPrioritization: 'quality' });

  const effect = getLumiEffect();
  const slots = useMemo(
    () => ({ res: uniformSlot(effect, 'uResolution'), px: uniformSlot(effect, 'uPixel') }),
    [effect],
  );
  // Look → flat uniforms (frame size patched per frame) + LUT. Shared with the
  // frame thread; updating them never restarts the session.
  const uniforms = useSharedValue<number[] | null>(null);
  const lut = useSharedValue<SkImage | null>(null);
  const neutral = neutralReshapeTextures();
  const identityLut = identityCurveTexture();
  const noMasks = neutralMaskAtlas();

  useEffect(() => {
    if (!look) {
      uniforms.set(null);
      return;
    }
    uniforms.set(flattenUniforms(effect, { ...buildUniforms(look, 1, 1), uReshape: 0 }));
    lut.set(look.curves || look.mix?.curves ? curveTexture(look.curves, look.mix?.curves ?? null) : null);
  }, [look, effect, uniforms, lut]);

  const minEV = device?.supportsExposureBias ? device.minExposureBias : 0;
  const maxEV = device?.supportsExposureBias ? device.maxExposureBias : 0;
  // ±2 EV at most, within what the device allows.
  const bias = exposure >= 0 ? Math.min(maxEV, 2) * exposure : Math.max(minEV, -2) * -exposure;

  useImperativeHandle(ref, () => ({
    takePhoto: async () => {
      const flashMode = device?.hasFlash ? flash : 'off';
      const photo = await photoOutput.capturePhoto({ flashMode, enableShutterSound: true }, {});
      try {
        const uri = await photo.saveToTemporaryFileAsync();
        return { uri: uri.startsWith('file://') ? uri : `file://${uri}`, mirrored: photo.isMirrored };
      } finally {
        photo.dispose();
      }
    },
    focusAt: async (x, y) => {
      if (!camera.current || !device?.supportsFocusMetering) return false;
      await camera.current.focusTo({ x, y }, { modes: ['AF', 'AE'] });
      return true;
    },
  }));

  const onFrame = (frame: Frame, render: (onDraw: (state: SkiaOnFrameState) => void) => void) => {
    'worklet';
    const u = uniforms.value;
    const lutImage = lut.value ?? identityLut;
    render(({ canvas, frameTexture }) => {
      if (u === null) {
        canvas.drawImage(frameTexture, 0, 0);
        return;
      }
      const w = frameTexture.width();
      const h = frameTexture.height();
      const values = u.slice();
      values[slots.res] = w;
      values[slots.res + 1] = h;
      values[slots.px] = Math.min(w, h) / 1000;
      const children = [
        frameTexture.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Linear, MipmapMode.None),
        neutral.x.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Nearest, MipmapMode.None),
        neutral.y.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Nearest, MipmapMode.None),
        lutImage.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Nearest, MipmapMode.None),
        // Bloom/halation read a low-resolution copy; preview-sized frames are
        // read directly (a few more samples, no extra pass per frame).
        frameTexture.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Linear, MipmapMode.None),
        // Mask atlas + background layer: unused by camera looks.
        noMasks.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Nearest, MipmapMode.None),
        noMasks.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Nearest, MipmapMode.None),
      ];
      const paint = Skia.Paint();
      paint.setShader(effect.makeShaderWithChildren(values, children));
      canvas.drawRect(Skia.XYWHRect(0, 0, w, h), paint);
    });
    frame.dispose();
  };

  if (!device) return null;

  return (
    <SkiaCamera
      ref={camera}
      style={StyleSheet.absoluteFill}
      device={device}
      isActive={active}
      outputs={[photoOutput]}
      // Preview-sized frames: the look costs per pixel, and the photo comes
      // from the full-resolution photo output anyway.
      enablePreviewSizedOutputBuffers
      exposure={bias}
      onFrame={onFrame}
      onStarted={onReady}
      onError={(e) => onError(e.message || '카메라를 시작하지 못했어요')}
    />
  );
}
