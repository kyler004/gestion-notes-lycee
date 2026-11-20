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

const ALLOWED_ROLES = ['teacher', 'admin', 'censor'] as const;

export const Route = createFileRoute('/_authenticated/grades')({
  beforeLoad: () => {
    const role = useSessionStore.getState().user?.role;
    if (!hasRoleAccess(role, ALLOWED_ROLES)) {
      throw redirect({ to: '/forbidden' });
    }
  },
  component: GradesPlaceholderPage,
});

function GradesPlaceholderPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{t('nav.grades')}</h1>
        <Badge variant="secondary">{t('dashboard.cards.gradesPhase')}</Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.cards.gradesTitle')}</CardTitle>
          <CardDescription>{t('dashboard.cards.gradesDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Cet écran sera implémenté au Jalon 2 avec la grille clavier TanStack Table et la
          synchronisation hors-ligne Dexie Outbox.
        </CardContent>
      </Card>
    </div>
  );
}
