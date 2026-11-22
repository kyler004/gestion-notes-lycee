import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import { RiArrowDownSFill, RiCheckboxCircleFill } from '@remixicon/react';
import { type ReactNode, useState } from 'react';
import { cn } from '@/lib/utils';

export interface DropdownOption {
  value: string;
  label: string;
  description?: string;
  icon?: ReactNode;
}

/**
 * Sélecteur déroulant sur mesure (classe, matière, période, rôle…).
 * Déclencheur en « tuile » avec étiquette flottante, menu à coins larges,
 * l'option choisie est surlignée en vert avec une coche pleine.
 */
export function Dropdown({
  label,
  value,
  onChange,
  options,
  placeholder = 'Sélectionner',
  className,
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <DropdownPrimitive.Root open={open} onOpenChange={setOpen}>
      <DropdownPrimitive.Trigger
        className={cn(
          'group flex h-14 w-full min-w-48 cursor-pointer items-center gap-3 rounded-md border-2 bg-card px-4 text-left transition-colors outline-none',
          open ? 'border-primary' : 'border-slate-600/15 hover:border-slate-300',
          className,
        )}
      >
        {selected?.icon && <span className="text-primary [&_svg]:size-5">{selected.icon}</span>}
        <span className="min-w-0 flex-1">
          <span className="block text-[0.65rem] font-bold tracking-wider text-muted-foreground uppercase">
            {label}
          </span>
          <span className={cn('block truncate text-sm font-bold', !selected && 'text-muted-foreground')}>
            {selected?.label ?? placeholder}
          </span>
        </span>
        <RiArrowDownSFill
          className={cn('size-6 shrink-0 text-slate-300 transition-transform', open && 'rotate-180 text-primary')}
        />
      </DropdownPrimitive.Trigger>
      <DropdownPrimitive.Portal>
        <DropdownPrimitive.Content
          sideOffset={8}
          align="start"
          className="z-50 max-h-80 min-w-(--radix-dropdown-menu-trigger-width) animate-pop overflow-y-auto rounded-lg border border-border bg-popover p-1.5 shadow-lg"
        >
          {options.map((o) => {
            const active = o.value === value;
            return (
              <DropdownPrimitive.Item
                key={o.value}
                onSelect={() => onChange(o.value)}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-sm outline-none transition-colors data-[highlighted]:bg-muted',
                  active && 'bg-emerald-50/40 data-[highlighted]:bg-emerald-50/60',
                )}
              >
                {o.icon && <span className="text-slate-300 [&_svg]:size-5">{o.icon}</span>}
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{o.label}</span>
                  {o.description && (
                    <span className="block text-xs text-muted-foreground">{o.description}</span>
                  )}
                </span>
                {active && <RiCheckboxCircleFill className="size-5 text-primary" />}
              </DropdownPrimitive.Item>
            );
          })}
        </DropdownPrimitive.Content>
      </DropdownPrimitive.Portal>
    </DropdownPrimitive.Root>
  );
}
