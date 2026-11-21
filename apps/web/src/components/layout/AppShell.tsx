import { Link, useRouterState } from '@tanstack/react-router';
import {
  RiBookOpenFill,
  RiBuilding2Fill,
  RiFileTextFill,
  
  RiKey2Fill,
  RiLayoutGridFill,
  RiLockFill,
  RiLogoutBoxRFill,
  RiMenuFill,
  RiGroupFill,
  RiCloseFill,
} from '@remixicon/react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { PinSetupDialog } from '@/components/auth/PinSetupDialog';
import { Brand, BrandMark, initials } from '@/components/layout/Brand';
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
      return RiLayoutGridFill;
    case '/grades':
      return RiBookOpenFill;
    case '/admin':
      return RiBuilding2Fill;
    case '/reports':
      return RiFileTextFill;
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
    <nav aria-label="Navigation principale" className="flex flex-1 flex-col gap-1.5 px-4 py-3">
      {visibleNavItems.map((item) => {
        const Icon = getNavIcon(item.to);
        const isActive = item.to === '/' ? pathname === '/' : pathname.startsWith(item.to);

        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={() => setMobileMenuOpen(false)}
            className={cn(
              'flex items-center justify-between rounded-md px-3 py-3 text-sm font-bold transition-all',
              isActive
                ? 'bg-emerald-50 text-slate-600 shadow-edge'
                : 'text-sidebar-foreground hover:bg-white/10 hover:text-white',
            )}
          >
            <span className="flex items-center gap-3">
              <Icon className={cn('size-5 shrink-0', isActive ? 'text-emerald-300' : 'text-slate-200')} />
              <span>{t(item.labelKey)}</span>
            </span>
            {item.milestoneTag && (
              <span
                className={cn(
                  'shrink-0 whitespace-nowrap rounded-sm px-1.5 py-0.5 text-[10px] font-extrabold',
                  isActive ? 'bg-slate-600/10 text-slate-500' : 'bg-white/10 text-slate-100',
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

  const sidebarBody = (
    <>
      <div className="p-5 pb-3">
        <Brand tone="light" />
      </div>
      {navContent}
      <div className="space-y-3 p-4">
        {hasPin ? (
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              setManualPinDialogOpen(true);
            }}
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-sm font-semibold text-sidebar-foreground transition-colors hover:bg-white/10"
          >
            <RiKey2Fill className="size-5 text-slate-200" />
            <span>{t('nav.changePin')}</span>
          </button>
        ) : (
          <Badge variant="warning" className="w-full justify-center py-2">
            Code PIN non configuré
          </Badge>
        )}
        {user && (
          <div className="flex items-center gap-3 rounded-lg bg-white/7 p-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-md bg-violet-100 text-sm font-extrabold text-violet-500">
              {initials(user.fullName)}
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-bold text-white">{user.fullName}</p>
              <p className="truncate text-xs text-slate-100">{t(`roles.${user.role}`)}</p>
            </div>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Barre latérale bureau */}
      <aside
        className="sticky top-0 hidden h-screen w-68 shrink-0 flex-col bg-sidebar lg:flex"
        aria-label="Barre latérale"
      >
        {sidebarBody}
      </aside>

      {/* Tiroir mobile */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="fixed inset-0 bg-slate-600/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <aside className="relative z-10 flex w-72 flex-col bg-sidebar shadow-lg">{sidebarBody}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
          <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-8">
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label="Ouvrir le menu"
                onClick={() => setMobileMenuOpen((v) => !v)}
              >
                {mobileMenuOpen ? <RiCloseFill className="size-6" /> : <RiMenuFill className="size-6" />}
              </Button>
              <Link to="/" className="lg:hidden">
                <BrandMark className="size-9" />
              </Link>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <NetworkBadge />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleLock}
                title={hasPin ? t('nav.lockScreen') : t('nav.setupPin')}
              >
                {hasPin ? <RiLockFill /> : <RiKey2Fill />}
                <span className="hidden sm:inline">{hasPin ? t('nav.lockScreen') : t('nav.setupPin')}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void switchUser()}
                title={t('nav.switchUser')}
              >
                <RiGroupFill />
                <span className="hidden xl:inline">{t('nav.switchUser')}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void handleLogout()}
                title={t('nav.logout')}
              >
                <RiLogoutBoxRFill />
                <span className="hidden sm:inline">{t('nav.logout')}</span>
              </Button>
            </div>
          </div>

          {!isOnline && (
            <div className="bg-amber-50 px-4 py-2 text-center text-xs font-bold text-amber-500">
              {t('app.offlineBanner')}
            </div>
          )}
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-8">{children}</main>
      </div>

      <PinSetupDialog
        open={needsPinSetup || manualPinDialogOpen}
        onOpenChange={(open) => setManualPinDialogOpen(open)}
        allowDismiss
      />
    </div>
  );
}
