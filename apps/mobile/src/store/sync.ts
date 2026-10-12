import { create } from 'zustand';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

interface SyncState {
  status: SyncStatus;
  lastSyncedAt: number | null;
  /** The last failure's error code, for the banner copy. */
  error: string | null;
  /** Records created on this device that the server has not accepted yet. */
  pendingCount: number;
  /** Whether the device currently has a usable connection. */
  online: boolean;
  /** Photos whose upload failed (FAILED rows); shown as a tap-to-retry banner. */
  failedUploads: number;

  setStatus: (status: SyncStatus) => void;
  setLastSyncedAt: (timestamp: number) => void;
  setError: (code: string | null) => void;
  setPendingCount: (count: number) => void;
  setOnline: (online: boolean) => void;
  setFailedUploads: (count: number) => void;
}

/**
 * Sync status for the UI.
 *
 * Kept out of React Query on purpose: this is device state, it changes from a
 * background timer and from NetInfo, and every screen's offline banner reads it.
 */
export const useSyncStore = create<SyncState>()((set) => ({
  status: 'idle',
  lastSyncedAt: null,
  error: null,
  pendingCount: 0,
  online: true,
  failedUploads: 0,

  setStatus: (status) => set({ status, ...(status !== 'error' ? { error: null } : {}) }),
  setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
  setError: (error) => set({ error }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
  setFailedUploads: (failedUploads) => set({ failedUploads }),
  setOnline: (online) =>
    set((state) => ({
      online,
      // Coming back online clears a stale offline banner immediately.
      status: online && state.status === 'offline' ? 'idle' : state.status,
    })),
}));
