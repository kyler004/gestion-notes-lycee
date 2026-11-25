import type { CouncilDecisionType, GradeStatus } from '@lycee/shared';
import {
  RiAwardFill,
  RiBookOpenFill,
  RiCalendar2Fill,
  RiCalendarCheckFill,
  RiFilter3Fill,
  RiHistoryFill,
  RiLockFill,
  RiLockUnlockFill,
  RiSchoolFill,
} from '@remixicon/react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Dropdown } from '@/components/ui/dropdown';
import { Spinner } from '@/components/ui/spinner';
import type { AcademicYearDto, ClassDto, PeriodDto } from '@/lib/api/admin';
import { reportKeys } from '@/lib/api/query-keys';
import {
  listCouncilDecisionAuditLogs,
  listGradeAuditLogs,
  listPeriodAuditLogs,
} from '@/lib/api/reports';
import { t } from '@/lib/i18n';
import { formatDecimalFr, formatReportError } from './ReportContextBar';

const ALL_VALUE = '__all__';

export type AuditSubview = 'grades' | 'periods' | 'council';

function formatAuditValue(score: number | null, status: GradeStatus | null): string {
  if (status === null) return '';
  if (status === 'absent') return t('grades.statusAbsent');
  if (status === 'excused') return t('grades.statusExcused');
  return formatDecimalFr(score);
}

function formatDecisionLabel(decision: CouncilDecisionType): string {
  return t(`councilDecisions.${decision}`);
}

function formatServerDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function GradeAuditTab({
  years = [],
  classes,
  periods,
  initialSubview = 'grades',
}: {
  years?: AcademicYearDto[];
  classes: ClassDto[];
  periods: PeriodDto[];
  initialSubview?: AuditSubview;
}) {
  const [subview, setSubview] = useState<AuditSubview>(initialSubview);
  const [yearFilter, setYearFilter] = useState<string>(ALL_VALUE);
  const [classFilter, setClassFilter] = useState<string>(ALL_VALUE);
  const [periodFilter, setPeriodFilter] = useState<string>(ALL_VALUE);
  const [actionFilter, setActionFilter] = useState<string>(ALL_VALUE);

  useEffect(() => {
    setSubview(initialSubview);
  }, [initialSubview]);

  const gradeFilters = {
    classId: classFilter === ALL_VALUE ? undefined : classFilter,
    periodId: periodFilter === ALL_VALUE ? undefined : periodFilter,
  };

  const periodAuditAction: 'locked' | 'unlocked' | undefined =
    actionFilter === 'locked' || actionFilter === 'unlocked'
      ? actionFilter
      : undefined;

  const periodAuditFilters = {
    academicYearId: yearFilter === ALL_VALUE ? undefined : yearFilter,
    periodId: periodFilter === ALL_VALUE ? undefined : periodFilter,
    action: periodAuditAction,
  };

  const councilAuditFilters = {
    academicYearId: yearFilter === ALL_VALUE ? undefined : yearFilter,
    classId: classFilter === ALL_VALUE ? undefined : classFilter,
    periodId: periodFilter === ALL_VALUE ? undefined : periodFilter,
  };

  const gradeAuditQuery = useQuery({
    queryKey: reportKeys.gradeAudit(gradeFilters),
    queryFn: () => listGradeAuditLogs(gradeFilters),
    enabled: subview === 'grades',
  });

  const periodAuditQuery = useQuery({
    queryKey: reportKeys.periodAudit(periodAuditFilters),
    queryFn: () => listPeriodAuditLogs(periodAuditFilters),
    enabled: subview === 'periods',
  });

  const councilAuditQuery = useQuery({
    queryKey: reportKeys.councilDecisionAudit(councilAuditFilters),
    queryFn: () => listCouncilDecisionAuditLogs(councilAuditFilters),
    enabled: subview === 'council',
  });

  const activeQuery =
    subview === 'grades'
      ? gradeAuditQuery
      : subview === 'periods'
        ? periodAuditQuery
        : councilAuditQuery;

  const yearOptions = [
    {
      value: ALL_VALUE,
      label: t('reports.audit.allYearsOption'),
      icon: <RiCalendarCheckFill />,
    },
    ...years.map((y) => ({
      value: y.id,
      label: y.isActive ? `${y.label} · ${t('admin.yearContextActiveTag')}` : y.label,
      icon: <RiCalendarCheckFill />,
    })),
  ];

  const classOptions = [
    {
      value: ALL_VALUE,
      label: t('reports.audit.allClassesOption'),
      icon: <RiSchoolFill />,
    },
    ...classes.map((c) => ({
      value: c.id,
      label: c.name,
      icon: <RiSchoolFill />,
    })),
  ];

  const periodOptions = [
    {
      value: ALL_VALUE,
      label: t('reports.audit.allPeriodsOption'),
      icon: <RiCalendar2Fill />,
    },
    ...periods.map((p) => ({
      value: p.id,
      label: `${p.name} (${p.code})`,
      icon: <RiCalendar2Fill />,
    })),
  ];

  return (
    <Card variant="elevated">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>{t('reports.audit.title')}</CardTitle>
          <CardDescription>{t('reports.audit.desc')}</CardDescription>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-blue-50 text-blue-500">
          <RiHistoryFill className="size-5" />
        </span>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Sélecteur des 3 journaux d'audit */}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={subview === 'grades' ? 'dark' : 'outline'}
            icon={<RiBookOpenFill />}
            onClick={() => setSubview('grades')}
          >
            {t('reports.audit.subtabGrades')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={subview === 'periods' ? 'dark' : 'outline'}
            icon={<RiLockFill />}
            onClick={() => setSubview('periods')}
          >
            {t('reports.audit.subtabPeriods')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={subview === 'council' ? 'dark' : 'outline'}
            icon={<RiAwardFill />}
            onClick={() => setSubview('council')}
          >
            {t('reports.audit.subtabCouncil')}
          </Button>
        </div>

        {/* Filtres contextuels selon le journal actif */}
        {subview === 'grades' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Dropdown
              label={t('reports.context.classLabel')}
              value={classFilter}
              onChange={setClassFilter}
              options={classOptions}
            />
            <Dropdown
              label={t('reports.context.periodLabel')}
              value={periodFilter}
              onChange={setPeriodFilter}
              options={periodOptions}
            />
          </div>
        )}

        {subview === 'periods' && (
          <div className="grid gap-3 sm:grid-cols-3">
            {years.length > 0 && (
              <Dropdown
                label={t('reports.audit.yearFilterLabel')}
                value={yearFilter}
                onChange={setYearFilter}
                options={yearOptions}
              />
            )}
            <Dropdown
              label={t('reports.context.periodLabel')}
              value={periodFilter}
              onChange={setPeriodFilter}
              options={periodOptions}
            />
            <Dropdown
              label={t('reports.audit.actionFilterLabel')}
              value={actionFilter}
              onChange={setActionFilter}
              options={[
                {
                  value: ALL_VALUE,
                  label: t('reports.audit.allActionsOption'),
                  icon: <RiFilter3Fill />,
                },
                {
                  value: 'locked',
                  label: t('reports.audit.actionLocked'),
                  icon: <RiLockFill />,
                },
                {
                  value: 'unlocked',
                  label: t('reports.audit.actionUnlocked'),
                  icon: <RiLockUnlockFill />,
                },
              ]}
            />
          </div>
        )}

        {subview === 'council' && (
          <div className="grid gap-3 sm:grid-cols-3">
            {years.length > 0 && (
              <Dropdown
                label={t('reports.audit.yearFilterLabel')}
                value={yearFilter}
                onChange={setYearFilter}
                options={yearOptions}
              />
            )}
            <Dropdown
              label={t('reports.context.classLabel')}
              value={classFilter}
              onChange={setClassFilter}
              options={classOptions}
            />
            <Dropdown
              label={t('reports.context.periodLabel')}
              value={periodFilter}
              onChange={setPeriodFilter}
              options={periodOptions}
            />
          </div>
        )}

        {/* Contenu tableau */}
        {activeQuery.isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Spinner className="size-4 text-primary" />
            <span>{t('admin.common.loading')}</span>
          </div>
        ) : activeQuery.isError ? (
          <Card variant="outline" className="p-4 text-sm text-brick-500">
            {formatReportError(activeQuery.error)}
          </Card>
        ) : subview === 'grades' ? (
          (gradeAuditQuery.data ?? []).length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-muted-foreground">
              {t('reports.audit.emptyLogs')}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="border-b border-border bg-muted/60 text-xs font-extrabold tracking-wide text-muted-foreground uppercase">
                  <tr>
                    <th className="px-4 py-3">{t('reports.audit.colDate')}</th>
                    <th className="px-4 py-3">{t('reports.audit.colStudent')}</th>
                    <th className="px-4 py-3">{t('reports.audit.colSubject')}</th>
                    <th className="px-4 py-3">{t('reports.audit.colPeriod')}</th>
                    <th className="px-4 py-3">{t('reports.audit.colTransition')}</th>
                    <th className="px-4 py-3">{t('reports.audit.colAuthor')}</th>
                    <th className="px-4 py-3">{t('reports.audit.colReason')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {(gradeAuditQuery.data ?? []).map((log) => {
                    const prevLabel = formatAuditValue(log.previousScore, log.previousStatus);
                    const nextLabel = formatAuditValue(log.newScore, log.newStatus);
                    return (
                      <tr key={log.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                          {formatServerDate(log.serverTimestamp)}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-bold text-foreground">
                            {log.studentLastName} {log.studentFirstName}
                          </p>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {log.studentMatricule}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="mr-1.5 font-bold text-primary">{log.subjectCode}</span>
                          {log.subjectName}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="neutral">{log.periodCode}</Badge>
                        </td>
                        <td className="px-4 py-3 font-extrabold tabular-nums">
                          {log.previousStatus === null ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Badge variant="secondary">{t('reports.audit.initialEntryTag')}</Badge>
                              <span>→ {nextLabel}</span>
                            </span>
                          ) : (
                            <span>
                              {prevLabel} → {nextLabel}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-semibold">{log.changedByName}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{log.reason}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : subview === 'periods' ? (
          (periodAuditQuery.data ?? []).length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-muted-foreground">
              {t('reports.audit.emptyPeriodLogs')}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="border-b border-border bg-muted/60 text-xs font-extrabold tracking-wide text-muted-foreground uppercase">
                  <tr>
                    <th className="px-4 py-3">{t('reports.audit.colDate')}</th>
                    <th className="px-4 py-3">{t('reports.audit.colYear')}</th>
                    <th className="px-4 py-3">{t('reports.audit.colPeriod')}</th>
                    <th className="px-4 py-3">{t('reports.audit.colAction')}</th>
                    <th className="px-4 py-3">{t('reports.audit.colAuthor')}</th>
                    <th className="px-4 py-3">{t('reports.audit.colReason')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {(periodAuditQuery.data ?? []).map((log) => (
                    <tr key={log.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                        {formatServerDate(log.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold tabular-nums">
                        {log.academicYearLabel}
                      </td>
                      <td className="px-4 py-3">
                        <span className="mr-1.5 font-bold text-primary">{log.periodCode}</span>
                        {log.periodName}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={log.action === 'locked' ? 'dark' : 'warning'}
                          icon={
                            log.action === 'locked' ? <RiLockFill /> : <RiLockUnlockFill />
                          }
                        >
                          {log.action === 'locked'
                            ? t('reports.audit.actionLocked')
                            : t('reports.audit.actionUnlocked')}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-foreground">{log.actorName}</p>
                        <p className="text-xs text-muted-foreground">@{log.actorUsername}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {log.reason || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (councilAuditQuery.data ?? []).length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-muted-foreground">
            {t('reports.audit.emptyCouncilLogs')}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-border bg-muted/60 text-xs font-extrabold tracking-wide text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3">{t('reports.audit.colDate')}</th>
                  <th className="px-4 py-3">{t('reports.audit.colClass')}</th>
                  <th className="px-4 py-3">{t('reports.audit.colStudent')}</th>
                  <th className="px-4 py-3">{t('reports.audit.colPeriod')}</th>
                  <th className="px-4 py-3">{t('reports.audit.colDecisionTransition')}</th>
                  <th className="px-4 py-3">{t('reports.audit.colAbsencesTransition')}</th>
                  <th className="px-4 py-3">{t('reports.audit.colAppreciationTransition')}</th>
                  <th className="px-4 py-3">{t('reports.audit.colAuthor')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {(councilAuditQuery.data ?? []).map((log) => (
                  <tr key={log.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                      {formatServerDate(log.serverTimestamp)}
                    </td>
                    <td className="px-4 py-3 font-semibold">{log.className}</td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-foreground">
                        {log.studentLastName} {log.studentFirstName}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {log.studentMatricule}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="neutral">{log.periodCode}</Badge>
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {log.previousDecision === null ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Badge variant="secondary">{t('reports.audit.initialEntryTag')}</Badge>
                          <span>→ {formatDecisionLabel(log.newDecision)}</span>
                        </span>
                      ) : (
                        <span>
                          {formatDecisionLabel(log.previousDecision)} →{' '}
                          {formatDecisionLabel(log.newDecision)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold tabular-nums">
                      {log.previousAbsencesHours === null
                        ? `${log.newAbsencesHours} h`
                        : `${log.previousAbsencesHours} h → ${log.newAbsencesHours} h`}
                    </td>
                    <td className="max-w-56 px-4 py-3 text-xs text-muted-foreground">
                      {log.previousAppreciation === null
                        ? log.newAppreciation || '—'
                        : `${log.previousAppreciation || '—'} → ${log.newAppreciation || '—'}`}
                    </td>
                    <td className="px-4 py-3 font-semibold">{log.changedByName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
