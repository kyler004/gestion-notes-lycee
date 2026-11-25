import {
  RiAwardFill,
  RiCalendar2Fill,
  RiCalendarCheckFill,
  RiLockFill,
  RiSchoolFill,
} from '@remixicon/react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dropdown } from '@/components/ui/dropdown';
import type { AcademicYearDto, ClassDto, PeriodDto } from '@/lib/api/admin';
import { isApiError, isNetworkError } from '@/lib/api/errors';
import { t } from '@/lib/i18n';

const ALL_VALUE = '__all__';
export const ANNUAL_PERIOD_VALUE = '__annual__';

export function formatReportError(err: unknown): string {
  if (isApiError(err)) {
    if (err.status === 429) {
      return t('reports.results.pdfRateLimited', {
        seconds: err.retryAfterSeconds ?? 60,
      });
    }
    if (err.status === 503 || err.code === 'PDF_SERVICE_BUSY') {
      return t('reports.results.pdfBusyError');
    }
    return err.message;
  }
  if (isNetworkError(err)) {
    return t('auth.networkError');
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return 'Une erreur inattendue est survenue.';
}

export function formatDecimalFr(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toFixed(digits).replace('.', ',');
}

export function ReportContextBar({
  years,
  selectedYearId,
  onSelectYear,
  periods,
  selectedPeriodId,
  onSelectPeriod,
  classes,
  selectedClassId,
  onSelectClass,
  showPeriod = true,
  showClass = false,
  allowAllClasses = false,
  allowAllPeriods = false,
  allowAnnual = false,
}: {
  years: AcademicYearDto[];
  selectedYearId?: string;
  onSelectYear: (id: string) => void;
  periods: PeriodDto[];
  selectedPeriodId?: string;
  onSelectPeriod: (id: string) => void;
  classes: ClassDto[];
  selectedClassId?: string;
  onSelectClass?: (id: string) => void;
  showPeriod?: boolean;
  showClass?: boolean;
  allowAllClasses?: boolean;
  allowAllPeriods?: boolean;
  allowAnnual?: boolean;
}) {
  const isAnnualSelected = allowAnnual && selectedPeriodId === ANNUAL_PERIOD_VALUE;
  const selectedPeriod = isAnnualSelected
    ? undefined
    : periods.find((p) => p.id === selectedPeriodId);
  const trimesters = periods.filter((p) => p.type === 'trimester');
  const isAnnualOfficial =
    trimesters.length > 0 && trimesters.every((p) => p.status === 'locked');

  const periodOptions = [
    ...(allowAllPeriods
      ? [
          {
            value: ALL_VALUE,
            label: t('reports.audit.allPeriodsOption'),
            icon: <RiCalendar2Fill />,
          },
        ]
      : []),
    ...periods.map((p) => ({
      value: p.id,
      label: `${p.name} (${p.code})`,
      description:
        p.status === 'locked'
          ? t('reports.context.periodLockedDesc')
          : t('reports.context.periodOpenDesc'),
      icon: p.status === 'locked' ? <RiLockFill /> : <RiCalendar2Fill />,
    })),
    ...(allowAnnual
      ? [
          {
            value: ANNUAL_PERIOD_VALUE,
            label: t('reports.context.annualOptionLabel'),
            description: isAnnualOfficial
              ? t('reports.context.annualOfficialDesc')
              : t('reports.context.annualProvisionalDesc'),
            icon: <RiAwardFill />,
          },
        ]
      : []),
  ];

  const classOptions = [
    ...(allowAllClasses
      ? [
          {
            value: ALL_VALUE,
            label: t('reports.audit.allClassesOption'),
            icon: <RiSchoolFill />,
          },
        ]
      : []),
    ...classes.map((c) => ({
      value: c.id,
      label: c.name,
      description: `${c.level}${c.series ? ` · Série ${c.series}` : ''}`,
      icon: <RiSchoolFill />,
    })),
  ];

  return (
    <Card className="space-y-3 p-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Dropdown
          label={t('reports.context.yearLabel')}
          value={selectedYearId}
          onChange={onSelectYear}
          options={years.map((y) => ({
            value: y.id,
            label: y.isActive
              ? `${y.label} · ${t('admin.yearContextActiveTag')}`
              : y.label,
            description: `${y.startDate} → ${y.endDate}`,
            icon: y.isActive ? <RiCalendarCheckFill /> : <RiCalendar2Fill />,
          }))}
        />

        {showPeriod && (
          <Dropdown
            label={t('reports.context.periodLabel')}
            value={selectedPeriodId ?? (allowAllPeriods ? ALL_VALUE : undefined)}
            onChange={onSelectPeriod}
            options={periodOptions}
          />
        )}

        {showClass && onSelectClass && (
          <Dropdown
            label={t('reports.context.classLabel')}
            value={selectedClassId ?? (allowAllClasses ? ALL_VALUE : undefined)}
            onChange={onSelectClass}
            options={classOptions}
          />
        )}
      </div>

      {showPeriod && isAnnualSelected && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{t('reports.context.annualSelectedLabel')}</span>
          <Badge
            variant={isAnnualOfficial ? 'success' : 'warning'}
            icon={isAnnualOfficial ? <RiLockFill /> : <RiAwardFill />}
          >
            {isAnnualOfficial
              ? t('reports.context.annualOfficialBadge')
              : t('reports.context.annualProvisionalBadge')}
          </Badge>
        </div>
      )}

      {selectedPeriod && showPeriod && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {selectedPeriod.name} ({selectedPeriod.code})
          </span>
          <Badge
            variant={selectedPeriod.status === 'locked' ? 'success' : 'warning'}
            icon={selectedPeriod.status === 'locked' ? <RiLockFill /> : <RiCalendar2Fill />}
          >
            {selectedPeriod.status === 'locked'
              ? t('reports.statusOfficialBadge')
              : t('reports.statusProvisionalBadge')}
          </Badge>
        </div>
      )}
    </Card>
  );
}
