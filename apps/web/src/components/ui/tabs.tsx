import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TabItem<T extends string = string> {
  value: T;
  label: string;
  icon?: ReactNode;
  badge?: string | number;
  disabled?: boolean;
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  ariaLabel,
  className,
}: {
  value: T;
  onChange: (nextValue: T) => void;
  items: readonly TabItem<T>[];
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'flex items-center gap-1.5 overflow-x-auto rounded-lg border border-border bg-card p-1.5 shadow-sm',
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            id={`tab-${item.value}`}
            aria-selected={active}
            aria-controls={`tabpanel-${item.value}`}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            className={cn(
              'inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-md px-3.5 py-2.5 text-sm font-bold transition-all duration-150 [&_svg]:size-4.5 [&_svg]:shrink-0 disabled:pointer-events-none disabled:opacity-50',
              active
                ? 'bg-violet-50 text-violet-500 shadow-xs'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.badge !== undefined && (
              <span
                className={cn(
                  'rounded-sm px-1.5 py-0.5 text-[11px] font-extrabold leading-none tabular-nums',
                  active ? 'bg-violet-100/80 text-violet-500' : 'bg-muted text-muted-foreground',
                )}
              >
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
