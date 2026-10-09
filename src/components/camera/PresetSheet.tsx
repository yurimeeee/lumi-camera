import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/common/BottomSheet';
import { PressableScale } from '@/components/common/PressableScale';
import { TextPromptDialog } from '@/components/common/TextPromptDialog';
import { getFilmCamera } from '@/constants/filmCameras';
import { getFilter } from '@/constants/filters';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { feedback } from '@/services/feedback';
import { useCameraStore } from '@/stores/cameraStore';
import { allPresets, usePresetStore } from '@/stores/presetStore';
import { getRecipe, parseRecipeLookId } from '@/stores/recipeStore';
import { showToast } from '@/stores/toastStore';
import type { CameraPreset } from '@/types/presets';
import { confirmAction } from '@/utils/dialogs';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** The current camera setup as a preset (for "save"). */
  current: () => Omit<CameraPreset, 'id' | 'builtIn' | 'name'>;
}

function describe(p: CameraPreset): string {
  const look =
    p.mode === 'film'
      ? getFilmCamera(p.filmCameraId).name
      : (getRecipe(parseRecipeLookId(p.lookId))?.name ?? getFilter(p.lookId).name);
  return [p.mode === 'film' ? 'FILM' : 'PHOTO', `${look} ${p.intensity}`, p.ratio, p.dateStamp ? 'DATE' : null].filter(Boolean).join(' · ');
}

/** Camera presets: apply instantly (the camera keeps running), save the current setup, delete your own. */
export function PresetSheet({ visible, onClose, current }: Props) {
  const user = usePresetStore((s) => s.presets);
  const activeId = useCameraStore((s) => s.presetId);
  const [naming, setNaming] = useState(false);
  const presets = allPresets(user);

  const apply = (p: CameraPreset) => {
    feedback.selection();
    useCameraStore.getState().applyPreset(p);
    showToast(`‘${p.name}’ 프리셋`);
    onClose();
  };

  const remove = (p: CameraPreset) =>
    confirmAction({
      title: `‘${p.name}’ 프리셋을 지울까요?`,
      confirmText: '지우기',
      destructive: true,
      onConfirm: () => usePresetStore.getState().remove(p.id),
    });

  return (
    <>
      <BottomSheet visible={visible && !naming} onClose={onClose} title="촬영 프리셋">
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {presets.map((p) => {
            const active = p.id === activeId;
            return (
              <PressableScale
                key={p.id}
                style={[styles.row, active && styles.rowActive]}
                onPress={() => apply(p)}
                onLongPress={p.builtIn ? undefined : () => remove(p)}
                activeScale={0.98}
                accessibilityRole="button"
                accessibilityLabel={`${p.name} 프리셋`}
                accessibilityHint={p.builtIn ? undefined : '길게 누르면 삭제'}
              >
                <View style={styles.info}>
                  <Text style={styles.name}>{p.name}</Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {describe(p)}
                  </Text>
                </View>
                {active ? <Ionicons name="checkmark" size={18} color={colors.accent} /> : null}
              </PressableScale>
            );
          })}
        </ScrollView>
        <PressableScale style={styles.save} onPress={() => setNaming(true)} accessibilityRole="button" accessibilityLabel="지금 설정을 프리셋으로 저장">
          <Ionicons name="add" size={18} color={colors.white} />
          <Text style={styles.saveText}>지금 설정 저장</Text>
        </PressableScale>
      </BottomSheet>
      <TextPromptDialog
        visible={naming}
        title="프리셋으로 저장"
        message="촬영 모드·필터(또는 필름 카메라)·강도·필름 효과·그레인·날짜 스탬프·비율을 저장해요."
        initialValue={`My Preset ${user.length + 1}`}
        placeholder="예: Summer Film"
        confirmText="저장"
        maxLength={24}
        onSubmit={(name) => {
          const id = usePresetStore.getState().add({ ...current(), name: name.trim() || 'My Preset' });
          useCameraStore.setState({ presetId: id });
          feedback.success();
          showToast(`‘${name}’ 프리셋을 저장했어요`);
        }}
        onClose={() => setNaming(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  list: {
    maxHeight: 360,
  },
  listContent: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
  },
  rowActive: {
    backgroundColor: colors.accentMuted,
  },
  info: {
    flex: 1,
  },
  name: {
    ...typography.callout,
  },
  meta: {
    ...typography.caption,
    fontSize: 11,
    letterSpacing: 0.4,
  },
  save: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    minHeight: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.text,
  },
  saveText: {
    ...typography.headline,
    fontSize: 14,
    color: colors.white,
  },
});
