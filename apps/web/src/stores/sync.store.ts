import { create } from 'zustand';
import { closeAllUserDbs, getUserDb } from '@/db/user-db';
import { ApiError, NetworkError } from '@/lib/api/errors';
import { useSessionStore } from '@/stores/session.store';
import { syncNow, type SyncRunSummary } from '@/sync/engine';

export type SyncPhase = 'idle' | 'syncing' | 'error';

export interface SyncUiState {
  phase: SyncPhase;
  lastError: string | null;
  lastSyncedAt: string | null;
  outboxDialogOpen: boolean;

  setOutboxDialogOpen: (open: boolean) => void;
  triggerSync: (options?: { reset?: boolean; quiet?: boolean }) => Promise<SyncRunSummary | null>;
  clearError: () => void;
}

export const useSyncStore = create<SyncUiState>((set) => ({
  phase: 'idle',
  lastError: null,
  lastSyncedAt: null,
  outboxDialogOpen: false,

  setOutboxDialogOpen: (open) => set({ outboxDialogOpen: open }),

  clearError: () => set({ lastError: null }),

  triggerSync: async (options) => {
    const session = useSessionStore.getState();
    if (session.status !== 'authenticated' || !session.user) {
      return null;
    }

    set({ phase: 'syncing', lastError: null });
    try {
      const summary = await syncNow(session.user.id, { reset: options?.reset });
      set({
        phase: 'idle',
        lastError: null,
        lastSyncedAt: summary.lastPullAt,
      });
      return summary;
    } catch (err) {
      const message =
        err instanceof NetworkError
          ? 'Serveur inaccessible. Les modifications restent enregistrées localement.'
          : err instanceof ApiError
            ? err.message
            : 'Erreur lors de la synchronisation.';

      set({
        phase: options?.quiet ? 'idle' : 'error',
        lastError: options?.quiet ? null : message,
      });
      return null;
    }
  },
}));

/**
 * Compte les mutations non synchronisées (pending/syncing/failed) pour l'utilisateur courant.
 */
export async function countUnsyncedOutboxForUser(userId: string | undefined): Promise<number> {
  if (!userId) return 0;
  return getUserDb(userId).outbox.count();
}

let sessionSubscriptionInitialized = false;
let prevSessionStatus = useSessionStore.getState().status;
let prevUserId = useSessionStore.getState().user?.id;
let prevIsOnline = useSessionStore.getState().isOnline;

export function initSyncLifecycle(): () => void {
  if (sessionSubscriptionInitialized) {
    return () => {};
  }
  sessionSubscriptionInitialized = true;

  const unsubscribe = useSessionStore.subscribe((state) => {
    const currentUserId = state.user?.id;
    const statusChanged = state.status !== prevSessionStatus;
    const userChanged = currentUserId !== prevUserId;
    const onlineRecovered = !prevIsOnline && state.isOnline;

    prevSessionStatus = state.status;
    prevUserId = currentUserId;
    prevIsOnline = state.isOnline;

    if (userChanged || (statusChanged && state.status === 'anonymous')) {
      closeAllUserDbs();
      useSyncStore.setState({ phase: 'idle', lastError: null, lastSyncedAt: null, outboxDialogOpen: false });
    }

    const becameAuthenticated =
      state.status === 'authenticated' && (statusChanged || userChanged || onlineRecovered);

    if (becameAuthenticated && currentUserId && state.isOnline) {
      void useSyncStore.getState().triggerSync({ quiet: true });
    }
  });

  return () => {
    unsubscribe();
    sessionSubscriptionInitialized = false;
  };
}
