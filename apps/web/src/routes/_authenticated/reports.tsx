import { createFileRoute, redirect } from '@tanstack/react-router';
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

const ALLOWED_ROLES = ['admin', 'censor', 'principal', 'secretary'] as const;

export const Route = createFileRoute('/_authenticated/reports')({
  beforeLoad: () => {
    const role = useSessionStore.getState().user?.role;
    if (!hasRoleAccess(role, ALLOWED_ROLES)) {
      throw redirect({ to: '/forbidden' });
    }
  },
  component: ReportsPlaceholderPage,
});

function ReportsPlaceholderPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{t('nav.reports')}</h1>
        <Badge variant="secondary">{t('dashboard.cards.reportsPhase')}</Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.cards.reportsTitle')}</CardTitle>
          <CardDescription>{t('dashboard.cards.reportsDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          La validation des séquences, les décisions du conseil et l’impression des bulletins PDF
          seront implémentés au Jalon 4.
        </CardContent>
      </Card>
    </div>
  );
}
