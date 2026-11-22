import type { GradeStatus } from '@lycee/shared';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const STATUS_OPTIONS: Array<{
  value: GradeStatus;
  labelKey: 'grades.statusPresent' | 'grades.statusAbsent' | 'grades.statusExcused';
  activeClass: string;
}> = [
  {
    value: 'present',
    labelKey: 'grades.statusPresent',
    activeClass: 'bg-emerald-50 text-emerald-500 shadow-xs',
  },
  {
    value: 'absent',
    labelKey: 'grades.statusAbsent',
    activeClass: 'bg-amber-50 text-amber-500 shadow-xs',
  },
  {
    value: 'excused',
    labelKey: 'grades.statusExcused',
    activeClass: 'bg-blue-100 text-blue-500 shadow-xs',
  },
];

export function StatusSegment({
  value,
  disabled = false,
  onChange,
  studentName,
}: {
  value: GradeStatus | null;
  disabled?: boolean;
  onChange: (next: GradeStatus) => void;
  studentName: string;
}) {
  return (
    <div
      role="group"
      aria-label={`${t('grades.colStatus')} — ${studentName}`}
      className={cn(
        'inline-flex rounded-md bg-muted/75 p-0.5 border border-border',
        disabled && 'opacity-65',
      )}
    >
      {STATUS_OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'cursor-pointer rounded-sm px-2.5 py-1 text-xs font-bold transition-all disabled:cursor-not-allowed',
              active
                ? opt.activeClass
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(opt.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
