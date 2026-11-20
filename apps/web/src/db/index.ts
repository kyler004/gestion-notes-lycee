import type { AuthUserPayload } from '@lycee/shared';
import Dexie, { type EntityTable } from 'dexie';

export interface LocalAccountRecord {
  userId: string;
  user: AuthUserPayload;
  refreshToken: string | null;
  pinHash: string | null;
  pinSalt: string | null;
  pinAttempts: number;
  requiresOnlineLogin: boolean;
  lastActiveAt: string;
  updatedAt: string;
}

export interface AppMetaRecord {
  key: string;
  value: string | null;
}

export class LyceeMetaDb extends Dexie {
  localAccounts!: EntityTable<LocalAccountRecord, 'userId'>;
  appMeta!: EntityTable<AppMetaRecord, 'key'>;

  constructor(name = 'lycee-meta') {
    super(name);
    this.version(1).stores({
      localAccounts: 'userId, lastActiveAt',
      appMeta: 'key',
    });
  }
}

export const metaDb = new LyceeMetaDb();

const ACTIVE_USER_META_KEY = 'activeUserId';

export async function getActiveUserId(db: LyceeMetaDb = metaDb): Promise<string | null> {
  const row = await db.appMeta.get(ACTIVE_USER_META_KEY);
  return row?.value ?? null;
}

export async function setActiveUserId(
  userId: string | null,
  db: LyceeMetaDb = metaDb,
): Promise<void> {
  await db.appMeta.put({ key: ACTIVE_USER_META_KEY, value: userId });
}

export async function listLocalAccounts(
  db: LyceeMetaDb = metaDb,
): Promise<LocalAccountRecord[]> {
  return db.localAccounts.orderBy('lastActiveAt').reverse().toArray();
}

export async function getLocalAccount(
  userId: string,
  db: LyceeMetaDb = metaDb,
): Promise<LocalAccountRecord | undefined> {
  return db.localAccounts.get(userId);
}

export async function upsertLocalAccount(
  account: LocalAccountRecord,
  db: LyceeMetaDb = metaDb,
): Promise<void> {
  await db.localAccounts.put(account);
}

export async function removeLocalAccount(
  userId: string,
  db: LyceeMetaDb = metaDb,
): Promise<void> {
  await db.localAccounts.delete(userId);
}

/**
 * Cloisonnement physique par userId pour les données hors-ligne (Jalon 2).
 */
export function getUserDatabaseName(userId: string): string {
  return `lycee-data-${userId}`;
}
