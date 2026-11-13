import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { DbClient } from './client.js';
import { MIGRATIONS_DIR } from './migrate.js';
import * as schema from './schema.js';

export interface TestDbHandle {
  db: DbClient;
  raw: PGlite;
  close: () => Promise<void>;
}

export async function createTestDb(): Promise<TestDbHandle> {
  const raw = new PGlite();
  const pgliteDb = drizzle(raw, { schema });
  await migrate(pgliteDb, { migrationsFolder: MIGRATIONS_DIR });
  return {
    db: pgliteDb as unknown as DbClient,
    raw,
    close: async () => {
      await raw.close();
    },
  };
}
