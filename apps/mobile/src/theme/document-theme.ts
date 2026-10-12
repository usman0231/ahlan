import type { ThemeName } from './tokens';

/**
 * Reflects the active theme onto the document root.
 *
 * A no-op on a device: there is no document, and NativeWind resolves the
 * `dark:` variants and the token variables in JavaScript. The web build has a
 * real implementation in `document-theme.web.ts`.
 */
export function applyDocumentTheme(_theme: ThemeName): void {
  // Intentionally empty on native.
}
