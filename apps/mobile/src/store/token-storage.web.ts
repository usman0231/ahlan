/**
 * Token storage for the web preview.
 *
 * SecureStore has no browser implementation. `localStorage` is NOT an
 * acceptable place for a refresh token in a real web app - it is readable by
 * any script on the origin - and this file exists only so the UI can be
 * reviewed in a browser. The shipping app is a native dev build and uses
 * `token-storage.ts`, which is backed by the Keychain / Keystore.
 */
function safe<T>(action: () => T, fallback: T): T {
  try {
    return action();
  } catch {
    // Private windows and blocked site data both throw here.
    return fallback;
  }
}

export const tokenStorage = {
  get: (key: string) => Promise.resolve(safe(() => window.localStorage.getItem(key), null)),
  set: (key: string, value: string) =>
    Promise.resolve(safe(() => window.localStorage.setItem(key, value), undefined)),
  remove: (key: string) =>
    Promise.resolve(safe(() => window.localStorage.removeItem(key), undefined)),
};
