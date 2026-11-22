import { RiEdit2Fill, RiShieldCheckFill } from '@remixicon/react';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldMessage, Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n';

export interface PendingReasonPrompt {
  studentName: string;
  valueLabel: string;
  onConfirm: (reason: string) => Promise<void> | void;
  onCancel?: () => void;
}

export function EditReasonDialog({
  prompt,
  onClose,
}: {
  prompt: PendingReasonPrompt | null;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (prompt) {
      setReason('');
      setError(null);
      setSubmitting(false);
    }
  }, [prompt]);

  const handleCancel = () => {
    prompt?.onCancel?.();
    onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed) {
      setError(t('grades.reasonMinError'));
      return;
    }

    if (!prompt) return;
    setSubmitting(true);
    try {
      await prompt.onConfirm(trimmed);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={Boolean(prompt)}
      onOpenChange={(open) => {
        if (!open) handleCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <div className="mb-1 flex items-center gap-2.5 text-primary">
            <span className="grid size-9 place-items-center rounded-sm bg-emerald-50 text-emerald-400">
              <RiEdit2Fill className="size-5" />
            </span>
            <DialogTitle>{t('grades.reasonModalTitle')}</DialogTitle>
          </div>
          <DialogDescription>{t('grades.reasonModalDesc')}</DialogDescription>
        </DialogHeader>

        {prompt && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-md bg-muted/60 px-3.5 py-2.5 text-xs font-semibold text-foreground">
              <p>{t('grades.reasonModalStudent', { name: prompt.studentName })}</p>
              <p className="mt-0.5 text-primary tabular-nums">
                {t('grades.reasonModalChange', { value: prompt.valueLabel })}
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  t('grades.reasonPresets.typo'),
                  t('grades.reasonPresets.recount'),
                  t('grades.reasonPresets.justified'),
                ] as const
              ).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setReason(preset);
                    setError(null);
                  }}
                  className="cursor-pointer rounded-sm bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-slate-100"
                >
                  {preset}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-grade-reason">{t('grades.reasonInputLabel')}</Label>
              <Input
                id="edit-grade-reason"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (error) setError(null);
                }}
                state={error ? 'error' : 'default'}
                placeholder={t('sync.reasonPlaceholder')}
                maxLength={255}
                autoFocus
              />
              {error && <FieldMessage tone="error">{error}</FieldMessage>}
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={handleCancel} disabled={submitting}>
                {t('grades.reasonCancel')}
              </Button>
              <Button
                type="submit"
                loading={submitting}
                icon={<RiShieldCheckFill />}
              >
                {t('grades.reasonConfirm')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
