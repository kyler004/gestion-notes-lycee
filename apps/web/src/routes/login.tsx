import { zodResolver } from '@hookform/resolvers/zod';
import { LoginSchema } from '@lycee/shared';
import { createFileRoute, redirect } from '@tanstack/react-router';
import {
  RiComputerFill,
  RiDeleteBin6Fill,
  RiErrorWarningFill,
  RiKey2Fill,
  RiLockFill,
  RiLockPasswordFill,
  RiRefreshFill,
  RiShieldCheckFill,
  RiUser3Fill,
  RiWifiOffFill,
} from '@remixicon/react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { Brand } from '@/components/layout/Brand';
import { NetworkBadge } from '@/components/layout/NetworkBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { FieldMessage, TileInput } from '@/components/ui/input';
import { ApiError, NetworkError } from '@/lib/api/errors';
import { t } from '@/lib/i18n';
import { useSessionStore } from '@/stores/session.store';

type LoginFormValues = z.infer<typeof LoginSchema>;

export const Route = createFileRoute('/login')({
  beforeLoad: () => {
    const status = useSessionStore.getState().status;
    if (status === 'authenticated') {
      throw redirect({ to: '/' });
    }
    if (status === 'locked') {
      throw redirect({ to: '/lock' });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const login = useSessionStore((s) => s.login);
  const savedAccounts = useSessionStore((s) => s.savedAccounts);
  const selectSavedAccount = useSessionStore((s) => s.selectSavedAccount);
  const forgetSavedAccount = useSessionStore((s) => s.forgetSavedAccount);
  const authNotice = useSessionStore((s) => s.authNotice);
  const clearAuthNotice = useSessionStore((s) => s.clearAuthNotice);
  const isOnline = useSessionStore((s) => s.isOnline);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [rateLimitSeconds, setRateLimitSeconds] = useState<number>(0);

  const {
    register,
    handleSubmit,
    setValue,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(LoginSchema),
    defaultValues: {
      username: '',
      password: '',
    },
  });

  useEffect(() => {
    if (rateLimitSeconds <= 0) return;
    const interval = window.setInterval(() => {
      setRateLimitSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [rateLimitSeconds]);

  const onSubmit = async (values: LoginFormValues) => {
    setSubmitError(null);
    clearAuthNotice();

    try {
      await login({
        username: values.username,
        password: values.password,
        deviceLabel: values.deviceLabel?.trim() ? values.deviceLabel.trim() : undefined,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          const wait = err.retryAfterSeconds ?? 60;
          setRateLimitSeconds(wait);
          setSubmitError(t('auth.rateLimited', { seconds: wait }));
          return;
        }
        if (err.status === 401) {
          setSubmitError(t('auth.invalidCredentials'));
          return;
        }
        setSubmitError(err.message);
        return;
      }
      if (err instanceof NetworkError) {
        setSubmitError(isOnline ? t('auth.networkError') : t('auth.offlineLoginDisabled'));
        return;
      }
      setSubmitError('Erreur inattendue lors de la connexion.');
    }
  };

  const handleSelectSaved = async (userId: string, username: string) => {
    const result = await selectSavedAccount(userId);
    if (result === 'requires_password') {
      setValue('username', username);
      setFocus('password');
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Panneau de marque */}
      <aside className="relative hidden overflow-hidden bg-slate-600 p-12 text-slate-50 lg:flex lg:flex-col lg:justify-between">
        <span aria-hidden className="absolute -top-24 -right-24 size-96 rounded-full bg-emerald-300/30" />
        <span aria-hidden className="absolute top-1/3 -left-20 size-64 rounded-full bg-violet-400/40" />
        <span aria-hidden className="absolute -right-10 -bottom-32 size-80 rounded-full bg-blue-500/50" />
        <Brand tone="light" className="relative" />
        <div className="relative max-w-md">
          <p className="text-5xl leading-[1.1] font-extrabold text-white">
            Les notes,
            <br />
            <span className="text-emerald-50">même sans réseau.</span>
          </p>
          <p className="mt-5 text-base text-slate-100">
            Saisissez, synchronisez et validez les notes de toute la classe, en classe comme à la
            maison.
          </p>
        </div>
        <ul className="relative flex gap-2">
          <li><Badge variant="dark" icon={<RiWifiOffFill />}>Hors ligne</Badge></li>
          <li><Badge variant="accent" icon={<RiShieldCheckFill />}>Code PIN</Badge></li>
          <li><Badge variant="success" icon={<RiRefreshFill />}>Synchronisé</Badge></li>
        </ul>
      </aside>

      <div className="flex flex-col justify-center px-4 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-md space-y-6">
          <div className="flex items-center justify-between">
            <Brand className="lg:invisible" />
            <NetworkBadge />
          </div>

          {authNotice && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-lg bg-amber-50 p-4 text-sm font-semibold text-amber-500"
            >
              <RiErrorWarningFill className="mt-0.5 size-5 shrink-0" />
              <p>{authNotice}</p>
            </div>
          )}

        {savedAccounts.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('auth.savedAccountsTitle')}</CardTitle>
              <CardDescription>{t('auth.savedAccountsHint')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {savedAccounts.map((acc) => (
                <div
                  key={acc.user.id}
                  className="flex items-center justify-between gap-3 rounded-md bg-muted/70 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {acc.user.fullName}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        @{acc.user.username} · {t(`roles.${acc.user.role}`)}
                      </span>
                      {acc.hasPin && !acc.requiresOnlineLogin && (
                        <Badge variant="accent" className="px-1.5 py-0.5 text-[10px]">
                          <RiKey2Fill  />
                          PIN
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant={acc.hasPin && !acc.requiresOnlineLogin ? 'default' : 'outline'}
                      onClick={() => void handleSelectSaved(acc.user.id, acc.user.username)}
                    >
                      {acc.hasPin && !acc.requiresOnlineLogin ? (
                        <>
                          <RiLockFill  />
                          {t('auth.useSavedAccount')}
                        </>
                      ) : (
                        t('nav.switchUser')
                      )}
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-9 text-muted-foreground hover:text-destructive"
                      title={t('auth.forgetSavedAccount')}
                      aria-label={`${t('auth.forgetSavedAccount')} ${acc.user.fullName}`}
                      onClick={() => void forgetSavedAccount(acc.user.id)}
                    >
                      <RiDeleteBin6Fill  />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card variant="elevated">
          <CardHeader>
            <CardTitle className="text-2xl">{t('auth.loginTitle')}</CardTitle>
            <CardDescription>{t('auth.loginSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <TileInput
                  id="login-username"
                  label={t('auth.usernameLabel')}
                  icon={<RiUser3Fill />}
                  autoComplete="username"
                  placeholder={t('auth.usernamePlaceholder')}
                  state={errors.username ? 'error' : 'default'}
                  {...register('username')}
                />
                {errors.username && (
                  <FieldMessage tone="error">{errors.username.message}</FieldMessage>
                )}
              </div>

              <div className="space-y-1.5">
                <TileInput
                  id="login-password"
                  label={t('auth.passwordLabel')}
                  icon={<RiLockPasswordFill />}
                  type="password"
                  passwordToggle
                  autoComplete="current-password"
                  placeholder={t('auth.passwordPlaceholder')}
                  state={errors.password ? 'error' : 'default'}
                  {...register('password')}
                />
                {errors.password && (
                  <FieldMessage tone="error">{errors.password.message}</FieldMessage>
                )}
              </div>

              <div className="space-y-1.5">
                <TileInput
                  id="login-device"
                  label={t('auth.deviceLabel')}
                  icon={<RiComputerFill />}
                  placeholder={t('auth.devicePlaceholder')}
                  state={errors.deviceLabel ? 'error' : 'default'}
                  {...register('deviceLabel', {
                    setValueAs: (value: unknown) =>
                      typeof value === 'string' && value.trim() === '' ? undefined : value,
                  })}
                />
                {errors.deviceLabel && (
                  <FieldMessage tone="error">{errors.deviceLabel.message}</FieldMessage>
                )}
              </div>

              {submitError && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-md bg-brick-50 px-3.5 py-3 text-sm font-semibold text-brick-500"
                >
                  <RiErrorWarningFill className="mt-0.5 size-5 shrink-0" aria-hidden />
                  <span>
                    {rateLimitSeconds > 0
                      ? t('auth.rateLimited', { seconds: rateLimitSeconds })
                      : submitError}
                  </span>
                </div>
              )}

              <Button
                type="submit"
                size="lg"
                className="w-full"
                loading={isSubmitting}
                disabled={rateLimitSeconds > 0}
                icon={isSubmitting ? undefined : <RiLockFill />}
              >
                {isSubmitting ? t('auth.submittingLogin') : t('auth.submitLogin')}
              </Button>
            </form>
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
}
