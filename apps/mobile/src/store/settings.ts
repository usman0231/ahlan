import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemePreference = 'system' | 'light' | 'dark' | 'contrast';
export type Locale = 'en' | 'ar';

interface SettingsState {
  theme: ThemePreference;
  locale: Locale;
  /** Haptic feedback on answer, submit and status change. */
  hapticsEnabled: boolean;
  /** Only sync photo uploads on an unmetered connection. */
  wifiOnlyUploads: boolean;
  hydrated: boolean;

  setTheme: (theme: ThemePreference) => void;
  setLocale: (locale: Locale) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setWifiOnlyUploads: (enabled: boolean) => void;
}

/**
 * Device-local preferences. Persisted so the inspector's choices survive a
 * restart, which matters most for the high-contrast theme: somebody who turned
 * it on because they cannot read the screen in sunlight should not have to find
 * it again tomorrow.
 */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      locale: 'en',
      hapticsEnabled: true,
      wifiOnlyUploads: false,
      hydrated: false,

      setTheme: (theme) => set({ theme }),
      setLocale: (locale) => set({ locale }),
      setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
      setWifiOnlyUploads: (wifiOnlyUploads) => set({ wifiOnlyUploads }),
    }),
    {
      name: 'ahlan.settings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        theme: state.theme,
        locale: state.locale,
        hapticsEnabled: state.hapticsEnabled,
        wifiOnlyUploads: state.wifiOnlyUploads,
      }),
      // Screens wait on `hydrated` so they never render light-theme first and
      // then flip to dark a frame later.
      onRehydrateStorage: () => () => {
        useSettingsStore.setState({ hydrated: true });
      },
    },
  ),
);
