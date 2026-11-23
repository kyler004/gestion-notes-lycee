import { ChangePasswordSchema } from '@lycee/shared';
import {
  RiErrorWarningFill,
  RiLockPasswordFill,
  RiRefreshFill,
} from '@remixicon/react';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldMessage, Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { changePasswordRequest } from '@/lib/api/auth';
import { ApiError, NetworkError } from '@/lib/api/errors';
import { t } from '@/lib/i18n';
import { useSessionStore } from '@/stores/session.store';
import { countUnsyncedOutboxForUser, useSyncStore } from '@/stores/sync.store';

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: ChangePasswordDialogProps) {
  const user = useSessionStore((s) => s.user);
  const isOnline = useSessionStore((s) => s.isOnline);
  const logout = useSessionStore((s) => s.logout);
  const triggerSync = useSyncStore((s) => s.triggerSync);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingOutbox, setPendingOutbox] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!open || !user?.id) {
      setPendingOutbox(0);
      return;
    }
    let active = true;
    void countUnsyncedOutboxForUser(user.id).then((count) => {
      if (active) setPendingOutbox(count);
    });
    return () => {
      active = false;
    };
  }, [open, user?.id]);

  const handleClose = () => {
    if (submitting) return;
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setError(null);
    onOpenChange(false);
  };

  const handleSyncDrafts = async () => {
    setSyncing(true);
    try {
      await triggerSync();
      const remaining = await countUnsyncedOutboxForUser(user?.id);
      setPendingOutbox(remaining);
    } finally {
      setSyncing(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isOnline) {
      setError(t('auth.changePasswordOffline'));
      return;
    }

    if (newPassword.length < 8) {
      setError(t('auth.passwordMinLength'));
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }

    if (newPassword === currentPassword) {
      setError(t('auth.passwordSameAsCurrent'));
      return;
    }

    const parsed = ChangePasswordSchema.safeParse({
      currentPassword,
      newPassword,
    });
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? t('auth.passwordMinLength'));
      return;
    }

    setSubmitting(true);
    try {
      await changePasswordRequest(parsed.data);
      toast.success(t('auth.passwordChangedSuccess'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      onOpenChange(false);
      await logout({
        skipServerRevoke: true,
        notice: t('auth.passwordChangedNotice'),
      });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setError(t('auth.currentPasswordInvalid'));
          return;
        }
        if (err.status === 429) {
          setError(t('auth.rateLimited', { seconds: err.retryAfterSeconds ?? 60 }));
          return;
        }
        setError(err.message);
        return;
      }
      if (err instanceof NetworkError) {
        setError(t('auth.networkError'));
        return;
      }
      setError(err instanceof Error ? err.message : 'Erreur lors du changement de mot de passe.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <div className="mb-1 flex items-center gap-2.5 text-slate-600">
            <span className="grid size-9 place-items-center rounded-sm bg-blue-50 text-blue-500">
              <RiLockPasswordFill className="size-5" />
            </span>
            <DialogTitle>{t('auth.changePasswordTitle')}</DialogTitle>
          </div>
          <DialogDescription>{t('auth.changePasswordDesc')}</DialogDescription>
        </DialogHeader>

        {!isOnline && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-md bg-amber-50 p-3 text-xs font-semibold text-amber-500"
          >
            <RiErrorWarningFill className="mt-0.5 size-4 shrink-0" />
            <span>{t('auth.changePasswordOffline')}</span>
          </div>
        )}

        {pendingOutbox > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-amber-50 p-3 text-xs font-semibold text-amber-500">
            <span className="flex items-start gap-2">
              <RiErrorWarningFill className="mt-0.5 size-4 shrink-0" />
              <span>{t('auth.changePasswordOutboxWarn', { count: pendingOutbox })}</span>
            </span>
            {isOnline && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                icon={<RiRefreshFill />}
                loading={syncing}
                onClick={() => void handleSyncDrafts()}
              >
                {t('sync.syncNow')}
              </Button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="change-pw-current">{t('auth.currentPasswordLabel')}</Label>
            <Input
              id="change-pw-current"
              type="password"
              passwordToggle
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder={t('auth.passwordPlaceholder')}
              state={error ? 'error' : 'default'}
              disabled={!isOnline || submitting}
              required
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="change-pw-new">{t('auth.newPasswordLabel')}</Label>
            <Input
              id="change-pw-new"
              type="password"
              passwordToggle
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              state={error ? 'error' : 'default'}
              disabled={!isOnline || submitting}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="change-pw-confirm">{t('auth.confirmNewPasswordLabel')}</Label>
            <Input
              id="change-pw-confirm"
              type="password"
              passwordToggle
              autoComplete="new-password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              placeholder="••••••••"
              state={error ? 'error' : 'default'}
              disabled={!isOnline || submitting}
              required
            />
          </div>

          {error && <FieldMessage tone="error">{error}</FieldMessage>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={handleClose} disabled={submitting}>
              {t('admin.common.cancel')}
            </Button>
            <Button
              type="submit"
              loading={submitting}
              disabled={!isOnline}
              icon={<RiLockPasswordFill />}
            >
              {t('auth.changePasswordSubmit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
