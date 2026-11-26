import { expect, test } from 'vitest';
import { BRAND_GREEN, CANVAS_DARK, CANVAS_LIGHT, NAME } from '../../../app.config';
import { APP_NAME } from '../../config/app';
import { darkTheme, lightTheme } from './themes';

// app.config.ts cannot import app modules, so it repeats these values; keep them in sync.
test('app.config.ts matches the app name and design tokens', () => {
  expect(NAME).toBe(APP_NAME);
  expect(BRAND_GREEN).toBe(lightTheme.color.action.primary.bg);
  expect(CANVAS_LIGHT).toBe(lightTheme.color.bg.canvas);
  expect(CANVAS_DARK).toBe(darkTheme.color.bg.canvas);
});
