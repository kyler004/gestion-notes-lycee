import { cn } from '@/lib/utils';

export interface SwitchProps {
  id?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
  className?: string;
}

/**
 * Interrupteur binaire conforme au design system (coins doux `rounded-sm`, zéro pill).
 */
export function Switch({
  id,
  checked,
  onCheckedChange,
  disabled = false,
  label,
  description,
  className,
}: SwitchProps) {
  const button = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={!label ? 'Activer' : undefined}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-sm border transition-colors duration-150 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-55',
        checked ? 'border-primary bg-primary' : 'border-input bg-muted',
        !label && className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none block size-4.5 rounded-[4px] bg-card shadow-xs transition-transform duration-150',
          checked ? 'translate-x-5.5' : 'translate-x-0.5',
        )}
      />
    </button>
  );

  if (!label) {
    return button;
  }

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 rounded-md border border-border bg-card px-4 py-3',
        className,
      )}
    >
      <label
        htmlFor={id}
        className={cn('min-w-0 flex-1 cursor-pointer select-none', disabled && 'cursor-not-allowed opacity-60')}
      >
        <span className="block text-sm font-semibold text-foreground">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>}
      </label>
      {button}
    </div>
  );
}
