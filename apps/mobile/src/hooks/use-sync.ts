import { useCallback, useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

import { countPendingRecords, runSync } from '../db/sync';
import { useSyncStore } from '../store/sync';
import { useAuthStore } from '../store/auth';

const INTERVAL_MS =
  Number(process.env.EXPO_PUBLIC_SYNC_INTERVAL_SECONDS ?? '120') * 1000;

/**
 * Keeps the device in step with the server.
 *
 * Three triggers, in order of usefulness:
 *   - the connection comes back, which is the moment a day's queued work can go
 *   - the app returns to the foreground
 *   - a timer, while the app is open
 *
 * Mounted once, from the authenticated layout.
 */
export function useSyncEngine(): void {
  const signedIn = useAuthStore((state) => Boolean(state.user));
  const setOnline = useSyncStore((state) => state.setOnline);
  const setPendingCount = useSyncStore((state) => state.setPendingCount);
  const wasOffline = useRef(false);

  const sync = useCallback(async () => {
    if (!useAuthStore.getState().user) return;
    await runSync();
    setPendingCount(await countPendingRecords());
  }, [setPendingCount]);

  // Connectivity.
  useEffect(() => {
    if (!signedIn) return;

    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      setOnline(online);

      // Only sync on the transition back to online, not on every NetInfo tick.
      if (online && wasOffline.current) {
        wasOffline.current = false;
        void sync();
      }
      if (!online) wasOffline.current = true;
    });

    return unsubscribe;
  }, [signedIn, setOnline, sync]);

  // Foreground.
  useEffect(() => {
    if (!signedIn) return;

    const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status === 'active') void sync();
    });

    return () => subscription.remove();
  }, [signedIn, sync]);

  // Interval, plus one pass on mount.
  useEffect(() => {
    if (!signedIn) return;

    void sync();
    const timer = setInterval(() => void sync(), INTERVAL_MS);
    return () => clearInterval(timer);
  }, [signedIn, sync]);
}

/** Manual sync, for pull-to-refresh and the Settings button. */
export function useManualSync() {
  const status = useSyncStore((state) => state.status);
  const setPendingCount = useSyncStore((state) => state.setPendingCount);

  const sync = useCallback(async () => {
    const outcome = await runSync();
    setPendingCount(await countPendingRecords());
    return outcome;
  }, [setPendingCount]);

  return { sync, syncing: status === 'syncing' };
}
