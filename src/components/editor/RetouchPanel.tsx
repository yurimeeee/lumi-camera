import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { ChipTabs } from '@/components/common/ChipTabs';
import { PressableScale } from '@/components/common/PressableScale';
import {
  DEFAULT_FACE_RETOUCH,
  FACE_CATEGORY_KEYS,
  FACE_TOOLS,
  isNeutralFace,
  RETOUCH_CATEGORIES,
  SKIN_TOOLS,
  type FaceCategory,
  type RetouchCategory,
} from '@/constants/faceRetouch';
import { colors, spacing, typography } from '@/constants/theme';
import type { FaceStatus } from '@/hooks/useFaces';
import { feedback } from '@/services/feedback';
import { useEditorStore } from '@/stores/editorStore';

import { ToolSliderPanel } from './ToolSliderPanel';

interface Props {
  faceStatus: FaceStatus;
  faceCount: number;
  selectedFaceId: string | null;
  debugLandmarks: boolean;
  onDebugLandmarks: (on: boolean) => void;
}

const UNSUPPORTED_NOTE =
  Platform.OS === 'ios'
    ? '얼굴 보정은 Development Build에서 쓸 수 있어요 (Expo Go 미지원)'
    : '이 기기에서는 얼굴 인식을 아직 지원하지 않아요';

function faceNote(status: FaceStatus, faceCount: number): string {
  switch (status) {
    case 'unsupported':
      return UNSUPPORTED_NOTE;
    case 'idle':
    case 'detecting':
      return '얼굴을 찾는 중이에요…';
    case 'none':
      return '얼굴을 인식할 수 없어요';
    case 'error':
      return Platform.OS === 'web' ? '얼굴 인식을 불러오지 못했어요' : '얼굴을 인식할 수 없어요';
    case 'found':
      return faceCount > 1 ? '보정할 얼굴을 사진에서 눌러 고를 수 있어요' : '';
  }
}

const CATEGORY_NAME: Record<FaceCategory, string> = {
  face: '얼굴형',
  eyes: '눈',
  nose: '코',
  lips: '입',
  proportion: '비율',
};

/**
 * Retouch: Skin (texture/tone on any photo) and the landmark-based face tools
 * (Face, Eyes, Nose, Lips, Proportion). Face values belong to the selected
 * face; sliders update live and commit one undo step when released.
 */
export function RetouchPanel({ faceStatus, faceCount, selectedFaceId, debugLandmarks, onDebugLandmarks }: Props) {
  const [category, setCategory] = useState<RetouchCategory>('skin');
  const skinValues = useEditorStore((s) => s.present.retouch);
  const faceValues = useEditorStore((s) => (selectedFaceId ? s.present.faces[selectedFaceId] : undefined)) ?? DEFAULT_FACE_RETOUCH;
  const anyFaceEdits = useEditorStore((s) => Object.values(s.present.faces).some((r) => !isNeutralFace(r)));
  const { setRetouch, setFaceRetouch, commit, resetRetouch, resetFaceRetouch, resetAllFaces } = useEditorStore.getState();

  const chips = <ChipTabs tabs={RETOUCH_CATEGORIES} value={category} onChange={setCategory} />;

  if (category === 'skin') {
    return (
      <View>
        <View style={styles.chips}>{chips}</View>
        <ToolSliderPanel
          key="skin"
          tools={SKIN_TOOLS}
          values={skinValues}
          onChange={setRetouch}
          onCommit={commit}
          onReset={resetRetouch}
          note="피부색 영역만 골라 결을 정돈해요. 눈·머리카락·윤곽선은 선명하게 유지돼요."
        />
      </View>
    );
  }

  const ready = faceStatus === 'found' && !!selectedFaceId;
  const keys = FACE_CATEGORY_KEYS[category];
  const categoryEdited = keys.some((k) => faceValues[k] !== 0);
  const note = faceNote(faceStatus, faceCount);

  return (
    <View>
      <View style={styles.chips}>{chips}</View>
      <ToolSliderPanel
        key={category}
        tools={FACE_TOOLS[category]}
        values={faceValues}
        onChange={(key, v) => selectedFaceId && setFaceRetouch(selectedFaceId, key, v)}
        onCommit={commit}
        onReset={(key) => selectedFaceId && resetFaceRetouch(selectedFaceId, [key])}
        disabled={!ready}
      />
      <View style={styles.footer}>
        <Text style={[styles.note, !ready && faceStatus !== 'detecting' && styles.noteWarn]} numberOfLines={1}>
          {note}
        </Text>
        {__DEV__ ? (
          <PressableScale
            onPress={() => onDebugLandmarks(!debugLandmarks)}
            style={styles.textButton}
            accessibilityRole="switch"
            accessibilityState={{ checked: debugLandmarks }}
            accessibilityLabel="랜드마크 표시 (개발용)"
          >
            <Ionicons name="bug-outline" size={13} color={debugLandmarks ? colors.accent : colors.textTertiary} />
          </PressableScale>
        ) : null}
        <PressableScale
          onPress={() => {
            if (!selectedFaceId) return;
            feedback.light();
            resetFaceRetouch(selectedFaceId, keys);
          }}
          disabled={!ready || !categoryEdited}
          style={[styles.textButton, (!ready || !categoryEdited) && styles.textButtonDisabled]}
          accessibilityRole="button"
          accessibilityLabel={`${CATEGORY_NAME[category]} 초기화`}
        >
          <Text style={styles.textButtonLabel}>{CATEGORY_NAME[category]} 초기화</Text>
        </PressableScale>
        <PressableScale
          onPress={() => {
            feedback.light();
            resetAllFaces();
          }}
          disabled={!anyFaceEdits}
          style={[styles.textButton, !anyFaceEdits && styles.textButtonDisabled]}
          accessibilityRole="button"
          accessibilityLabel="얼굴 보정 전체 초기화"
        >
          <Text style={styles.textButtonLabel}>전체 초기화</Text>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: {
    marginBottom: spacing.xs,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.xl,
    paddingRight: spacing.md,
    marginTop: spacing.xxs,
    minHeight: 28,
  },
  note: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textTertiary,
    flex: 1,
  },
  noteWarn: {
    color: colors.textSecondary,
  },
  textButton: {
    minHeight: 28,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
  },
  textButtonDisabled: {
    opacity: 0.35,
  },
  textButtonLabel: {
    ...typography.filterName,
    fontSize: 11,
  },
});
