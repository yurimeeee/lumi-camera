import { Platform, type TextStyle } from 'react-native';

export const colors = {
  background: '#F7F4EF',
  surface: '#FFFCF8',
  surfaceMuted: '#F1ECE5',
  text: '#24211E',
  textSecondary: '#8B857D',
  textTertiary: '#B3ACA3',
  border: '#EAE4DC',
  accent: '#E8956B',
  accentSoft: '#F6DCCB',
  accentMuted: '#F3E6DC',
  success: '#7BA37A',
  danger: '#D2694F',
  // Dark surfaces used around the camera preview
  ink: '#1C1A18',
  inkSoft: 'rgba(28, 26, 24, 0.72)',
  scrim: 'rgba(0, 0, 0, 0.35)',
  white: '#FFFFFF',
  whiteSoft: 'rgba(255, 255, 255, 0.86)',
  whiteMuted: 'rgba(255, 255, 255, 0.55)',
  gridLine: 'rgba(255, 255, 255, 0.35)',
  dateStamp: '#F28A3C',
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 36,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  xxl: 32,
  pill: 999,
} as const;

const systemFont = Platform.select({ ios: 'System', default: undefined });

export const typography = {
  largeTitle: { fontFamily: systemFont, fontSize: 28, fontWeight: '600', letterSpacing: -0.4, color: colors.text },
  title: { fontFamily: systemFont, fontSize: 17, fontWeight: '600', letterSpacing: -0.2, color: colors.text },
  headline: { fontFamily: systemFont, fontSize: 15, fontWeight: '600', color: colors.text },
  body: { fontFamily: systemFont, fontSize: 15, fontWeight: '400', color: colors.text },
  callout: { fontFamily: systemFont, fontSize: 14, fontWeight: '400', color: colors.text },
  caption: { fontFamily: systemFont, fontSize: 12, fontWeight: '400', color: colors.textSecondary },
  micro: { fontFamily: systemFont, fontSize: 10, fontWeight: '500', letterSpacing: 0.2, color: colors.textSecondary },
  // Small, airy English labels used for filter names
  filterName: { fontFamily: systemFont, fontSize: 11, fontWeight: '500', letterSpacing: 0.4, color: colors.textSecondary },
  overline: { fontFamily: systemFont, fontSize: 12, fontWeight: '600', letterSpacing: 1.6, color: colors.text },
} satisfies Record<string, TextStyle>;

export const motion = {
  fast: 150,
  base: 200,
  slow: 250,
} as const;

export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 } as const;

/** Minimum touch target recommended by Apple HIG. */
export const MIN_TOUCH = 44;

/** react-native-web colours the "on" switch thumb via a web-only prop. */
export const WEB_SWITCH = Platform.OS === 'web' ? { activeThumbColor: colors.white } : {};

/**
 * Lumi is a phone layout. On wide screens (web on desktop) the app is shown
 * in a centred column of this width instead of stretching edge to edge.
 */
export const APP_MAX_WIDTH = 480;
