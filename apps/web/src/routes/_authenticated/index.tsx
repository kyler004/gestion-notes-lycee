import { RiBookOpenFill, RiBuilding2Fill, RiFileTextFill, RiRocket2Fill, RiArrowRightFill } from '@remixicon/react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/header';
import { hasRoleAccess } from '@/lib/auth/roles';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useSessionStore } from '@/stores/session.store';

export const Route = createFileRoute('/_authenticated/')({
  component: DashboardPage,
});

function DashboardPage() {
  const user = useSessionStore((s) => s.user);
  const role = user?.role;

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
      allowed: ['admin', 'censor'] as const,
      icon: <RiBuilding2Fill />,
      tone: 'bg-violet-50 text-violet-400',
      phase: t('dashboard.cards.adminPhase'),
      title: t('dashboard.cards.adminTitle'),
      desc: t('dashboard.cards.adminDesc'),
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

  return (
    <div className="space-y-8">
      <PageHeader
        tone="emerald"
        title={t('dashboard.welcome', { name: user?.fullName ?? '' })}
        subtitle={role ? t('dashboard.roleSummary', { role: t(`roles.${role}`) }) : undefined}
        actions={role && <Badge variant="dark">{t(`roles.${role}`)}</Badge>}
      />

      <Card variant="dark" className="flex items-start gap-4 p-5">
        <span className="grid size-11 shrink-0 place-items-center rounded-md bg-emerald-100/20 text-emerald-50">
          <RiRocket2Fill className="size-6" />
        </span>
        <div>
          <CardTitle className="text-base text-white">{t('dashboard.milestoneNoticeTitle')}</CardTitle>
          <p className="mt-1 text-sm text-slate-100">{t('dashboard.milestoneNoticeBody')}</p>
        </div>
      </Card>

      <section aria-labelledby="modules-heading" className="space-y-4">
        <h2 id="modules-heading" className="text-lg font-extrabold">
          {t('dashboard.nextStepsTitle')}
        </h2>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((m) => (
            <Link key={m.to} to={m.to} className="group block rounded-lg">
              <Card variant="interactive" className="flex h-full flex-col gap-4 p-6">
                <div className="flex items-center justify-between">
                  <span className={cn('grid size-12 place-items-center rounded-md [&_svg]:size-6', m.tone)}>
                    {m.icon}
                  </span>
                  <Badge variant={m.to === '/grades' ? 'success' : 'neutral'}>{m.phase}</Badge>
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
