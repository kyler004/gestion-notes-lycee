import { ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PinCodeSchema } from '@/lib/auth/pin';
import { t } from '@/lib/i18n';
import { useSessionStore } from '@/stores/session.store';

interface PinSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allowDismiss?: boolean;
}

export function PinSetupDialog({
  open,
  onOpenChange,
  allowDismiss = true,
}: PinSetupDialogProps) {
  const setupPin = useSessionStore((s) => s.setupPin);
  const dismissPinSetup = useSessionStore((s) => s.dismissPinSetup);

  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleClose = () => {
    setPin('');
    setConfirmPin('');
    setError(null);
    dismissPinSetup();
    onOpenChange(false);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsed = PinCodeSchema.safeParse(pin);
    if (!parsed.success) {
      setError(t('pin.pinInvalidFormat'));
      return;
    }

    if (pin !== confirmPin) {
      setError(t('pin.pinMismatch'));
      return;
    }

    setSaving(true);
    try {
      await setupPin(pin);
      toast.success(t('pin.setupSuccess'));
      setPin('');
      setConfirmPin('');
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde du code PIN.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && allowDismiss && handleClose()}>
      <DialogContent hideClose={!allowDismiss}>
        <DialogHeader>
          <div className="mb-1 flex items-center gap-2 text-primary">
            <ShieldCheck className="h-5 w-5" />
            <DialogTitle>{t('pin.setupTitle')}</DialogTitle>
          </div>
          <DialogDescription>{t('pin.setupDescription')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="setup-pin">{t('pin.pinLabel')}</Label>
            <Input
              id="setup-pin"
              type="password"
              inputMode="numeric"
              pattern="\d{4,6}"
              maxLength={6}
              autoComplete="new-password"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              className="tabular-nums tracking-widest"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm-setup-pin">{t('pin.confirmPinLabel')}</Label>
            <Input
              id="confirm-setup-pin"
              type="password"
              inputMode="numeric"
              pattern="\d{4,6}"
              maxLength={6}
              autoComplete="new-password"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              className="tabular-nums tracking-widest"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            {allowDismiss && (
              <Button type="button" variant="ghost" onClick={handleClose} disabled={saving}>
                {t('pin.skipPin')}
              </Button>
            )}
            <Button type="submit" disabled={saving}>
              {t('pin.savePin')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
