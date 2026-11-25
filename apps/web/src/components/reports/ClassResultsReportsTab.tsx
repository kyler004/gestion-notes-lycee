import {
  RiArrowUpDownFill,
  RiAwardFill,
  RiBarChartBoxFill,
  RiCheckDoubleFill,
  RiDownload2Fill,
  RiEyeFill,
  RiFileList3Fill,
  RiFilePdf2Fill,
  RiInformationFill,
  RiLockFill,
  RiMedalFill,
  RiTrophyFill,
} from '@remixicon/react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  StatCard,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { reportKeys } from '@/lib/api/query-keys';
import {
  downloadAnnualClassBulletinsPdf,
  downloadAnnualHonorRollPdf,
  downloadAnnualStudentBulletinPdf,
  downloadClassBulletinsPdf,
  downloadClassListPdf,
  downloadHonorRollPdf,
  downloadStudentBulletinPdf,
  getAnnualClassResults,
  getAnnualHonorRoll,
  getClassResults,
  getHonorRoll,
  triggerBrowserDownload,
  type BulletinStudentDto,
} from '@/lib/api/reports';
import { t } from '@/lib/i18n';
import { formatDecimalFr, formatReportError } from './ReportContextBar';

function formatIsoDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d);
}

export function ClassResultsReportsTab({
  classId,
  periodId,
  isAnnual = false,
  isOnline,
}: {
  classId: string;
  periodId: string;
  isAnnual?: boolean;
  isOnline: boolean;
}) {
  const [subview, setSubview] = useState<'ranking' | 'honor'>('ranking');
  const [rankingSort, setRankingSort] = useState<'rank' | 'name'>('rank');
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [detailStudent, setDetailStudent] = useState<BulletinStudentDto | null>(null);

  const resultsQuery = useQuery({
    queryKey: isAnnual
      ? reportKeys.annualClassResults(classId)
      : reportKeys.classResults(classId, periodId),
    queryFn: () =>
      isAnnual ? getAnnualClassResults(classId) : getClassResults(classId, periodId),
    enabled: Boolean(classId && (isAnnual || periodId)),
  });

  const honorQuery = useQuery({
    queryKey: isAnnual
      ? reportKeys.annualHonorRoll(classId)
      : reportKeys.honorRoll(classId, periodId),
    queryFn: () =>
      isAnnual ? getAnnualHonorRoll(classId) : getHonorRoll(classId, periodId),
    enabled: Boolean(classId && (isAnnual || periodId)),
  });

  const sortedStudents = useMemo(() => {
    const raw = resultsQuery.data?.students ?? [];
    return [...raw].sort((a, b) => {
      if (rankingSort === 'rank') {
        const ra = a.rank ?? Number.POSITIVE_INFINITY;
        const rb = b.rank ?? Number.POSITIVE_INFINITY;
        if (ra !== rb) return ra - rb;
      }
      return (
        a.lastName.localeCompare(b.lastName, 'fr') ||
        a.firstName.localeCompare(b.firstName, 'fr')
      );
    });
  }, [resultsQuery.data?.students, rankingSort]);

  const trimesterColumns = useMemo(() => {
    if (!isAnnual) return [];
    const firstWithSummaries = (resultsQuery.data?.students ?? []).find(
      (s) => (s.trimesterSummaries?.length ?? 0) > 0,
    );
    if (!firstWithSummaries?.trimesterSummaries) return [];
    return [...firstWithSummaries.trimesterSummaries].sort(
      (a, b) => a.orderIndex - b.orderIndex,
    );
  }, [isAnnual, resultsQuery.data?.students]);

  const detailTrimesterColumns = useMemo(() => {
    if (!isAnnual || !detailStudent) return [];
    const firstSubjectWithTrimesters = detailStudent.subjects.find(
      (sub) => (sub.trimesterScores?.length ?? 0) > 0,
    );
    if (firstSubjectWithTrimesters?.trimesterScores) {
      return [...firstSubjectWithTrimesters.trimesterScores].sort(
        (a, b) => a.orderIndex - b.orderIndex,
      );
    }
    return [...(detailStudent.trimesterSummaries ?? [])]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((ts) => ({ periodId: ts.periodId, code: ts.code, name: ts.name }));
  }, [isAnnual, detailStudent]);

  const honorEntries = useMemo(() => {
    const raw = honorQuery.data?.entries ?? [];
    return [...raw].sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999));
  }, [honorQuery.data?.entries]);

  const handleDownload = async (
    key: string,
    fetcher: () => Promise<{ blob: Blob; filename: string }>,
  ) => {
    setDownloadingKey(key);
    try {
      const { blob, filename } = await fetcher();
      triggerBrowserDownload(blob, filename);
      toast.success(t('reports.results.pdfDownloadSuccess', { filename }));
    } catch (err) {
      toast.error(formatReportError(err));
    } finally {
      setDownloadingKey(null);
    }
  };

  if (resultsQuery.isLoading) {
    return (
      <Card className="flex items-center justify-center gap-3 p-12 text-sm text-muted-foreground">
        <Spinner className="size-5 text-primary" />
        <span>{t('admin.common.loading')}</span>
      </Card>
    );
  }

  if (resultsQuery.isError || !resultsQuery.data) {
    return (
      <Card variant="outline" className="p-6 text-sm text-brick-500">
        {formatReportError(resultsQuery.error)}
      </Card>
    );
  }

  const report = resultsQuery.data;
  const honorThreshold =
    honorQuery.data?.honorRollThreshold ?? report.statistics.honorRollThreshold;

  const officialBadgeLabel = report.isOfficial
    ? isAnnual
      ? t('reports.context.annualOfficialBadge')
      : t('reports.statusOfficialBadge')
    : isAnnual
      ? t('reports.context.annualProvisionalBadge')
      : t('reports.statusProvisionalBadge');

  return (
    <div className="space-y-6">
      {/* Barre documents PDF */}
      <Card variant="elevated" className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={report.isOfficial ? 'success' : 'warning'} icon={report.isOfficial ? <RiLockFill /> : undefined}>
            {officialBadgeLabel}
          </Badge>
          <span className="text-sm font-bold text-foreground">
            {report.classInfo.name} · {report.period.code}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="info"
            size="sm"
            icon={<RiFilePdf2Fill />}
            loading={downloadingKey === 'class'}
            disabled={!isOnline || (downloadingKey !== null && downloadingKey !== 'class')}
            onClick={() =>
              void handleDownload('class', () =>
                isAnnual
                  ? downloadAnnualClassBulletinsPdf(classId)
                  : downloadClassBulletinsPdf(classId, periodId),
              )
            }
          >
            {isAnnual
              ? t('reports.results.pdfAnnualClassBulletins')
              : t('reports.results.pdfClassBulletins')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={<RiTrophyFill />}
            loading={downloadingKey === 'honor'}
            disabled={!isOnline || (downloadingKey !== null && downloadingKey !== 'honor')}
            onClick={() =>
              void handleDownload('honor', () =>
                isAnnual
                  ? downloadAnnualHonorRollPdf(classId)
                  : downloadHonorRollPdf(classId, periodId),
              )
            }
          >
            {isAnnual
              ? t('reports.results.pdfAnnualHonorRoll')
              : t('reports.results.pdfHonorRoll')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={<RiFileList3Fill />}
            loading={downloadingKey === 'list'}
            disabled={!isOnline || (downloadingKey !== null && downloadingKey !== 'list')}
            onClick={() => void handleDownload('list', () => downloadClassListPdf(classId))}
          >
            {t('reports.results.pdfClassList')}
          </Button>
        </div>
      </Card>

      {/* Bandeau officiel vs provisoire */}
      {report.isOfficial ? (
        <Card variant="success" className="flex items-center gap-3 p-4 text-sm font-semibold">
          <RiCheckDoubleFill className="size-5 shrink-0" />
          <span>
            {isAnnual
              ? t('reports.results.annualOfficialBanner', {
                  date: formatIsoDateTime(report.period.lockedAt),
                })
              : t('reports.results.officialBanner', {
                  date: formatIsoDateTime(report.period.lockedAt),
                })}
          </span>
        </Card>
      ) : (
        <Card variant="info" className="flex items-center gap-3 p-4 text-sm font-semibold">
          <RiInformationFill className="size-5 shrink-0" />
          <span>
            {isAnnual
              ? t('reports.results.annualProvisionalBanner')
              : t('reports.results.provisionalBanner')}
          </span>
        </Card>
      )}

      {/* KPI Classe */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="blue"
          label={t('reports.results.statClassAverage')}
          value={
            report.statistics.classAverage !== null
              ? `${formatDecimalFr(report.statistics.classAverage)} / 20`
              : '—'
          }
          icon={<RiBarChartBoxFill />}
        />
        <StatCard
          tone="emerald"
          label={t('reports.results.statPassRate', {
            threshold: report.statistics.passingThreshold,
          })}
          value={
            report.statistics.passRate !== null
              ? `${formatDecimalFr(report.statistics.passRate, 1)} %`
              : '—'
          }
          icon={<RiAwardFill />}
        />
        <StatCard
          tone="slate"
          label={t('reports.results.statMinMax')}
          value={`${formatDecimalFr(report.statistics.minClassAverage)} – ${formatDecimalFr(
            report.statistics.maxClassAverage,
          )}`}
          icon={<RiBarChartBoxFill />}
        />
        <StatCard
          tone="violet"
          label={t('reports.results.statHonorRoll', { threshold: honorThreshold })}
          value={String(report.statistics.honorRollCount)}
          icon={<RiTrophyFill />}
        />
      </div>

      {/* Classement OU Tableau d'honneur */}
      <Card variant="elevated">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={subview === 'ranking' ? 'dark' : 'outline'}
              onClick={() => setSubview('ranking')}
            >
              {t('reports.results.subtabRanking', { count: report.students.length })}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={subview === 'honor' ? 'dark' : 'outline'}
              icon={<RiTrophyFill />}
              onClick={() => setSubview('honor')}
            >
              {t('reports.results.subtabHonorRoll', { count: honorEntries.length })}
            </Button>
          </div>
          {subview === 'ranking' && report.students.length > 1 && (
            <div className="flex items-center gap-1.5" role="group" aria-label={t('reports.results.sortByRank')}>
              <Button
                type="button"
                size="sm"
                variant={rankingSort === 'rank' ? 'secondary' : 'ghost'}
                icon={<RiMedalFill />}
                aria-pressed={rankingSort === 'rank'}
                onClick={() => setRankingSort('rank')}
              >
                {t('reports.results.sortByRank')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={rankingSort === 'name' ? 'secondary' : 'ghost'}
                icon={<RiArrowUpDownFill />}
                aria-pressed={rankingSort === 'name'}
                onClick={() => setRankingSort('name')}
              >
                {t('reports.results.sortByName')}
              </Button>
            </div>
          )}
        </CardHeader>

        <CardContent>
          {subview === 'ranking' ? (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="border-b border-border bg-muted/60 text-xs font-extrabold tracking-wide text-muted-foreground uppercase">
                  <tr>
                    <th className="px-4 py-3">{t('reports.council.colRank')}</th>
                    <th className="px-4 py-3">{t('admin.students.matriculeLabel')}</th>
                    <th className="px-4 py-3">{t('reports.council.colStudent')}</th>
                    {trimesterColumns.map((trimCol) => (
                      <th key={trimCol.periodId} className="px-3 py-3 text-center">
                        {trimCol.code}
                      </th>
                    ))}
                    <th className="px-4 py-3">
                      {isAnnual ? t('reports.results.colAnnualAvg') : t('reports.council.colAverage')}
                    </th>
                    <th className="px-4 py-3">{t('reports.council.colDecision')}</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {sortedStudents.map((st) => (
                    <tr key={st.enrollmentId} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-extrabold text-primary tabular-nums">
                        {st.rank ?? '—'}
                      </td>
                      <td className="px-4 py-3 font-semibold text-muted-foreground tabular-nums">
                        {st.matricule}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-foreground">
                            {st.lastName} {st.firstName}
                          </span>
                          {st.isRepeater && (
                            <Badge variant="accent">{t('grades.repeaterTag')}</Badge>
                          )}
                          {st.isHonorRoll && (
                            <Badge variant="success" icon={<RiTrophyFill />}>
                              TH
                            </Badge>
                          )}
                        </div>
                        {st.autoAppreciation && (
                          <p className="text-xs text-muted-foreground">{st.autoAppreciation}</p>
                        )}
                      </td>
                      {trimesterColumns.map((trimCol) => {
                        const trimVal = st.trimesterSummaries?.find(
                          (ts) => ts.periodId === trimCol.periodId,
                        );
                        return (
                          <td
                            key={trimCol.periodId}
                            className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground tabular-nums"
                          >
                            {trimVal?.generalAverage !== null && trimVal?.generalAverage !== undefined
                              ? formatDecimalFr(trimVal.generalAverage)
                              : '—'}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 font-extrabold tabular-nums">
                        {st.generalAverage !== null
                          ? `${formatDecimalFr(st.generalAverage)} / 20`
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={st.councilDecision === 'none' ? 'neutral' : 'info'}>
                          {t(`councilDecisions.${st.councilDecision}`)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            icon={<RiEyeFill />}
                            onClick={() => setDetailStudent(st)}
                          >
                            {t('reports.results.detailBtn')}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            icon={<RiDownload2Fill />}
                            loading={downloadingKey === st.enrollmentId}
                            disabled={
                              !isOnline ||
                              (downloadingKey !== null && downloadingKey !== st.enrollmentId)
                            }
                            onClick={() =>
                              void handleDownload(st.enrollmentId, () =>
                                isAnnual
                                  ? downloadAnnualStudentBulletinPdf(st.enrollmentId)
                                  : downloadStudentBulletinPdf(st.enrollmentId, periodId),
                              )
                            }
                          >
                            {isAnnual
                              ? t('reports.results.pdfAnnualStudentBulletin')
                              : t('reports.results.pdfStudentBulletin')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : honorEntries.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-muted-foreground">
              {t('reports.results.emptyHonorRoll', { threshold: honorThreshold })}
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {honorEntries.map((entry) => (
                <Card key={entry.enrollmentId} variant="success" className="flex items-center justify-between gap-3 p-4">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-md bg-emerald-100 text-slate-600 font-extrabold tabular-nums">
                      #{entry.rank}
                    </span>
                    <div>
                      <p className="font-extrabold text-foreground">{entry.fullName}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {entry.matricule} · {entry.appreciation}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-extrabold text-emerald-400 tabular-nums">
                      {formatDecimalFr(entry.generalAverage)} / 20
                    </p>
                    <Badge variant="dark" className="mt-1">
                      {t(`councilDecisions.${entry.councilDecision}`)}
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modale détail bulletin élève */}
      <Dialog
        open={Boolean(detailStudent)}
        onOpenChange={(open) => !open && setDetailStudent(null)}
      >
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t('reports.results.bulletinDetailTitle', {
                name: detailStudent
                  ? `${detailStudent.lastName} ${detailStudent.firstName}`
                  : '',
              })}
            </DialogTitle>
            <DialogDescription className="tabular-nums">
              {t('reports.results.bulletinDetailDesc', {
                matricule: detailStudent?.matricule ?? '',
                avg: formatDecimalFr(detailStudent?.generalAverage),
                rank: detailStudent?.rank ?? '—',
                size: detailStudent?.classSize ?? 0,
              })}
            </DialogDescription>
          </DialogHeader>

          {detailStudent && (
            <div className="space-y-4">
              {isAnnual && (detailStudent.trimesterSummaries?.length ?? 0) > 0 && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-extrabold text-muted-foreground uppercase">
                      {t('reports.results.trimesterSummariesTitle')}
                    </p>
                    <Badge variant="neutral" className="tabular-nums">
                      {t('reports.results.totalAbsencesLabel', {
                        hours: detailStudent.absencesHours,
                      })}
                    </Badge>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {[...(detailStudent.trimesterSummaries ?? [])]
                      .sort((a, b) => a.orderIndex - b.orderIndex)
                      .map((ts) => (
                        <Card key={ts.periodId} className="flex items-center justify-between p-3">
                          <div>
                            <p className="text-xs font-extrabold text-foreground">{ts.code}</p>
                            <p className="text-[11px] text-muted-foreground">{ts.name}</p>
                          </div>
                          <div className="text-right tabular-nums">
                            <p className="text-sm font-extrabold text-primary">
                              {ts.generalAverage !== null
                                ? `${formatDecimalFr(ts.generalAverage)} / 20`
                                : '—'}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              Rang : {ts.rank ?? '—'}
                            </p>
                          </div>
                        </Card>
                      ))}
                  </div>
                </div>
              )}

              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="border-b border-border bg-muted/60 font-extrabold text-muted-foreground uppercase">
                    <tr>
                      <th className="px-3 py-2.5">{t('reports.results.colSubject')}</th>
                      <th className="px-3 py-2.5">{t('reports.results.colCoef')}</th>
                      {detailTrimesterColumns.map((trimCol) => (
                        <th key={trimCol.periodId} className="px-2.5 py-2.5 text-center">
                          {trimCol.code}
                        </th>
                      ))}
                      <th className="px-3 py-2.5">
                        {isAnnual ? t('reports.results.colAnnualAvg') : t('reports.results.colAvg')}
                      </th>
                      <th className="px-3 py-2.5">{t('reports.results.colRank')}</th>
                      <th className="px-3 py-2.5">{t('reports.results.colAppreciation')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-card">
                    {detailStudent.subjects.map((sub) => (
                      <tr key={sub.classSubjectId}>
                        <td className="px-3 py-2 font-bold text-foreground">
                          {sub.subjectName}
                        </td>
                        <td className="px-3 py-2 tabular-nums">{sub.coefficient}</td>
                        {detailTrimesterColumns.map((trimCol) => {
                          const tScore = sub.trimesterScores?.find(
                            (ts) => ts.periodId === trimCol.periodId,
                          );
                          return (
                            <td
                              key={trimCol.periodId}
                              className="px-2.5 py-2 text-center text-muted-foreground tabular-nums"
                            >
                              {formatDecimalFr(tScore?.average)}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 font-extrabold tabular-nums">
                          {formatDecimalFr(sub.average)}
                        </td>
                        <td className="px-3 py-2 tabular-nums">{sub.rank ?? '—'}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {sub.appreciation || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {detailStudent.councilAppreciation && (
                <Card variant="outline" className="p-3 text-xs">
                  <span className="font-bold">{t('reports.council.colAppreciation')} : </span>
                  {detailStudent.councilAppreciation}
                </Card>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDetailStudent(null)}>
              {t('admin.common.close')}
            </Button>
            {detailStudent && (
              <Button
                type="button"
                variant="info"
                icon={<RiDownload2Fill />}
                loading={downloadingKey === detailStudent.enrollmentId}
                disabled={!isOnline}
                onClick={() =>
                  void handleDownload(detailStudent.enrollmentId, () =>
                    isAnnual
                      ? downloadAnnualStudentBulletinPdf(detailStudent.enrollmentId)
                      : downloadStudentBulletinPdf(detailStudent.enrollmentId, periodId),
                  )
                }
              >
                {isAnnual
                  ? t('reports.results.pdfAnnualStudentBulletin')
                  : t('reports.results.pdfStudentBulletin')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
