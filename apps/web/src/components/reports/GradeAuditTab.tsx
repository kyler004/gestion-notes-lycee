import type { GradeStatus } from '@lycee/shared';
import { RiCalendar2Fill, RiHistoryFill, RiSchoolFill } from '@remixicon/react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Dropdown } from '@/components/ui/dropdown';
import { Spinner } from '@/components/ui/spinner';
import type { ClassDto, PeriodDto } from '@/lib/api/admin';
import { reportKeys } from '@/lib/api/query-keys';
import { listGradeAuditLogs } from '@/lib/api/reports';
import { t } from '@/lib/i18n';
import { formatDecimalFr, formatReportError } from './ReportContextBar';

const ALL_VALUE = '__all__';

function formatAuditValue(score: number | null, status: GradeStatus | null): string {
  if (status === null) return '';
  if (status === 'absent') return t('grades.statusAbsent');
  if (status === 'excused') return t('grades.statusExcused');
  return formatDecimalFr(score);
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
  classes,
  periods,
}: {
  classes: ClassDto[];
  periods: PeriodDto[];
}) {
  const [classFilter, setClassFilter] = useState<string>(ALL_VALUE);
  const [periodFilter, setPeriodFilter] = useState<string>(ALL_VALUE);

  const filters = {
    classId: classFilter === ALL_VALUE ? undefined : classFilter,
    periodId: periodFilter === ALL_VALUE ? undefined : periodFilter,
  };

  const auditQuery = useQuery({
    queryKey: reportKeys.gradeAudit(filters),
    queryFn: () => listGradeAuditLogs(filters),
  });

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
        <div className="grid gap-3 sm:grid-cols-2">
          <Dropdown
            label={t('reports.context.classLabel')}
            value={classFilter}
            onChange={setClassFilter}
            options={[
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
            ]}
          />
          <Dropdown
            label={t('reports.context.periodLabel')}
            value={periodFilter}
            onChange={setPeriodFilter}
            options={[
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
            ]}
          />
        </div>

        {auditQuery.isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Spinner className="size-4 text-primary" />
            <span>{t('admin.common.loading')}</span>
          </div>
        ) : auditQuery.isError ? (
          <Card variant="outline" className="p-4 text-sm text-brick-500">
            {formatReportError(auditQuery.error)}
          </Card>
        ) : (auditQuery.data ?? []).length === 0 ? (
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
                {(auditQuery.data ?? []).map((log) => {
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
        )}
      </CardContent>
    </Card>
  );
}
