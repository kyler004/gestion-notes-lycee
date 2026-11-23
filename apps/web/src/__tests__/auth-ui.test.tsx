import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeAllUserDbs, getUserDb } from '@/db/user-db';
import { t } from '@/lib/i18n';
import { queryClient } from '@/lib/query-client';
import { createAppRouter } from '@/router';
import { useSessionStore } from '@/stores/session.store';

const TEACHER_ID = '11111111-1111-4111-8111-111111111111';
const YEAR_ID = 'aaaa1111-1111-4111-8111-111111111111';
const PERIOD_OPEN_1 = 'bbbb1111-1111-4111-8111-111111111111';
const PERIOD_LOCKED_1 = 'bbbb2222-2222-4222-8222-222222222222';
const CLASS_ID = 'cccc1111-1111-4111-8111-111111111111';
const CS_1 = 'dddd1111-1111-4111-8111-111111111111';
const ASSIGN_1 = 'eeee1111-1111-4111-8111-111111111111';
const ASSIGN_2 = 'eeee2222-2222-4222-8222-222222222222';

function renderAt(initialPath: string) {
  const router = createAppRouter();
  router.update({
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  return {
    router,
    ...render(<RouterProvider router={router} />),
  };
}

describe('Auth UI & role-based route guards', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    useSessionStore.setState({
      status: 'anonymous',
      user: null,
      accessToken: null,
      hasPin: false,
      needsPinSetup: false,
      pinAttempts: 0,
      savedAccounts: [],
      authNotice: null,
      isOnline: true,
    });
  });

  afterEach(async () => {
    cleanup();
    queryClient.clear();
    await getUserDb(TEACHER_ID).delete().catch(() => {});
    closeAllUserDbs();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('redirects anonymous users from / to /login and handles 401 + 429 errors', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { code: 'UNAUTHORIZED', message: 'Identifiants invalides.' },
          }),
          { status: 401 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Trop de tentatives.' },
          }),
          { status: 429, headers: { 'retry-after': '30' } },
        ),
      );

    renderAt('/');

    expect(await screen.findByText(t('auth.loginTitle'))).toBeInTheDocument();

    await user.type(screen.getByLabelText(t('auth.usernameLabel')), 'teacher1');
    await user.type(screen.getByLabelText(t('auth.passwordLabel')), 'wrongpass');
    await user.click(screen.getByRole('button', { name: t('auth.submitLogin') }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      t('auth.invalidCredentials'),
    );

    await user.click(screen.getByRole('button', { name: t('auth.submitLogin') }));
    expect(await screen.findByRole('alert')).toHaveTextContent('30 s');
  });

  it('redirects locked users to /lock', async () => {
    useSessionStore.setState({
      status: 'locked',
      user: {
        id: TEACHER_ID,
        username: 'j.dupont',
        fullName: 'Jean Dupont',
        role: 'teacher',
        isActive: true,
      },
      hasPin: true,
    });

    renderAt('/');

    expect(await screen.findByText(t('pin.lockTitle'))).toBeInTheDocument();
    expect(screen.getByText('Jean Dupont')).toBeInTheDocument();
  });

  it('allows teacher on /grades and redirects teacher from /admin to /forbidden', async () => {
    useSessionStore.setState({
      status: 'authenticated',
      user: {
        id: TEACHER_ID,
        username: 'j.dupont',
        fullName: 'Jean Dupont',
        role: 'teacher',
        isActive: true,
      },
      accessToken: 'token-1',
      hasPin: true,
      needsPinSetup: false,
    });

    renderAt('/grades');
    expect(await screen.findByRole('heading', { name: t('nav.grades') })).toBeInTheDocument();

    renderAt('/admin');
    await waitFor(() => {
      expect(screen.getByText(t('errors.forbiddenTitle'))).toBeInTheDocument();
    });
  });

  it('allows secretary on /reports and blocks secretary from /grades', async () => {
    useSessionStore.setState({
      status: 'authenticated',
      user: {
        id: '33333333-3333-4333-8333-333333333333',
        username: 'secretariat',
        fullName: 'Marie Secrétaire',
        role: 'secretary',
        isActive: true,
      },
      accessToken: 'token-2',
      hasPin: true,
      needsPinSetup: false,
    });

    renderAt('/reports');
    expect(
      await screen.findByRole('heading', { name: t('reports.pageTitleSecretary') }),
    ).toBeInTheDocument();

    renderAt('/grades');
    await waitFor(() => {
      expect(screen.getByText(t('errors.forbiddenTitle'))).toBeInTheDocument();
    });
  });

  it('displays live Dexie stats on dashboard even offline without milestone notice', async () => {
    const db = getUserDb(TEACHER_ID);
    await db.academicYears.put({
      id: YEAR_ID,
      label: '2026-2027',
      startDate: '2026-09-01',
      endDate: '2027-06-30',
      isActive: true,
      syncVersion: 1,
    });
    await db.periods.bulkPut([
      {
        id: PERIOD_OPEN_1,
        academicYearId: YEAR_ID,
        parentPeriodId: null,
        type: 'sequence',
        code: 'S1',
        name: 'Séquence 1',
        orderIndex: 1,
        weight: 1,
        status: 'open',
        lockedAt: null,
        lockedBy: null,
        syncVersion: 1,
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
      {
        id: PERIOD_LOCKED_1,
        academicYearId: YEAR_ID,
        parentPeriodId: null,
        type: 'sequence',
        code: 'S2',
        name: 'Séquence 2',
        orderIndex: 2,
        weight: 1,
        status: 'locked',
        lockedAt: '2026-10-15T00:00:00.000Z',
        lockedBy: TEACHER_ID,
        syncVersion: 2,
        updatedAt: '2026-10-15T00:00:00.000Z',
      },
    ]);
    await db.classes.put({
      id: CLASS_ID,
      academicYearId: YEAR_ID,
      name: '3ème A',
      level: '3ème',
      series: null,
      mainTeacherId: TEACHER_ID,
      syncVersion: 1,
      updatedAt: '2026-09-01T00:00:00.000Z',
    });
    await db.teacherAssignments.bulkPut([
      {
        id: ASSIGN_1,
        teacherId: TEACHER_ID,
        classSubjectId: CS_1,
        academicYearId: YEAR_ID,
        isActive: true,
        syncVersion: 1,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
      {
        id: ASSIGN_2,
        teacherId: TEACHER_ID,
        classSubjectId: 'dddd2222-2222-4222-8222-222222222222',
        academicYearId: YEAR_ID,
        isActive: true,
        syncVersion: 2,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ]);

    useSessionStore.setState({
      status: 'authenticated',
      user: {
        id: TEACHER_ID,
        username: 'j.dupont',
        fullName: 'Jean Dupont',
        role: 'teacher',
        isActive: true,
      },
      accessToken: 'token-1',
      hasPin: true,
      needsPinSetup: false,
      isOnline: false,
    });

    renderAt('/');

    expect(await screen.findByText('2026-2027')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByText('1 ouverte(s) · 1 verrouillée(s)')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText(t('dashboard.statSyncUpToDate'))).toBeInTheDocument();
    expect(screen.queryByText(/Jalons 1 à 4/)).not.toBeInTheDocument();
  });

  it('allows self-service password change and redirects to /login with notice', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/auth/change-password') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { currentPassword: string; newPassword: string };
        if (body.currentPassword === 'WrongPass1!') {
          return new Response(
            JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Mot de passe actuel incorrect.' } }),
            { status: 401 },
          );
        }
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    globalThis.fetch = fetchMock;

    useSessionStore.setState({
      status: 'authenticated',
      user: {
        id: TEACHER_ID,
        username: 'j.dupont',
        fullName: 'Jean Dupont',
        role: 'teacher',
        isActive: true,
      },
      accessToken: 'token-1',
      hasPin: true,
      needsPinSetup: false,
      isOnline: true,
    });

    renderAt('/');
    await user.click(await screen.findByRole('button', { name: t('nav.changePassword') }));

    const currentInput = await screen.findByLabelText(t('auth.currentPasswordLabel'));
    const newInput = screen.getByLabelText(t('auth.newPasswordLabel'));
    const confirmInput = screen.getByLabelText(t('auth.confirmNewPasswordLabel'));

    // Validation locale : correspondance
    await user.type(currentInput, 'WrongPass1!');
    await user.type(newInput, 'NewPass2026!');
    await user.type(confirmInput, 'Mismatch2026!');
    await user.click(screen.getByRole('button', { name: t('auth.changePasswordSubmit') }));
    expect(await screen.findByText(t('auth.passwordMismatch'))).toBeInTheDocument();

    // Erreur 401 serveur
    await user.clear(confirmInput);
    await user.type(confirmInput, 'NewPass2026!');
    await user.click(screen.getByRole('button', { name: t('auth.changePasswordSubmit') }));
    expect(await screen.findByText(t('auth.currentPasswordInvalid'))).toBeInTheDocument();

    // Succès -> appel change-password puis redirection /login avec bandeau d'info
    await user.clear(currentInput);
    await user.type(currentInput, 'OldPass2026!');
    await user.click(screen.getByRole('button', { name: t('auth.changePasswordSubmit') }));

    expect(await screen.findByText(t('auth.passwordChangedNotice'))).toBeInTheDocument();
    expect(useSessionStore.getState().status).toBe('anonymous');
  });

  it('confirms logout-all-devices and calls POST /api/auth/logout-all', async () => {
    const user = userEvent.setup();
    let logoutAllCalled = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/auth/logout-all') && init?.method === 'POST') {
        logoutAllCalled += 1;
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    useSessionStore.setState({
      status: 'authenticated',
      user: {
        id: TEACHER_ID,
        username: 'j.dupont',
        fullName: 'Jean Dupont',
        role: 'teacher',
        isActive: true,
      },
      accessToken: 'token-1',
      hasPin: true,
      needsPinSetup: false,
      isOnline: true,
    });

    renderAt('/');
    await user.click(await screen.findByRole('button', { name: t('nav.logoutAll') }));
    expect(await screen.findByText(t('auth.logoutAllDesc'))).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: t('auth.logoutAllConfirm') }));

    expect(await screen.findByText(t('auth.logoutAllNotice'))).toBeInTheDocument();
    expect(logoutAllCalled).toBe(1);
    expect(useSessionStore.getState().status).toBe('anonymous');
  });
});
