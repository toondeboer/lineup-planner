import { expect, test } from 'vitest';
import { BRAND_GREEN, CANVAS_DARK, CANVAS_LIGHT, LABEL, NAME } from '../../../app.config';
import easJson from '../../../eas.json';
import { APP_LABEL, APP_NAME } from '../../config/app';
import { darkTheme, lightTheme } from './themes';

// app.config.ts cannot import app modules, so it repeats these values; keep them in sync.
test('app.config.ts matches the app names and design tokens', () => {
  expect(NAME).toBe(APP_NAME);
  expect(LABEL).toBe(APP_LABEL);
  expect(BRAND_GREEN).toBe(lightTheme.color.action.primary.bg);
  expect(CANVAS_LIGHT).toBe(lightTheme.color.bg.canvas);
  expect(CANVAS_DARK).toBe(darkTheme.color.bg.canvas);
});

// eas submit names the App Store Connect record after this; without it, it would use the short label.
test('the store submission uses the full app name', () => {
  expect(easJson.submit.production.ios.appName).toBe(APP_NAME);
});

test('the home-screen label fits under an iOS icon', () => {
  expect(APP_LABEL.length).toBeLessThanOrEqual(12);
});
