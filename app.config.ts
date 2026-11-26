import type { ExpoConfig } from 'expo/config';

/**
 * Expo app config.
 *
 * Expo's config loader cannot import the app's TypeScript modules, so the few values shared with
 * the app are repeated here. `src/design/tokens/appConfig.test.ts` fails when they drift from
 * src/config/app.ts (name) and the design tokens (colours). The icon PNGs in assets/ are generated
 * from the same tokens with `npm run icons`.
 */
export const NAME = 'Lineup Planner'; // APP_NAME
export const BRAND_GREEN = '#17693A'; // green[700], action.primary.bg (light)
export const CANVAS_LIGHT = '#F5F7F5'; // grey[25], bg.canvas (light)
export const CANVAS_DARK = '#0E1411'; // grey[900], bg.canvas (dark)

const config: ExpoConfig = {
  name: NAME,
  slug: 'lineup-planner',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  // follow the device's light or dark setting (Android needs expo-system-ui for this)
  userInterfaceStyle: 'automatic',
  backgroundColor: CANVAS_LIGHT,
  ios: {
    supportsTablet: true,
    icon: {
      light: './assets/icon.png',
      dark: './assets/icon-dark.png',
      tinted: './assets/icon-tinted.png',
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: BRAND_GREEN,
      foregroundImage: './assets/android-icon-foreground.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    bundler: 'metro',
    output: 'single',
    favicon: './assets/favicon.png',
    name: NAME,
    themeColor: BRAND_GREEN,
    backgroundColor: CANVAS_LIGHT,
  },
  // kept as `lineup-planner`: invite links already sent use this scheme
  scheme: 'lineup-planner',
  plugins: [
    // SDK 58 loads each web screen on first visit by default. Coaches use the app on the
    // sideline with patchy signal, so ship every screen up front and keep it working offline.
    ['expo-router', { asyncRoutes: { web: false } }],
    'expo-font',
    'expo-system-ui',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 160,
        backgroundColor: CANVAS_LIGHT,
        dark: { image: './assets/splash-icon-dark.png', backgroundColor: CANVAS_DARK },
      },
    ],
  ],
};

export default config;
