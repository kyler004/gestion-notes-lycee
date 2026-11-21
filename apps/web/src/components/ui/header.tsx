import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** En-têtes de page : une version par couleur de la palette. */
const headerVariants = cva('relative overflow-hidden rounded-xl p-6 sm:p-7', {
  variants: {
    tone: {
      emerald: 'bg-emerald-300 text-white',
      slate: 'bg-slate-600 text-slate-50',
      violet: 'bg-violet-400 text-violet-50',
      plum: 'bg-plum-600 text-plum-100',
      blue: 'bg-blue-500 text-blue-50',
      light: 'bg-card text-foreground border border-border shadow-sm',
      mint: 'bg-emerald-50 text-emerald-500',
      lilac: 'bg-violet-50 text-violet-500',
    },
  },
  defaultVariants: { tone: 'emerald' },
});

export interface PageHeaderProps
  extends Omit<HTMLAttributes<HTMLElement>, 'title'>,
    VariantProps<typeof headerVariants> {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ tone, title, subtitle, icon, actions, className, ...props }: PageHeaderProps) {
  return (
    <header className={cn(headerVariants({ tone }), className)} {...props}>
      {/* Motif signature : quarts de disque en coin */}
      <span aria-hidden className="pointer-events-none absolute -top-10 -right-10 size-40 rounded-full bg-white/10" />
      <span aria-hidden className="pointer-events-none absolute -right-2 -bottom-14 size-32 rounded-full bg-black/10" />
      <div className="relative flex flex-wrap items-center gap-4">
        {icon && (
          <span className="grid size-12 shrink-0 place-items-center rounded-md bg-white/15 [&_svg]:size-6">
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold leading-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm opacity-80">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export { headerVariants };
