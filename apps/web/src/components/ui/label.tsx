import * as LabelPrimitive from '@radix-ui/react-label';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface LabelProps extends ComponentPropsWithoutRef<typeof LabelPrimitive.Root> {
  optional?: boolean;
  /** Contenu optionnel aligné à droite sur la ligne du libellé (ex. aide ou action). */
  trailing?: ReactNode;
}

export function Label({ className, optional, trailing, children, ...props }: LabelProps) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <LabelPrimitive.Root
        className={cn(
          'inline-flex items-baseline gap-1.5 text-sm font-semibold leading-none text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
          className,
        )}
        {...props}
      >
        <span>{children}</span>
        {optional && (
          <span className="text-xs font-medium text-muted-foreground">(optionnel)</span>
        )}
      </LabelPrimitive.Root>
      {trailing}
    </div>
  );
}
