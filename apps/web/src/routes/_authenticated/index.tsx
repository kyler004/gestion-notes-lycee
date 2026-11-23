import {
  RiArrowRightFill,
  RiBookOpenFill,
  RiBuilding2Fill,
  RiCalendarCheckFill,
  RiFileTextFill,
  RiRefreshFill,
  RiShieldKeyholeFill,
  RiTimeFill,
} from '@remixicon/react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle, StatCard } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/header';
import { getUserDb } from '@/db/user-db';
import { hasRoleAccess } from '@/lib/auth/roles';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useSessionStore } from '@/stores/session.store';
import { useSyncStore } from '@/stores/sync.store';

export const Route = createFileRoute('/_authenticated/')({
  component: DashboardPage,
});

function DashboardPage() {
  const user = useSessionStore((s) => s.user);
  const role = user?.role;
  const setOutboxDialogOpen = useSyncStore((s) => s.setOutboxDialogOpen);

  const snapshot = useLiveQuery(async () => {
    if (!user?.id) return null;
    const db = getUserDb(user.id);
    const [years, periods, classes, assignments, outboxRows] = await Promise.all([
      db.academicYears.toArray(),
      db.periods.toArray(),
      db.classes.toArray(),
      db.teacherAssignments.toArray(),
      db.outbox.toArray(),
    ]);

    const activeYear = years.find((y) => y.isActive) ?? years[0] ?? null;
    const yearPeriods = activeYear
      ? periods.filter((p) => p.academicYearId === activeYear.id)
      : periods;
    const openPeriodsCount = yearPeriods.filter((p) => p.status === 'open').length;
    const lockedPeriodsCount = yearPeriods.filter((p) => p.status === 'locked').length;
    const yearClassesCount = activeYear
      ? classes.filter((c) => c.academicYearId === activeYear.id).length
      : classes.length;
    const activeAssignmentsCount = activeYear
      ? assignments.filter((a) => a.academicYearId === activeYear.id && a.isActive).length
      : assignments.filter((a) => a.isActive).length;
    const pendingCount = outboxRows.filter((row) => row.status !== 'failed').length;
    const failedCount = outboxRows.filter((row) => row.status === 'failed').length;

    return {
      activeYearLabel: activeYear?.label ?? null,
      openPeriodsCount,
      lockedPeriodsCount,
      totalPeriodsCount: yearPeriods.length,
      yearClassesCount,
      activeAssignmentsCount,
      pendingCount,
      failedCount,
    };
  }, [user?.id]);

  const modules = [
    {
      to: '/grades' as const,
      allowed: ['teacher', 'admin', 'censor'] as const,
      icon: <RiBookOpenFill />,
      tone: 'bg-emerald-50 text-emerald-400',
      phase: t('dashboard.cards.gradesPhase'),
      title: t('dashboard.cards.gradesTitle'),
      desc: t('dashboard.cards.gradesDesc'),
    },
    {
      to: '/admin' as const,
      allowed: ['admin', 'censor', 'secretary'] as const,
      icon: <RiBuilding2Fill />,
      tone: 'bg-violet-50 text-violet-400',
      phase: t('dashboard.cards.adminPhase'),
      title:
        role === 'secretary' ? t('admin.pageTitleSecretary') : t('dashboard.cards.adminTitle'),
      desc:
        role === 'secretary' ? t('admin.pageSubtitleSecretary') : t('dashboard.cards.adminDesc'),
    },
    {
      to: '/reports' as const,
      allowed: ['admin', 'censor', 'principal', 'secretary'] as const,
      icon: <RiFileTextFill />,
      tone: 'bg-blue-100 text-blue-500',
      phase: t('dashboard.cards.reportsPhase'),
      title: t('dashboard.cards.reportsTitle'),
      desc: t('dashboard.cards.reportsDesc'),
    },
  ].filter((m) => hasRoleAccess(role, [...m.allowed]));

  const hasOutboxItems = (snapshot?.pendingCount ?? 0) + (snapshot?.failedCount ?? 0) > 0;
  const syncValue = !snapshot
    ? '—'
    : snapshot.failedCount > 0
      ? String(snapshot.failedCount)
      : snapshot.pendingCount > 0
        ? String(snapshot.pendingCount)
        : t('dashboard.statSyncUpToDate');
  const syncLabel = !snapshot
    ? t('dashboard.statSyncLabel')
    : snapshot.failedCount > 0
      ? `${t('dashboard.statSyncLabel')} · ${t('dashboard.statSyncFailed', { count: snapshot.failedCount })}`
      : snapshot.pendingCount > 0
        ? `${t('dashboard.statSyncLabel')} · ${t('dashboard.statSyncPending', { count: snapshot.pendingCount })}`
        : t('dashboard.statSyncLabel');

  return (
    <div className="space-y-8">
      <PageHeader
        tone="emerald"
        title={t('dashboard.welcome', { name: user?.fullName ?? '' })}
        subtitle={role ? t('dashboard.roleSummary', { role: t(`roles.${role}`) }) : undefined}
        actions={role && <Badge variant="dark">{t(`roles.${role}`)}</Badge>}
      />

      <section aria-labelledby="overview-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="overview-heading" className="text-lg font-extrabold">
            {t('dashboard.overviewTitle')}
          </h2>
          {hasOutboxItems && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              icon={<RiRefreshFill />}
              onClick={() => setOutboxDialogOpen(true)}
            >
              {t('dashboard.viewOutboxAction')}
            </Button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            tone="emerald"
            label={
              snapshot?.activeYearLabel
                ? t('dashboard.statActiveYear')
                : `${t('dashboard.statActiveYear')} (${t('dashboard.statNoYear')})`
            }
            value={snapshot?.activeYearLabel ?? '—'}
            valueClassName="text-2xl whitespace-nowrap"
            icon={<RiCalendarCheckFill />}
          />
          <StatCard
            tone="blue"
            label={
              snapshot && snapshot.totalPeriodsCount > 0
                ? t('dashboard.statPeriodsDetail', {
                    open: snapshot.openPeriodsCount,
                    locked: snapshot.lockedPeriodsCount,
                  })
                : t('dashboard.statPeriods')
            }
            value={
              snapshot && snapshot.totalPeriodsCount > 0
                ? `${snapshot.openPeriodsCount} / ${snapshot.totalPeriodsCount}`
                : '—'
            }
            valueClassName="text-2xl whitespace-nowrap"
            icon={<RiTimeFill />}
          />
          <StatCard
            tone="violet"
            label={
              role === 'teacher'
                ? t('dashboard.statAssignmentsLabel')
                : t('dashboard.statClassesLabel')
            }
            value={
              !snapshot
                ? '—'
                : String(
                    role === 'teacher'
                      ? snapshot.activeAssignmentsCount
                      : snapshot.yearClassesCount,
                  )
            }
            valueClassName="text-2xl whitespace-nowrap"
            icon={<RiShieldKeyholeFill />}
          />
          <StatCard
            tone="slate"
            label={syncLabel}
            value={syncValue}
            valueClassName="text-2xl whitespace-nowrap"
            icon={<RiRefreshFill />}
          />
        </div>
      </section>

      <section aria-labelledby="modules-heading" className="space-y-4">
        <h2 id="modules-heading" className="text-lg font-extrabold">
          {t('dashboard.quickAccessTitle')}
        </h2>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((m) => (
            <Link key={m.to} to={m.to} className="group block rounded-lg">
              <Card variant="interactive" className="flex h-full flex-col gap-4 p-6">
                <div className="flex items-center justify-between">
                  <span className={cn('grid size-12 place-items-center rounded-md [&_svg]:size-6', m.tone)}>
                    {m.icon}
                  </span>
                  <Badge variant="success">{m.phase}</Badge>
                </div>
                <div className="flex-1">
                  <CardTitle className="text-base">{m.title}</CardTitle>
                  <CardDescription className="mt-1 text-muted-foreground opacity-100">
                    {m.desc}
                  </CardDescription>
                </div>
                <RiArrowRightFill className="size-5 text-slate-200 transition-all group-hover:translate-x-1 group-hover:text-primary" />
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
