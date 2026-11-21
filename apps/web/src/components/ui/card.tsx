import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const cardVariants = cva('rounded-lg text-card-foreground', {
  variants: {
    variant: {
      default: 'border border-border bg-card shadow-sm',
      elevated: 'border border-transparent bg-card shadow-md',
      outline: 'border-2 border-dashed border-slate-200 bg-transparent',
      interactive:
        'border border-border bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md',
      dark: 'border border-slate-500 bg-slate-600 text-slate-50 shadow-md',
      accent: 'border border-violet-100 bg-violet-50 text-violet-500',
      info: 'border border-blue-100 bg-blue-50 text-blue-500',
      success: 'border border-emerald-100/50 bg-emerald-50/25 text-emerald-500',
    },
  },
  defaultVariants: { variant: 'default' },
});

export interface CardProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export function Card({ className, variant, ...props }: CardProps) {
  return <div className={cn(cardVariants({ variant }), className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={cn('text-lg font-extrabold leading-tight tracking-tight', className)} {...props} />
  );
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm opacity-75', className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-6 pt-0', className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center p-6 pt-0', className)} {...props} />;
}

/** Carte de statistique : grand chiffre + libellé + icône dans une pastille. */
export function StatCard({
  label,
  value,
  icon,
  tone = 'emerald',
  className,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: 'emerald' | 'violet' | 'blue' | 'slate';
  className?: string;
}) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-400',
    violet: 'bg-violet-50 text-violet-400',
    blue: 'bg-blue-100 text-blue-500',
    slate: 'bg-slate-50 text-slate-500',
  } as const;
  return (
    <Card variant="elevated" className={cn('flex items-center gap-4 p-5', className)}>
      <span className={cn('grid size-12 shrink-0 place-items-center rounded-md [&_svg]:size-6', tones[tone])}>
        {icon}
      </span>
      <div>
        <p className="text-3xl font-extrabold leading-none tabular-nums">{value}</p>
        <p className="mt-1.5 text-xs font-semibold text-muted-foreground">{label}</p>
      </div>
    </Card>
  );
}

export { cardVariants };
