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
  useId,
  useState,
  type ComponentPropsWithRef,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

export type FieldState = 'default' | 'error' | 'success';

const shellVariants = cva(
  'group flex w-full items-center gap-2.5 rounded-md border-2 transition-all duration-150 focus-within:ring-4',
  {
    variants: {
      state: {
        default:
          'border-slate-600/15 bg-muted/45 shadow-xs hover:border-slate-200 hover:bg-card focus-within:border-primary focus-within:bg-card focus-within:shadow-sm focus-within:ring-ring/20',
        error:
          'border-brick-400 bg-brick-50/35 shadow-xs focus-within:border-brick-400 focus-within:bg-card focus-within:ring-brick-300/25',
        success:
          'border-emerald-200 bg-card shadow-xs focus-within:border-primary focus-within:ring-ring/20',
      },
      size: {
        sm: 'h-10 px-2.5',
        default: 'h-12 px-3',
        lg: 'h-14 px-3.5',
      },
    },
    defaultVariants: {
      state: 'default',
      size: 'default',
    },
  },
);

const iconChipVariants = cva(
  'grid shrink-0 place-items-center rounded-sm transition-colors duration-150 [&_svg]:size-4',
  {
    variants: {
      state: {
        default:
          'bg-card text-slate-400 shadow-xs group-focus-within:bg-emerald-50 group-focus-within:text-emerald-400',
        error: 'bg-brick-50 text-brick-400',
        success: 'bg-emerald-50 text-emerald-400',
      },
      size: {
        sm: 'size-6',
        default: 'size-8',
        lg: 'size-9 [&_svg]:size-5',
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
  /** Icône pleine (Remix Fill) affichée dans une pastille à gauche. */
  icon?: ReactNode;
  /** Contenu additionnel affiché à droite du champ. */
  trailing?: ReactNode;
  /** Active le bouton afficher/masquer lorsque `type="password"`. */
  passwordToggle?: boolean;
  /** Classes appliquées au conteneur externe du champ. */
  containerClassName?: string;
}

/**
 * Champ de saisie principal du design system Lycée.
 * Surface ardoise légère au repos, élévation blanche + pastille d'icône émeraude au focus.
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
      <RiCheckboxCircleFill className="size-5 shrink-0 text-primary" aria-hidden />
    ) : !trailing && !isPassword && state === 'error' ? (
      <RiErrorWarningFill className="size-5 shrink-0 text-brick-400" aria-hidden />
    ) : null;

  return (
    <div
      className={cn(
        shellVariants({ state, size }),
        disabled && 'cursor-not-allowed bg-muted/70 opacity-60 hover:border-slate-600/15 hover:bg-muted/70',
        containerClassName,
      )}
    >
      {icon && (
        <span className={iconChipVariants({ state, size })} aria-hidden>
          {icon}
        </span>
      )}
      <input
        type={resolvedType}
        disabled={disabled}
        aria-invalid={state === 'error' || undefined}
        className={cn(
          'min-w-0 flex-1 bg-transparent text-sm font-semibold text-foreground placeholder:font-medium placeholder:text-muted-foreground/80 focus:outline-none disabled:cursor-not-allowed file:border-0 file:bg-transparent file:text-sm file:font-semibold',
          !icon && 'pl-1',
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
          className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-sm text-slate-300 transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none"
        >
          {revealed ? <RiEyeOffFill className="size-4" /> : <RiEyeFill className="size-4" />}
        </button>
      )}
      {trailing}
      {autoStatusIcon}
    </div>
  );
}

export interface TileInputProps extends Omit<InputProps, 'size'> {
  /** Libellé affiché en majuscules dans la tuile, aligné sur `Dropdown`. */
  label: string;
}

/**
 * Champ « tuile » (h-14) conçu pour s'aligner pixel par pixel avec `Dropdown`.
 * Intègre l'étiquette majuscule, la pastille d'icône pleine et l'état visuel.
 */
export function TileInput({
  id,
  label,
  icon,
  trailing,
  passwordToggle = false,
  state = 'default',
  type = 'text',
  disabled,
  className,
  containerClassName,
  ...props
}: TileInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === 'password' && passwordToggle;
  const resolvedType = isPassword ? (revealed ? 'text' : 'password') : type;

  const autoStatusIcon =
    !trailing && !isPassword && state === 'success' ? (
      <RiCheckboxCircleFill className="size-5 shrink-0 text-primary" aria-hidden />
    ) : !trailing && !isPassword && state === 'error' ? (
      <RiErrorWarningFill className="size-5 shrink-0 text-brick-400" aria-hidden />
    ) : null;

  return (
    <div
      className={cn(
        'group flex h-14 w-full items-center gap-3 rounded-md border-2 px-3.5 transition-all duration-150 focus-within:ring-4',
        state === 'default' &&
          'border-slate-600/15 bg-card shadow-xs hover:border-slate-200 focus-within:border-primary focus-within:shadow-sm focus-within:ring-ring/20',
        state === 'error' &&
          'border-brick-400 bg-brick-50/35 shadow-xs focus-within:border-brick-400 focus-within:bg-card focus-within:ring-brick-300/25',
        state === 'success' &&
          'border-emerald-200 bg-card shadow-xs focus-within:border-primary focus-within:ring-ring/20',
        disabled && 'cursor-not-allowed bg-muted/60 opacity-60',
        containerClassName,
      )}
    >
      {icon && (
        <span
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-sm transition-colors duration-150 [&_svg]:size-5',
            state === 'default' &&
              'bg-muted text-slate-400 group-focus-within:bg-emerald-50 group-focus-within:text-emerald-400',
            state === 'error' && 'bg-brick-50 text-brick-400',
            state === 'success' && 'bg-emerald-50 text-emerald-400',
          )}
          aria-hidden
        >
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <label
          htmlFor={inputId}
          className={cn(
            'block cursor-text text-[0.65rem] font-bold tracking-wider uppercase leading-none transition-colors',
            state === 'error'
              ? 'text-brick-500'
              : 'text-muted-foreground group-focus-within:text-primary',
          )}
        >
          {label}
        </label>
        <input
          id={inputId}
          type={resolvedType}
          disabled={disabled}
          aria-invalid={state === 'error' || undefined}
          className={cn(
            'mt-1 block w-full bg-transparent text-sm font-bold text-foreground placeholder:font-medium placeholder:text-muted-foreground/75 focus:outline-none disabled:cursor-not-allowed',
            className,
          )}
          {...props}
        />
      </div>
      {isPassword && (
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => setRevealed((prev) => !prev)}
          aria-label={revealed ? 'Masquer la saisie' : 'Afficher la saisie'}
          className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-sm text-slate-300 transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none"
        >
          {revealed ? <RiEyeOffFill className="size-4" /> : <RiEyeFill className="size-4" />}
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

/** Champ de recherche avec icône pleine et bouton d'effacement rapide. */
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
            className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-sm text-slate-300 transition-colors hover:bg-muted hover:text-foreground"
          >
            <RiCloseCircleFill className="size-4" />
          </button>
        ) : undefined
      }
      {...props}
    />
  );
}

export interface GradeInputProps extends Omit<InputProps, 'icon' | 'trailing' | 'size'> {
  /** Note maximale affichée dans la pastille suffixe (20 par défaut). */
  maxScore?: number;
}

/**
 * Champ numérique dédié à la saisie des notes sur /20.
 * Chiffres tabulaires centrés et pastille « / 20 » intégrée.
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
      containerClassName={cn('w-32 pr-1.5', containerClassName)}
      className={cn('text-center text-base font-extrabold tabular-nums', className)}
      trailing={
        <span
          className={cn(
            'shrink-0 rounded-sm px-2 py-1 text-xs font-extrabold tabular-nums',
            state === 'error'
              ? 'bg-brick-50 text-brick-500'
              : state === 'success'
                ? 'bg-emerald-50 text-emerald-500'
                : 'bg-muted text-slate-500',
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
        'flex min-h-24 w-full resize-y rounded-md border-2 px-4 py-3 text-sm font-medium text-foreground transition-all duration-150 placeholder:text-muted-foreground/80 focus:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:bg-muted/70 disabled:opacity-60',
        state === 'default' &&
          'border-slate-600/15 bg-muted/45 shadow-xs hover:border-slate-200 hover:bg-card focus-visible:border-primary focus-visible:bg-card focus-visible:shadow-sm focus-visible:ring-ring/20',
        state === 'error' &&
          'border-brick-400 bg-brick-50/35 shadow-xs focus-visible:border-brick-400 focus-visible:bg-card focus-visible:ring-brick-300/25',
        state === 'success' &&
          'border-emerald-200 bg-card shadow-xs focus-visible:border-primary focus-visible:ring-ring/20',
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
        'flex items-center gap-1.5 text-xs font-semibold',
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
