import type { SkTypeface } from '@shopify/react-native-skia';
import { useCallback, useState } from 'react';
import { Alert, Linking } from 'react-native';

import { prepareOriginal, renderEdit } from '@/services/exportImage';
import { feedback } from '@/services/feedback';
import { LUMI_ALBUM, LUMI_ORIGINALS_ALBUM, saveToLibrary } from '@/services/mediaLibrary';
import { useCameraStore } from '@/stores/cameraStore';
import { useEditorStore } from '@/stores/editorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { showToast } from '@/stores/toastStore';

function permissionAlert() {
  Alert.alert('사진 저장 권한이 필요해요', '편집한 사진을 보관함에 저장하려면 설정에서 사진 접근을 허용해 주세요.', [
    { text: '취소', style: 'cancel' },
    { text: '설정 열기', onPress: () => void Linking.openSettings() },
  ]);
}

/** Render at export resolution and save (plus the original, when enabled). */
export function useSaveEdit(typeface: SkTypeface | null) {
  const [saving, setSaving] = useState(false);

  const save = useCallback(async () => {
    const { source, present } = useEditorStore.getState();
    if (!source || saving) return false;
    const settings = useSettingsStore.getState();
    setSaving(true);
    try {
      const out = await renderEdit(source, present, {
        highQuality: settings.highQuality,
        dateFormat: settings.dateFormat,
        stampTypeface: typeface,
        location: source.location,
      });
      const result = await saveToLibrary(out.uri, LUMI_ALBUM);
      if (!result.ok) {
        feedback.error();
        if (result.reason === 'permission') permissionAlert();
        else showToast('저장하지 못했어요');
        return false;
      }
      // Originals only make sense for new captures — library photos already exist.
      if (settings.saveOriginal && source.origin === 'camera') {
        const original = await prepareOriginal(source, source.location);
        await saveToLibrary(original, LUMI_ORIGINALS_ALBUM);
      }
      useCameraStore.getState().setLastPhoto(out.uri);
      feedback.success();
      showToast('사진에 저장했어요');
      return true;
    } catch (e) {
      feedback.error();
      showToast('저장 중 문제가 생겼어요');
      if (__DEV__) console.warn('[save]', e);
      return false;
    } finally {
      setSaving(false);
    }
  }, [saving, typeface]);

  return { save, saving };
}
