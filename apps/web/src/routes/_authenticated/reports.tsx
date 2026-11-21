import { RiFileTextFill } from '@remixicon/react';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PageHeader } from '@/components/ui/header';
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
    <div className="space-y-6">
      <PageHeader
        tone="blue"
        icon={<RiFileTextFill />}
        title={t('nav.reports')}
        subtitle={t('dashboard.cards.reportsDesc')}
        actions={<Badge variant="dark">{t('dashboard.cards.reportsPhase')}</Badge>}
      />
      <Card variant="elevated">
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
