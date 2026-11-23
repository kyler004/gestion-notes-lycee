import {
  RiAwardFill,
  RiBarChartBoxFill,
  RiFileTextFill,
  RiHistoryFill,
  RiShieldCheckFill,
  RiWifiOffFill,
} from '@remixicon/react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { ClassResultsReportsTab } from '@/components/reports/ClassResultsReportsTab';
import { CouncilDecisionsTab } from '@/components/reports/CouncilDecisionsTab';
import { GradeAuditTab } from '@/components/reports/GradeAuditTab';
import { ReportContextBar } from '@/components/reports/ReportContextBar';
import { SchoolStatsTab } from '@/components/reports/SchoolStatsTab';
import { ValidationLockTab } from '@/components/reports/ValidationLockTab';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/header';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import { listAcademicYears, listClasses, listPeriods } from '@/lib/api/admin';
import { adminKeys } from '@/lib/api/query-keys';
import { hasRoleAccess } from '@/lib/auth/roles';
import { t } from '@/lib/i18n';
import { useSessionStore } from '@/stores/session.store';

const ALLOWED_ROLES = ['admin', 'censor', 'principal', 'secretary'] as const;

const REPORT_TABS = ['stats', 'validation', 'council', 'results', 'audit'] as const;
export type ReportTabKey = (typeof REPORT_TABS)[number];

interface ReportsSearch {
  tab?: ReportTabKey;
}

function isReportTab(value: unknown): value is ReportTabKey {
  return typeof value === 'string' && (REPORT_TABS as readonly string[]).includes(value);
}

export const Route = createFileRoute('/_authenticated/reports')({
  validateSearch: (search: Record<string, unknown>): ReportsSearch => ({
    tab: isReportTab(search.tab) ? search.tab : undefined,
  }),
  beforeLoad: () => {
    const role = useSessionStore.getState().user?.role;
    if (!hasRoleAccess(role, ALLOWED_ROLES)) {
      throw redirect({ to: '/forbidden' });
    }
  },
  component: ReportsPage,
});

function ReportsPage() {
  const user = useSessionStore((s) => s.user);
  const isOnline = useSessionStore((s) => s.isOnline);
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const [selectedYearId, setSelectedYearId] = useState<string | undefined>();
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | undefined>();
  const [selectedClassId, setSelectedClassId] = useState<string | undefined>();

  const isSecretary = user?.role === 'secretary';
  const canUnlock = user?.role === 'admin' || user?.role === 'principal';

  const visibleTabs = useMemo<TabItem<ReportTabKey>[]>(() => {
    if (isSecretary) {
      return [
        {
          value: 'results',
          label: t('reports.tabs.results'),
          icon: <RiFileTextFill />,
        },
      ];
    }

    return [
      { value: 'stats', label: t('reports.tabs.stats'), icon: <RiBarChartBoxFill /> },
      { value: 'validation', label: t('reports.tabs.validation'), icon: <RiShieldCheckFill /> },
      { value: 'council', label: t('reports.tabs.council'), icon: <RiAwardFill /> },
      { value: 'results', label: t('reports.tabs.results'), icon: <RiFileTextFill /> },
      { value: 'audit', label: t('reports.tabs.audit'), icon: <RiHistoryFill /> },
    ];
  }, [isSecretary]);

  const activeTab: ReportTabKey = useMemo(() => {
    if (search.tab && visibleTabs.some((tab) => tab.value === search.tab)) {
      return search.tab;
    }
    return visibleTabs[0]!.value;
  }, [search.tab, visibleTabs]);

  const handleTabChange = (nextTab: ReportTabKey) => {
    void navigate({
      search: () => ({ tab: nextTab }),
      replace: true,
    });
  };

  const yearsQuery = useQuery({
    queryKey: adminKeys.academicYears(),
    queryFn: listAcademicYears,
    enabled: Boolean(user),
  });

  const years = yearsQuery.data ?? [];

  useEffect(() => {
    if (years.length === 0) return;
    if (!selectedYearId || !years.some((y) => y.id === selectedYearId)) {
      const preferred = years.find((y) => y.isActive) ?? years[0]!;
      setSelectedYearId(preferred.id);
    }
  }, [years, selectedYearId]);

  const periodsQuery = useQuery({
    queryKey: adminKeys.periods(selectedYearId ?? ''),
    queryFn: () => listPeriods(selectedYearId!),
    enabled: Boolean(selectedYearId),
  });

  const classesQuery = useQuery({
    queryKey: adminKeys.classes(selectedYearId),
    queryFn: () => listClasses(selectedYearId),
    enabled: Boolean(selectedYearId),
  });

  const periods = useMemo(() => {
    const raw = periodsQuery.data ?? [];
    return [...raw].sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'sequence' ? -1 : 1;
      }
      return a.orderIndex - b.orderIndex;
    });
  }, [periodsQuery.data]);

  const classes = classesQuery.data ?? [];

  useEffect(() => {
    if (periods.length === 0) {
      setSelectedPeriodId(undefined);
      return;
    }
    if (!selectedPeriodId || !periods.some((p) => p.id === selectedPeriodId)) {
      setSelectedPeriodId(periods[0]!.id);
    }
  }, [periods, selectedPeriodId]);

  useEffect(() => {
    if (classes.length === 0) {
      setSelectedClassId(undefined);
      return;
    }
    if (!selectedClassId || !classes.some((c) => c.id === selectedClassId)) {
      setSelectedClassId(classes[0]!.id);
    }
  }, [classes, selectedClassId]);

  if (!user) return null;

  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId);
  const parentPeriod = selectedPeriod?.parentPeriodId
    ? periods.find((p) => p.id === selectedPeriod.parentPeriodId)
    : undefined;
  const isSelectedPeriodLocked =
    selectedPeriod?.status === 'locked' || parentPeriod?.status === 'locked';

  const isAuditTab = activeTab === 'audit';
  const showClassInContextBar = activeTab === 'council' || activeTab === 'results';

  const loadingContext =
    yearsQuery.isLoading ||
    (Boolean(selectedYearId) && (periodsQuery.isLoading || classesQuery.isLoading));

  return (
    <div className="space-y-6">
      <PageHeader
        tone="blue"
        icon={<RiFileTextFill />}
        title={isSecretary ? t('reports.pageTitleSecretary') : t('reports.pageTitle')}
        subtitle={isSecretary ? t('reports.pageSubtitleSecretary') : t('reports.pageSubtitle')}
        actions={<Badge variant="dark">{t(`roles.${user.role}`)}</Badge>}
      />

      {!isOnline && (
        <Card variant="info" className="flex items-start gap-3 p-4">
          <RiWifiOffFill className="mt-0.5 size-5 shrink-0 text-amber-500" />
          <div>
            <p className="text-sm font-extrabold">{t('reports.offlineRequiredTitle')}</p>
            <p className="mt-0.5 text-xs opacity-90">{t('reports.offlineRequiredBody')}</p>
          </div>
        </Card>
      )}

      {visibleTabs.length > 1 && (
        <Tabs
          ariaLabel={t('reports.pageTitle')}
          value={activeTab}
          onChange={handleTabChange}
          items={visibleTabs}
        />
      )}

      {!isAuditTab && years.length > 0 && (
        <ReportContextBar
          years={years}
          selectedYearId={selectedYearId}
          onSelectYear={(nextYearId) => {
            setSelectedYearId(nextYearId);
            setSelectedPeriodId(undefined);
            setSelectedClassId(undefined);
          }}
          periods={periods}
          selectedPeriodId={selectedPeriodId}
          onSelectPeriod={setSelectedPeriodId}
          classes={classes}
          selectedClassId={selectedClassId}
          onSelectClass={setSelectedClassId}
          showClass={showClassInContextBar}
        />
      )}

      <div
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
      >
        {loadingContext && !isAuditTab ? (
          <Card className="flex items-center justify-center gap-3 p-12 text-sm text-muted-foreground">
            <Spinner className="size-5 text-primary" />
            <span>{t('admin.common.loading')}</span>
          </Card>
        ) : activeTab === 'audit' ? (
          <GradeAuditTab classes={classes} periods={periods} />
        ) : !selectedYearId || !selectedPeriod ? (
          <Card variant="outline" className="p-8 text-center text-sm text-muted-foreground">
            {t('admin.yearContextNone')}
          </Card>
        ) : activeTab === 'stats' ? (
          <SchoolStatsTab
            academicYearId={selectedYearId}
            periodId={selectedPeriod.id}
            onInspectClass={(classId) => {
              setSelectedClassId(classId);
              handleTabChange('results');
            }}
          />
        ) : activeTab === 'validation' ? (
          <ValidationLockTab
            academicYearId={selectedYearId}
            period={selectedPeriod}
            periods={periods}
            canUnlock={canUnlock}
            isOnline={isOnline}
          />
        ) : !selectedClassId ? (
          <Card variant="outline" className="p-8 text-center text-sm text-muted-foreground">
            {t('reports.stats.emptyClasses')}
          </Card>
        ) : activeTab === 'council' ? (
          <CouncilDecisionsTab
            academicYearId={selectedYearId}
            classId={selectedClassId}
            periodId={selectedPeriod.id}
            isLocked={isSelectedPeriodLocked}
            isOnline={isOnline}
          />
        ) : (
          <ClassResultsReportsTab
            classId={selectedClassId}
            periodId={selectedPeriod.id}
            isOnline={isOnline}
          />
        )}
      </div>
    </div>
  );
}
