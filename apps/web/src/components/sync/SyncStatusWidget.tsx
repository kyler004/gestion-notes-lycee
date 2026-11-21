import {
  RiCheckboxCircleFill,
  RiErrorWarningFill,
  RiRefreshFill,
  RiUploadCloud2Fill,
} from '@remixicon/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { getUserDb } from '@/db/user-db';
import { t } from '@/lib/i18n';
import { useSessionStore } from '@/stores/session.store';
import { useSyncStore } from '@/stores/sync.store';

export function SyncStatusWidget() {
  const user = useSessionStore((s) => s.user);
  const isOnline = useSessionStore((s) => s.isOnline);
  const phase = useSyncStore((s) => s.phase);
  const triggerSync = useSyncStore((s) => s.triggerSync);
  const setOutboxDialogOpen = useSyncStore((s) => s.setOutboxDialogOpen);

  const counts = useLiveQuery(async () => {
    if (!user) return { pending: 0, failed: 0 };
    const all = await getUserDb(user.id).outbox.toArray();
    return {
      pending: all.filter((o) => o.status === 'pending' || o.status === 'syncing').length,
      failed: all.filter((o) => o.status === 'failed').length,
    };
  }, [user?.id]) ?? { pending: 0, failed: 0 };

  if (!user) return null;

  const handleManualSync = async () => {
    const summary = await triggerSync();
    if (!summary) return;
    if (summary.failedCount > 0) {
      toast.warning(t('sync.syncPartialFailure', { count: summary.failedCount }));
      setOutboxDialogOpen(true);
    } else {
      toast.success(t('sync.syncSuccess'));
    }
  };

  return (
    <div className="flex items-center gap-1.5" data-testid="sync-widget">
      <button
        type="button"
        onClick={() => setOutboxDialogOpen(true)}
        className="cursor-pointer rounded-sm transition-opacity hover:opacity-85"
        aria-label={t('sync.outboxTitle')}
        data-testid="sync-outbox-trigger"
      >
        {phase === 'syncing' ? (
          <Badge variant="info" icon={<Spinner className="[&_svg]:size-3.5" />}>
            <span className="hidden sm:inline">{t('sync.syncing')}</span>
          </Badge>
        ) : counts.failed > 0 ? (
          <Badge variant="destructive" icon={<RiErrorWarningFill />} className="tabular-nums">
            {t('sync.failedCount', { count: counts.failed })}
          </Badge>
        ) : counts.pending > 0 ? (
          <Badge variant="warning" icon={<RiUploadCloud2Fill />} className="tabular-nums">
            {t('sync.pendingCount', { count: counts.pending })}
          </Badge>
        ) : (
          <Badge
            variant="info"
            icon={<RiCheckboxCircleFill />}
            className="hidden sm:inline-flex"
          >
            {t('sync.synced')}
          </Badge>
        )}
      </button>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-9"
        disabled={!isOnline || phase === 'syncing'}
        loading={phase === 'syncing'}
        onClick={() => void handleManualSync()}
        title={t('sync.syncNow')}
        aria-label={t('sync.syncNow')}
      >
        <RiRefreshFill className="size-4" />
      </Button>
    </div>
  );
}
