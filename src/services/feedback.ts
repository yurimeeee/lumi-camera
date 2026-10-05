import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Centralised haptic/sound feedback.
 *
 * Silent mode: Lumi itself plays no sound effects, so "무음 모드" only gates
 * app-generated sounds through `shouldPlayAppSound`. The system camera
 * shutter sound is controlled by iOS (and is mandatory in some regions);
 * Lumi never tries to suppress or bypass it.
 */

const supportsHaptics = Platform.OS === 'ios' || Platform.OS === 'android';

let lastSelection = 0;

export const feedback = {
  shutter() {
    if (supportsHaptics) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
  },
  /** Throttled so scrolling through filters doesn't buzz constantly. */
  selection() {
    if (!supportsHaptics) return;
    const now = Date.now();
    if (now - lastSelection < 90) return;
    lastSelection = now;
    void Haptics.selectionAsync().catch(() => undefined);
  },
  light() {
    if (supportsHaptics) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  },
  success() {
    if (supportsHaptics)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  },
  error() {
    if (supportsHaptics) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
  },
};

export function shouldPlayAppSound(silentMode: boolean): boolean {
  return !silentMode;
}
