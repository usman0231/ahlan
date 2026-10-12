import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

import en from './en.json';
import ar from './ar.json';
import { useSettingsStore, type Locale } from '../store/settings';

export const SUPPORTED_LOCALES: Locale[] = ['en', 'ar'];

/** The device language if we support it, otherwise English. */
export function deviceLocale(): Locale {
  const tag = getLocales()[0]?.languageCode ?? 'en';
  return (SUPPORTED_LOCALES as string[]).includes(tag) ? (tag as Locale) : 'en';
}

/**
 * i18next, initialised once at startup.
 *
 * Every user-facing string in the app comes from here - there are no hard-coded
 * strings in a component. Server error codes map to `errors.<CODE>`, which is
 * why the API returns a stable code rather than a sentence.
 */
export function initI18n(): typeof i18n {
  if (i18n.isInitialized) return i18n;

  void i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      ar: { translation: ar },
    },
    lng: useSettingsStore.getState().locale || deviceLocale(),
    fallbackLng: 'en',
    // React escapes for us; i18next doing it again mangles apostrophes.
    interpolation: { escapeValue: false },
    returnNull: false,
    compatibilityJSON: 'v4',
  });

  return i18n;
}

/** Keeps i18next in step with the stored preference. */
export function applyLocale(locale: Locale): void {
  void i18n.changeLanguage(locale);
}

export { i18n };
export default i18n;
