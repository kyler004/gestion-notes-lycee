import { zodResolver } from '@hookform/resolvers/zod';
import { LoginSchema } from '@lycee/shared';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { AlertCircle, GraduationCap, KeyRound, Lock, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    <div className="flex min-h-screen flex-col justify-center bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-md space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-foreground">
                {t('app.name')}
              </h1>
              <p className="text-xs text-muted-foreground">{t('app.subtitle')}</p>
            </div>
          </div>
          <NetworkBadge />
        </div>

        {authNotice && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-950"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
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
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-background/60 p-3"
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
                        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                          <KeyRound className="h-2.5 w-2.5" />
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
                          <Lock className="h-3.5 w-3.5" />
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
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      title={t('auth.forgetSavedAccount')}
                      aria-label={`${t('auth.forgetSavedAccount')} ${acc.user.fullName}`}
                      onClick={() => void forgetSavedAccount(acc.user.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{t('auth.loginTitle')}</CardTitle>
            <CardDescription>{t('auth.loginSubtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="login-username">{t('auth.usernameLabel')}</Label>
                <Input
                  id="login-username"
                  autoComplete="username"
                  placeholder={t('auth.usernamePlaceholder')}
                  {...register('username')}
                />
                {errors.username && (
                  <p className="text-xs font-medium text-destructive">
                    {errors.username.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="login-password">{t('auth.passwordLabel')}</Label>
                <Input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  placeholder={t('auth.passwordPlaceholder')}
                  {...register('password')}
                />
                {errors.password && (
                  <p className="text-xs font-medium text-destructive">
                    {errors.password.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="login-device">{t('auth.deviceLabel')}</Label>
                <Input
                  id="login-device"
                  placeholder={t('auth.devicePlaceholder')}
                  {...register('deviceLabel', {
                    setValueAs: (value: unknown) =>
                      typeof value === 'string' && value.trim() === '' ? undefined : value,
                  })}
                />
                {errors.deviceLabel && (
                  <p className="text-xs font-medium text-destructive">
                    {errors.deviceLabel.message}
                  </p>
                )}
              </div>

              {submitError && (
                <div
                  role="alert"
                  className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                >
                  {rateLimitSeconds > 0
                    ? t('auth.rateLimited', { seconds: rateLimitSeconds })
                    : submitError}
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting || rateLimitSeconds > 0}
              >
                {isSubmitting ? t('auth.submittingLogin') : t('auth.submitLogin')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
