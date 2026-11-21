import {
  RiCheckboxCircleFill,
  RiCloseCircleFill,
  RiErrorWarningFill,
  RiEyeFill,
  RiEyeOffFill,
  RiInformationFill,
  RiSearch2Fill,
} from '@remixicon/react';
import { cva, type VariantProps } from 'class-variance-authority';
import {
  useState,
  type ComponentPropsWithRef,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

export type FieldState = 'default' | 'error' | 'success';

const shellVariants = cva(
  'group flex w-full items-center gap-2.5 rounded-md border bg-card transition-all duration-150 focus-within:ring-3',
  {
    variants: {
      state: {
        default:
          'border-input hover:border-slate-300 focus-within:border-primary focus-within:ring-ring/15',
        error:
          'border-brick-300 focus-within:border-brick-400 focus-within:ring-brick-300/15',
        success:
          'border-emerald-200 focus-within:border-primary focus-within:ring-ring/15',
      },
      size: {
        sm: 'h-10 px-3',
        default: 'h-12 px-4',
        lg: 'h-14 px-4',
      },
    },
    defaultVariants: {
      state: 'default',
      size: 'default',
    },
  },
);

export interface InputProps
  extends Omit<ComponentPropsWithRef<'input'>, 'size'>,
    VariantProps<typeof shellVariants> {
  /** Icône pleine discrète affichée à gauche sans encadré. */
  icon?: ReactNode;
  /** Contenu additionnel affiché à droite du champ. */
  trailing?: ReactNode;
  /** Active le bouton afficher/masquer lorsque `type="password"`. */
  passwordToggle?: boolean;
  /** Classes appliquées au conteneur externe du champ. */
  containerClassName?: string;
}

/**
 * Champ de saisie du design system Lycée.
 * Surface blanche nette, bordure fine, coins doux (12 px) et focus calme.
 */
export function Input({
  className,
  containerClassName,
  type = 'text',
  state = 'default',
  size = 'default',
  icon,
  trailing,
  passwordToggle = false,
  disabled,
  ...props
}: InputProps) {
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === 'password' && passwordToggle;
  const resolvedType = isPassword ? (revealed ? 'text' : 'password') : type;

  const autoStatusIcon =
    !trailing && !isPassword && state === 'success' ? (
      <RiCheckboxCircleFill className="size-4.5 shrink-0 text-primary" aria-hidden />
    ) : !trailing && !isPassword && state === 'error' ? (
      <RiErrorWarningFill className="size-4.5 shrink-0 text-brick-400" aria-hidden />
    ) : null;

  return (
    <div
      className={cn(
        shellVariants({ state, size }),
        disabled && 'cursor-not-allowed bg-muted/65 opacity-60 hover:border-input',
        containerClassName,
      )}
    >
      {icon && (
        <span
          className={cn(
            'shrink-0 transition-colors [&_svg]:size-4.5',
            state === 'error'
              ? 'text-brick-400'
              : state === 'success'
                ? 'text-primary'
                : 'text-slate-300 group-focus-within:text-primary',
          )}
          aria-hidden
        >
          {icon}
        </span>
      )}
      <input
        type={resolvedType}
        disabled={disabled}
        aria-invalid={state === 'error' || undefined}
        className={cn(
          'min-w-0 flex-1 bg-transparent text-sm font-medium text-foreground placeholder:font-normal placeholder:text-muted-foreground/80 focus:outline-none disabled:cursor-not-allowed file:border-0 file:bg-transparent file:text-sm file:font-semibold',
          className,
        )}
        {...props}
      />
      {isPassword && (
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => setRevealed((prev) => !prev)}
          aria-label={revealed ? 'Masquer la saisie' : 'Afficher la saisie'}
          className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-sm text-slate-300 transition-colors hover:text-foreground disabled:pointer-events-none"
        >
          {revealed ? <RiEyeOffFill className="size-4.5" /> : <RiEyeFill className="size-4.5" />}
        </button>
      )}
      {trailing}
      {autoStatusIcon}
    </div>
  );
}

export interface SearchInputProps extends Omit<InputProps, 'icon' | 'type' | 'trailing'> {
  onClear?: () => void;
}

/** Champ de recherche avec icône pleine discrète et bouton d'effacement. */
export function SearchInput({ value, onClear, placeholder = 'Rechercher…', ...props }: SearchInputProps) {
  const hasValue = typeof value === 'string' ? value.length > 0 : Boolean(value);
  return (
    <Input
      type="search"
      value={value}
      placeholder={placeholder}
      icon={<RiSearch2Fill />}
      trailing={
        hasValue && onClear ? (
          <button
            type="button"
            onClick={onClear}
            aria-label="Effacer la recherche"
            className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-sm text-slate-300 transition-colors hover:text-foreground"
          >
            <RiCloseCircleFill className="size-4.5" />
          </button>
        ) : undefined
      }
      {...props}
    />
  );
}

export interface GradeInputProps extends Omit<InputProps, 'icon' | 'trailing' | 'size'> {
  /** Note maximale affichée en suffixe discret (20 par défaut). */
  maxScore?: number;
}

/**
 * Champ numérique dédié à la saisie des notes sur /20.
 * Surface blanche nette, chiffres tabulaires et suffixe « / 20 » discret.
 */
export function GradeInput({
  maxScore = 20,
  state = 'default',
  className,
  containerClassName,
  ...props
}: GradeInputProps) {
  return (
    <Input
      type="text"
      inputMode="decimal"
      state={state}
      size="sm"
      containerClassName={cn('w-30 pr-3', containerClassName)}
      className={cn('text-center text-sm font-bold tabular-nums', className)}
      trailing={
        <span
          className={cn(
            'shrink-0 text-xs font-semibold tabular-nums',
            state === 'error'
              ? 'text-brick-400'
              : state === 'success'
                ? 'text-primary'
                : 'text-muted-foreground',
          )}
        >
          / {maxScore}
        </span>
      }
      {...props}
    />
  );
}

export interface TextareaProps extends ComponentPropsWithRef<'textarea'> {
  state?: FieldState;
}

/** Zone de texte multi-lignes (appréciations, observations du conseil) alignée sur `Input`. */
export function Textarea({
  className,
  state = 'default',
  disabled,
  ...props
}: TextareaProps) {
  return (
    <textarea
      disabled={disabled}
      aria-invalid={state === 'error' || undefined}
      className={cn(
        'flex min-h-24 w-full resize-y rounded-md border bg-card px-4 py-3 text-sm font-medium text-foreground transition-all duration-150 placeholder:font-normal placeholder:text-muted-foreground/80 focus:outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:bg-muted/65 disabled:opacity-60',
        state === 'default' &&
          'border-input hover:border-slate-300 focus-visible:border-primary focus-visible:ring-ring/15',
        state === 'error' &&
          'border-brick-300 focus-visible:border-brick-400 focus-visible:ring-brick-300/15',
        state === 'success' &&
          'border-emerald-200 focus-visible:border-primary focus-visible:ring-ring/15',
        className,
      )}
      {...props}
    />
  );
}

export interface FieldMessageProps extends HTMLAttributes<HTMLParagraphElement> {
  tone?: 'hint' | 'error' | 'success';
}

/** Message d'aide, de validation ou d'erreur sous un champ de saisie. */
export function FieldMessage({
  tone = 'hint',
  className,
  children,
  ...props
}: FieldMessageProps) {
  return (
    <p
      role={tone === 'error' ? 'alert' : undefined}
      className={cn(
        'flex items-center gap-1.5 text-xs font-medium',
        tone === 'hint' && 'text-muted-foreground',
        tone === 'error' && 'text-brick-500',
        tone === 'success' && 'text-emerald-400',
        className,
      )}
      {...props}
    >
      {tone === 'error' && <RiErrorWarningFill className="size-3.5 shrink-0" aria-hidden />}
      {tone === 'success' && <RiCheckboxCircleFill className="size-3.5 shrink-0" aria-hidden />}
      {tone === 'hint' && <RiInformationFill className="size-3.5 shrink-0 opacity-75" aria-hidden />}
      <span>{children}</span>
    </p>
  );
}
