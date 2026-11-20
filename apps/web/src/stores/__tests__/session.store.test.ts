import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLocalAccount, listLocalAccounts, LyceeMetaDb } from '@/db';
import { MAX_PIN_ATTEMPTS } from '@/lib/auth/pin';
import { useSessionStore } from '../session.store';

const TEACHER_USER = {
  id: '11111111-1111-4111-8111-111111111111',
  username: 'j.dupont',
  fullName: 'Jean Dupont',
  role: 'teacher' as const,
  isActive: true,
};

const ADMIN_USER = {
  id: '22222222-2222-4222-8222-222222222222',
  username: 'admin',
  fullName: 'Admin Lycée',
  role: 'admin' as const,
  isActive: true,
};

describe('Session store (auth, PIN lock, shared PC switching)', () => {
  let db: LyceeMetaDb;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    db = new LyceeMetaDb(`lycee-meta-test-${crypto.randomUUID()}`);
    useSessionStore.getState().resetForTests();
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    await db.delete();
  });

  it('logs in online, sets needsPinSetup, sets up PIN, locks, and unlocks offline', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: 'jwt-access-1',
          refreshToken: 'opaque-refresh-1-123456',
          user: TEACHER_USER,
        }),
        { status: 200 },
      ),
    );

    await useSessionStore.getState().login(
      { username: 'j.dupont', password: 'Password123!' },
      db,
    );

    expect(useSessionStore.getState().status).toBe('authenticated');
    expect(useSessionStore.getState().accessToken).toBe('jwt-access-1');
    expect(useSessionStore.getState().needsPinSetup).toBe(true);

    await useSessionStore.getState().setupPin('2580', db);
    expect(useSessionStore.getState().hasPin).toBe(true);
    expect(useSessionStore.getState().needsPinSetup).toBe(false);

    useSessionStore.getState().lock();
    expect(useSessionStore.getState().status).toBe('locked');
    expect(useSessionStore.getState().accessToken).toBeNull();

    // Bascule hors-ligne et déverrouille avec le code PIN
    useSessionStore.getState().setOnline(false);
    const unlockResult = await useSessionStore.getState().unlockWithPin('2580', db);
    expect(unlockResult).toEqual({
      ok: true,
      remainingAttempts: MAX_PIN_ATTEMPTS,
      lockedOut: false,
    });
    expect(useSessionStore.getState().status).toBe('authenticated');
    expect(useSessionStore.getState().user?.username).toBe('j.dupont');
  });

  it('locks out to online login after 5 wrong PIN attempts', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: 'jwt-access-1',
          refreshToken: 'opaque-refresh-1-123456',
          user: TEACHER_USER,
        }),
        { status: 200 },
      ),
    );

    await useSessionStore.getState().login(
      { username: 'j.dupont', password: 'Password123!' },
      db,
    );
    await useSessionStore.getState().setupPin('1234', db);
    useSessionStore.getState().lock();

    for (let attempt = 1; attempt < MAX_PIN_ATTEMPTS; attempt += 1) {
      const res = await useSessionStore.getState().unlockWithPin('9999', db);
      expect(res.ok).toBe(false);
      expect(res.lockedOut).toBe(false);
      expect(res.remainingAttempts).toBe(MAX_PIN_ATTEMPTS - attempt);
      expect(useSessionStore.getState().status).toBe('locked');
    }

    const finalRes = await useSessionStore.getState().unlockWithPin('9999', db);
    expect(finalRes).toEqual({ ok: false, remainingAttempts: 0, lockedOut: true });
    expect(useSessionStore.getState().status).toBe('anonymous');
    expect(useSessionStore.getState().authNotice).toBeTruthy();

    const stored = await getLocalAccount(TEACHER_USER.id, db);
    expect(stored?.requiresOnlineLogin).toBe(true);
    expect(stored?.refreshToken).toBeNull();
  });

  it('preserves local accounts across shared-PC switchUser and transitions revoked bootstrap to anonymous', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: 'jwt-teacher',
            refreshToken: 'refresh-teacher-123456',
            user: TEACHER_USER,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: 'jwt-admin',
            refreshToken: 'refresh-admin-123456',
            user: ADMIN_USER,
          }),
          { status: 200 },
        ),
      );

    await useSessionStore.getState().login(
      { username: 'j.dupont', password: 'Password123!' },
      db,
    );
    await useSessionStore.getState().setupPin('1111', db);
    await useSessionStore.getState().switchUser(db);

    expect(useSessionStore.getState().status).toBe('anonymous');
    expect(useSessionStore.getState().savedAccounts).toHaveLength(1);

    await useSessionStore.getState().login(
      { username: 'admin', password: 'AdminPassword123!' },
      db,
    );
    const accounts = await listLocalAccounts(db);
    expect(accounts).toHaveLength(2);

    // Simule un jeton révoqué côté serveur lors du prochain bootstrap
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Révoqué' } }),
        { status: 401 },
      ),
    );
    useSessionStore.getState().resetForTests();
    await useSessionStore.getState().bootstrap(db);

    expect(useSessionStore.getState().status).toBe('anonymous');
    expect(useSessionStore.getState().authNotice).toContain('expiré ou été révoquée');
  });
});
