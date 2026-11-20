import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '@/lib/i18n';
import { createAppRouter } from '@/router';
import { useSessionStore } from '@/stores/session.store';

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

  afterEach(() => {
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
        id: '11111111-1111-4111-8111-111111111111',
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
        id: '11111111-1111-4111-8111-111111111111',
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
    expect(await screen.findByRole('heading', { name: t('nav.reports') })).toBeInTheDocument();

    renderAt('/grades');
    await waitFor(() => {
      expect(screen.getByText(t('errors.forbiddenTitle'))).toBeInTheDocument();
    });
  });
});
