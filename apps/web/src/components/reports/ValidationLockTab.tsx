import { LockPeriodSchema, UnlockPeriodSchema } from '@lycee/shared';
import {
  RiCheckboxCircleFill,
  RiErrorWarningFill,
  RiLockFill,
  RiLockUnlockFill,
  RiSchoolFill,
} from '@remixicon/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { refreshLocalSyncSnapshot } from '@/components/admin/admin-utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldMessage, Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import type { PeriodDto } from '@/lib/api/admin';
import { adminKeys, reportKeys } from '@/lib/api/query-keys';
import { getPeriodCompleteness, lockPeriod, unlockPeriod } from '@/lib/api/reports';
import { t } from '@/lib/i18n';
import { formatReportError } from './ReportContextBar';

export function ValidationLockTab({
  academicYearId,
  period,
  periods,
  canUnlock,
  isOnline,
}: {
  academicYearId: string;
  period: PeriodDto;
  periods: PeriodDto[];
  canUnlock: boolean;
  isOnline: boolean;
}) {
  const queryClient = useQueryClient();

  const [lockModalOpen, setLockModalOpen] = useState(false);
  const [lockReason, setLockReason] = useState('');
  const [lockError, setLockError] = useState<string | null>(null);

  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [unlockReason, setUnlockReason] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const completenessQuery = useQuery({
    queryKey: reportKeys.completeness(period.id),
    queryFn: () => getPeriodCompleteness(period.id),
    enabled: Boolean(period.id),
  });

  const parentPeriod = useMemo(
    () =>
      period.parentPeriodId
        ? periods.find((p) => p.id === period.parentPeriodId)
        : undefined,
    [periods, period.parentPeriodId],
  );
  const isParentLocked = parentPeriod?.status === 'locked';

  const summary = useMemo(() => {
    const classes = completenessQuery.data?.classes ?? [];
    let totalMissing = 0;
    let incompleteClasses = 0;
    for (const cls of classes) {
      if (!cls.isComplete) incompleteClasses += 1;
      for (const sub of cls.subjects) {
        totalMissing += sub.missingCount;
      }
    }
    return { totalMissing, incompleteClasses };
  }, [completenessQuery.data]);

  const invalidateAfterStateChange = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: adminKeys.periods(academicYearId) }),
      queryClient.invalidateQueries({ queryKey: reportKeys.all }),
    ]);
    refreshLocalSyncSnapshot();
  };

  const lockMutation = useMutation({
    mutationFn: () => {
      const parsed = LockPeriodSchema.parse({ reason: lockReason });
      return lockPeriod(period.id, parsed.reason);
    },
    onSuccess: async (res) => {
      await invalidateAfterStateChange();
      setLockModalOpen(false);
      setLockReason('');
      setLockError(null);
      toast.success(
        t('reports.validation.lockSuccess', {
          code: res.period.code,
          students: res.snapshots.studentResultsCount,
          subjects: res.snapshots.subjectResultsCount,
        }),
      );
    },
    onError: (err) => {
      const msg = formatReportError(err);
      setLockError(msg);
      toast.error(msg);
    },
  });

  const unlockMutation = useMutation({
    mutationFn: () => {
      const parsed = UnlockPeriodSchema.safeParse({ reason: unlockReason });
      if (!parsed.success) {
        throw new Error(
          parsed.error.issues[0]?.message ?? t('reports.validation.unlockReasonMinError'),
        );
      }
      return unlockPeriod(period.id, parsed.data.reason);
    },
    onSuccess: async (res) => {
      await invalidateAfterStateChange();
      setUnlockModalOpen(false);
      setUnlockReason('');
      setUnlockError(null);
      toast.success(t('reports.validation.unlockSuccess', { code: res.period.code }));
    },
    onError: (err) => {
      const msg = formatReportError(err);
      setUnlockError(msg);
      toast.error(msg);
    },
  });

  if (completenessQuery.isLoading) {
    return (
      <Card className="flex items-center justify-center gap-3 p-12 text-sm text-muted-foreground">
        <Spinner className="size-5 text-primary" />
        <span>{t('admin.common.loading')}</span>
      </Card>
    );
  }

  if (completenessQuery.isError || !completenessQuery.data) {
    return (
      <Card variant="outline" className="p-6 text-sm text-brick-500">
        {formatReportError(completenessQuery.error)}
      </Card>
    );
  }

  const data = completenessQuery.data;

  return (
    <div className="space-y-6">
      {/* Bannière état & action principale */}
      <Card variant="elevated">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>
                {data.periodCode} — {data.periodName}
              </CardTitle>
              <Badge
                variant={data.status === 'locked' ? 'dark' : data.isComplete ? 'success' : 'warning'}
                icon={
                  data.status === 'locked' ? (
                    <RiLockFill />
                  ) : data.isComplete ? (
                    <RiCheckboxCircleFill />
                  ) : (
                    <RiErrorWarningFill />
                  )
                }
              >
                {data.status === 'locked'
                  ? t('admin.academic.periodLockedTag')
                  : data.isComplete
                    ? t('reports.validation.completeBadge')
                    : t('reports.validation.incompleteBadge', { count: summary.totalMissing })}
              </Badge>
            </div>
            <CardDescription>
              {data.isComplete
                ? t('reports.validation.summaryComplete')
                : t('reports.validation.summaryIncomplete', {
                    missing: summary.totalMissing,
                    classes: summary.incompleteClasses,
                  })}
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {data.status === 'open' ? (
              <Button
                type="button"
                variant="info"
                icon={<RiLockFill />}
                disabled={!isOnline}
                onClick={() => {
                  setLockError(null);
                  setLockReason('');
                  setLockModalOpen(true);
                }}
              >
                {t('reports.validation.lockBtn')}
              </Button>
            ) : (
              canUnlock && (
                <Button
                  type="button"
                  variant="destructive"
                  icon={<RiLockUnlockFill />}
                  disabled={!isOnline || isParentLocked}
                  onClick={() => {
                    setUnlockError(null);
                    setUnlockReason('');
                    setUnlockModalOpen(true);
                  }}
                >
                  {t('reports.validation.unlockBtn')}
                </Button>
              )
            )}
          </div>
        </CardHeader>
        {data.status === 'locked' && canUnlock && isParentLocked && (
          <CardContent>
            <Card variant="info" className="flex items-center gap-2.5 p-3.5 text-xs font-semibold">
              <RiLockFill className="size-4 shrink-0" />
              <span>{t('reports.validation.unlockParentLockedHint')}</span>
            </Card>
          </CardContent>
        )}
      </Card>

      {/* Détail complétude par classe */}
      <div className="grid gap-5 lg:grid-cols-2">
        {data.classes.map((cls) => (
          <Card key={cls.classId} variant="default" className="flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="grid size-9 place-items-center rounded-md bg-blue-50 text-blue-500">
                  <RiSchoolFill className="size-4.5" />
                </span>
                <div>
                  <CardTitle className="text-base">{cls.className}</CardTitle>
                  <CardDescription className="text-xs tabular-nums">
                    {cls.level} · {cls.expectedStudents} élève(s) actif(s)
                  </CardDescription>
                </div>
              </div>
              <Badge
                variant={cls.isComplete ? 'success' : 'warning'}
                icon={cls.isComplete ? <RiCheckboxCircleFill /> : <RiErrorWarningFill />}
              >
                {cls.isComplete
                  ? t('reports.validation.completeBadge')
                  : t('reports.validation.incompleteBadge', {
                      count: cls.subjects.reduce((acc, s) => acc + s.missingCount, 0),
                    })}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-2.5 pt-0">
              {cls.subjects.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t('reports.validation.noSubjects')}
                </p>
              ) : (
                cls.subjects.map((subj) => {
                  const pct =
                    subj.expectedStudents > 0
                      ? Math.min(100, Math.round((subj.gradedCount / subj.expectedStudents) * 100))
                      : 100;
                  return (
                    <div key={subj.classSubjectId} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate font-semibold text-foreground">
                          <span className="mr-1.5 font-bold text-primary">{subj.subjectCode}</span>
                          {subj.subjectName}
                        </span>
                        <span
                          className={`shrink-0 font-bold tabular-nums ${
                            subj.isComplete ? 'text-primary' : 'text-amber-500'
                          }`}
                        >
                          {subj.gradedCount} / {subj.expectedStudents}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-sm bg-muted">
                        <div
                          className={`h-full transition-all ${
                            subj.isComplete ? 'bg-primary' : 'bg-warning'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Modale verrouillage */}
      <Dialog open={lockModalOpen} onOpenChange={setLockModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('reports.validation.lockModalTitle', {
                code: period.code,
                name: period.name,
              })}
            </DialogTitle>
            <DialogDescription>{t('reports.validation.lockModalDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!data.isComplete && (
              <Card variant="outline" className="border-amber-300 bg-amber-50 p-3.5 text-xs font-semibold text-amber-500">
                {t('reports.validation.lockModalIncompleteWarn', {
                  missing: summary.totalMissing,
                })}
              </Card>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="lock-reason" optional>
                {t('reports.validation.lockReasonLabel')}
              </Label>
              <Input
                id="lock-reason"
                placeholder={t('reports.validation.lockReasonPlaceholder')}
                value={lockReason}
                onChange={(e) => setLockReason(e.target.value)}
              />
            </div>
            {lockError && <FieldMessage tone="error">{lockError}</FieldMessage>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setLockModalOpen(false)}>
              {t('admin.common.cancel')}
            </Button>
            <Button
              type="button"
              variant="info"
              icon={<RiLockFill />}
              loading={lockMutation.isPending}
              disabled={!isOnline}
              onClick={() => lockMutation.mutate()}
            >
              {t('reports.validation.lockConfirmAction')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modale déverrouillage exceptionnel */}
      <Dialog open={unlockModalOpen} onOpenChange={setUnlockModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('reports.validation.unlockModalTitle', { code: period.code })}
            </DialogTitle>
            <DialogDescription>{t('reports.validation.unlockModalDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="unlock-reason">{t('reports.validation.unlockReasonLabel')}</Label>
              <Textarea
                id="unlock-reason"
                placeholder={t('reports.validation.unlockReasonPlaceholder')}
                value={unlockReason}
                state={unlockError ? 'error' : 'default'}
                onChange={(e) => setUnlockReason(e.target.value)}
              />
            </div>
            {unlockError && <FieldMessage tone="error">{unlockError}</FieldMessage>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setUnlockModalOpen(false)}>
              {t('admin.common.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              icon={<RiLockUnlockFill />}
              loading={unlockMutation.isPending}
              disabled={!isOnline}
              onClick={() => unlockMutation.mutate()}
            >
              {t('reports.validation.unlockConfirmAction')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
