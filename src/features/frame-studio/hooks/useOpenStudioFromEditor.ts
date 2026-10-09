import type { SkTypeface } from '@shopify/react-native-skia';
import { useCallback, useState } from 'react';

import { NO_FRAME } from '@/constants/film';
import { storeStudioFile } from '@/services/appFiles';
import { renderEdit } from '@/services/exportImage';
import { useEditorStore } from '@/stores/editorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { showToast } from '@/stores/toastStore';

import { openFrameStudio, type StudioTab } from '../screens/FrameStudioScreen';

/**
 * Editor → Frame Studio: the current edit is rendered at export resolution
 * (the editor's quick frame left out — the studio frames it) and handed to
 * the studio as its first photo. The edit itself stays open in the editor.
 */
export function useOpenStudioFromEditor(typeface: SkTypeface | null) {
  const [opening, setOpening] = useState(false);
  const open = useCallback(async (tab?: StudioTab) => {
    const { source, present } = useEditorStore.getState();
    if (!source || opening) return;
    setOpening(true);
    try {
      const settings = useSettingsStore.getState();
      const out = await renderEdit(source, { ...present, frame: NO_FRAME }, {
        highQuality: settings.highQuality,
        format: 'jpeg',
        quality: 100,
        stampTypeface: typeface,
      });
      const uri = await storeStudioFile(out.uri);
      openFrameStudio([{ uri, width: out.width, height: out.height }], tab);
    } catch (e) {
      showToast('프레임 스튜디오를 열지 못했어요');
      if (__DEV__) console.warn('[studio open]', e);
    } finally {
      setOpening(false);
    }
  }, [opening, typeface]);
  return { open, opening };
}
