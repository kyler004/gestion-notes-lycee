import { RiChat1Fill, RiCheckFill } from '@remixicon/react';
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
import { Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n';

export interface AppreciationPrompt {
  studentName: string;
  autoAppreciation: string;
  initialValue: string;
  onSave: (appreciation: string | null) => Promise<void> | void;
}

export function AppreciationDialog({
  prompt,
  onClose,
}: {
  prompt: AppreciationPrompt | null;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (prompt) {
      setText(prompt.initialValue);
      setSaving(false);
    }
  }, [prompt]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!prompt) return;
    setSaving(true);
    try {
      const trimmed = text.trim();
      await prompt.onSave(trimmed === '' ? null : trimmed);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={Boolean(prompt)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <div className="mb-1 flex items-center gap-2.5 text-info">
            <span className="grid size-9 place-items-center rounded-sm bg-blue-100 text-blue-500">
              <RiChat1Fill className="size-5" />
            </span>
            <DialogTitle>{t('grades.appreciationModalTitle')}</DialogTitle>
          </div>
          <DialogDescription>
            {prompt
              ? `${prompt.studentName} — ${t('grades.appreciationModalDesc', {
                  auto: prompt.autoAppreciation || '—',
                })}`
              : ''}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="teacher-appreciation" optional>
              {t('grades.appreciationLabel')}
            </Label>
            <Textarea
              id="teacher-appreciation"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={255}
              placeholder={t('grades.appreciationPlaceholder')}
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              {t('grades.reasonCancel')}
            </Button>
            <Button type="submit" loading={saving} icon={<RiCheckFill />}>
              {t('grades.appreciationSave')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
