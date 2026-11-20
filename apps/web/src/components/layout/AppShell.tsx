import { Link, useRouterState } from '@tanstack/react-router';
import {
  BookOpenCheck,
  Building2,
  FileText,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  Users,
  X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { PinSetupDialog } from '@/components/auth/PinSetupDialog';
import { NetworkBadge } from '@/components/layout/NetworkBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { hasRoleAccess, NAV_ITEMS, type NavItemConfig } from '@/lib/auth/roles';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useSessionStore } from '@/stores/session.store';

function getNavIcon(to: NavItemConfig['to']) {
  switch (to) {
    case '/':
      return LayoutDashboard;
    case '/grades':
      return BookOpenCheck;
    case '/admin':
      return Building2;
    case '/reports':
      return FileText;
  }
}

export function AppShell({ children }: { children: ReactNode }) {
  const user = useSessionStore((s) => s.user);
  const hasPin = useSessionStore((s) => s.hasPin);
  const needsPinSetup = useSessionStore((s) => s.needsPinSetup);
  const isOnline = useSessionStore((s) => s.isOnline);
  const lock = useSessionStore((s) => s.lock);
  const switchUser = useSessionStore((s) => s.switchUser);
  const logout = useSessionStore((s) => s.logout);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [manualPinDialogOpen, setManualPinDialogOpen] = useState(false);

  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const visibleNavItems = NAV_ITEMS.filter((item) =>
    hasRoleAccess(user?.role, item.allowedRoles),
  );

  const handleLock = () => {
    if (!hasPin) {
      setManualPinDialogOpen(true);
      return;
    }
    lock();
  };

  const handleLogout = async () => {
    await logout();
    toast.success(t('auth.logoutSuccess'));
  };

  const navContent = (
    <nav aria-label="Navigation principale" className="flex flex-1 flex-col gap-1 p-3">
      {visibleNavItems.map((item) => {
        const Icon = getNavIcon(item.to);
        const isActive =
          item.to === '/' ? pathname === '/' : pathname.startsWith(item.to);

        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={() => setMobileMenuOpen(false)}
            className={cn(
              'flex items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-foreground/80 hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <span className="flex items-center gap-2.5">
              <Icon className="h-4 w-4 shrink-0" />
              <span>{t(item.labelKey)}</span>
            </span>
            {item.milestoneTag && (
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                  isActive
                    ? 'bg-primary-foreground/15 text-primary-foreground'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {item.milestoneTag}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur-xs">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Ouvrir le menu"
              onClick={() => setMobileMenuOpen((v) => !v)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>

            <Link to="/" className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <GraduationCap className="h-5 w-5" />
              </div>
              <div className="leading-tight">
                <span className="block text-sm font-semibold tracking-tight text-foreground">
                  {t('app.name')}
                </span>
                <span className="hidden text-xs text-muted-foreground sm:block">
                  {t('app.subtitle')}
                </span>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <NetworkBadge />

            {user && (
              <div className="hidden items-center gap-2 border-l border-border pl-3 md:flex">
                <div className="text-right leading-tight">
                  <p className="text-sm font-medium text-foreground">{user.fullName}</p>
                  <p className="text-xs text-muted-foreground">{t(`roles.${user.role}`)}</p>
                </div>
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleLock}
              title={hasPin ? t('nav.lockScreen') : t('nav.setupPin')}
            >
              {hasPin ? <Lock className="h-3.5 w-3.5" /> : <KeyRound className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">
                {hasPin ? t('nav.lockScreen') : t('nav.setupPin')}
              </span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void switchUser()}
              title={t('nav.switchUser')}
            >
              <Users className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">{t('nav.switchUser')}</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void handleLogout()}
              title={t('nav.logout')}
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('nav.logout')}</span>
            </Button>
          </div>
        </div>

        {!isOnline && (
          <div className="border-t border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-xs font-medium text-amber-900">
            {t('app.offlineBanner')}
          </div>
        )}
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1">
        {/* Barre latérale bureau */}
        <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card/60 lg:flex">
          {navContent}
          <div className="border-t border-border p-3 text-xs text-muted-foreground">
            {hasPin ? (
              <button
                type="button"
                onClick={() => setManualPinDialogOpen(true)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
              >
                <KeyRound className="h-3.5 w-3.5" />
                <span>{t('nav.changePin')}</span>
              </button>
            ) : (
              <Badge variant="warning" className="w-full justify-center">
                Code PIN non configuré
              </Badge>
            )}
          </div>
        </aside>

        {/* Tiroir mobile */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-40 flex lg:hidden">
            <div
              className="fixed inset-0 bg-black/40"
              onClick={() => setMobileMenuOpen(false)}
            />
            <aside className="relative z-10 flex w-64 flex-col bg-card shadow-xl">
              <div className="flex items-center justify-between border-b border-border p-4">
                <div>
                  <p className="text-sm font-semibold">{user?.fullName}</p>
                  {user && (
                    <p className="text-xs text-muted-foreground">{t(`roles.${user.role}`)}</p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Fermer le menu"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              {navContent}
              <div className="space-y-2 border-t border-border p-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setManualPinDialogOpen(true);
                  }}
                >
                  <KeyRound className="h-4 w-4" />
                  <span>{hasPin ? t('nav.changePin') : t('nav.setupPin')}</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    void switchUser();
                  }}
                >
                  <Users className="h-4 w-4" />
                  <span>{t('nav.switchUser')}</span>
                </Button>
              </div>
            </aside>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>

      <PinSetupDialog
        open={needsPinSetup || manualPinDialogOpen}
        onOpenChange={(open) => setManualPinDialogOpen(open)}
        allowDismiss
      />
    </div>
  );
}
