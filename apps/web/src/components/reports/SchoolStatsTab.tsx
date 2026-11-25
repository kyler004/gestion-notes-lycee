import {
  RiArrowRightFill,
  RiAwardFill,
  RiBarChartBoxFill,
  RiGroupFill,
  RiUserStarFill,
} from '@remixicon/react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  StatCard,
} from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { reportKeys } from '@/lib/api/query-keys';
import { getAnnualSchoolStats, getSchoolStats } from '@/lib/api/reports';
import { t } from '@/lib/i18n';
import { formatDecimalFr, formatReportError } from './ReportContextBar';

export function SchoolStatsTab({
  academicYearId,
  periodId,
  isAnnual = false,
  onInspectClass,
}: {
  academicYearId: string;
  periodId: string;
  isAnnual?: boolean;
  onInspectClass: (classId: string) => void;
}) {
  const statsQuery = useQuery({
    queryKey: isAnnual
      ? reportKeys.annualSchoolStats(academicYearId)
      : reportKeys.schoolStats(academicYearId, periodId),
    queryFn: () =>
      isAnnual ? getAnnualSchoolStats(academicYearId) : getSchoolStats(academicYearId, periodId),
    enabled: Boolean(academicYearId && (isAnnual || periodId)),
  });

  if (statsQuery.isLoading) {
    return (
      <Card className="flex items-center justify-center gap-3 p-12 text-sm text-muted-foreground">
        <Spinner className="size-5 text-primary" />
        <span>{t('admin.common.loading')}</span>
      </Card>
    );
  }

  if (statsQuery.isError || !statsQuery.data) {
    return (
      <Card variant="outline" className="p-6 text-sm text-brick-500">
        {formatReportError(statsQuery.error)}
      </Card>
    );
  }

  const stats = statsQuery.data;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="slate"
          label={t('reports.stats.totalStudents')}
          value={String(stats.totalStudents)}
          icon={<RiGroupFill />}
        />
        <StatCard
          tone="blue"
          label={t('reports.stats.evaluatedStudents')}
          value={String(stats.evaluatedStudents)}
          icon={<RiUserStarFill />}
        />
        <StatCard
          tone="emerald"
          label={t('reports.stats.overallAverage')}
          value={
            stats.overallAverage !== null
              ? `${formatDecimalFr(stats.overallAverage)} / 20`
              : '—'
          }
          icon={<RiBarChartBoxFill />}
        />
        <StatCard
          tone="violet"
          label={t('reports.stats.overallPassRate')}
          value={
            stats.overallPassRate !== null
              ? `${formatDecimalFr(stats.overallPassRate, 1)} %`
              : '—'
          }
          icon={<RiAwardFill />}
        />
      </div>

      <Card variant="elevated">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{t('reports.stats.classTableTitle')}</CardTitle>
            <CardDescription>
              {isAnnual ? t('reports.stats.classTableAnnualDesc') : t('reports.stats.classTableDesc')}
            </CardDescription>
          </div>
          <Badge variant={stats.period.isOfficial ? 'success' : 'warning'}>
            {stats.period.isOfficial
              ? isAnnual
                ? t('reports.context.annualOfficialBadge')
                : t('reports.statusOfficialBadge')
              : isAnnual
                ? t('reports.context.annualProvisionalBadge')
                : t('reports.statusProvisionalBadge')}
          </Badge>
        </CardHeader>
        <CardContent>
          {stats.classes.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-muted-foreground">
              {t('reports.stats.emptyClasses')}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="border-b border-border bg-muted/60 text-xs font-extrabold tracking-wide text-muted-foreground uppercase">
                  <tr>
                    <th className="px-4 py-3">{t('admin.classes.nameLabel')}</th>
                    <th className="px-4 py-3">{t('admin.classes.levelLabel')}</th>
                    <th className="px-4 py-3">Effectif</th>
                    <th className="px-4 py-3">Évalués</th>
                    <th className="px-4 py-3">Moyenne / 20</th>
                    <th className="px-4 py-3">Min / Max</th>
                    <th className="px-4 py-3">Réussite</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {stats.classes.map((row) => (
                    <tr key={row.classId} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-extrabold text-foreground">
                        {row.className}
                      </td>
                      <td className="px-4 py-3">
                        <span>{row.level}</span>
                        {row.series && (
                          <Badge variant="accent" className="ml-2">
                            {row.series}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{row.totalStudents}</td>
                      <td className="px-4 py-3 tabular-nums">{row.evaluatedStudents}</td>
                      <td className="px-4 py-3 font-bold tabular-nums">
                        {formatDecimalFr(row.average)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">
                        {formatDecimalFr(row.minAverage)} – {formatDecimalFr(row.maxAverage)}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {row.passRate !== null ? (
                          <Badge
                            variant={
                              row.passRate >= 50
                                ? 'success'
                                : 'warning'
                            }
                          >
                            {formatDecimalFr(row.passRate, 1)} %
                          </Badge>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          icon={<RiArrowRightFill />}
                          onClick={() => onInspectClass(row.classId)}
                        >
                          {t('reports.stats.viewClassBtn')}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
