import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Spinner « cadran » : arc plein + piste translucide, hérite de currentColor. */
export function Spinner({
  className,
  label = 'Chargement',
  ...props
}: HTMLAttributes<HTMLSpanElement> & { label?: string }) {
  return (
    <span role="status" aria-label={label} className={cn('inline-flex', className)} {...props}>
      <svg viewBox="0 0 24 24" className="size-5 animate-spin-slow" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.22" strokeWidth="4" />
        <path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      </svg>
    </span>
  );
}
