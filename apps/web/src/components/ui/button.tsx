import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Spinner } from './spinner';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold transition-all duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-[1.15em] [&_svg]:shrink-0 cursor-pointer',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-edge hover:bg-emerald-400',
        dark: 'bg-slate-600 text-white shadow-edge hover:bg-slate-500',
        accent: 'bg-violet-300 text-white shadow-edge hover:bg-violet-400',
        info: 'bg-blue-500 text-white shadow-edge hover:bg-blue-400',
        destructive: 'bg-destructive text-destructive-foreground shadow-edge hover:bg-brick-500',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-slate-100/60',
        outline: 'border-2 border-slate-600/15 bg-card text-foreground hover:border-primary hover:text-primary',
        ghost: 'text-foreground hover:bg-muted',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 px-5 text-sm',
        sm: 'h-9 px-3.5 text-xs',
        lg: 'h-12 px-6 text-base',
        icon: 'size-11',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Icône (élément plein) affichée avant le libellé. */
  icon?: ReactNode;
  loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  icon,
  loading = false,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size, className }));
  if (asChild) {
    return (
      <Slot className={classes} {...props}>
        {children as React.ReactElement}
      </Slot>
    );
  }
  return (
    <button className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? <Spinner className="[&_svg]:size-[1.15em]" /> : icon}
      {children}
    </button>
  );
}

export { buttonVariants };
