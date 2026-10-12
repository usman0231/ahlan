import { create } from 'zustand';
import { tokenStorage } from './token-storage';
import type { AuthSession, AuthUser, LoginInput, RegisterInput } from '@ahlan/shared';

import { api, registerAuthHandlers, ApiError } from '../api/client';
import { canManage } from '../features/admin/roles';

const ACCESS_KEY = 'ahlan.accessToken';
const REFRESH_KEY = 'ahlan.refreshToken';
const USER_KEY = 'ahlan.user';

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  /** False until the stored session has been read back from SecureStore. */
  restored: boolean;
  signingIn: boolean;

  restore: () => Promise<void>;
  signIn: (input: LoginInput) => Promise<AuthUser>;
  register: (input: RegisterInput) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<boolean>;
  setUser: (user: AuthUser) => void;
  isAdmin: () => boolean;
}

/**
 * The session.
 *
 * Tokens go through `tokenStorage`, which is SecureStore (Keychain / Keystore)
 * on a device - never AsyncStorage, because a refresh token is a 30-day
 * credential and an inspector's phone is a shared, frequently-mislaid device.
 */
export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  restored: false,
  signingIn: false,

  restore: async () => {
    try {
      const [accessToken, refreshToken, rawUser] = await Promise.all([
        tokenStorage.get(ACCESS_KEY),
        tokenStorage.get(REFRESH_KEY),
        tokenStorage.get(USER_KEY),
      ]);

      set({
        accessToken,
        refreshToken,
        user: rawUser ? (JSON.parse(rawUser) as AuthUser) : null,
        restored: true,
      });

      // The access token is short-lived, so a cold start almost always needs a
      // refresh. Doing it here means the first screen renders signed in.
      if (refreshToken) await get().refresh();
    } catch {
      // A corrupt or unreadable keychain entry should land on sign-in, not crash.
      set({ accessToken: null, refreshToken: null, user: null, restored: true });
    }
  },

  signIn: async (input) => {
    set({ signingIn: true });
    try {
      const session = await api.post<AuthSession>('/auth/login', input, { anonymous: true });
      await persist(session);
      set({
        user: session.user,
        accessToken: session.tokens.accessToken,
        refreshToken: session.tokens.refreshToken,
      });
      return session.user;
    } finally {
      set({ signingIn: false });
    }
  },

  register: async (input) => {
    await api.post('/auth/register', input, { anonymous: true });
  },

  signOut: async () => {
    // Best effort: a failed call must not trap the user in a signed-in state.
    try {
      await api.post('/auth/logout');
    } catch {
      // Already revoked, or offline.
    }
    await clearPersisted();
    set({ user: null, accessToken: null, refreshToken: null });
  },

  refresh: async () => {
    const token = get().refreshToken;
    if (!token) return false;

    try {
      const session = await api.post<AuthSession>(
        '/auth/refresh',
        { refreshToken: token },
        { anonymous: true },
      );
      await persist(session);
      set({
        user: session.user,
        accessToken: session.tokens.accessToken,
        refreshToken: session.tokens.refreshToken,
      });
      return true;
    } catch (error) {
      // Offline is not a reason to sign out: the stored session is still valid,
      // and the app works from the local database until the network returns.
      if (error instanceof ApiError && error.isOffline) return false;
      // Nor is a server fault: only a refused token means the session is gone.
      if (error instanceof ApiError && error.status >= 500) return false;

      await forceSignOut();
      return false;
    }
  },

  setUser: (user) => {
    void tokenStorage.set(USER_KEY, JSON.stringify(user));
    set({ user });
  },

  isAdmin: () => canManage(get().user?.role),
}));

async function persist(session: AuthSession): Promise<void> {
  await Promise.all([
    tokenStorage.set(ACCESS_KEY, session.tokens.accessToken),
    tokenStorage.set(REFRESH_KEY, session.tokens.refreshToken),
    tokenStorage.set(USER_KEY, JSON.stringify(session.user)),
  ]);
}

/**
 * The session was ended by the server (role changed, password reset, token
 * revoked or expired), not by the user. Same outcome as a manual sign-out:
 * tokens gone and the local database wiped, so the next person to sign in on
 * this phone never sees the previous user's records. Imported lazily because
 * the database layer reads this store.
 */
async function forceSignOut(): Promise<void> {
  await clearPersisted();
  useAuthStore.setState({ user: null, accessToken: null, refreshToken: null });
  try {
    const { resetDatabase } = await import('../db');
    await resetDatabase();
  } catch (error) {
    console.warn('[auth] local database wipe after forced sign-out failed', error);
  }
}

async function clearPersisted(): Promise<void> {
  await Promise.all([
    tokenStorage.remove(ACCESS_KEY),
    tokenStorage.remove(REFRESH_KEY),
    tokenStorage.remove(USER_KEY),
  ]);
}

/**
 * Hands the client its token accessors. Called once from the root layout,
 * before anything can issue a request.
 */
export function wireAuthToApiClient(): void {
  registerAuthHandlers({
    getAccessToken: () => useAuthStore.getState().accessToken,
    refresh: () => useAuthStore.getState().refresh(),
    onUnauthenticated: () => {
      void forceSignOut();
    },
  });
}
