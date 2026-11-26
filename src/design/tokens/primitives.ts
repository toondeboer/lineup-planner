/**
 * Layer 1: primitives. Raw values with no meaning attached.
 *
 * Only the theme files (themes.ts, components.ts) and the icon script read these. Screens and
 * components use the semantic tokens from `useTheme()` instead, so a value can change here without
 * touching any screen. app.config.ts repeats a few values; appConfig.test.ts keeps them in sync.
 *
 * Palette direction "Touchline": deep grass green with green-tinted greys.
 * Keep this file free of imports and TypeScript-only syntax beyond types and `as const`:
 * scripts/generate-icons.mjs loads it directly with Node.
 */

export const white = '#FFFFFF';
export const black = '#000000';

/** Green-tinted greys, light to dark. */
export const grey = {
  0: '#FFFFFF',
  25: '#F5F7F5',
  50: '#EDF1EE',
  75: '#E7EEE9',
  100: '#DCE3DE',
  300: '#9AA9A0',
  400: '#808D84',
  500: '#66786D',
  600: '#56635B',
  800: '#26312A',
  850: '#161E19',
  875: '#14201A',
  900: '#0E1411',
  950: '#0A0F0C',
} as const;

export const green = {
  50: '#E3F1E8',
  300: '#6FD497',
  400: '#5BC487',
  500: '#4AAE75',
  700: '#17693A',
  800: '#11522D',
  900: '#17301F',
  950: '#06210F',
} as const;

export const red = {
  50: '#FDECEA',
  300: '#FF8A80',
  700: '#B42318',
  950: '#3D1A18',
} as const;

export const amber = {
  50: '#FDF1DC',
  300: '#F0B54A',
  800: '#8A5300',
  950: '#3A2A0E',
} as const;

/** The pitch has its own greens, separate from the brand green, so the lineup stays readable. */
export const grass = {
  light: '#276B43',
  lightStripe: '#2C7449',
  dark: '#1F5A39',
  darkStripe: '#225F3D',
  line: 'rgba(255,255,255,0.72)',
  highlight: '#FFD54A',
  empty: 'rgba(0,0,0,0.27)',
} as const;

/**
 * One colour per rotation group. Dark enough for a white label (at least 4.5:1); each disc also
 * gets a white ring, because none of these stands out against the grass on its own.
 */
export const groupPalette = [
  '#C62828', // A red
  '#1565C0', // B blue
  '#B45309', // C amber
  '#6A1B9A', // D purple
  '#00695C', // E teal
  '#5D4037', // F brown
  '#AD1457', // G raspberry
  '#283593', // H indigo
  '#4D7C0F', // I olive
  '#37474F', // J slate
] as const;

/** Inter, loaded with expo-font. The keys are the names `useFonts` registers. */
export const fontFamily = {
  regular: 'Inter_400Regular',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

/**
 * Text inside the pitch SVG. The pitch is also turned into the PNG that gets shared, and a web
 * font is not available when the browser rasterises that SVG, so this uses fonts every device has.
 */
export const svgFontStack = 'Arial, Helvetica, sans-serif';

/** 4-point spacing scale. */
export const spaceScale = [0, 2, 4, 8, 12, 16, 24, 32, 48] as const;

export const radiusScale = { sm: 6, md: 10, lg: 14, full: 999 } as const;

export const durationMs = { fast: 120, normal: 200 } as const;
