import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeAllUserDbs, getUserDb } from '@/db/user-db';
import { t } from '@/lib/i18n';
import { createAppRouter } from '@/router';
import { useSessionStore } from '@/stores/session.store';
import { useSyncStore } from '@/stores/sync.store';
import { enqueueGradeMutation } from '@/sync/engine';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ENR_ID = '80000000-0000-4000-8000-000000000001';
const CS_ID = '50000000-0000-4000-8000-000000000001';
const SEQ1_ID = '20000000-0000-4000-8000-000000000011';

function renderDashboard() {
  const router = createAppRouter();
  router.update({
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return render(<RouterProvider router={router} />);
}

describe('AppShell SyncStatusWidget, OutboxDialog & logout safeguard', () => {
  beforeEach(async () => {
    await getUserDb(USER_ID).delete();
    closeAllUserDbs();
    useSyncStore.setState({ phase: 'idle', lastError: null, lastSyncedAt: null, outboxDialogOpen: false });
    useSessionStore.setState({
      status: 'authenticated',
      user: {
        id: USER_ID,
        username: 'j.dupont',
        fullName: 'Jean Dupont',
        role: 'teacher',
        isActive: true,
      },
      accessToken: 'token-1',
      hasPin: true,
      needsPinSetup: false,
      pinAttempts: 0,
      savedAccounts: [],
      authNotice: null,
      isOnline: false,
    });
  });

  afterEach(() => {
    closeAllUserDbs();
    vi.restoreAllMocks();
  });

  it('displays failed outbox count, allows discarding in OutboxDialog, and warns before logout while drafts exist', async () => {
    const user = userEvent.setup();
    const db = getUserDb(USER_ID);

    const queued = await enqueueGradeMutation(db, {
      enrollmentId: ENR_ID,
      classSubjectId: CS_ID,
      periodId: SEQ1_ID,
      score: 14,
      status: 'present',
    });

    const row = await db.outbox.get(queued.targetKey);
    expect(row).toBeDefined();
    await db.outbox.put({
      ...row!,
      status: 'failed',
      outcome: 'rejected_validation',
      errorMessage: 'Motif requis sur cette note.',
    });

    renderDashboard();

    const trigger = await screen.findByTestId('sync-outbox-trigger');
    await waitFor(() => {
      expect(trigger).toHaveTextContent('1 rejet(s)');
    });

    // Clic sur Déconnexion -> garde de protection car 1 note locale reste dans la file Outbox
    await user.click(screen.getByRole('button', { name: t('nav.logout') }));
    expect(await screen.findByText(t('auth.logoutPendingTitle'))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: t('auth.logoutCancel') }));

    // Ouverture OutboxDialog -> abandon du rejet -> état propre "Tout est à jour"
    await user.click(trigger);
    expect(await screen.findByText('Motif requis sur cette note.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: t('sync.discardAction') }));

    expect(await screen.findByText(t('sync.emptyOutboxTitle'))).toBeInTheDocument();
    const closeButtons = screen.getAllByRole('button', { name: t('sync.closeDialog') });
    await user.click(closeButtons[closeButtons.length - 1]!);

    // Maintenant Déconnexion ne bloque plus
    await user.click(screen.getByRole('button', { name: t('nav.logout') }));
    await waitFor(() => {
      expect(useSessionStore.getState().status).toBe('anonymous');
    });
  });
});
