import { RiCalendarCheckFill, RiCalendar2Fill } from '@remixicon/react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dropdown } from '@/components/ui/dropdown';
import type { AcademicYearDto } from '@/lib/api/admin';
import { t } from '@/lib/i18n';

export function AdminYearContextBar({
  years,
  selectedYearId,
  onSelectYear,
}: {
  years: AcademicYearDto[];
  selectedYearId?: string;
  onSelectYear: (yearId: string) => void;
}) {
  const selectedYear = years.find((y) => y.id === selectedYearId);

  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-80">
          <Dropdown
            label={t('admin.yearContextLabel')}
            placeholder={t('admin.yearContextNone')}
            value={selectedYearId}
            onChange={onSelectYear}
            options={years.map((year) => ({
              value: year.id,
              label: year.isActive
                ? `${year.label} · ${t('admin.yearContextActiveTag')}`
                : year.label,
              description: `${year.startDate} → ${year.endDate}`,
              icon: year.isActive ? <RiCalendarCheckFill /> : <RiCalendar2Fill />,
            }))}
          />
        </div>
        {selectedYear?.isActive && (
          <Badge variant="success" icon={<RiCalendarCheckFill />}>
            {t('admin.yearContextActiveTag')}
          </Badge>
        )}
      </div>
      {selectedYear && (
        <p className="text-xs font-semibold text-muted-foreground tabular-nums">
          Du {selectedYear.startDate} au {selectedYear.endDate}
        </p>
      )}
    </Card>
  );
}
