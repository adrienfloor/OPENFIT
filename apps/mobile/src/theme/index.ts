/**
 * Phase 2.5 design tokens.
 *
 * Single dark-mode palette — there is no light theme. Tokens are flat
 * objects (not contextual) so any component can import them directly
 * without a Provider. A `useTheme` hook is exported for parity with
 * components that prefer hooks; it returns the same constants.
 */

export const colors = {
  // Background layers, lightest to darkest going up the z-stack.
  bg: '#0b0b0d',
  surface: '#16171a',
  surfaceRaised: '#1f2024',
  surfaceMuted: '#101114',

  // Borders and dividers.
  border: '#26272b',
  borderSubtle: '#1c1d20',

  // Text.
  text: '#f5f5f7',
  textSecondary: '#a1a1aa',
  textMuted: '#6b7280',
  textDisabled: '#52525b',

  // Brand / accents — kept consistent with workout-type colours so the
  // palette doesn't drift between cards and existing logs.
  accent: '#22c55e',
  accentSoft: '#15803d',
  sleep: '#60a5fa',
  effort: '#f59e0b',
  bioCharge: '#22c55e',
  strength: '#22c55e',
  run: '#3b82f6',
  free: '#a855f7',
  bike: '#06b6d4',
  swim: '#0ea5e9',
  hike: '#84cc16',
  walk: '#94a3b8',
  other: '#737373',
  danger: '#ef4444',
  warning: '#f59e0b',
  info: '#38bdf8',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

export const radii = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  pill: 999,
} as const;

export const typography = {
  size: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 18,
    xl: 22,
    xxl: 28,
    display: 32,
  },
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
} as const;

export const theme = { colors, spacing, radii, typography } as const;
export type Theme = typeof theme;

export function useTheme(): Theme {
  return theme;
}

/**
 * Themed props for `RefreshControl`. The defaults render a stark white disc
 * with a black arc on Android — jarring on the dark theme. Spreading these
 * props brings the spinner in line with the brand accent and the surface
 * colour so it disappears into the bg layers when not pulled.
 *
 * Usage:
 *   <RefreshControl refreshing={loading} onRefresh={refetch} {...themedRefresh} />
 */
export const themedRefresh: {
  tintColor: string;
  colors: string[];
  progressBackgroundColor: string;
} = {
  // iOS: arc colour.
  tintColor: colors.accent,
  // Android: array of arc colours (cycles through them).
  colors: [colors.accent],
  // Android: bg of the circular indicator disc.
  progressBackgroundColor: colors.surface,
};
