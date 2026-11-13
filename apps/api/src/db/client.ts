import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import * as schema from './schema.js';

export type DbClient = PgDatabase<PgQueryResultHKT, typeof schema>;
export type PgDbClient = NodePgDatabase<typeof schema>;

export interface PgConnection {
  db: DbClient;
  pool: Pool;
  close: () => Promise<void>;
}

export function createPgDb(connectionString: string): PgConnection {
  const pool = new Pool({ connectionString });
  const db: DbClient = drizzle(pool, { schema }) as unknown as DbClient;
  return {
    db,
    pool,
    close: async () => {
      await pool.end();
    },
  };
}

export async function nextSyncVersion(executor: DbClient): Promise<number> {
  const result = (await executor.execute(
    sql`SELECT nextval('sync_seq')::text AS val`,
  )) as { rows?: Array<{ val?: string }> };
  const row = result.rows?.[0];
  if (!row?.val) {
    throw new Error('Impossible de générer une nouvelle valeur sync_seq');
  }
  return Number(row.val);
}
