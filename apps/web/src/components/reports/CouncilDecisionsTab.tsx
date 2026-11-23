import {
  BulkCouncilDecisionsSchema,
  CAMEROON_DEFAULT_GRADING_RULES,
  COUNCIL_DECISIONS,
  type CouncilDecisionType,
} from '@lycee/shared';
import {
  RiAwardFill,
  RiLockFill,
  RiSaveFill,
  RiSparklingFill,
} from '@remixicon/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
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
import { Dropdown } from '@/components/ui/dropdown';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { getGradingRules } from '@/lib/api/admin';
import { adminKeys, reportKeys } from '@/lib/api/query-keys';
import {
  bulkUpsertCouncilDecisions,
  getClassResults,
  listCouncilDecisions,
} from '@/lib/api/reports';
import { t } from '@/lib/i18n';
import { formatDecimalFr, formatReportError } from './ReportContextBar';

interface DecisionDraft {
  decision: CouncilDecisionType;
  absencesHours: number;
  generalAppreciation: string;
}

function decisionBadgeVariant(decision: CouncilDecisionType) {
  switch (decision) {
    case 'congratulations':
    case 'encouragement':
    case 'honor_roll':
    case 'pass':
      return 'success' as const;
    case 'warning':
    case 'repeat':
      return 'warning' as const;
    case 'blame':
    case 'expelled':
      return 'destructive' as const;
    default:
      return 'neutral' as const;
  }
}

export function CouncilDecisionsTab({
  academicYearId,
  classId,
  periodId,
  isLocked,
  isOnline,
}: {
  academicYearId: string;
  classId: string;
  periodId: string;
  isLocked: boolean;
  isOnline: boolean;
}) {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, DecisionDraft>>({});

  const resultsQuery = useQuery({
    queryKey: reportKeys.classResults(classId, periodId),
    queryFn: () => getClassResults(classId, periodId),
    enabled: Boolean(classId && periodId),
  });

  const decisionsQuery = useQuery({
    queryKey: reportKeys.councilDecisions({ classId, periodId }),
    queryFn: () => listCouncilDecisions({ classId, periodId }),
    enabled: Boolean(classId && periodId),
  });

  const rulesQuery = useQuery({
    queryKey: adminKeys.gradingRules(academicYearId),
    queryFn: () => getGradingRules(academicYearId),
    enabled: Boolean(academicYearId),
  });

  const baselineMap = useMemo(() => {
    const byEnrollment = new Map<string, DecisionDraft>();
    for (const st of resultsQuery.data?.students ?? []) {
      byEnrollment.set(st.enrollmentId, {
        decision: st.councilDecision,
        absencesHours: st.absencesHours,
        generalAppreciation: st.councilAppreciation,
      });
    }
    for (const d of decisionsQuery.data ?? []) {
      byEnrollment.set(d.enrollmentId, {
        decision: d.decision,
        absencesHours: d.absencesHours,
        generalAppreciation: d.generalAppreciation,
      });
    }
    return byEnrollment;
  }, [resultsQuery.data, decisionsQuery.data]);

  useEffect(() => {
    const initial: Record<string, DecisionDraft> = {};
    for (const [enrollmentId, value] of baselineMap.entries()) {
      initial[enrollmentId] = { ...value };
    }
    setDrafts(initial);
  }, [baselineMap, classId, periodId]);

  const dirtyRows = useMemo(() => {
    const list: Array<{
      enrollmentId: string;
      periodId: string;
      decision: CouncilDecisionType;
      absencesHours: number;
      generalAppreciation: string;
    }> = [];

    for (const st of resultsQuery.data?.students ?? []) {
      const draft = drafts[st.enrollmentId];
      const base = baselineMap.get(st.enrollmentId);
      if (!draft || !base) continue;

      if (
        draft.decision !== base.decision ||
        draft.absencesHours !== base.absencesHours ||
        draft.generalAppreciation.trim() !== base.generalAppreciation.trim()
      ) {
        list.push({
          enrollmentId: st.enrollmentId,
          periodId,
          decision: draft.decision,
          absencesHours: Math.max(0, Math.round(draft.absencesHours)),
          generalAppreciation: draft.generalAppreciation.trim(),
        });
      }
    }
    return list;
  }, [resultsQuery.data, drafts, baselineMap, periodId]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const parsed = BulkCouncilDecisionsSchema.safeParse({ decisions: dirtyRows });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'Décisions du conseil invalides.');
      }
      return bulkUpsertCouncilDecisions(parsed.data.decisions);
    },
    onSuccess: async (res) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: reportKeys.councilDecisions({ classId, periodId }),
        }),
        queryClient.invalidateQueries({ queryKey: reportKeys.classResults(classId, periodId) }),
        queryClient.invalidateQueries({ queryKey: reportKeys.honorRoll(classId, periodId) }),
      ]);
      refreshLocalSyncSnapshot();
      toast.success(t('reports.council.savedSuccess', { count: res.count }));
    },
    onError: (err) => {
      toast.error(formatReportError(err));
    },
  });

  const handleAutoSuggest = () => {
    const rules = rulesQuery.data ?? CAMEROON_DEFAULT_GRADING_RULES;
    const next = { ...drafts };
    let suggested = 0;

    for (const st of resultsQuery.data?.students ?? []) {
      const current = next[st.enrollmentId];
      if (!current || current.decision !== 'none' || st.generalAverage === null) continue;

      let proposed: Exclude<CouncilDecisionType, 'none'>;
      if (st.generalAverage >= rules.congratulationThreshold) {
        proposed = 'congratulations';
      } else if (st.generalAverage >= rules.encouragementThreshold) {
        proposed = 'encouragement';
      } else if (st.generalAverage >= rules.honorRollThreshold) {
        proposed = 'honor_roll';
      } else if (st.generalAverage >= rules.passingThreshold) {
        proposed = 'pass';
      } else {
        proposed = 'warning';
      }

      next[st.enrollmentId] = { ...current, decision: proposed };
      suggested += 1;
    }

    setDrafts(next);
    toast.info(t('reports.council.autoSuggestSuccess', { count: suggested }));
  };

  if (resultsQuery.isLoading || decisionsQuery.isLoading) {
    return (
      <Card className="flex items-center justify-center gap-3 p-12 text-sm text-muted-foreground">
        <Spinner className="size-5 text-primary" />
        <span>{t('admin.common.loading')}</span>
      </Card>
    );
  }

  if (resultsQuery.isError) {
    return (
      <Card variant="outline" className="p-6 text-sm text-brick-500">
        {formatReportError(resultsQuery.error)}
      </Card>
    );
  }

  const students = resultsQuery.data?.students ?? [];
  const readOnly = isLocked || !isOnline;

  return (
    <div className="space-y-4">
      {isLocked && (
        <Card variant="info" className="flex items-center gap-3 p-4 text-sm font-semibold">
          <RiLockFill className="size-5 shrink-0" />
          <span>{t('reports.council.lockedReadOnlyBanner')}</span>
        </Card>
      )}

      <Card variant="elevated">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>{t('reports.council.title')}</CardTitle>
            <CardDescription>{t('reports.council.desc')}</CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {dirtyRows.length > 0 && (
              <Badge variant="warning" className="tabular-nums">
                {t('reports.council.unsavedChangesBadge', { count: dirtyRows.length })}
              </Badge>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={<RiSparklingFill />}
              disabled={readOnly || students.length === 0}
              onClick={handleAutoSuggest}
            >
              {t('reports.council.autoSuggestBtn')}
            </Button>
            <Button
              type="button"
              icon={<RiSaveFill />}
              loading={saveMutation.isPending}
              disabled={readOnly || dirtyRows.length === 0}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending
                ? t('reports.council.savingBtn')
                : t('reports.council.saveAllBtn')}
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {students.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-muted-foreground">
              {t('reports.council.emptyStudents')}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="border-b border-border bg-muted/60 text-xs font-extrabold tracking-wide text-muted-foreground uppercase">
                  <tr>
                    <th className="px-3 py-3">{t('reports.council.colRank')}</th>
                    <th className="px-3 py-3">{t('reports.council.colStudent')}</th>
                    <th className="px-3 py-3">{t('reports.council.colAverage')}</th>
                    <th className="px-3 py-3">{t('reports.council.colDecision')}</th>
                    <th className="px-3 py-3">{t('reports.council.colAbsences')}</th>
                    <th className="px-3 py-3">{t('reports.council.colAppreciation')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {students.map((st) => {
                    const draft = drafts[st.enrollmentId] ?? {
                      decision: st.councilDecision,
                      absencesHours: st.absencesHours,
                      generalAppreciation: st.councilAppreciation,
                    };
                    return (
                      <tr key={st.enrollmentId} className="align-middle hover:bg-muted/30">
                        <td className="px-3 py-3 font-extrabold text-primary tabular-nums">
                          {st.rank ?? '—'}
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-bold text-foreground">
                            {st.lastName} {st.firstName}
                          </div>
                          <div className="text-xs text-muted-foreground tabular-nums">
                            {st.matricule}
                            {st.autoAppreciation ? ` · ${st.autoAppreciation}` : ''}
                          </div>
                        </td>
                        <td className="px-3 py-3 font-extrabold tabular-nums">
                          {st.generalAverage !== null ? `${formatDecimalFr(st.generalAverage)} / 20` : '—'}
                        </td>
                        <td className="px-3 py-3">
                          {readOnly ? (
                            <Badge variant={decisionBadgeVariant(draft.decision)}>
                              {t(`councilDecisions.${draft.decision}`)}
                            </Badge>
                          ) : (
                            <Dropdown
                              label={t('reports.council.colDecision')}
                              className="h-12 min-w-48 px-3"
                              value={draft.decision}
                              onChange={(val) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [st.enrollmentId]: {
                                    ...draft,
                                    decision: val as CouncilDecisionType,
                                  },
                                }))
                              }
                              options={COUNCIL_DECISIONS.map((code) => ({
                                value: code,
                                label: t(`councilDecisions.${code}`),
                                icon: <RiAwardFill />,
                              }))}
                            />
                          )}
                        </td>
                        <td className="w-28 px-3 py-3">
                          <Input
                            size="sm"
                            type="number"
                            min={0}
                            max={5000}
                            aria-label={`${t('reports.council.colAbsences')} ${st.lastName} ${st.firstName}`}
                            className="tabular-nums"
                            disabled={readOnly}
                            value={draft.absencesHours}
                            onChange={(e) => {
                              const parsed = Number.parseInt(e.target.value, 10);
                              setDrafts((prev) => ({
                                ...prev,
                                [st.enrollmentId]: {
                                  ...draft,
                                  absencesHours: Number.isNaN(parsed) ? 0 : Math.max(0, parsed),
                                },
                              }));
                            }}
                          />
                        </td>
                        <td className="min-w-60 px-3 py-3">
                          <Input
                            size="sm"
                            maxLength={500}
                            aria-label={`${t('reports.council.colAppreciation')} ${st.lastName} ${st.firstName}`}
                            placeholder={t('reports.council.appreciationPlaceholder')}
                            disabled={readOnly}
                            value={draft.generalAppreciation}
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [st.enrollmentId]: {
                                  ...draft,
                                  generalAppreciation: e.target.value,
                                },
                              }))
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
