import {
  RiCheckboxCircleFill,
  RiCloseCircleFill,
  RiDeleteBin6Fill,
  RiErrorWarningFill,
  RiLockFill,
  RiRefreshFill,
  RiUploadCloud2Fill,
} from '@remixicon/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { getUserDb, type LocalOutboxOperation } from '@/db/user-db';
import { formatScore } from '@/lib/grades/format';
import { t } from '@/lib/i18n';
import { useSessionStore } from '@/stores/session.store';
import { useSyncStore } from '@/stores/sync.store';
import { discardOutboxItem, retryOutboxItemWithReason } from '@/sync/engine';

function formatOutcomeBadge(op: LocalOutboxOperation) {
  if (op.status === 'pending') {
    return (
      <Badge variant="warning" icon={<RiUploadCloud2Fill />}>
        {t('sync.statusPending')}
      </Badge>
    );
  }
  if (op.status === 'syncing') {
    return (
      <Badge variant="info" icon={<RiRefreshFill />}>
        {t('sync.statusSyncing')}
      </Badge>
    );
  }

  switch (op.outcome) {
    case 'rejected_locked':
      return (
        <Badge variant="dark" icon={<RiLockFill />}>
          {t('sync.outcomeLocked')}
        </Badge>
      );
    case 'rejected_forbidden':
      return (
        <Badge variant="destructive" icon={<RiCloseCircleFill />}>
          {t('sync.outcomeForbidden')}
        </Badge>
      );
    default:
      return (
        <Badge variant="destructive" icon={<RiErrorWarningFill />}>
          {t('sync.outcomeValidation')}
        </Badge>
      );
  }
}

function formatSyncTimestamp(iso: string | null): string {
  if (!iso) return t('sync.neverSynced');
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return t('sync.neverSynced');
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function OutboxDialog() {
  const user = useSessionStore((s) => s.user);
  const isOnline = useSessionStore((s) => s.isOnline);
  const open = useSyncStore((s) => s.outboxDialogOpen);
  const setOpen = useSyncStore((s) => s.setOutboxDialogOpen);
  const phase = useSyncStore((s) => s.phase);
  const triggerSync = useSyncStore((s) => s.triggerSync);

  const [reasonDrafts, setReasonDrafts] = useState<Record<string, string>>({});

  const data = useLiveQuery(async () => {
    if (!user) return null;
    const db = getUserDb(user.id);
    const [ops, enrollments, students, classSubjects, subjects, classes, periods, lastPullMeta] =
      await Promise.all([
        db.outbox.orderBy('createdAt').toArray(),
        db.enrollments.toArray(),
        db.students.toArray(),
        db.classSubjects.toArray(),
        db.subjects.toArray(),
        db.classes.toArray(),
        db.periods.toArray(),
        db.syncMeta.get('lastPullAt'),
      ]);

    const enrById = new Map(enrollments.map((e) => [e.id, e]));
    const studentById = new Map(students.map((s) => [s.id, s]));
    const csById = new Map(classSubjects.map((cs) => [cs.id, cs]));
    const subjectById = new Map(subjects.map((s) => [s.id, s]));
    const classById = new Map(classes.map((c) => [c.id, c]));
    const periodById = new Map(periods.map((p) => [p.id, p]));

    return {
      ops,
      lastPullAt: typeof lastPullMeta?.value === 'string' ? lastPullMeta.value : null,
      describe: (op: LocalOutboxOperation) => {
        const enr = enrById.get(op.enrollmentId);
        const student = enr ? studentById.get(enr.studentId) : undefined;
        const cs = csById.get(op.classSubjectId);
        const subject = cs ? subjectById.get(cs.subjectId) : undefined;
        const cls = cs ? classById.get(cs.classId) : undefined;
        const period = periodById.get(op.periodId);

        const studentName = student
          ? `${student.lastName.toUpperCase()} ${student.firstName}`
          : op.enrollmentId.slice(0, 8);
        const context = [cls?.name, subject?.shortName ?? subject?.name, period?.code]
          .filter(Boolean)
          .join(' · ');

        const valueLabel =
          op.payload.status === 'present'
            ? `${formatScore(op.payload.score)} / 20`
            : op.payload.status === 'absent'
              ? t('grades.statusAbsent')
              : t('grades.statusExcused');

        return { studentName, context, valueLabel };
      },
    };
  }, [user?.id, open]);

  if (!user) return null;

  const ops = data?.ops ?? [];
  const pendingCount = ops.filter((o) => o.status === 'pending').length;

  const handleSyncAll = async () => {
    const summary = await triggerSync();
    if (!summary) return;
    if (summary.failedCount > 0) {
      toast.warning(t('sync.syncPartialFailure', { count: summary.failedCount }));
    } else {
      toast.success(t('sync.syncSuccess'));
    }
  };

  const handleRetryWithReason = async (op: LocalOutboxOperation) => {
    const db = getUserDb(user.id);
    const reasonText = reasonDrafts[op.targetKey] ?? op.payload.reason ?? '';
    await retryOutboxItemWithReason(db, op.targetKey, reasonText);
    if (isOnline) {
      await triggerSync();
    }
  };

  const handleDiscard = async (op: LocalOutboxOperation) => {
    const db = getUserDb(user.id);
    await discardOutboxItem(db, op.targetKey);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('sync.outboxTitle')}</DialogTitle>
          <DialogDescription>{t('sync.outboxSubtitle')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/60 px-3.5 py-2.5 text-xs font-semibold text-muted-foreground">
          <span>
            {t('sync.lastSyncLabel')}{' '}
            <strong className="text-foreground tabular-nums">
              {formatSyncTimestamp(data?.lastPullAt ?? null)}
            </strong>
          </span>
          <span className="tabular-nums">{ops.length} opération(s)</span>
        </div>

        {ops.length === 0 ? (
          <Card variant="success" className="flex items-center gap-4 p-5">
            <span className="grid size-11 shrink-0 place-items-center rounded-md bg-emerald-100/25 text-emerald-400">
              <RiCheckboxCircleFill className="size-6" />
            </span>
            <div>
              <p className="text-sm font-bold text-foreground">{t('sync.emptyOutboxTitle')}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t('sync.emptyOutboxBody')}</p>
            </div>
          </Card>
        ) : (
          <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
            {ops.map((op) => {
              const info = data?.describe(op);
              const isFailed = op.status === 'failed';
              const needsReasonInput = isFailed && op.outcome === 'rejected_validation';
              const currentReason = reasonDrafts[op.targetKey] ?? op.payload.reason ?? '';

              return (
                <Card key={op.targetKey} className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-foreground">
                        {info?.studentName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {info?.context} ·{' '}
                        <strong className="text-foreground tabular-nums">{info?.valueLabel}</strong>
                      </p>
                    </div>
                    {formatOutcomeBadge(op)}
                  </div>

                  {isFailed && op.errorMessage && (
                    <div
                      role="alert"
                      className="flex items-start gap-2 rounded-sm bg-brick-50 px-3 py-2 text-xs font-semibold text-brick-500"
                    >
                      <RiErrorWarningFill className="mt-0.5 size-4 shrink-0" />
                      <span>{op.errorMessage}</span>
                    </div>
                  )}

                  {needsReasonInput && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {(
                          [
                            t('grades.reasonPresets.typo'),
                            t('grades.reasonPresets.recount'),
                            t('grades.reasonPresets.justified'),
                          ] as const
                        ).map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() =>
                              setReasonDrafts((prev) => ({ ...prev, [op.targetKey]: preset }))
                            }
                            className="cursor-pointer rounded-sm bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-slate-100"
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                      <Input
                        size="sm"
                        placeholder={t('sync.reasonPlaceholder')}
                        value={currentReason}
                        onChange={(e) =>
                          setReasonDrafts((prev) => ({
                            ...prev,
                            [op.targetKey]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  )}

                  {isFailed && (
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        icon={<RiDeleteBin6Fill />}
                        onClick={() => void handleDiscard(op)}
                      >
                        {t('sync.discardAction')}
                      </Button>
                      {op.outcome !== 'rejected_locked' && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          icon={<RiRefreshFill />}
                          disabled={needsReasonInput && !currentReason.trim()}
                          onClick={() => void handleRetryWithReason(op)}
                        >
                          {t('sync.retryAction')}
                        </Button>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {t('sync.closeDialog')}
          </Button>
          <Button
            type="button"
            icon={<RiRefreshFill />}
            loading={phase === 'syncing'}
            disabled={!isOnline || pendingCount === 0}
            onClick={() => void handleSyncAll()}
          >
            {t('sync.syncNow')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
