import type { IconName } from '@/components/common/IconButton';
import type { CaptureRatio, FlashSetting, TimerSetting } from '@/types/settings';

export const FLASH_OPTIONS: readonly { value: FlashSetting; label: string; icon: IconName }[] = [
  { value: 'auto', label: 'Auto', icon: 'flash-outline' },
  { value: 'on', label: 'On', icon: 'flash' },
  { value: 'off', label: 'Off', icon: 'flash-off-outline' },
];

export const TIMER_OPTIONS: readonly { value: TimerSetting; label: string }[] = [
  { value: 0, label: 'Off' },
  { value: 3, label: '3s' },
  { value: 5, label: '5s' },
  { value: 10, label: '10s' },
];

export const RATIO_OPTIONS: readonly { value: CaptureRatio; label: string }[] = [
  { value: 'original', label: 'Full' },
  { value: '1:1', label: '1:1' },
  { value: '4:3', label: '4:3' },
  { value: '16:9', label: '16:9' },
];

export function nextOf<T>(options: readonly { value: T }[], current: T): T {
  const i = options.findIndex((o) => o.value === current);
  return options[(i + 1) % options.length]!.value;
}

export function labelOf<T>(options: readonly { value: T; label: string }[], current: T): string {
  return options.find((o) => o.value === current)?.label ?? '';
}
