import { RiGroupFill, RiLockFill } from '@remixicon/react';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
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
import { FieldMessage, Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PinCodeSchema } from '@/lib/auth/pin';
import { t } from '@/lib/i18n';
import { useSessionStore } from '@/stores/session.store';

export const Route = createFileRoute('/lock')({
  beforeLoad: () => {
    const status = useSessionStore.getState().status;
    if (status === 'anonymous') {
      throw redirect({ to: '/login' });
    }
    if (status === 'authenticated') {
      throw redirect({ to: '/' });
    }
  },
  component: LockScreenPage,
});

function LockScreenPage() {
  const user = useSessionStore((s) => s.user);
  const unlockWithPin = useSessionStore((s) => s.unlockWithPin);
  const switchUser = useSessionStore((s) => s.switchUser);

  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!PinCodeSchema.safeParse(pin).success) {
      setError(t('pin.pinInvalidFormat'));
      return;
    }

    setSubmitting(true);
    try {
      const result = await unlockWithPin(pin);
      if (!result.ok) {
        setPin('');
        if (!result.lockedOut) {
          setError(t('pin.wrongPin', { remaining: result.remainingAttempts }));
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col justify-center overflow-hidden bg-slate-600 px-4 py-10">
      <span aria-hidden className="absolute -top-24 -left-24 size-96 rounded-full bg-emerald-300/25" />
      <span aria-hidden className="absolute -right-24 -bottom-24 size-96 rounded-full bg-violet-400/35" />
      <div className="relative mx-auto w-full max-w-sm space-y-5">
        <div className="flex items-center justify-between">
          <Brand tone="light" />
          <NetworkBadge />
        </div>

        <Card variant="elevated" className="rounded-xl">
          <CardHeader className="items-center text-center">
            <span className="mb-1 grid size-16 place-items-center rounded-lg bg-violet-50 text-violet-400">
              <RiLockFill className="size-8" />
            </span>
            <CardTitle className="text-2xl">{t('pin.lockTitle')}</CardTitle>
            <CardDescription>{t('pin.lockSubtitle')}</CardDescription>
            {user && (
              <div className="pt-3">
                <p className="text-base font-extrabold text-foreground">{user.fullName}</p>
                <div className="mt-1.5 flex justify-center">
                  <Badge variant="accent">{t(`roles.${user.role}`)}</Badge>
                </div>
              </div>
            )}
          </CardHeader>

          <CardContent className="space-y-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="unlock-pin">{t('pin.pinLabel')}</Label>
                <Input
                  id="unlock-pin"
                  type="password"
                  inputMode="numeric"
                  pattern="\d{4,6}"
                  maxLength={6}
                  autoComplete="one-time-code"
                  size="lg"
                  state={error ? 'error' : 'default'}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="text-center text-2xl font-extrabold tabular-nums tracking-[0.5em]"
                  autoFocus
                />
              </div>

              {error && (
                <FieldMessage tone="error" className="justify-center">
                  {error}
                </FieldMessage>
              )}

              <Button type="submit" size="lg" className="w-full" loading={submitting} icon={<RiLockFill />}>
                {t('pin.unlockButton')}
              </Button>
            </form>

            <div className="space-y-2 border-t border-border pt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => void switchUser()}
              >
                <RiGroupFill  />
                {t('nav.switchUser')}
              </Button>
              <button
                type="button"
                onClick={() => void switchUser()}
                className="block w-full text-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {t('pin.forgotPinLink')}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
