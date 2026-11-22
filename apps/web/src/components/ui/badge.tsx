import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Pastilles colorées selon la nature du message / statut. */
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-2.5 py-1 text-xs font-bold leading-none transition-colors [&_svg]:size-3.5',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        secondary: 'bg-secondary text-secondary-foreground',
        outline: 'border-2 border-slate-600/15 bg-card text-foreground',
        success: 'bg-emerald-50 text-emerald-500',
        warning: 'bg-amber-50 text-amber-500',
        destructive: 'bg-brick-50 text-brick-500',
        info: 'bg-blue-100 text-blue-500',
        accent: 'bg-violet-50 text-violet-500',
        neutral: 'bg-ink-50/60 text-ink-400',
        dark: 'bg-slate-600 text-emerald-50',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  icon?: ReactNode;
}

export function Badge({ className, variant, icon, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {icon}
      {children}
    </span>
  );
}
