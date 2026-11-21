import * as LabelPrimitive from '@radix-ui/react-label';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';

export interface LabelProps extends ComponentPropsWithoutRef<typeof LabelPrimitive.Root> {
  optional?: boolean;
}

export function Label({ className, optional, children, ...props }: LabelProps) {
  return (
    <LabelPrimitive.Root
      className={cn(
        'inline-flex items-center gap-2 text-xs font-bold tracking-wide text-slate-500 leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        className,
      )}
      {...props}
    >
      <span>{children}</span>
      {optional && (
        <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-bold tracking-normal text-muted-foreground">
          Optionnel
        </span>
      )}
    </LabelPrimitive.Root>
  );
}
