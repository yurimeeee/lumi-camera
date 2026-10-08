import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { ChipTabs } from '@/components/common/ChipTabs';
import { PressableScale } from '@/components/common/PressableScale';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import {
  DEFAULT_FACE_RETOUCH,
  EYE_SHAPE_KEYS,
  FACE_CATEGORY_KEYS,
  FACE_SKIN_KEYS,
  FACE_TOOLS,
  isEyeShapeKey,
  isFaceSkinKey,
  isNeutralFace,
  RETOUCH_CATEGORIES,
  sidedKey,
  SKIN_TOOLS,
  type EyeSide,
  type FaceCategory,
  type RetouchCategory,
  type SkinToolKey,
} from '@/constants/faceRetouch';
import { colors, spacing, typography } from '@/constants/theme';
import type { FaceStatus } from '@/hooks/useFaces';
import type { FocusTarget } from '@/services/faceDetection/featureFocus';
import { feedback } from '@/services/feedback';
import { useEditorStore } from '@/stores/editorStore';
import type { FaceAnchor, FaceRetouch, FaceRetouchKey } from '@/types/editing';

import { ToolSliderPanel } from './ToolSliderPanel';

interface Props {
  faceStatus: FaceStatus;
  faceCount: number;
  selectedFaceId: string | null;
  /** Where the selected face is, stored with its first edit (re-identification). */
  selectedAnchor: FaceAnchor | null;
  /** Which of the detector's eyes is on the left of the photo as shown (flips swap them). */
  leftEye: 'L' | 'R';
  debugLandmarks: boolean;
  onDebugLandmarks: (on: boolean) => void;
  /** Area the selected tool works on, for automatic framing (null = whole photo). */
  onFocusChange: (target: FocusTarget | null) => void;
  /** Opens 잡티 제거 (tap to heal) in the touch tool. */
  onOpenBlemish: () => void;
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

const SKIN_NOTE: Partial<Record<SkinToolKey, string>> = {
  darkCircle: '눈 밑 그늘만 아래 볼의 피부톤에 맞춰 밝혀요',
  wrinkle: '눈가·눈 밑·이마·미간·팔자 주름의 어두운 선만 옅게 해요',
  redness: '얼굴 피부의 붉은 기만 줄여요 (입술·눈은 그대로)',
  teeth: '입 안에서 치아 색만 골라 누런 기를 빼요',
  eyeBright: '흰자는 맑게, 눈동자는 또렷하게',
};
const SKIN_DEFAULT_NOTE = '피부색 영역만 골라 정돈해요. 눈·눈썹·입술·콧구멍은 선명하게 유지돼요.';

/** Area a tool works on (automatic framing). Global skin tools frame nothing. */
function focusOf(category: RetouchCategory, key: string, side: EyeSide): FocusTarget | null {
  switch (category) {
    case 'skin':
      if (key === 'darkCircle' || key === 'eyeBright') return 'eyes';
      if (key === 'teeth') return 'mouth';
      if (key === 'wrinkle' || key === 'redness') return 'face';
      return null;
    case 'eyes':
      if (key === 'eyeDistance' || side === 'both') return 'eyes';
      return side === 'L' ? 'eyeL' : 'eyeR';
    case 'nose':
      return 'nose';
    case 'lips':
      return 'mouth';
    default:
      return 'face';
  }
}

const pickFace = (r: FaceRetouch) => Object.fromEntries(FACE_SKIN_KEYS.map((k) => [k, r[k]])) as Pick<FaceRetouch, (typeof FACE_SKIN_KEYS)[number]>;

/**
 * Retouch: Skin (texture/tone on any photo, plus tools that need a face's
 * regions) and the landmark-based face tools (Face, Eyes, Nose, Lips,
 * Proportion). Face values belong to the selected face; sliders update live
 * and commit one undo step when released.
 */
export function RetouchPanel({
  faceStatus,
  faceCount,
  selectedFaceId,
  selectedAnchor,
  leftEye,
  debugLandmarks,
  onDebugLandmarks,
  onFocusChange,
  onOpenBlemish,
}: Props) {
  const [category, setCategory] = useState<RetouchCategory>('skin');
  const [activeTool, setActiveTool] = useState<Record<RetouchCategory, string>>({
    skin: SKIN_TOOLS[0]!.key,
    face: FACE_TOOLS.face[0]!.key,
    eyes: FACE_TOOLS.eyes[0]!.key,
    nose: FACE_TOOLS.nose[0]!.key,
    lips: FACE_TOOLS.lips[0]!.key,
    proportion: FACE_TOOLS.proportion[0]!.key,
  });
  const [side, setSide] = useState<EyeSide>('both');
  const skinValues = useEditorStore((s) => s.present.retouch);
  const faceValues = useEditorStore((s) => (selectedFaceId ? s.present.faces[selectedFaceId] : undefined)) ?? DEFAULT_FACE_RETOUCH;
  const anyFaceEdits = useEditorStore((s) => Object.values(s.present.faces).some((r) => !isNeutralFace(r)));
  const { setRetouch, setFaceRetouch, commit, resetRetouch, resetFaceRetouch, resetAllFaces } = useEditorStore.getState();

  const ready = faceStatus === 'found' && !!selectedFaceId;
  const active = activeTool[category];
  const focus = ready ? focusOf(category, active, side) : null;
  useEffect(() => onFocusChange(focus), [focus, onFocusChange]);
  // Leaving the panel gives the photo back.
  useEffect(() => () => onFocusChange(null), [onFocusChange]);

  const setFace = (key: FaceRetouchKey, v: number) => selectedFaceId && setFaceRetouch(selectedFaceId, key, v, selectedAnchor ?? undefined);
  const chips = <ChipTabs tabs={RETOUCH_CATEGORIES} value={category} onChange={setCategory} />;
  const select = (key: string) => setActiveTool((t) => ({ ...t, [category]: key }));
  const note = faceNote(faceStatus, faceCount);

  if (category === 'skin') {
    const values = { ...skinValues, ...pickFace(faceValues) };
    return (
      <View>
        <View style={styles.chips}>{chips}</View>
        <ToolSliderPanel<SkinToolKey>
          key="skin"
          tools={SKIN_TOOLS}
          values={values}
          active={active as SkinToolKey}
          onActiveChange={select}
          onChange={(key, v) => (isFaceSkinKey(key) ? setFace(key, v) : setRetouch(key, v))}
          onCommit={commit}
          onReset={(key) => (isFaceSkinKey(key) ? selectedFaceId && resetFaceRetouch(selectedFaceId, [key]) : resetRetouch(key))}
          isDisabled={(key) => isFaceSkinKey(key) && !ready}
          note={(key) => (isFaceSkinKey(key) && !ready ? note || '얼굴을 인식해야 쓸 수 있어요' : (SKIN_NOTE[key] ?? SKIN_DEFAULT_NOTE))}
        />
        <View style={styles.footer}>
          <View style={styles.flex} />
          <PressableScale onPress={onOpenBlemish} style={styles.textButton} accessibilityRole="button" accessibilityLabel="잡티 제거: 사진에서 눌러 지우기">
            <View style={styles.inline}>
              <Ionicons name="bandage-outline" size={13} color={colors.textSecondary} />
              <Text style={styles.textButtonLabel}>잡티 제거 (탭)</Text>
            </View>
          </PressableScale>
        </View>
      </View>
    );
  }

  const keys = FACE_CATEGORY_KEYS[category];
  const categoryEdited = keys.some((k) => faceValues[k] !== 0);
  const eyes = category === 'eyes';
  const keyOf = (key: FaceRetouchKey) => (eyes ? sidedKey(key, side) : key);
  // In one-eye mode the shape controls show and edit that eye's offset.
  const values = eyes && side !== 'both' ? { ...faceValues, ...Object.fromEntries(EYE_SHAPE_KEYS.map((k) => [k, faceValues[sidedKey(k, side)]])) } : faceValues;

  return (
    <View>
      <View style={styles.chips}>{chips}</View>
      {eyes ? (
        <View style={styles.sides}>
          <SegmentedControl<EyeSide>
            options={[
              { value: 'both', label: '양쪽' },
              { value: leftEye, label: '왼쪽 눈' },
              { value: leftEye === 'L' ? 'R' : 'L', label: '오른쪽 눈' },
            ]}
            value={side}
            onChange={setSide}
            accessibilityLabel="보정할 눈"
          />
        </View>
      ) : null}
      <ToolSliderPanel<FaceRetouchKey>
        key={category}
        tools={FACE_TOOLS[category]}
        values={values}
        active={active as FaceRetouchKey}
        onActiveChange={select}
        onChange={(key, v) => setFace(keyOf(key), v)}
        onCommit={commit}
        onReset={(key) => selectedFaceId && resetFaceRetouch(selectedFaceId, [keyOf(key)])}
        disabled={!ready}
        isDisabled={(key) => eyes && side !== 'both' && !isEyeShapeKey(key)}
        note={eyes ? (key) => (side !== 'both' && !isEyeShapeKey(key) ? '이 항목은 양쪽 눈에 함께 적용돼요' : undefined) : undefined}
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
  sides: {
    paddingHorizontal: spacing.xl,
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
  flex: {
    flex: 1,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
