import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider, type Theme as NavigationTheme } from 'expo-router';
import * as SystemUI from 'expo-system-ui';
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { StyleSheet, useColorScheme, type TextStyle } from 'react-native';
import { componentTokens, type ComponentTokens } from './tokens/components';
import { themes, type Theme, type TextVariant, type TextToken } from './tokens/themes';

export interface AppTheme extends Theme {
  component: ComponentTokens;
  /** Ready-to-use text styles per variant, resolved for the font that actually loaded. */
  typography: Record<TextVariant, TextStyle>;
}

function textStyle(token: TextToken, customFont: boolean): TextStyle {
  return {
    fontSize: token.fontSize,
    lineHeight: token.lineHeight,
    letterSpacing: token.letterSpacing,
    textTransform: token.uppercase ? 'uppercase' : undefined,
    // Each Inter weight is its own font family; adding fontWeight on top would make platforms
    // synthesise a heavier face. Without the custom font, fall back to the system font's weights.
    ...(customFont ? { fontFamily: token.family } : { fontWeight: token.weight }),
  };
}

function buildTheme(base: Theme, customFont: boolean): AppTheme {
  const typography = Object.fromEntries(
    Object.entries(base.text).map(([k, v]) => [k, textStyle(v, customFont)]),
  ) as Record<TextVariant, TextStyle>;
  return { ...base, component: componentTokens(base), typography };
}

function navigationTheme(t: AppTheme): NavigationTheme {
  const base = t.scheme === 'dark' ? DarkTheme : DefaultTheme;
  const font = (variant: TextVariant, weight: '400' | '600' | '700') => ({
    fontFamily: t.typography[variant].fontFamily ?? base.fonts.regular.fontFamily,
    fontWeight: t.typography[variant].fontFamily ? ('400' as const) : weight,
  });
  return {
    dark: t.scheme === 'dark',
    colors: {
      primary: t.color.text.link,
      background: t.color.bg.canvas,
      card: t.color.bg.surface,
      text: t.color.text.primary,
      border: t.color.border.subtle,
      notification: t.color.status.danger.fg,
    },
    fonts: {
      regular: font('body', '400'),
      medium: font('bodyStrong', '600'),
      bold: font('heading', '600'),
      heavy: font('title', '700'),
    },
  };
}

const ThemeContext = createContext<AppTheme>(buildTheme(themes.light, false));

/**
 * Provides the light or dark theme, following the device setting, to the app and to Expo Router's
 * headers and tab bar. Also paints the root view (web page, area behind modals) in the canvas colour.
 */
export function DesignProvider({ customFont, children }: { customFont: boolean; children: ReactNode }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const theme = useMemo(() => buildTheme(themes[scheme], customFont), [scheme, customFont]);
  const navTheme = useMemo(() => navigationTheme(theme), [theme]);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.color.bg.canvas).catch(() => {});
  }, [theme]);

  return (
    <ThemeContext.Provider value={theme}>
      <NavigationThemeProvider value={navTheme}>{children}</NavigationThemeProvider>
    </ThemeContext.Provider>
  );
}

export function useTheme(): AppTheme {
  return useContext(ThemeContext);
}

/**
 * Defines a component's styles from the theme. Styles are created once per theme and cached, so
 * switching between light and dark does not rebuild them on every render.
 *
 *   const useStyles = makeStyles((t) => ({ row: { gap: t.space.sm } }));
 *   const styles = useStyles();
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(factory: (t: AppTheme) => T): () => T {
  const cache = new WeakMap<AppTheme, T>();
  return function useStyles() {
    const theme = useTheme();
    let styles = cache.get(theme);
    if (!styles) {
      styles = StyleSheet.create(factory(theme));
      cache.set(theme, styles);
    }
    return styles;
  };
}
