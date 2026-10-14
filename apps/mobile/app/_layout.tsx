import '../global.css';
import 'react-native-gesture-handler';

import { useEffect, useState } from 'react';
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as NavigationThemeProvider,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/inter';
import {
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';

import { ThemeProvider, useTheme } from '../src/theme/theme-provider';
import { applyLocale, initI18n } from '../src/i18n';
import { useAuthStore, wireAuthToApiClient } from '../src/store/auth';
import { useSettingsStore } from '../src/store/settings';
import { ApiError } from '../src/api/client';

void SplashScreen.preventAutoHideAsync();

const i18n = initI18n();

/**
 * React Query, for the server-backed admin screens.
 *
 * Inspector screens read from WatermelonDB instead, so the retry policy here is
 * about an administrator on a flaky office connection: retry twice, but never
 * retry something the server has already rejected on its merits.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (error instanceof ApiError) {
          if (error.isAuthError) return false;
          if (error.status >= 400 && error.status < 500) return false;
        }
        return failureCount < 2;
      },
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 0 },
  },
});

export default function RootLayout(): React.JSX.Element | null {
  const [ready, setReady] = useState(false);
  // Inter for reading, Space Grotesk for display, Syne for the wordmark;
  // nothing renders until all are in, so the first frame is never a
  // system-font flash.
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    // Bundled rather than an @expo-google-fonts package: one weight, used
    // only by the wordmark (assets/fonts/Syne-OFL.txt).
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro bundles static assets through require().
    Syne_800ExtraBold: require('../assets/fonts/Syne_800ExtraBold.ttf'),
  });
  const restore = useAuthStore((state) => state.restore);
  const settingsHydrated = useSettingsStore((state) => state.hydrated);
  const locale = useSettingsStore((state) => state.locale);

  // The API client needs its token accessors before anything can fetch.
  useEffect(() => {
    wireAuthToApiClient();
  }, []);

  useEffect(() => {
    applyLocale(locale);
  }, [locale]);

  useEffect(() => {
    async function boot(): Promise<void> {
      await restore();
      setReady(true);
    }
    void boot();
  }, [restore]);

  useEffect(() => {
    // Held until the session, the theme preference and the typeface are all
    // known, so the first frame is the right theme, screen and font.
    if (ready && settingsHydrated && fontsLoaded) void SplashScreen.hideAsync();
  }, [ready, settingsHydrated, fontsLoaded]);

  if (!ready || !settingsHydrated || !fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <I18nextProvider i18n={i18n}>
            <ThemeProvider>
              <ThemedStatusBar />
              <ThemedNavigation>
                <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
                  <Stack.Screen name="index" />
                  <Stack.Screen name="(auth)" />
                  <Stack.Screen name="(inspector)" />
                  <Stack.Screen name="(admin)" />
                  <Stack.Screen name="change-password" />
                </Stack>
              </ThemedNavigation>
            </ThemeProvider>
          </I18nextProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function ThemedStatusBar(): React.JSX.Element {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

/**
 * The navigator's own colours, from our tokens. Without this the containers
 * behind screens keep React Navigation's default light gray, which shows as a
 * band around the floating tab dock and flashes on push in dark mode.
 */
function ThemedNavigation({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { isDark, palette } = useTheme();
  const base = isDark ? DarkTheme : DefaultTheme;
  return (
    <NavigationThemeProvider
      value={{
        ...base,
        colors: {
          ...base.colors,
          primary: palette.primary,
          background: palette.bg,
          card: palette.surface,
          text: palette.fg,
          border: palette.border,
          notification: palette.danger,
        },
      }}
    >
      {children}
    </NavigationThemeProvider>
  );
}
