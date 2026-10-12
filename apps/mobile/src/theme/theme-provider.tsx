import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useColorScheme as useNativeWindColorScheme, colorScheme } from 'nativewind';
import { I18nManager } from 'react-native';
import * as SystemUI from 'expo-system-ui';

import { palettes, type Palette, type ThemeName } from './tokens';
import { applyDocumentTheme } from './document-theme';
import { useSettingsStore } from '../store/settings';

interface ThemeValue {
  /** The theme actually in effect, after resolving `system`. */
  name: ThemeName;
  palette: Palette;
  isDark: boolean;
  isRtl: boolean;
}

const ThemeContext = createContext<ThemeValue | null>(null);

/**
 * Resolves the active theme and keeps three things in step with it: the
 * NativeWind class scheme (so Tailwind classes switch), the native window
 * background (so there is no white flash behind a dark screen on push), and
 * RTL layout for Arabic.
 */
export function ThemeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const preference = useSettingsStore((state) => state.theme);
  const locale = useSettingsStore((state) => state.locale);
  const { colorScheme: active } = useNativeWindColorScheme();

  // `contrast` is our own theme, so it is applied as dark/light plus a token
  // override; NativeWind only knows about the two.
  const resolved: ThemeName =
    preference === 'contrast' ? 'contrast' : preference === 'system' ? (active ?? 'light') : preference;

  useEffect(() => {
    colorScheme.set(preference === 'system' ? 'system' : resolved === 'dark' ? 'dark' : 'light');
    // NativeWind only knows light and dark, and only drives its own
    // utilities. The token variables themselves are keyed off the document
    // root in a browser, and `contrast` is ours alone, so the resolved theme
    // is written there too.
    applyDocumentTheme(resolved);
  }, [preference, resolved]);

  const palette = palettes[resolved];

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(palette.bg);
  }, [palette.bg]);

  const isRtl = locale === 'ar';

  useEffect(() => {
    // Takes effect on the next app launch; the layouts use start/end so the
    // current session stays usable either way.
    I18nManager.allowRTL(isRtl);
    if (I18nManager.isRTL !== isRtl) I18nManager.forceRTL(isRtl);
  }, [isRtl]);

  const value = useMemo<ThemeValue>(
    () => ({ name: resolved, palette, isDark: resolved === 'dark', isRtl }),
    [resolved, palette, isRtl],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside <ThemeProvider>');
  return value;
}

/** Shorthand for the common case of reaching for one colour. */
export function usePalette(): Palette {
  return useTheme().palette;
}
