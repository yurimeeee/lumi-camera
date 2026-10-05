import { Canvas, Group, type SkTypeface } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';

import { getFilter } from '@/constants/filters';
import { radius } from '@/constants/theme';
import type { WorkingImage } from '@/hooks/useWorkingImage';
import { DateStampLayer } from '@/render/DateStampLayer';
import { LumiLayer } from '@/render/LumiLayer';
import { buildUniforms, isIdentity, resolveProcessing } from '@/services/imageProcessing';
import { useEditorStore } from '@/stores/editorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { formatDateStamp } from '@/utils/dateStamp';

interface Props {
  working: WorkingImage;
  boxWidth: number;
  boxHeight: number;
  showOriginal: boolean;
  onBeforeChange: (on: boolean) => void;
  typeface: SkTypeface | null;
}

export function fitContain(imgW: number, imgH: number, boxW: number, boxH: number) {
  const s = Math.min(boxW / imgW, boxH / imgH);
  return { width: Math.round(imgW * s), height: Math.round(imgH * s) };
}

/**
 * Live preview. Subscribes only to colour state, so slider drags re-render
 * this canvas and nothing else. Long-press shows the original.
 */
export const EditorCanvas = memo(function EditorCanvas({
  working,
  boxWidth,
  boxHeight,
  showOriginal,
  onBeforeChange,
  typeface,
}: Props) {
  const filterId = useEditorStore((s) => s.present.filterId);
  const intensity = useEditorStore((s) => s.present.intensity);
  const adjustments = useEditorStore((s) => s.present.adjustments);
  const retouch = useEditorStore((s) => s.present.retouch);
  const dateStamp = useEditorStore((s) => s.present.dateStamp);
  const takenAt = useEditorStore((s) => s.source?.takenAt ?? 0);
  const dateFormat = useSettingsStore((s) => s.dateFormat);

  const { width, height } = fitContain(working.width, working.height, boxWidth, boxHeight);

  const uniforms = useMemo(() => {
    const p = resolveProcessing({ filter: getFilter(filterId), intensity, adjustments, retouch });
    return isIdentity(p) ? null : buildUniforms(p, width, height);
  }, [filterId, intensity, adjustments, retouch, width, height]);

  const hold = Gesture.LongPress()
    .minDuration(220)
    .onStart(() => scheduleOnRN(onBeforeChange, true))
    .onFinalize(() => scheduleOnRN(onBeforeChange, false));

  return (
    <GestureDetector gesture={hold}>
      <View
        style={[styles.box, { width: boxWidth, height: boxHeight }]}
        accessible
        accessibilityLabel="편집 중인 사진. 길게 눌러 원본 보기"
      >
        <View style={[styles.photo, { width, height }]}>
          <Canvas style={{ width, height }}>
            <Group>
              <LumiLayer image={working.image} width={width} height={height} uniforms={showOriginal ? null : uniforms} />
              {dateStamp && typeface && !showOriginal ? (
                <DateStampLayer
                  text={formatDateStamp(takenAt, dateFormat)}
                  typeface={typeface}
                  width={width}
                  height={height}
                />
              ) : null}
            </Group>
          </Canvas>
        </View>
      </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: {
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
});
