import { createFileRoute, Link } from '@tanstack/react-router';
import { BookOpenCheck, Building2, CheckCircle2, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { hasRoleAccess } from '@/lib/auth/roles';
import { t } from '@/lib/i18n';
import { useSessionStore } from '@/stores/session.store';

export const Route = createFileRoute('/_authenticated/')({
  component: DashboardPage,
});

function DashboardPage() {
  const user = useSessionStore((s) => s.user);
  const role = user?.role;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t('dashboard.welcome', { name: user?.fullName ?? '' })}
          </h1>
          {role && (
            <p className="text-sm text-muted-foreground">
              {t('dashboard.roleSummary', { role: t(`roles.${role}`) })}
            </p>
          )}
        </div>
        {role && <Badge variant="outline">{t(`roles.${role}`)}</Badge>}
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2 text-primary">
            <CheckCircle2 className="h-5 w-5" />
            <CardTitle className="text-base">{t('dashboard.milestoneNoticeTitle')}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-foreground/85">{t('dashboard.milestoneNoticeBody')}</p>
        </CardContent>
      </Card>

      <section aria-labelledby="modules-heading" className="space-y-3">
        <h2 id="modules-heading" className="text-base font-semibold text-foreground">
          {t('dashboard.nextStepsTitle')}
        </h2>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {hasRoleAccess(role, ['teacher', 'admin', 'censor']) && (
            <Link to="/grades" className="group block">
              <Card className="h-full transition-colors group-hover:border-primary/40">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <BookOpenCheck className="h-5 w-5 text-primary" />
                    <Badge variant="secondary">{t('dashboard.cards.gradesPhase')}</Badge>
                  </div>
                  <CardTitle className="pt-2 text-base">
                    {t('dashboard.cards.gradesTitle')}
                  </CardTitle>
                  <CardDescription>{t('dashboard.cards.gradesDesc')}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          )}

          {hasRoleAccess(role, ['admin', 'censor']) && (
            <Link to="/admin" className="group block">
              <Card className="h-full transition-colors group-hover:border-primary/40">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <Building2 className="h-5 w-5 text-primary" />
                    <Badge variant="secondary">{t('dashboard.cards.adminPhase')}</Badge>
                  </div>
                  <CardTitle className="pt-2 text-base">
                    {t('dashboard.cards.adminTitle')}
                  </CardTitle>
                  <CardDescription>{t('dashboard.cards.adminDesc')}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          )}

          {hasRoleAccess(role, ['admin', 'censor', 'principal', 'secretary']) && (
            <Link to="/reports" className="group block">
              <Card className="h-full transition-colors group-hover:border-primary/40">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <FileText className="h-5 w-5 text-primary" />
                    <Badge variant="secondary">{t('dashboard.cards.reportsPhase')}</Badge>
                  </div>
                  <CardTitle className="pt-2 text-base">
                    {t('dashboard.cards.reportsTitle')}
                  </CardTitle>
                  <CardDescription>{t('dashboard.cards.reportsDesc')}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
