/**
 * The same tokens as `global.css`, for the places a Tailwind class cannot
 * reach: Skia charts, Reanimated interpolations, navigator options and native
 * props like `tintColor`.
 *
 * `global.css` stays the source of truth for anything rendered as a class;
 * this file mirrors it so a chart can never drift from the rest of the UI.
 */

export type ThemeName = 'light' | 'dark' | 'contrast';

export interface Palette {
  bg: string;
  surface: string;
  surfaceRaised: string;
  surfaceSunken: string;
  border: string;
  borderStrong: string;
  /** Card edge: near-invisible in light mode, a hairline in dark. */
  cardBorder: string;
  fg: string;
  fgMuted: string;
  fgSubtle: string;
  fgInverse: string;
  primary: string;
  primaryPressed: string;
  /** The deep end of the brand ramp; pairs with `primary` in gradients. */
  primaryStrong: string;
  primarySoft: string;
  /** Volt: the solid action fill; always carries `onPrimary` ink. */
  primaryFill: string;
  onPrimary: string;
  /** Electric violet - charts, focus, highlights. Never a status. */
  accent: string;
  accentSoft: string;
  /** Ink on the graphite hero; the same in every theme. */
  onHero: string;
  /** The graphite hero gradient, top-start to bottom-end. */
  heroFrom: string;
  heroTo: string;
  /** Hairline around the hero, so it separates from a dark background. */
  heroEdge: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  info: string;
  infoSoft: string;
  severityLow: string;
  severityMedium: string;
  severityHigh: string;
  severityCritical: string;
}

export const palettes: Record<ThemeName, Palette> = {
  light: {
    bg: '#F4F5F1',
    surface: '#FFFFFF',
    surfaceRaised: '#FFFFFF',
    surfaceSunken: '#ECEEE8',
    border: '#E2E5DE',
    borderStrong: '#CBCFC6',
    cardBorder: '#ECEEE7',
    fg: '#0D0F12',
    fgMuted: '#585D65',
    fgSubtle: '#80858D',
    fgInverse: '#FFFFFF',
    primary: '#3D6B00',
    primaryPressed: '#2F5400',
    primaryStrong: '#0D0F12',
    primarySoft: '#ECF9C8',
    primaryFill: '#C6F432',
    onPrimary: '#0D0F12',
    accent: '#6D4AFF',
    accentSoft: '#EEEAFF',
    onHero: '#FFFFFF',
    heroFrom: '#1C2026',
    heroTo: '#0B0C0E',
    heroEdge: '#1C2026',
    success: '#038752',
    successSoft: '#DBF5E8',
    warning: '#B54708',
    warningSoft: '#FEF0DE',
    danger: '#D92D20',
    dangerSoft: '#FEE4E2',
    info: '#1570CD',
    infoSoft: '#DEEDFC',
    severityLow: '#155EAA',
    severityMedium: '#A05A00',
    severityHigh: '#C4320A',
    severityCritical: '#B41428',
  },
  dark: {
    bg: '#0A0B0D',
    surface: '#141619',
    surfaceRaised: '#1B1E22',
    surfaceSunken: '#0F1113',
    border: '#25282D',
    borderStrong: '#34383F',
    cardBorder: '#212429',
    fg: '#F2F4F0',
    fgMuted: '#A1A6AD',
    fgSubtle: '#70757D',
    fgInverse: '#0A0B0D',
    primary: '#C6F432',
    primaryPressed: '#B0DE28',
    primaryStrong: '#0A0B0D',
    primarySoft: '#212B0C',
    primaryFill: '#C6F432',
    onPrimary: '#0A0B0D',
    accent: '#9B85FF',
    accentSoft: '#211B42',
    onHero: '#FFFFFF',
    heroFrom: '#1E2228',
    heroTo: '#111316',
    heroEdge: '#2A2E35',
    success: '#3DDC97',
    successSoft: '#0A2E20',
    warning: '#FDB022',
    warningSoft: '#3A2606',
    danger: '#FF6B63',
    dangerSoft: '#401412',
    info: '#53B1FD',
    infoSoft: '#0C243C',
    severityLow: '#7DC8FC',
    severityMedium: '#FDC846',
    severityHigh: '#FD9150',
    severityCritical: '#FF7070',
  },
  contrast: {
    bg: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceRaised: '#FFFFFF',
    surfaceSunken: '#F0F0F0',
    border: '#141414',
    borderStrong: '#000000',
    cardBorder: '#141414',
    fg: '#000000',
    fgMuted: '#262626',
    fgSubtle: '#464646',
    fgInverse: '#FFFFFF',
    primary: '#244000',
    primaryPressed: '#182C00',
    primaryStrong: '#000000',
    primarySoft: '#E8FABE',
    primaryFill: '#C6F432',
    onPrimary: '#000000',
    accent: '#461EC8',
    accentSoft: '#E8E2FF',
    onHero: '#FFFFFF',
    heroFrom: '#111111',
    heroTo: '#000000',
    heroEdge: '#000000',
    success: '#006428',
    successSoft: '#D4F0DE',
    warning: '#784C00',
    warningSoft: '#FDF0C8',
    danger: '#A00028',
    dangerSoft: '#FDE0E6',
    info: '#005078',
    infoSoft: '#D6ECF8',
    severityLow: '#00466E',
    severityMedium: '#6E4600',
    severityHigh: '#8C2800',
    severityCritical: '#96001E',
  },
};

/** Spacing scale, in dp. Components pick from here, never a magic number. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
  gutter: 20,
  /** The minimum touch target the UI standards require. */
  touch: 48,
} as const;

export const radius = {
  xs: 10,
  sm: 14,
  md: 20,
  lg: 24,
  xl: 32,
  full: 999,
} as const;

/**
 * Two families, one file per weight.
 *
 * Space Grotesk carries the display roles (titles, figures, the wordmark):
 * its squared, technical forms are most of what makes the Volt look read as
 * an instrument rather than a form. Inter carries everything you read.
 *
 * React Native does not synthesize weights from a single file the way CSS
 * does, so every variant names its family explicitly and nothing ever sets
 * a bare `fontWeight` (which would produce a faux-bold on one platform and
 * a different file on the other).
 */
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
  displayMedium: 'SpaceGrotesk_500Medium',
  displaySemibold: 'SpaceGrotesk_600SemiBold',
  displayBold: 'SpaceGrotesk_700Bold',
} as const;

export const typography = {
  numeral: { fontSize: 56, lineHeight: 58, letterSpacing: -2.4, fontFamily: fonts.displayBold },
  display: { fontSize: 34, lineHeight: 38, letterSpacing: -1.4, fontFamily: fonts.displayBold },
  title: { fontSize: 26, lineHeight: 31, letterSpacing: -0.9, fontFamily: fonts.displayBold },
  heading: { fontSize: 18, lineHeight: 24, letterSpacing: -0.3, fontFamily: fonts.displaySemibold },
  body: { fontSize: 15, lineHeight: 22, letterSpacing: -0.1, fontFamily: fonts.regular },
  callout: { fontSize: 14, lineHeight: 20, letterSpacing: -0.1, fontFamily: fonts.medium },
  caption: { fontSize: 12.5, lineHeight: 17, letterSpacing: 0, fontFamily: fonts.regular },
  overline: { fontSize: 11, lineHeight: 14, letterSpacing: 1.2, fontFamily: fonts.semibold },
  metric: { fontSize: 30, lineHeight: 34, letterSpacing: -1.1, fontFamily: fonts.displayBold },
} as const;

/** Reanimated timings. Short enough to feel immediate under a gloved thumb. */
export const motion = {
  fast: 140,
  normal: 220,
  slow: 320,
  /** Long, soft timing for figures that count up and rings that sweep. */
  reveal: 900,
  /** Matches the iOS spring the navigator uses, so transitions agree. */
  spring: { damping: 18, stiffness: 180, mass: 0.9 },
  /** A livelier spring with a touch of overshoot, for selection pills. */
  bouncy: { damping: 14, stiffness: 220, mass: 0.8 },
} as const;

/**
 * Elevation, as React Native shadow props. Light mode leans on these; dark
 * mode mostly separates planes by surface lightness instead, so the shadows
 * are deliberately faint there (the alpha already works on both).
 */
export const elevation = {
  card: {
    shadowColor: '#0D0F12',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1,
  },
  raised: {
    shadowColor: '#0D0F12',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  floating: {
    shadowColor: '#0D0F12',
    shadowOpacity: 0.14,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
} as const;

import type { ComplianceBand, Severity } from '@ahlan/shared';

/** Compliance band -> token key. Used by KPI cards, rings and charts alike. */
export function bandColor(band: ComplianceBand | null, palette: Palette): string {
  switch (band) {
    case 'EXCELLENT':
    case 'GOOD':
      return palette.success;
    case 'FAIR':
      return palette.warning;
    case 'POOR':
    case 'CRITICAL':
      return palette.danger;
    default:
      return palette.fgSubtle;
  }
}

export function severityColor(severity: Severity, palette: Palette): string {
  switch (severity) {
    case 'LOW':
      return palette.severityLow;
    case 'MEDIUM':
      return palette.severityMedium;
    case 'HIGH':
      return palette.severityHigh;
    case 'CRITICAL':
      return palette.severityCritical;
  }
}

/** Tailwind class for a severity pill background and text. */
export const severityClass: Record<Severity, string> = {
  LOW: 'bg-info-soft text-severity-low',
  MEDIUM: 'bg-warning-soft text-severity-medium',
  HIGH: 'bg-warning-soft text-severity-high',
  CRITICAL: 'bg-danger-soft text-severity-critical',
};
