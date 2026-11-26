/**
 * Layer 2: semantic tokens. Every value names a role (canvas, muted text, primary action),
 * with one value for the light theme and one for the dark theme. Screens use only these,
 * through `useTheme()` or `makeStyles()`.
 */
import * as p from './primitives';

export type ColorScheme = 'light' | 'dark';

export type TextVariant =
  | 'display'
  | 'title'
  | 'heading'
  | 'body'
  | 'bodyStrong'
  | 'small'
  | 'label'
  | 'caption'
  | 'overline';

export interface TextToken {
  fontSize: number;
  lineHeight: number;
  /** The Inter face to use; it carries the weight. */
  family: (typeof p.fontFamily)[keyof typeof p.fontFamily];
  /** Used only when the custom font is unavailable and the system font is shown instead. */
  weight: '400' | '600' | '700';
  letterSpacing?: number;
  uppercase?: boolean;
}

export interface StatusColors {
  /** Text and icons. */
  fg: string;
  /** A tinted background the `fg` colour is readable on. */
  bg: string;
}

export interface ActionColors {
  bg: string;
  bgPressed: string;
  fg: string;
  border: string;
}

export interface ThemeColors {
  bg: { canvas: string; surface: string; sunken: string };
  text: { primary: string; muted: string; link: string; onAction: string };
  border: { subtle: string; input: string; focus: string };
  action: {
    primary: ActionColors;
    secondary: ActionColors;
    danger: ActionColors;
    disabled: { bg: string; fg: string };
    /** A selected chip or option. */
    selected: { bg: string; fg: string };
    /** The soft halo around a focused input. */
    focusRing: string;
  };
  status: { success: StatusColors; warning: StatusColors; danger: StatusColors };
  pitch: {
    grass: string;
    stripe: string;
    line: string;
    label: string;
    labelSoft: string;
    markerRing: string;
    markerEmpty: string;
    selected: string;
    /** Players who play the whole match are not in a rotation group. */
    fullTime: string;
    fullTimeLabel: string;
    groups: readonly string[];
    groupLabel: string;
  };
}

export interface Theme {
  scheme: ColorScheme;
  color: ThemeColors;
  space: { none: number; xxs: number; xs: number; sm: number; md: number; lg: number; xl: number; xxl: number; xxxl: number };
  radius: typeof p.radiusScale;
  borderWidth: { hairline: number; thin: number; thick: number };
  size: {
    /** Minimum height and width of anything pressable (Apple HIG, WCAG 2.5.8 enhanced). */
    touchTarget: number;
    contentMaxWidth: number;
    groupBadge: number;
    icon: number;
  };
  text: Record<TextVariant, TextToken>;
  font: { svg: string };
  motion: typeof p.durationMs;
  /** Content that is about to be replaced, such as a plan being recalculated. */
  opacity: { pending: number };
}

const [none, xxs, xs, sm, md, lg, xl, xxl, xxxl] = p.spaceScale;

const text: Record<TextVariant, TextToken> = {
  display: { fontSize: 28, lineHeight: 34, family: p.fontFamily.bold, weight: '700', letterSpacing: -0.3 },
  title: { fontSize: 22, lineHeight: 28, family: p.fontFamily.bold, weight: '700', letterSpacing: -0.2 },
  heading: { fontSize: 17, lineHeight: 24, family: p.fontFamily.semibold, weight: '600' },
  body: { fontSize: 16, lineHeight: 24, family: p.fontFamily.regular, weight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 24, family: p.fontFamily.semibold, weight: '600' },
  small: { fontSize: 14, lineHeight: 20, family: p.fontFamily.regular, weight: '400' },
  label: { fontSize: 14, lineHeight: 20, family: p.fontFamily.semibold, weight: '600' },
  caption: { fontSize: 13, lineHeight: 18, family: p.fontFamily.regular, weight: '400' },
  overline: { fontSize: 11, lineHeight: 16, family: p.fontFamily.semibold, weight: '600', letterSpacing: 0.9, uppercase: true },
};

const shared = {
  space: { none, xxs, xs, sm, md, lg, xl, xxl, xxxl },
  radius: p.radiusScale,
  borderWidth: { hairline: 0.5, thin: 1, thick: 2 },
  size: { touchTarget: 44, contentMaxWidth: 640, groupBadge: 22, icon: 22 },
  text,
  font: { svg: p.svgFontStack },
  motion: p.durationMs,
  opacity: { pending: 0.5 },
} as const;

const pitchCommon = {
  line: p.grass.line,
  label: p.white,
  labelSoft: 'rgba(255,255,255,0.85)',
  markerRing: p.white,
  markerEmpty: p.grass.empty,
  selected: p.grass.highlight,
  fullTime: p.white,
  fullTimeLabel: p.grey[875],
  groups: p.groupPalette,
  groupLabel: p.white,
};

export const lightTheme: Theme = {
  scheme: 'light',
  ...shared,
  color: {
    bg: { canvas: p.grey[25], surface: p.grey[0], sunken: p.grey[50] },
    text: { primary: p.grey[875], muted: p.grey[600], link: p.green[700], onAction: p.white },
    border: { subtle: p.grey[100], input: p.grey[400], focus: p.green[700] },
    action: {
      primary: { bg: p.green[700], bgPressed: p.green[800], fg: p.white, border: p.green[700] },
      secondary: { bg: p.grey[0], bgPressed: p.grey[50], fg: p.grey[875], border: p.grey[400] },
      danger: { bg: p.grey[0], bgPressed: p.red[50], fg: p.red[700], border: p.red[700] },
      disabled: { bg: p.grey[50], fg: p.grey[600] },
      selected: { bg: p.green[700], fg: p.white },
      focusRing: p.green[50],
    },
    status: {
      success: { fg: p.green[700], bg: p.green[50] },
      warning: { fg: p.amber[800], bg: p.amber[50] },
      danger: { fg: p.red[700], bg: p.red[50] },
    },
    pitch: { ...pitchCommon, grass: p.grass.light, stripe: p.grass.lightStripe },
  },
};

export const darkTheme: Theme = {
  scheme: 'dark',
  ...shared,
  color: {
    bg: { canvas: p.grey[900], surface: p.grey[850], sunken: p.grey[950] },
    text: { primary: p.grey[75], muted: p.grey[300], link: p.green[300], onAction: p.green[950] },
    border: { subtle: p.grey[800], input: p.grey[500], focus: p.green[400] },
    action: {
      primary: { bg: p.green[400], bgPressed: p.green[500], fg: p.green[950], border: p.green[400] },
      secondary: { bg: p.grey[850], bgPressed: p.grey[800], fg: p.grey[75], border: p.grey[500] },
      danger: { bg: p.grey[850], bgPressed: p.red[950], fg: p.red[300], border: p.red[300] },
      disabled: { bg: p.grey[950], fg: p.grey[300] },
      selected: { bg: p.green[400], fg: p.green[950] },
      focusRing: p.green[900],
    },
    status: {
      success: { fg: p.green[400], bg: p.green[900] },
      warning: { fg: p.amber[300], bg: p.amber[950] },
      danger: { fg: p.red[300], bg: p.red[950] },
    },
    pitch: { ...pitchCommon, grass: p.grass.dark, stripe: p.grass.darkStripe },
  },
};

export const themes: Record<ColorScheme, Theme> = { light: lightTheme, dark: darkTheme };

/** The letter shown for a rotation group: A, B, C … */
export function groupLetter(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}

/** The colour of a rotation group, or the full-match colour when the player is in no group. */
export function groupColor(theme: Theme, index: number | undefined): string {
  const { groups, fullTime } = theme.color.pitch;
  return index === undefined ? fullTime : groups[index % groups.length];
}
