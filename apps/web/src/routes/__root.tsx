import { QueryClientProvider } from '@tanstack/react-query';
import {
  createRootRoute,
  Outlet,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router';
import { useEffect } from 'react';
import { PwaUpdateBanner } from '@/components/layout/PwaUpdateBanner';
import { Toaster } from '@/components/ui/sonner';
import { IDLE_LOCK_TIMEOUT_MS } from '@/lib/auth/pin';
import { queryClient } from '@/lib/query-client';
import { useSessionStore } from '@/stores/session.store';
import { initSyncLifecycle } from '@/stores/sync.store';

let bootstrapPromise: Promise<void> | null = null;

export async function ensureSessionBootstrapped(): Promise<void> {
  const state = useSessionStore.getState();
  if (state.status !== 'bootstrapping') return;
  if (!bootstrapPromise) {
    bootstrapPromise = state.bootstrap().finally(() => {
      bootstrapPromise = null;
    });
  }
  await bootstrapPromise;
}

function SessionLifecycleEffects() {
  const status = useSessionStore((s) => s.status);
  const hasPin = useSessionStore((s) => s.hasPin);
  const lock = useSessionStore((s) => s.lock);
  const setOnline = useSessionStore((s) => s.setOnline);

  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOnline]);

  useEffect(() => {
    if (status === 'anonymous') {
      queryClient.clear();
    }
    // Vitrine du design system : uniquement accessible sans session en développement local.
    if (import.meta.env.DEV && pathname === '/design-system') return;
    if (status === 'locked' && pathname !== '/lock') {
      void navigate({ to: '/lock', replace: true });
    } else if (status === 'anonymous' && pathname !== '/login') {
      void navigate({ to: '/login', replace: true });
    } else if (
      status === 'authenticated' &&
      (pathname === '/login' || pathname === '/lock')
    ) {
      void navigate({ to: '/', replace: true });
    }
  }, [status, pathname, navigate]);

  useEffect(() => {
    if (status !== 'authenticated' || !hasPin) return;

    let timer = window.setTimeout(() => {
      lock();
    }, IDLE_LOCK_TIMEOUT_MS);

    const resetTimer = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        lock();
      }, IDLE_LOCK_TIMEOUT_MS);
    };

    const events: Array<keyof WindowEventMap> = [
      'pointerdown',
      'keydown',
      'touchstart',
    ];
    for (const ev of events) {
      window.addEventListener(ev, resetTimer, { passive: true });
    }

    return () => {
      window.clearTimeout(timer);
      for (const ev of events) {
        window.removeEventListener(ev, resetTimer);
      }
    };
  }, [status, hasPin, lock]);

  return null;
}

function RootComponent() {
  useEffect(() => initSyncLifecycle(), []);

  return (
    <QueryClientProvider client={queryClient}>
      <SessionLifecycleEffects />
      <Outlet />
      <PwaUpdateBanner />
      <Toaster />
    </QueryClientProvider>
  );
}

export const Route = createRootRoute({
  beforeLoad: async () => {
    await ensureSessionBootstrapped();
  },
  component: RootComponent,
});
