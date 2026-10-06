import { useWindowDimensions } from 'react-native';

import { APP_MAX_WIDTH } from '@/constants/theme';

/** Window size, with the width capped to the app column (see `APP_MAX_WIDTH`). */
export function useAppDimensions() {
  const { width, height } = useWindowDimensions();
  return { width: Math.min(width, APP_MAX_WIDTH), height };
}
