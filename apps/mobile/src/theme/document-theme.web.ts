import type { ThemeName } from './tokens';

/**
 * Reflects the active theme onto the document root, for the web build.
 *
 * `global.css` declares the dark and high-contrast tokens under
 * `.dark:root, :root[data-theme='dark']` and `:root[data-theme='contrast']`.
 * On a device NativeWind resolves those in JavaScript, but in a browser they
 * are ordinary CSS selectors and something has to make them match - and
 * nothing did, so every surface stayed on the light tokens while
 * `usePalette()` handed components the dark ones. That is why a dark-mode
 * browser showed near-white icons on a white card.
 *
 * `colorScheme.set()` only drives NativeWind's own `dark:` utilities, and it
 * knows nothing about `contrast`, which is our third theme rather than one of
 * its two. Setting `data-theme` covers all three, and the `dark` class keeps
 * the `dark:` variants in CSS in step with it.
 */
export function applyDocumentTheme(theme: ThemeName): void {
  const root = globalThis.document?.documentElement;
  if (!root) return;

  root.setAttribute('data-theme', theme);
  root.classList.toggle('dark', theme === 'dark');
}
