import type { GradeStatus } from '@lycee/shared';
import {
  RiBarChartBoxFill,
  RiBookOpenFill,
  RiCalculatorFill,
  RiCalendarFill,
  RiCheckboxCircleFill,
  RiEdit2Fill,
  RiErrorWarningFill,
  RiLockFill,
  RiRefreshFill,
  RiSchoolFill,
  RiTrophyFill,
  RiUploadCloud2Fill,
} from '@remixicon/react';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AppreciationDialog,
  type AppreciationPrompt,
} from '@/components/grades/AppreciationDialog';
import {
  EditReasonDialog,
  type PendingReasonPrompt,
} from '@/components/grades/EditReasonDialog';
import { GradeEntryTable } from '@/components/grades/GradeEntryTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, StatCard } from '@/components/ui/card';
import { Dropdown } from '@/components/ui/dropdown';
import { PageHeader } from '@/components/ui/header';
import { Input, SearchInput } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { getUserDb } from '@/db/user-db';
import { hasRoleAccess } from '@/lib/auth/roles';
import { formatScore, normalizeScoresEqual } from '@/lib/grades/format';
import { buildGradeWorkspace, type GradeGridRow } from '@/lib/grades/workspace';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useSessionStore } from '@/stores/session.store';
import { useSyncStore } from '@/stores/sync.store';
import {
  discardOutboxItem,
  enqueueGradeMutation,
  requiresEditReason,
} from '@/sync/engine';

const ALLOWED_ROLES = ['teacher', 'admin', 'censor'] as const;

type QuickFilter = 'all' | 'missing' | 'attention';

export const Route = createFileRoute('/_authenticated/grades')({
  beforeLoad: () => {
    const role = useSessionStore.getState().user?.role;
    if (!hasRoleAccess(role, ALLOWED_ROLES)) {
      throw redirect({ to: '/forbidden' });
    }
  },
  component: GradesPage,
});

function formatValueLabel(score: number | null, status: GradeStatus): string {
  if (status === 'present') {
    return `${formatScore(score)} / 20`;
  }
  return status === 'absent' ? t('grades.statusAbsent') : t('grades.statusExcused');
}

function GradesPage() {
  const user = useSessionStore((s) => s.user);
  const isOnline = useSessionStore((s) => s.isOnline);
  const syncPhase = useSyncStore((s) => s.phase);
  const triggerSync = useSyncStore((s) => s.triggerSync);
  const setOutboxDialogOpen = useSyncStore((s) => s.setOutboxDialogOpen);

  const [selectedClassId, setSelectedClassId] = useState<string | undefined>();
  const [selectedClassSubjectId, setSelectedClassSubjectId] = useState<string | undefined>();
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState('');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [batchReason, setBatchReason] = useState('');
  const [reasonPrompt, setReasonPrompt] = useState<PendingReasonPrompt | null>(null);
  const [appreciationPrompt, setAppreciationPrompt] = useState<AppreciationPrompt | null>(null);

  const initialAutoPullRef = useRef(false);

  const snapshot = useLiveQuery(async () => {
    if (!user) return null;
    const db = getUserDb(user.id);
    const [
      academicYears,
      gradingRules,
      periods,
      subjectGroups,
      subjects,
      classes,
      classSubjects,
      teacherAssignments,
      enrollments,
      students,
      serverGrades,
      outboxOps,
      lastPullMeta,
    ] = await Promise.all([
      db.academicYears.toArray(),
      db.gradingRules.toArray(),
      db.periods.toArray(),
      db.subjectGroups.toArray(),
      db.subjects.toArray(),
      db.classes.toArray(),
      db.classSubjects.toArray(),
      db.teacherAssignments.toArray(),
      db.enrollments.toArray(),
      db.students.toArray(),
      db.grades.toArray(),
      db.outbox.toArray(),
      db.syncMeta.get('lastPullAt'),
    ]);

    return {
      academicYears,
      gradingRules,
      periods,
      subjectGroups,
      subjects,
      classes,
      classSubjects,
      teacherAssignments,
      enrollments,
      students,
      serverGrades,
      outboxOps,
      hasSyncedOnce: Boolean(lastPullMeta?.value),
    };
  }, [user?.id]);

  useEffect(() => {
    if (!snapshot || !user || !isOnline || initialAutoPullRef.current) return;
    if (!snapshot.hasSyncedOnce && syncPhase === 'idle') {
      initialAutoPullRef.current = true;
      void triggerSync({ quiet: true });
    }
  }, [snapshot, user, isOnline, syncPhase, triggerSync]);

  const workspace = useMemo(() => {
    if (!snapshot || !user) return null;
    return buildGradeWorkspace({
      userId: user.id,
      role: user.role,
      academicYears: snapshot.academicYears,
      gradingRules: snapshot.gradingRules,
      periods: snapshot.periods,
      subjectGroups: snapshot.subjectGroups,
      subjects: snapshot.subjects,
      classes: snapshot.classes,
      classSubjects: snapshot.classSubjects,
      teacherAssignments: snapshot.teacherAssignments,
      enrollments: snapshot.enrollments,
      students: snapshot.students,
      serverGrades: snapshot.serverGrades,
      outboxOps: snapshot.outboxOps,
      selectedClassId,
      selectedClassSubjectId,
      selectedPeriodId,
    });
  }, [snapshot, user, selectedClassId, selectedClassSubjectId, selectedPeriodId]);

  useEffect(() => {
    if (!workspace) return;
    if (!selectedClassId && workspace.selectedClass) {
      setSelectedClassId(workspace.selectedClass.classInfo.id);
    }
    if (!selectedClassSubjectId && workspace.selectedSubject) {
      setSelectedClassSubjectId(workspace.selectedSubject.classSubject.id);
    }
    if (!selectedPeriodId && workspace.selectedSequence) {
      setSelectedPeriodId(workspace.selectedSequence.period.id);
    }
  }, [workspace, selectedClassId, selectedClassSubjectId, selectedPeriodId]);

  const filteredRows = useMemo(() => {
    if (!workspace) return [];
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return workspace.rows.filter((row) => {
      if (quickFilter === 'missing') {
        if (row.effectiveStatus !== null || row.enrollment.status !== 'active') return false;
      } else if (quickFilter === 'attention') {
        if (row.syncState !== 'pending' && row.syncState !== 'syncing' && row.syncState !== 'failed') {
          return false;
        }
      }

      if (!normalizedSearch) return true;
      return (
        row.fullName.toLowerCase().includes(normalizedSearch) ||
        row.student.matricule.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [workspace, searchQuery, quickFilter]);

  if (!user) return null;

  const db = getUserDb(user.id);
  const failedTotal = snapshot?.outboxOps.filter((o) => o.status === 'failed').length ?? 0;
  const pendingTotal =
    snapshot?.outboxOps.filter((o) => o.status === 'pending' || o.status === 'syncing').length ?? 0;

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

  const persistMutation = async (
    row: GradeGridRow,
    input: {
      score: number | null;
      status: GradeStatus;
      appreciation?: string | null;
      reason?: string;
    },
  ) => {
    if (!workspace?.selectedSubject || !workspace.selectedSequence) return;
    await enqueueGradeMutation(db, {
      enrollmentId: row.enrollment.id,
      classSubjectId: workspace.selectedSubject.classSubject.id,
      periodId: workspace.selectedSequence.period.id,
      score: input.score,
      status: input.status,
      appreciation: input.appreciation,
      reason: input.reason,
    });

    if (isOnline) {
      void triggerSync({ quiet: true });
    }
  };

  const commitGradeChange = async (
    row: GradeGridRow,
    nextScore: number | null,
    nextStatus: GradeStatus,
    nextAppreciation?: string | null,
  ): Promise<boolean> => {
    const scoreSame = normalizeScoresEqual(row.effectiveScore, nextScore);
    const statusSame = row.effectiveStatus === nextStatus;
    const appreciationSame =
      nextAppreciation === undefined ||
      (nextAppreciation ?? null) === (row.effectiveAppreciation ?? null);

    if (scoreSame && statusSame && appreciationSame) {
      return true;
    }

    const needsReason = requiresEditReason(row.serverGrade, {
      score: nextScore,
      status: nextStatus,
    });

    if (needsReason && !batchReason.trim()) {
      setReasonPrompt({
        studentName: row.fullName,
        valueLabel: formatValueLabel(nextScore, nextStatus),
        onConfirm: async (reason) => {
          await persistMutation(row, {
            score: nextScore,
            status: nextStatus,
            appreciation:
              nextAppreciation !== undefined ? nextAppreciation : row.effectiveAppreciation,
            reason,
          });
        },
      });
      return false;
    }

    await persistMutation(row, {
      score: nextScore,
      status: nextStatus,
      appreciation:
        nextAppreciation !== undefined ? nextAppreciation : row.effectiveAppreciation,
      reason: needsReason ? batchReason.trim() : undefined,
    });
    return true;
  };

  const handleCommitScore = async (row: GradeGridRow, score: number | null): Promise<boolean> => {
    if (score === null) {
      if (row.effectiveStatus === null) return true;
      if (row.effectiveStatus === 'present' && !row.serverGrade && row.outboxOp) {
        await discardOutboxItem(db, row.targetKey);
      }
      return true;
    }
    return commitGradeChange(row, score, 'present');
  };

  const handleCommitStatus = async (row: GradeGridRow, status: GradeStatus): Promise<boolean> => {
    if (status === row.effectiveStatus) return true;

    if (status === 'present') {
      if (row.serverGrade?.status === 'present' && row.serverGrade.score !== null) {
        return commitGradeChange(row, row.serverGrade.score, 'present');
      }
      if (!row.serverGrade && row.outboxOp) {
        await discardOutboxItem(db, row.targetKey);
      }
      return true;
    }

    return commitGradeChange(row, null, status);
  };

  const handleEditAppreciation = (row: GradeGridRow) => {
    if (row.effectiveStatus === null) return;
    setAppreciationPrompt({
      studentName: row.fullName,
      autoAppreciation: row.autoAppreciation,
      initialValue: row.effectiveAppreciation ?? '',
      onSave: async (appreciation) => {
        await commitGradeChange(
          row,
          row.effectiveScore,
          row.effectiveStatus as GradeStatus,
          appreciation,
        );
      },
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        tone="emerald"
        icon={<RiBookOpenFill />}
        title={t('grades.pageTitle')}
        subtitle={
          workspace?.academicYear
            ? t('grades.pageSubtitle', { year: workspace.academicYear.label })
            : t('grades.pageSubtitleEmpty')
        }
        actions={
          <>
            {(pendingTotal > 0 || failedTotal > 0) && (
              <button
                type="button"
                onClick={() => setOutboxDialogOpen(true)}
                className="cursor-pointer rounded-sm"
              >
                {failedTotal > 0 ? (
                  <Badge variant="destructive" icon={<RiErrorWarningFill />} className="tabular-nums">
                    {t('sync.failedCount', { count: failedTotal })}
                  </Badge>
                ) : (
                  <Badge variant="dark" icon={<RiUploadCloud2Fill />} className="tabular-nums">
                    {t('sync.pendingCount', { count: pendingTotal })}
                  </Badge>
                )}
              </button>
            )}
            <Button
              type="button"
              variant="dark"
              size="sm"
              icon={<RiRefreshFill />}
              loading={syncPhase === 'syncing'}
              disabled={!isOnline}
              onClick={() => void handleManualSync()}
            >
              {t('sync.syncNow')}
            </Button>
          </>
        }
      />

      {!snapshot ? (
        <Card className="flex items-center justify-center gap-3 p-12 text-sm font-semibold text-muted-foreground">
          <Spinner className="text-primary" />
          <span>{t('app.loading')}</span>
        </Card>
      ) : !snapshot.hasSyncedOnce && workspace?.classOptions.length === 0 ? (
        <Card variant="outline" className="space-y-4 p-8 text-center">
          <p className="text-base font-extrabold text-foreground">{t('grades.emptyNoSyncTitle')}</p>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            {t('grades.emptyNoSyncBody')}
          </p>
          <div className="flex justify-center">
            <Button
              type="button"
              icon={<RiRefreshFill />}
              loading={syncPhase === 'syncing'}
              disabled={!isOnline}
              onClick={() => void handleManualSync()}
            >
              {t('sync.syncNow')}
            </Button>
          </div>
        </Card>
      ) : !workspace || workspace.classOptions.length === 0 ? (
        <Card variant="outline" className="space-y-2 p-8 text-center">
          <p className="text-base font-extrabold text-foreground">
            {t('grades.emptyNoAssignmentsTitle')}
          </p>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            {t('grades.emptyNoAssignmentsBody')}
          </p>
        </Card>
      ) : (
        <>
          {/* Barre de sélection Classe / Matière / Séquence */}
          <div className="grid gap-3 md:grid-cols-3">
            <Dropdown
              label={t('grades.classLabel')}
              placeholder={t('grades.classPlaceholder')}
              value={workspace.selectedClass?.classInfo.id}
              onChange={(classId) => {
                setSelectedClassId(classId);
                const nextClass = workspace.classOptions.find((c) => c.classInfo.id === classId);
                setSelectedClassSubjectId(nextClass?.subjectOptions[0]?.classSubject.id);
              }}
              options={workspace.classOptions.map((opt) => ({
                value: opt.classInfo.id,
                label: opt.classInfo.name,
                description: `${opt.activeStudentCount} élève(s) · ${opt.subjectOptions.length} matière(s)`,
                icon: <RiSchoolFill />,
              }))}
            />

            <Dropdown
              label={t('grades.subjectLabel')}
              placeholder={t('grades.subjectPlaceholder')}
              value={workspace.selectedSubject?.classSubject.id}
              onChange={(csId) => setSelectedClassSubjectId(csId)}
              options={(workspace.selectedClass?.subjectOptions ?? []).map((opt) => ({
                value: opt.classSubject.id,
                label: opt.subject.name,
                description: `Coef. ${opt.classSubject.coefficient}`,
                icon: <RiBookOpenFill />,
              }))}
            />

            <Dropdown
              label={t('grades.sequenceLabel')}
              placeholder={t('grades.sequencePlaceholder')}
              value={workspace.selectedSequence?.period.id}
              onChange={(periodId) => setSelectedPeriodId(periodId)}
              options={workspace.sequenceOptions.map((opt) => ({
                value: opt.period.id,
                label: `${opt.period.name} (${opt.period.code})`,
                description: `${opt.parentTrimester?.name ?? 'Période'}${
                  opt.isLocked ? ' · Verrouillée' : ''
                }`,
                icon: opt.isLocked ? <RiLockFill /> : <RiCalendarFill />,
              }))}
            />
          </div>

          {/* Bandeau verrouillage OU motif de modification par lot */}
          {workspace.selectedSequence?.isLocked ? (
            <Card variant="info" className="flex items-start gap-3 p-4">
              <RiLockFill className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="text-sm font-extrabold">{t('grades.lockedBannerTitle')}</p>
                <p className="mt-0.5 text-xs opacity-90">{t('grades.lockedBannerBody')}</p>
              </div>
            </Card>
          ) : workspace.hasAnyServerGrades ? (
            <Card className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <RiEdit2Fill className="size-4 text-primary" />
                  <Label htmlFor="batch-edit-reason">{t('grades.batchReasonLabel')}</Label>
                </div>
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
                      onClick={() => setBatchReason(preset)}
                      className={cn(
                        'cursor-pointer rounded-sm px-2.5 py-1 text-xs font-semibold transition-colors',
                        batchReason === preset
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-secondary-foreground hover:bg-slate-100',
                      )}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
                <Input
                  id="batch-edit-reason"
                  size="sm"
                  containerClassName="sm:max-w-md"
                  placeholder={t('sync.reasonPlaceholder')}
                  value={batchReason}
                  onChange={(e) => setBatchReason(e.target.value)}
                  maxLength={255}
                />
                <p className="text-xs text-muted-foreground">{t('grades.batchReasonHint')}</p>
              </div>
            </Card>
          ) : null}

          {/* Indicateurs calculés en temps réel par @lycee/shared */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={t('grades.statFilled')}
              value={`${workspace.stats.filledCount}/${workspace.stats.activeCount}`}
              tone="emerald"
              icon={<RiCheckboxCircleFill />}
            />
            <StatCard
              label={t('grades.statAverage')}
              value={`${formatScore(workspace.stats.classAverage)} / 20`}
              tone="blue"
              icon={<RiCalculatorFill />}
            />
            <StatCard
              label={t('grades.statPassRate', { threshold: workspace.rules.passingThreshold })}
              value={
                workspace.stats.passRate !== null
                  ? `${Math.round(workspace.stats.passRate)}%`
                  : '—'
              }
              tone="violet"
              icon={<RiTrophyFill />}
            />
            <StatCard
              label={t('grades.statMinMax')}
              value={`${formatScore(workspace.stats.minScore)} – ${formatScore(
                workspace.stats.maxScore,
              )}`}
              tone="slate"
              icon={<RiBarChartBoxFill />}
            />
          </div>

          {/* Recherche + filtres rapides */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SearchInput
              aria-label={t('grades.searchPlaceholder')}
              placeholder={t('grades.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onClear={() => setSearchQuery('')}
              containerClassName="sm:max-w-sm"
            />
            <div className="flex flex-wrap gap-2">
              {(
                [
                  {
                    key: 'all',
                    label: t('grades.filterAll', { count: workspace.rows.length }),
                  },
                  {
                    key: 'missing',
                    label: t('grades.filterMissing', { count: workspace.stats.missingCount }),
                  },
                  {
                    key: 'attention',
                    label: t('grades.filterAttention', { count: workspace.stats.attentionCount }),
                  },
                ] as const
              ).map((tab) => {
                const active = quickFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setQuickFilter(tab.key)}
                    className={cn(
                      'cursor-pointer rounded-md px-3.5 py-2 text-xs font-bold transition-all tabular-nums',
                      active
                        ? 'bg-slate-600 text-white shadow-edge'
                        : 'border border-border bg-card text-foreground hover:bg-muted',
                    )}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Grille ou état vide */}
          {workspace.rows.length === 0 ? (
            <Card variant="outline" className="space-y-2 p-8 text-center">
              <p className="text-base font-extrabold text-foreground">
                {t('grades.emptyNoStudentsTitle')}
              </p>
              <p className="mx-auto max-w-md text-sm text-muted-foreground">
                {t('grades.emptyNoStudentsBody')}
              </p>
            </Card>
          ) : filteredRows.length === 0 ? (
            <Card variant="outline" className="space-y-3 p-8 text-center">
              <p className="text-sm font-bold text-foreground">{t('grades.emptyNoFilterMatch')}</p>
              <div className="flex justify-center">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setSearchQuery('');
                    setQuickFilter('all');
                  }}
                >
                  {t('grades.resetFilters')}
                </Button>
              </div>
            </Card>
          ) : (
            <GradeEntryTable
              rows={filteredRows}
              isLocked={Boolean(workspace.selectedSequence?.isLocked)}
              onCommitScore={handleCommitScore}
              onCommitStatus={handleCommitStatus}
              onEditAppreciation={handleEditAppreciation}
              onOpenOutbox={() => setOutboxDialogOpen(true)}
            />
          )}
        </>
      )}

      <EditReasonDialog prompt={reasonPrompt} onClose={() => setReasonPrompt(null)} />
      <AppreciationDialog
        prompt={appreciationPrompt}
        onClose={() => setAppreciationPrompt(null)}
      />
    </div>
  );
}
