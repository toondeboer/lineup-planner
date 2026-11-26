import type { ExpoConfig } from 'expo/config';

/**
 * Expo app config.
 *
 * Expo's config loader cannot import the app's TypeScript modules, so the few values shared with
 * the app are repeated here. `src/design/tokens/appConfig.test.ts` fails when they drift from
 * src/config/app.ts (names) and the design tokens (colours). The icon PNGs in assets/ are generated
 * from the same tokens with `npm run icons`.
 */
export const NAME = 'Bench Logistics'; // APP_NAME: stores, browser tab, in-app copy
export const LABEL = 'Bench Log'; // APP_LABEL: under the home-screen icon
export const BRAND_GREEN = '#17693A'; // green[700], action.primary.bg (light)
export const CANVAS_LIGHT = '#F5F7F5'; // grey[25], bg.canvas (light)
export const CANVAS_DARK = '#0E1411'; // grey[900], bg.canvas (dark)

/**
 * The iOS bundle identifier and Android package. Permanent once the app is in a store.
 * Development builds (eas.json profiles with APP_VARIANT=development) get a `.dev` suffix and their
 * own label, so they can be installed next to the store version.
 */
export const APP_ID = 'com.toondeboer.benchlogistics';
const IS_DEV = process.env.APP_VARIANT === 'development';
const appId = IS_DEV ? `${APP_ID}.dev` : APP_ID;

const config: ExpoConfig = {
  // `name` is the label under the home-screen icon. The App Store and Play Store listing names are
  // set in App Store Connect and the Play Console: use NAME there.
  name: IS_DEV ? `${LABEL} Dev` : LABEL,
  slug: 'bench-logistics',
  // the EAS project (expo.dev/@toondeboer98/bench-logistics); `eas init` can't write to a dynamic
  // config, so the ID it printed is set here by hand
  owner: 'toondeboer98',
  extra: {
    eas: { projectId: '043a92e5-ca7f-4a4c-a51f-dc2927215902' },
  },
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  // follow the device's light or dark setting (Android needs expo-system-ui for this)
  userInterfaceStyle: 'automatic',
  backgroundColor: CANVAS_LIGHT,
  ios: {
    bundleIdentifier: appId,
    supportsTablet: true,
    icon: {
      light: './assets/icon.png',
      dark: './assets/icon-dark.png',
      tinted: './assets/icon-tinted.png',
    },
  },
  android: {
    package: appId,
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
    shortName: LABEL,
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
