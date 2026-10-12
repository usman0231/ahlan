import { render, type RenderOptions } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { ReactElement } from 'react';

import { ThemeProvider } from '../theme/theme-provider';
import { initI18n } from '../i18n';

const i18n = initI18n();

/**
 * Renders a component inside the providers it actually needs.
 *
 * Every component reads theme tokens and translated copy, so testing one
 * without these would mean testing something the app never renders.
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  return render(ui, {
    wrapper: ({ children }) => (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        <I18nextProvider i18n={i18n}>
          <ThemeProvider>{children}</ThemeProvider>
        </I18nextProvider>
      </SafeAreaProvider>
    ),
    ...options,
  });
}

export { i18n };
