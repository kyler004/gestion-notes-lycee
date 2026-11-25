import { isApiError, isNetworkError } from '@/lib/api/errors';
import { t } from '@/lib/i18n';
import { useSessionStore } from '@/stores/session.store';
import { useSyncStore } from '@/stores/sync.store';

export function getAdminErrorMessage(err: unknown): string {
  if (isApiError(err)) {
    if (err.status === 429) {
      return t('admin.common.rateLimited', {
        seconds: err.retryAfterSeconds ?? 60,
      });
    }
    return err.message;
  }
  if (isNetworkError(err)) {
    return t('auth.networkError');
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return 'Une erreur inattendue est survenue.';
}

/**
 * Met à jour silencieusement la copie locale IndexedDB après une mutation admin
 * pour garder `/grades` immédiatement synchronisé.
 */
export function refreshLocalSyncSnapshot(): void {
  const { status, isOnline } = useSessionStore.getState();
  if (status === 'authenticated' && isOnline) {
    void useSyncStore.getState().triggerSync({ quiet: true });
  }
}
