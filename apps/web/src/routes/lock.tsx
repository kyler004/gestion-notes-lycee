import { createFileRoute, redirect } from '@tanstack/react-router';
import { Lock, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
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
    <div className="flex min-h-screen flex-col justify-center bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-sm space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary">
            <Lock className="h-5 w-5" />
            <span className="text-sm font-semibold">{t('app.name')}</span>
          </div>
          <NetworkBadge />
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle>{t('pin.lockTitle')}</CardTitle>
            <CardDescription>{t('pin.lockSubtitle')}</CardDescription>
            {user && (
              <div className="pt-3">
                <p className="text-base font-semibold text-foreground">{user.fullName}</p>
                <div className="mt-1 flex justify-center">
                  <Badge variant="secondary">{t(`roles.${user.role}`)}</Badge>
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
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="text-center text-lg tabular-nums tracking-[0.4em]"
                  autoFocus
                />
              </div>

              {error && (
                <p role="alert" className="text-center text-sm font-medium text-destructive">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={submitting}>
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
                <Users className="h-3.5 w-3.5" />
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
