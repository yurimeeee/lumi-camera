import { Platform } from 'react-native';

import { useSettingsStore } from '@/stores/settingsStore';

/**
 * AI features run on the device. On iOS they use Apple Vision (built into the
 * OS, nothing to download). In the browser the models are downloaded once
 * from Google's / Hugging Face's model storage and cached by the browser, so
 * the first use asks first and says how much it downloads. Photos are never
 * uploaded.
 */
export function ensureModelConsent(group: 'segmentation' | 'inpainting', what: string, size: string): boolean {
  const given = useSettingsStore.getState().aiModelConsent;
  if (Platform.OS !== 'web' || given.includes(group)) return true;
  const ok = window.confirm(
    `AI 모델을 내려받을까요?\n\n${what}에 쓰는 AI 모델(약 ${size})을 한 번 내려받아요. 사진은 기기 밖으로 보내지 않고 이 브라우저 안에서만 처리돼요.`,
  );
  if (ok) useSettingsStore.getState().set('aiModelConsent', [...given, group]);
  return ok;
}
