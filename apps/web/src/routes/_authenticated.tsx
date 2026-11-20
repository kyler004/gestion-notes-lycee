import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { AppShell } from '@/components/layout/AppShell';
import { useSessionStore } from '@/stores/session.store';

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: () => {
    const status = useSessionStore.getState().status;
    if (status === 'anonymous') {
      throw redirect({ to: '/login' });
    }
    if (status === 'locked') {
      throw redirect({ to: '/lock' });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
