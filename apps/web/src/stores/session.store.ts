import type { AuthUserPayload } from '@lycee/shared';
import { create } from 'zustand';
import {
  getActiveUserId,
  getLocalAccount,
  listLocalAccounts,
  metaDb,
  removeLocalAccount,
  setActiveUserId,
  upsertLocalAccount,
  type LocalAccountRecord,
  type LyceeMetaDb,
} from '@/db';
import {
  loginRequest,
  logoutAllRequest,
  logoutRequest,
  meRequest,
  refreshRequest,
  type LoginInput,
} from '@/lib/api/auth';
import { registerApiAuthBridge } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { hashPin, MAX_PIN_ATTEMPTS, verifyPin } from '@/lib/auth/pin';
import { t } from '@/lib/i18n';

export type SessionStatus = 'bootstrapping' | 'anonymous' | 'authenticated' | 'locked';

export interface SavedAccountSummary {
  user: AuthUserPayload;
  hasPin: boolean;
  requiresOnlineLogin: boolean;
  lastActiveAt: string;
}

export interface SessionState {
  status: SessionStatus;
  user: AuthUserPayload | null;
  accessToken: string | null;
  hasPin: boolean;
  needsPinSetup: boolean;
  pinAttempts: number;
  savedAccounts: SavedAccountSummary[];
  authNotice: string | null;
  isOnline: boolean;

  bootstrap: (db?: LyceeMetaDb) => Promise<void>;
  login: (input: LoginInput, db?: LyceeMetaDb) => Promise<void>;
  setupPin: (pin: string, db?: LyceeMetaDb) => Promise<void>;
  dismissPinSetup: () => void;
  lock: () => void;
  unlockWithPin: (
    pin: string,
    db?: LyceeMetaDb,
  ) => Promise<{ ok: boolean; remainingAttempts: number; lockedOut: boolean }>;
  selectSavedAccount: (userId: string, db?: LyceeMetaDb) => Promise<'locked' | 'requires_password'>;
  forgetSavedAccount: (userId: string, db?: LyceeMetaDb) => Promise<void>;
  switchUser: (db?: LyceeMetaDb) => Promise<void>;
  logout: (options?: { allDevices?: boolean }, db?: LyceeMetaDb) => Promise<void>;
  refreshAccessToken: (db?: LyceeMetaDb) => Promise<string | null>;
  setOnline: (online: boolean) => void;
  clearAuthNotice: () => void;
  resetForTests: () => void;
}

function toSavedSummaries(records: LocalAccountRecord[]): SavedAccountSummary[] {
  return records
    .filter((record) => record.refreshToken !== null)
    .map((record) => ({
      user: record.user,
      hasPin: record.pinHash !== null && record.pinSalt !== null,
      requiresOnlineLogin: record.requiresOnlineLogin,
      lastActiveAt: record.lastActiveAt,
    }));
}

let activeMetaDb: LyceeMetaDb = metaDb;
let refreshPromise: Promise<string | null> | null = null;

export const useSessionStore = create<SessionState>((set, get) => ({
  status: 'bootstrapping',
  user: null,
  accessToken: null,
  hasPin: false,
  needsPinSetup: false,
  pinAttempts: 0,
  savedAccounts: [],
  authNotice: null,
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,

  bootstrap: async (db = metaDb) => {
    activeMetaDb = db;
    const allAccounts = await listLocalAccounts(db);
    const savedAccounts = toSavedSummaries(allAccounts);
    const activeUserId = await getActiveUserId(db);

    if (!activeUserId) {
      set({
        status: 'anonymous',
        user: null,
        accessToken: null,
        hasPin: false,
        needsPinSetup: false,
        pinAttempts: 0,
        savedAccounts,
      });
      return;
    }

    const account = await getLocalAccount(activeUserId, db);
    if (!account || !account.refreshToken) {
      await setActiveUserId(null, db);
      set({
        status: 'anonymous',
        user: null,
        accessToken: null,
        hasPin: false,
        needsPinSetup: false,
        pinAttempts: 0,
        savedAccounts,
      });
      return;
    }

    const hasPin = account.pinHash !== null && account.pinSalt !== null;

    if (account.requiresOnlineLogin) {
      set({
        status: 'anonymous',
        user: null,
        accessToken: null,
        hasPin,
        needsPinSetup: false,
        pinAttempts: account.pinAttempts,
        savedAccounts,
        authNotice: t('auth.sessionRevoked'),
      });
      return;
    }

    try {
      const refreshed = await refreshRequest(account.refreshToken);
      const now = new Date().toISOString();
      const updatedRecord: LocalAccountRecord = {
        ...account,
        user: refreshed.user,
        refreshToken: refreshed.refreshToken,
        requiresOnlineLogin: false,
        lastActiveAt: now,
        updatedAt: now,
      };
      await upsertLocalAccount(updatedRecord, db);

      set({
        accessToken: refreshed.accessToken,
        user: refreshed.user,
        isOnline: true,
      });

      // Confirme la session via /me
      const verifiedUser = await meRequest();
      const updatedAfterMe: LocalAccountRecord = {
        ...updatedRecord,
        user: verifiedUser,
        updatedAt: new Date().toISOString(),
      };
      await upsertLocalAccount(updatedAfterMe, db);

      const freshList = await listLocalAccounts(db);
      set({
        status: 'authenticated',
        user: verifiedUser,
        accessToken: refreshed.accessToken,
        hasPin,
        needsPinSetup: !hasPin,
        pinAttempts: account.pinAttempts,
        savedAccounts: toSavedSummaries(freshList),
        authNotice: null,
        isOnline: true,
      });
      return;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await upsertLocalAccount(
          {
            ...account,
            refreshToken: null,
            requiresOnlineLogin: true,
            updatedAt: new Date().toISOString(),
          },
          db,
        );
        await setActiveUserId(null, db);
        const freshList = await listLocalAccounts(db);
        set({
          status: 'anonymous',
          user: null,
          accessToken: null,
          hasPin: false,
          needsPinSetup: false,
          pinAttempts: 0,
          savedAccounts: toSavedSummaries(freshList),
          authNotice: t('auth.sessionRevoked'),
        });
        return;
      }
      // Erreur réseau ou serveur indisponible : bascule sur le verrouillage PIN si configuré
      set({ isOnline: false });
    }

    if (hasPin) {
      set({
        status: 'locked',
        user: account.user,
        accessToken: null,
        hasPin: true,
        needsPinSetup: false,
        pinAttempts: account.pinAttempts,
        savedAccounts,
        authNotice: null,
      });
      return;
    }

    set({
      status: 'anonymous',
      user: null,
      accessToken: null,
      hasPin: false,
      needsPinSetup: false,
      pinAttempts: 0,
      savedAccounts,
      authNotice: t('auth.offlineLoginDisabled'),
    });
  },

  login: async (input, db = activeMetaDb) => {
    activeMetaDb = db;
    const session = await loginRequest(input);
    const existing = await getLocalAccount(session.user.id, db);
    const now = new Date().toISOString();
    const hasPin = Boolean(existing?.pinHash && existing?.pinSalt);

    const record: LocalAccountRecord = {
      userId: session.user.id,
      user: session.user,
      refreshToken: session.refreshToken,
      pinHash: existing?.pinHash ?? null,
      pinSalt: existing?.pinSalt ?? null,
      pinAttempts: 0,
      requiresOnlineLogin: false,
      lastActiveAt: now,
      updatedAt: now,
    };

    await upsertLocalAccount(record, db);
    await setActiveUserId(session.user.id, db);

    const freshList = await listLocalAccounts(db);
    set({
      status: 'authenticated',
      user: session.user,
      accessToken: session.accessToken,
      hasPin,
      needsPinSetup: !hasPin,
      pinAttempts: 0,
      savedAccounts: toSavedSummaries(freshList),
      authNotice: null,
      isOnline: true,
    });
  },

  setupPin: async (pin, db = activeMetaDb) => {
    const currentUser = get().user;
    if (!currentUser) {
      throw new Error('Aucun utilisateur authentifié.');
    }

    const { hash, salt } = await hashPin(pin);
    const existing = await getLocalAccount(currentUser.id, db);
    const now = new Date().toISOString();

    await upsertLocalAccount(
      {
        userId: currentUser.id,
        user: currentUser,
        refreshToken: existing?.refreshToken ?? null,
        pinHash: hash,
        pinSalt: salt,
        pinAttempts: 0,
        requiresOnlineLogin: false,
        lastActiveAt: now,
        updatedAt: now,
      },
      db,
    );

    const freshList = await listLocalAccounts(db);
    set({
      hasPin: true,
      needsPinSetup: false,
      pinAttempts: 0,
      savedAccounts: toSavedSummaries(freshList),
    });
  },

  dismissPinSetup: () => {
    set({ needsPinSetup: false });
  },

  lock: () => {
    const { status, user, hasPin } = get();
    if (status !== 'authenticated' || !user) return;
    if (!hasPin) {
      set({ needsPinSetup: true });
      return;
    }
    set({
      status: 'locked',
      accessToken: null,
    });
  },

  unlockWithPin: async (pin, db = activeMetaDb) => {
    const currentUser = get().user;
    if (!currentUser) {
      return { ok: false, remainingAttempts: 0, lockedOut: true };
    }

    const account = await getLocalAccount(currentUser.id, db);
    if (!account || !account.pinHash || !account.pinSalt) {
      await setActiveUserId(null, db);
      set({
        status: 'anonymous',
        user: null,
        accessToken: null,
        hasPin: false,
        authNotice: t('auth.sessionRevoked'),
      });
      return { ok: false, remainingAttempts: 0, lockedOut: true };
    }

    const valid = await verifyPin(pin, account.pinHash, account.pinSalt);
    if (!valid) {
      const nextAttempts = account.pinAttempts + 1;
      const remaining = Math.max(0, MAX_PIN_ATTEMPTS - nextAttempts);
      const lockedOut = nextAttempts >= MAX_PIN_ATTEMPTS;

      if (lockedOut) {
        await upsertLocalAccount(
          {
            ...account,
            pinAttempts: nextAttempts,
            requiresOnlineLogin: true,
            refreshToken: null,
            updatedAt: new Date().toISOString(),
          },
          db,
        );
        await setActiveUserId(null, db);
        const freshList = await listLocalAccounts(db);
        set({
          status: 'anonymous',
          user: null,
          accessToken: null,
          hasPin: false,
          pinAttempts: nextAttempts,
          savedAccounts: toSavedSummaries(freshList),
          authNotice: t('auth.pinLockedOut'),
        });
      } else {
        await upsertLocalAccount(
          {
            ...account,
            pinAttempts: nextAttempts,
            updatedAt: new Date().toISOString(),
          },
          db,
        );
        set({ pinAttempts: nextAttempts });
      }

      return { ok: false, remainingAttempts: remaining, lockedOut };
    }

    const now = new Date().toISOString();
    await upsertLocalAccount(
      {
        ...account,
        pinAttempts: 0,
        lastActiveAt: now,
        updatedAt: now,
      },
      db,
    );

    set({
      status: 'authenticated',
      user: account.user,
      pinAttempts: 0,
      authNotice: null,
    });

    if (get().isOnline && account.refreshToken) {
      await get().refreshAccessToken(db);
    }

    return { ok: true, remainingAttempts: MAX_PIN_ATTEMPTS, lockedOut: false };
  },

  selectSavedAccount: async (userId, db = activeMetaDb) => {
    const account = await getLocalAccount(userId, db);
    if (!account || !account.refreshToken || account.requiresOnlineLogin) {
      return 'requires_password';
    }

    const hasPin = account.pinHash !== null && account.pinSalt !== null;
    if (!hasPin) {
      return 'requires_password';
    }

    await setActiveUserId(userId, db);
    set({
      status: 'locked',
      user: account.user,
      accessToken: null,
      hasPin: true,
      needsPinSetup: false,
      pinAttempts: account.pinAttempts,
      authNotice: null,
    });
    return 'locked';
  },

  forgetSavedAccount: async (userId, db = activeMetaDb) => {
    const account = await getLocalAccount(userId, db);
    if (account?.refreshToken && get().isOnline) {
      try {
        await logoutRequest(account.refreshToken);
      } catch {
        // Ignorer en cas d'erreur réseau
      }
    }
    await removeLocalAccount(userId, db);
    const activeId = await getActiveUserId(db);
    if (activeId === userId) {
      await setActiveUserId(null, db);
    }
    const freshList = await listLocalAccounts(db);
    set({
      savedAccounts: toSavedSummaries(freshList),
    });
  },

  switchUser: async (db = activeMetaDb) => {
    await setActiveUserId(null, db);
    const freshList = await listLocalAccounts(db);
    set({
      status: 'anonymous',
      user: null,
      accessToken: null,
      hasPin: false,
      needsPinSetup: false,
      pinAttempts: 0,
      savedAccounts: toSavedSummaries(freshList),
      authNotice: null,
    });
  },

  logout: async (options = {}, db = activeMetaDb) => {
    const currentUser = get().user;
    if (currentUser) {
      const account = await getLocalAccount(currentUser.id, db);
      if (get().isOnline) {
        try {
          if (options.allDevices && get().accessToken) {
            await logoutAllRequest();
          } else if (account?.refreshToken) {
            await logoutRequest(account.refreshToken);
          }
        } catch {
          // Best effort côté serveur ; nettoyage local garanti
        }
      }
      await removeLocalAccount(currentUser.id, db);
    }

    await setActiveUserId(null, db);
    const freshList = await listLocalAccounts(db);
    set({
      status: 'anonymous',
      user: null,
      accessToken: null,
      hasPin: false,
      needsPinSetup: false,
      pinAttempts: 0,
      savedAccounts: toSavedSummaries(freshList),
      authNotice: null,
    });
  },

  refreshAccessToken: async (db = activeMetaDb) => {
    if (refreshPromise) {
      return refreshPromise;
    }

    refreshPromise = (async () => {
      const currentUser = get().user;
      const targetUserId = currentUser?.id ?? (await getActiveUserId(db));
      if (!targetUserId) return null;

      const account = await getLocalAccount(targetUserId, db);
      if (!account?.refreshToken) return null;

      try {
        const refreshed = await refreshRequest(account.refreshToken);
        const now = new Date().toISOString();
        await upsertLocalAccount(
          {
            ...account,
            user: refreshed.user,
            refreshToken: refreshed.refreshToken,
            requiresOnlineLogin: false,
            lastActiveAt: now,
            updatedAt: now,
          },
          db,
        );

        const freshList = await listLocalAccounts(db);
        set({
          accessToken: refreshed.accessToken,
          user: refreshed.user,
          savedAccounts: toSavedSummaries(freshList),
        });
        return refreshed.accessToken;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          await upsertLocalAccount(
            {
              ...account,
              refreshToken: null,
              requiresOnlineLogin: true,
              updatedAt: new Date().toISOString(),
            },
            db,
          );
          await setActiveUserId(null, db);
          const freshList = await listLocalAccounts(db);
          set({
            status: 'anonymous',
            user: null,
            accessToken: null,
            hasPin: false,
            needsPinSetup: false,
            savedAccounts: toSavedSummaries(freshList),
            authNotice: t('auth.sessionRevoked'),
          });
        }
        return null;
      } finally {
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  },

  setOnline: (online) => {
    const prev = get().isOnline;
    set({ isOnline: online });
    if (!prev && online && get().status === 'authenticated' && !get().accessToken) {
      void get().refreshAccessToken(activeMetaDb);
    }
  },

  clearAuthNotice: () => set({ authNotice: null }),

  resetForTests: () => {
    refreshPromise = null;
    set({
      status: 'bootstrapping',
      user: null,
      accessToken: null,
      hasPin: false,
      needsPinSetup: false,
      pinAttempts: 0,
      savedAccounts: [],
      authNotice: null,
      isOnline: true,
    });
  },
}));

registerApiAuthBridge({
  getAccessToken: () => useSessionStore.getState().accessToken,
  refreshAccessToken: () => useSessionStore.getState().refreshAccessToken(),
  onReachabilityChange: (online) => {
    const state = useSessionStore.getState();
    if (state.isOnline !== online) {
      state.setOnline(online);
    }
  },
});
