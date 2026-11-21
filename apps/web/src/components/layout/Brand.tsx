import { RiGraduationCapFill } from '@remixicon/react';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** Marque : tuile émeraude à coin « cranté » + nom en gras. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-md rounded-tr-xl bg-emerald-100 text-slate-600 shadow-edge',
        className,
      )}
    >
      <RiGraduationCapFill className="size-6" />
    </span>
  );
}

export function Brand({ tone = 'dark', className }: { tone?: 'dark' | 'light'; className?: string }) {
  return (
    <span className={cn('flex items-center gap-3', className)}>
      <BrandMark />
      <span className="leading-tight">
        <span
          className={cn(
            'block text-base font-extrabold tracking-tight',
            tone === 'light' ? 'text-white' : 'text-foreground',
          )}
        >
          {t('app.name')}
        </span>
        <span
          className={cn('block text-xs font-medium', tone === 'light' ? 'text-slate-100' : 'text-muted-foreground')}
        >
          {t('app.subtitle')}
        </span>
      </span>
    </span>
  );
}

export function initials(name: string | undefined) {
  return (name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}
