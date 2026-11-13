import { describe, expect, it } from 'vitest';
import { nextSyncVersion } from '../db/client.js';
import { createTestDb } from '../db/test-helpers.js';

describe('Vague 0 DB & sync_seq smoke test', () => {
  it('applies Drizzle migrations on PGlite and increments sync_seq inside and outside transactions', async () => {
    const { db, close } = await createTestDb();
    try {
      const v1 = await nextSyncVersion(db);
      const v2 = await db.transaction(async (tx) => nextSyncVersion(tx));
      expect(v1).toBe(1);
      expect(v2).toBe(2);
    } finally {
      await close();
    }
  });
});
