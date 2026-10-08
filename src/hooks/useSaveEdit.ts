import type { SkTypeface } from '@shopify/react-native-skia';
import { useCallback, useRef, useState } from 'react';

import { prepareOriginal, renderEdit } from '@/services/exportImage';
import { feedback } from '@/services/feedback';
import { LUMI_ALBUM, LUMI_ORIGINALS_ALBUM, saveToLibrary } from '@/services/mediaLibrary';
import { useCameraStore } from '@/stores/cameraStore';
import { useEditorStore } from '@/stores/editorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { showToast } from '@/stores/toastStore';
import { permissionDenied } from '@/utils/dialogs';

function permissionAlert() {
  permissionDenied('사진 저장 권한이 필요해요', '편집한 사진을 보관함에 저장하려면 설정에서 사진 접근을 허용해 주세요.');
}

/** Render at export resolution and save (plus the original, when enabled). */
export function useSaveEdit(typeface: SkTypeface | null) {
  const [saving, setSaving] = useState(false);
  // State lags a render behind; the ref blocks a second tap immediately.
  const busy = useRef(false);

  const save = useCallback(async () => {
    const { source, present } = useEditorStore.getState();
    if (!source || busy.current) return false;
    busy.current = true;
    const settings = useSettingsStore.getState();
    setSaving(true);
    try {
      const out = await renderEdit(source, present, {
        highQuality: settings.highQuality,
        format: settings.exportFormat,
        quality: settings.jpegQuality,
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
      showToast(e instanceof Error && /인코딩|렌더링|열 수 없어요/.test(e.message) ? e.message : '저장 중 문제가 생겼어요');
      if (__DEV__) console.warn('[save]', e);
      return false;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }, [typeface]);

  return { save, saving };
}
