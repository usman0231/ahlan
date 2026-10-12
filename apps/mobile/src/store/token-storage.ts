import * as SecureStore from 'expo-secure-store';

/**
 * Where the session tokens live.
 *
 * On a device this is SecureStore (Keychain / Keystore), because a refresh token
 * is a 30-day credential on a frequently-mislaid shared phone. The web build
 * swaps in `token-storage.web.ts`.
 */
export const tokenStorage = {
  get: (key: string) => SecureStore.getItemAsync(key),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  remove: (key: string) => SecureStore.deleteItemAsync(key),
};
