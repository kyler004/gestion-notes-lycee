import { RiBuilding2Fill } from '@remixicon/react';
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

const ALLOWED_ROLES = ['admin', 'censor'] as const;

export const Route = createFileRoute('/_authenticated/admin')({
  beforeLoad: () => {
    const role = useSessionStore.getState().user?.role;
    if (!hasRoleAccess(role, ALLOWED_ROLES)) {
      throw redirect({ to: '/forbidden' });
    }
  },
  component: AdminPlaceholderPage,
});

function AdminPlaceholderPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        tone="violet"
        icon={<RiBuilding2Fill />}
        title={t('nav.academic')}
        subtitle={t('dashboard.cards.adminDesc')}
        actions={<Badge variant="dark">{t('dashboard.cards.adminPhase')}</Badge>}
      />
      <Card variant="elevated">
        <CardHeader>
          <CardTitle>{t('dashboard.cards.adminTitle')}</CardTitle>
          <CardDescription>{t('dashboard.cards.adminDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Les écrans de paramétrage (année scolaire, classes, élèves, matières, affectations et
          utilisateurs) seront implémentés au Jalon 3.
        </CardContent>
      </Card>
    </div>
  );
}
