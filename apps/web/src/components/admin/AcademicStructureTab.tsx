import {
  CAMEROON_DEFAULT_GRADING_RULES,
  CreateAcademicYearSchema,
  CreatePeriodSchema,
  GradingRulesSchema,
  UpdatePeriodSchema,
  type AppreciationBand,
  type PeriodType,
} from '@lycee/shared';
import {
  RiAddCircleFill,
  RiCalendar2Fill,
  RiCalendarCheckFill,
  RiCheckboxCircleFill,
  RiDeleteBin6Fill,
  RiEdit2Fill,
  RiLockFill,
  RiLockUnlockFill,
  RiPercentFill,
  RiSaveFill,
} from '@remixicon/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Dropdown } from '@/components/ui/dropdown';
import { FieldMessage, Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import {
  activateAcademicYear,
  createAcademicYear,
  createPeriod,
  getGradingRules,
  listPeriods,
  updatePeriod,
  upsertGradingRules,
  type AcademicYearDto,
  type PeriodDto,
} from '@/lib/api/admin';
import { adminKeys } from '@/lib/api/query-keys';
import { t } from '@/lib/i18n';
import { getAdminErrorMessage, refreshLocalSyncSnapshot } from './admin-utils';

interface RulesDraft {
  trimestersCount: number;
  sequencesPerTrimester: number;
  sequenceWeights: number[];
  trimesterWeights: number[];
  passingThreshold: number;
  honorRollThreshold: number;
  encouragementThreshold: number;
  congratulationThreshold: number;
  treatAbsentAsZero: boolean;
  appreciationScale: AppreciationBand[];
}

function resizeWeights(current: number[], count: number): number[] {
  const safeCount = Math.max(1, Math.min(4, count));
  return Array.from({ length: safeCount }, (_, i) => current[i] ?? 1);
}

function toRulesDraft(source: typeof CAMEROON_DEFAULT_GRADING_RULES): RulesDraft {
  return {
    trimestersCount: source.trimestersCount,
    sequencesPerTrimester: source.sequencesPerTrimester,
    sequenceWeights: [...source.sequenceWeights],
    trimesterWeights: [...source.trimesterWeights],
    passingThreshold: source.passingThreshold,
    honorRollThreshold: source.honorRollThreshold,
    encouragementThreshold: source.encouragementThreshold,
    congratulationThreshold: source.congratulationThreshold,
    treatAbsentAsZero: source.treatAbsentAsZero,
    appreciationScale: source.appreciationScale.map((b) => ({ ...b })),
  };
}

function suggestNextAppreciationBand(existing: AppreciationBand[]): AppreciationBand {
  if (existing.length === 0) {
    return { min: 0, max: 20, label: 'Passable' };
  }
  const sorted = [...existing].sort((a, b) => a.min - b.min || a.max - b.max);
  const highestMax = sorted.reduce(
    (maxVal, band) => (Number.isFinite(band.max) ? Math.max(maxVal, band.max) : maxVal),
    0,
  );
  if (highestMax <= 19.98) {
    return {
      min: Number((highestMax + 0.01).toFixed(2)),
      max: 20,
      label: 'Nouvelle tranche',
    };
  }
  if (sorted[0] && Number.isFinite(sorted[0].min) && sorted[0].min >= 0.02) {
    return {
      min: 0,
      max: Number((sorted[0].min - 0.01).toFixed(2)),
      label: 'Nouvelle tranche',
    };
  }
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1]!;
    const curr = sorted[i]!;
    if (Number.isFinite(prev.max) && Number.isFinite(curr.min) && curr.min - prev.max > 0.02) {
      return {
        min: Number((prev.max + 0.01).toFixed(2)),
        max: Number((curr.min - 0.01).toFixed(2)),
        label: 'Nouvelle tranche',
      };
    }
  }
  return { min: 20, max: 20, label: 'Nouvelle tranche' };
}

export function AcademicStructureTab({
  years,
  selectedYearId,
  onSelectYear,
  isOnline,
}: {
  years: AcademicYearDto[];
  selectedYearId?: string;
  onSelectYear: (id: string) => void;
  isOnline: boolean;
}) {
  const queryClient = useQueryClient();

  const [newYearOpen, setNewYearOpen] = useState(false);
  const [newYearLabel, setNewYearLabel] = useState('');
  const [newYearStart, setNewYearStart] = useState('2027-09-01');
  const [newYearEnd, setNewYearEnd] = useState('2028-06-30');
  const [newYearActive, setNewYearActive] = useState(false);
  const [newYearDefaults, setNewYearDefaults] = useState(true);
  const [newYearError, setNewYearError] = useState<string | null>(null);

  const [confirmActivateYear, setConfirmActivateYear] = useState<AcademicYearDto | null>(null);

  const [periodModalMode, setPeriodModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingPeriod, setEditingPeriod] = useState<PeriodDto | null>(null);
  const [periodType, setPeriodType] = useState<PeriodType>('sequence');
  const [periodParentId, setPeriodParentId] = useState<string>('');
  const [periodCode, setPeriodCode] = useState('');
  const [periodName, setPeriodName] = useState('');
  const [periodOrder, setPeriodOrder] = useState('1');
  const [periodWeight, setPeriodWeight] = useState('1');
  const [periodError, setPeriodError] = useState<string | null>(null);

  const [rulesDraft, setRulesDraft] = useState<RulesDraft>(() =>
    toRulesDraft(CAMEROON_DEFAULT_GRADING_RULES),
  );
  const [rulesError, setRulesError] = useState<string | null>(null);

  const periodsQuery = useQuery({
    queryKey: adminKeys.periods(selectedYearId ?? ''),
    queryFn: () => listPeriods(selectedYearId!),
    enabled: Boolean(selectedYearId),
  });

  const rulesQuery = useQuery({
    queryKey: adminKeys.gradingRules(selectedYearId ?? ''),
    queryFn: () => getGradingRules(selectedYearId!),
    enabled: Boolean(selectedYearId),
  });

  useEffect(() => {
    if (rulesQuery.data) {
      setRulesDraft(toRulesDraft(rulesQuery.data));
      setRulesError(null);
    } else if (rulesQuery.isSuccess && rulesQuery.data === null) {
      setRulesDraft(toRulesDraft(CAMEROON_DEFAULT_GRADING_RULES));
      setRulesError(null);
    }
  }, [rulesQuery.data, rulesQuery.isSuccess]);

  const periods = periodsQuery.data ?? [];
  const hasLockedPeriod = useMemo(
    () => periods.some((p) => p.status === 'locked'),
    [periods],
  );

  const trimesters = useMemo(
    () =>
      periods
        .filter((p) => p.type === 'trimester')
        .sort((a, b) => a.orderIndex - b.orderIndex),
    [periods],
  );

  const sequences = useMemo(
    () =>
      periods
        .filter((p) => p.type === 'sequence')
        .sort((a, b) => a.orderIndex - b.orderIndex),
    [periods],
  );

  const isPeriodEditable = (period: PeriodDto): boolean => {
    if (period.status === 'locked') return false;
    if (period.parentPeriodId) {
      const parent = periods.find((p) => p.id === period.parentPeriodId);
      if (parent?.status === 'locked') return false;
    }
    if (periods.some((p) => p.parentPeriodId === period.id && p.status === 'locked')) {
      return false;
    }
    return true;
  };

  const createYearMutation = useMutation({
    mutationFn: () => {
      const parsed = CreateAcademicYearSchema.safeParse({
        label: newYearLabel,
        startDate: newYearStart,
        endDate: newYearEnd,
        isActive: newYearActive,
        initializeCameroonDefaults: newYearDefaults,
      });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'Données invalides.');
      }
      return createAcademicYear(parsed.data);
    },
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.academicYears() });
      onSelectYear(res.academicYear.id);
      setNewYearOpen(false);
      setNewYearLabel('');
      setNewYearError(null);
      toast.success(t('admin.academic.yearCreated', { label: res.academicYear.label }));
      refreshLocalSyncSnapshot();
    },
    onError: (err) => {
      const msg = getAdminErrorMessage(err);
      setNewYearError(msg);
      toast.error(msg);
    },
  });

  const activateYearMutation = useMutation({
    mutationFn: (yearId: string) => activateAcademicYear(yearId),
    onSuccess: async (activated) => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.academicYears() });
      onSelectYear(activated.id);
      setConfirmActivateYear(null);
      toast.success(t('admin.academic.yearActivated', { label: activated.label }));
      refreshLocalSyncSnapshot();
    },
    onError: (err) => {
      toast.error(getAdminErrorMessage(err));
    },
  });

  const savePeriodMutation = useMutation({
    mutationFn: async () => {
      if (!selectedYearId) throw new Error('Aucune année scolaire sélectionnée.');
      const parsedWeight = Number(periodWeight);

      if (periodModalMode === 'edit' && editingPeriod) {
        const parsed = UpdatePeriodSchema.safeParse({
          name: periodName,
          weight: parsedWeight,
        });
        if (!parsed.success) {
          throw new Error(parsed.error.issues[0]?.message ?? 'Données invalides.');
        }
        return updatePeriod(editingPeriod.id, parsed.data);
      }

      const parsedOrder = Number.parseInt(periodOrder, 10);
      const parsed = CreatePeriodSchema.safeParse({
        academicYearId: selectedYearId,
        type: periodType,
        parentPeriodId: periodType === 'sequence' ? periodParentId || null : null,
        code: periodCode,
        name: periodName,
        orderIndex: parsedOrder,
        weight: parsedWeight,
      });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'Données invalides.');
      }
      return createPeriod(parsed.data);
    },
    onSuccess: async () => {
      if (selectedYearId) {
        await queryClient.invalidateQueries({ queryKey: adminKeys.periods(selectedYearId) });
      }
      setPeriodModalMode(null);
      setEditingPeriod(null);
      setPeriodError(null);
      toast.success(t('admin.academic.periodSaved'));
      refreshLocalSyncSnapshot();
    },
    onError: (err) => {
      const msg = getAdminErrorMessage(err);
      setPeriodError(msg);
      toast.error(msg);
    },
  });

  const saveRulesMutation = useMutation({
    mutationFn: () => {
      if (!selectedYearId) throw new Error('Aucune année scolaire sélectionnée.');
      const parsed = GradingRulesSchema.safeParse(rulesDraft);
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'Règles de notation invalides.');
      }
      return upsertGradingRules(selectedYearId, parsed.data);
    },
    onSuccess: async (saved) => {
      if (selectedYearId) {
        queryClient.setQueryData(adminKeys.gradingRules(selectedYearId), saved);
      }
      setRulesError(null);
      toast.success(t('admin.academic.rulesSaved'));
      refreshLocalSyncSnapshot();
    },
    onError: (err) => {
      const msg = getAdminErrorMessage(err);
      setRulesError(msg);
      toast.error(msg);
    },
  });

  const openCreatePeriod = () => {
    setPeriodModalMode('create');
    setEditingPeriod(null);
    setPeriodType('sequence');
    setPeriodParentId(trimesters[0]?.id ?? '');
    setPeriodCode(`S${sequences.length + 1}`);
    setPeriodName(`Séquence ${sequences.length + 1}`);
    setPeriodOrder(String(sequences.length + 1));
    setPeriodWeight('1');
    setPeriodError(null);
  };

  const openEditPeriod = (period: PeriodDto) => {
    setPeriodModalMode('edit');
    setEditingPeriod(period);
    setPeriodName(period.name);
    setPeriodWeight(String(period.weight));
    setPeriodError(null);
  };

  const lockedRulesReadOnly = !isOnline || hasLockedPeriod;

  const liveRulesIssue = useMemo(() => {
    const parsed = GradingRulesSchema.safeParse(rulesDraft);
    if (parsed.success) return null;
    return parsed.error.issues[0]?.message ?? 'Règles de notation invalides.';
  }, [rulesDraft]);

  return (
    <div className="space-y-6">
      {/* 1. Années scolaires */}
      <Card variant="elevated">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{t('admin.academic.yearsTitle')}</CardTitle>
            <CardDescription>{t('admin.academic.yearsDesc')}</CardDescription>
          </div>
          <Button
            type="button"
            icon={<RiAddCircleFill />}
            disabled={!isOnline}
            onClick={() => {
              setNewYearError(null);
              setNewYearOpen(true);
            }}
          >
            {t('admin.academic.newYearBtn')}
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {years.map((year) => {
            const isSelected = year.id === selectedYearId;
            return (
              <div
                key={year.id}
                className={`flex flex-col justify-between gap-3 rounded-lg border p-4 transition-colors ${
                  isSelected
                    ? 'border-violet-300 bg-violet-50/45'
                    : 'border-border bg-card'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-extrabold text-foreground tabular-nums">
                      {year.label}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                      {year.startDate} → {year.endDate}
                    </p>
                  </div>
                  {year.isActive && (
                    <Badge variant="success" icon={<RiCalendarCheckFill />}>
                      {t('admin.yearContextActiveTag')}
                    </Badge>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={isSelected ? 'accent' : 'outline'}
                    onClick={() => onSelectYear(year.id)}
                  >
                    {isSelected ? 'Affichée' : 'Consulter'}
                  </Button>
                  {!year.isActive && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={!isOnline}
                      onClick={() => setConfirmActivateYear(year)}
                    >
                      {t('admin.academic.activateYearBtn')}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {selectedYearId && (
        <>
          {/* 2. Périodes */}
          <Card variant="elevated">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>{t('admin.academic.periodsTitle')}</CardTitle>
                <CardDescription>{t('admin.academic.periodsDesc')}</CardDescription>
              </div>
              <Button
                type="button"
                variant="secondary"
                icon={<RiAddCircleFill />}
                disabled={!isOnline}
                onClick={openCreatePeriod}
              >
                {t('admin.academic.newPeriodBtn')}
              </Button>
            </CardHeader>
            <CardContent>
              {periodsQuery.isLoading ? (
                <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                  <Spinner className="size-4 text-primary" />
                  <span>{t('admin.common.loading')}</span>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-3">
                  {trimesters.map((trim) => {
                    const children = sequences.filter((s) => s.parentPeriodId === trim.id);
                    return (
                      <div
                        key={trim.id}
                        className="flex flex-col gap-3 rounded-lg border border-border bg-muted/35 p-4"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="rounded-sm bg-slate-600 px-2 py-0.5 text-xs font-extrabold text-white tabular-nums">
                                {trim.code}
                              </span>
                              <span className="text-sm font-extrabold">{trim.name}</span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                              {t('admin.academic.periodWeightLabel')} : {trim.weight}
                            </p>
                          </div>
                          <Badge
                            variant={trim.status === 'locked' ? 'dark' : 'success'}
                            icon={trim.status === 'locked' ? <RiLockFill /> : <RiLockUnlockFill />}
                          >
                            {trim.status === 'locked'
                              ? t('admin.academic.periodLockedTag')
                              : t('admin.academic.periodOpenTag')}
                          </Badge>
                        </div>

                        <div className="space-y-2">
                          {children.map((seq) => (
                            <div
                              key={seq.id}
                              className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold">
                                  <span className="mr-1.5 text-primary tabular-nums">
                                    {seq.code}
                                  </span>
                                  {seq.name}
                                </p>
                                <p className="text-xs text-muted-foreground tabular-nums">
                                  Poids {seq.weight}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Badge
                                  variant={seq.status === 'locked' ? 'dark' : 'success'}
                                  icon={
                                    seq.status === 'locked' ? (
                                      <RiLockFill />
                                    ) : (
                                      <RiCheckboxCircleFill />
                                    )
                                  }
                                >
                                  {seq.status === 'locked'
                                    ? t('admin.academic.periodLockedTag')
                                    : t('admin.academic.periodOpenTag')}
                                </Badge>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  disabled={!isOnline || !isPeriodEditable(seq)}
                                  aria-label={`${t('admin.common.edit')} ${seq.code}`}
                                  onClick={() => openEditPeriod(seq)}
                                >
                                  <RiEdit2Fill className="size-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>

                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          icon={<RiEdit2Fill />}
                          disabled={!isOnline || !isPeriodEditable(trim)}
                          onClick={() => openEditPeriod(trim)}
                        >
                          {t('admin.common.edit')} {trim.code}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 3. Barème & règles */}
          <Card variant="elevated">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>{t('admin.academic.rulesTitle')}</CardTitle>
                  <CardDescription>{t('admin.academic.rulesDesc')}</CardDescription>
                </div>
                <span className="grid size-10 shrink-0 place-items-center rounded-md bg-violet-50 text-violet-400">
                  <RiPercentFill className="size-5" />
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {hasLockedPeriod && (
                <Card variant="info" className="flex items-center gap-3 p-4 text-sm font-semibold">
                  <RiLockFill className="size-5 shrink-0" />
                  <span>{t('admin.academic.rulesLockedBanner')}</span>
                </Card>
              )}

              {rulesQuery.isSuccess && rulesQuery.data === null && (
                <FieldMessage tone="hint">
                  {t('admin.academic.rulesNotConfiguredHint')}
                </FieldMessage>
              )}

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="rules-trim-count">{t('admin.academic.trimestersCountLabel')}</Label>
                  <Input
                    id="rules-trim-count"
                    type="number"
                    min={1}
                    max={4}
                    className="tabular-nums"
                    disabled={lockedRulesReadOnly}
                    value={rulesDraft.trimestersCount}
                    onChange={(e) => {
                      const nextCount = Math.max(1, Math.min(4, Number(e.target.value) || 1));
                      setRulesDraft((prev) => ({
                        ...prev,
                        trimestersCount: nextCount,
                        trimesterWeights: resizeWeights(prev.trimesterWeights, nextCount),
                      }));
                    }}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="rules-seq-count">
                    {t('admin.academic.sequencesPerTrimesterLabel')}
                  </Label>
                  <Input
                    id="rules-seq-count"
                    type="number"
                    min={1}
                    max={4}
                    className="tabular-nums"
                    disabled={lockedRulesReadOnly}
                    value={rulesDraft.sequencesPerTrimester}
                    onChange={(e) => {
                      const nextCount = Math.max(1, Math.min(4, Number(e.target.value) || 1));
                      setRulesDraft((prev) => ({
                        ...prev,
                        sequencesPerTrimester: nextCount,
                        sequenceWeights: resizeWeights(prev.sequenceWeights, nextCount),
                      }));
                    }}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="rules-passing">{t('admin.academic.passingThresholdLabel')}</Label>
                  <Input
                    id="rules-passing"
                    type="number"
                    step="0.25"
                    min={0}
                    max={20}
                    className="tabular-nums"
                    disabled={lockedRulesReadOnly}
                    value={rulesDraft.passingThreshold}
                    onChange={(e) =>
                      setRulesDraft((prev) => ({
                        ...prev,
                        passingThreshold: Number(e.target.value),
                      }))
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="rules-honor">{t('admin.academic.honorRollThresholdLabel')}</Label>
                  <Input
                    id="rules-honor"
                    type="number"
                    step="0.25"
                    min={0}
                    max={20}
                    className="tabular-nums"
                    disabled={lockedRulesReadOnly}
                    value={rulesDraft.honorRollThreshold}
                    onChange={(e) =>
                      setRulesDraft((prev) => ({
                        ...prev,
                        honorRollThreshold: Number(e.target.value),
                      }))
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="rules-enc">
                    {t('admin.academic.encouragementThresholdLabel')}
                  </Label>
                  <Input
                    id="rules-enc"
                    type="number"
                    step="0.25"
                    min={0}
                    max={20}
                    className="tabular-nums"
                    disabled={lockedRulesReadOnly}
                    value={rulesDraft.encouragementThreshold}
                    onChange={(e) =>
                      setRulesDraft((prev) => ({
                        ...prev,
                        encouragementThreshold: Number(e.target.value),
                      }))
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="rules-cong">
                    {t('admin.academic.congratulationThresholdLabel')}
                  </Label>
                  <Input
                    id="rules-cong"
                    type="number"
                    step="0.25"
                    min={0}
                    max={20}
                    className="tabular-nums"
                    disabled={lockedRulesReadOnly}
                    value={rulesDraft.congratulationThreshold}
                    onChange={(e) =>
                      setRulesDraft((prev) => ({
                        ...prev,
                        congratulationThreshold: Number(e.target.value),
                      }))
                    }
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 rounded-lg border border-border p-4">
                  <Label>{t('admin.academic.sequenceWeightsLabel')}</Label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {rulesDraft.sequenceWeights.map((weight, idx) => (
                      <Input
                        key={idx}
                        type="number"
                        step="0.5"
                        min={0.1}
                        max={100}
                        aria-label={`Poids séquence ${idx + 1}`}
                        className="tabular-nums"
                        disabled={lockedRulesReadOnly}
                        value={weight}
                        onChange={(e) => {
                          const next = [...rulesDraft.sequenceWeights];
                          next[idx] = Number(e.target.value);
                          setRulesDraft((prev) => ({ ...prev, sequenceWeights: next }));
                        }}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-2 rounded-lg border border-border p-4">
                  <Label>{t('admin.academic.trimesterWeightsLabel')}</Label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {rulesDraft.trimesterWeights.map((weight, idx) => (
                      <Input
                        key={idx}
                        type="number"
                        step="0.5"
                        min={0.1}
                        max={100}
                        aria-label={`Poids trimestre ${idx + 1}`}
                        className="tabular-nums"
                        disabled={lockedRulesReadOnly}
                        value={weight}
                        onChange={(e) => {
                          const next = [...rulesDraft.trimesterWeights];
                          next[idx] = Number(e.target.value);
                          setRulesDraft((prev) => ({ ...prev, trimesterWeights: next }));
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <Switch
                id="rules-absent-zero"
                checked={rulesDraft.treatAbsentAsZero}
                onCheckedChange={(checked) =>
                  setRulesDraft((prev) => ({ ...prev, treatAbsentAsZero: checked }))
                }
                disabled={lockedRulesReadOnly}
                label={t('admin.academic.treatAbsentAsZeroLabel')}
                description={t('admin.academic.treatAbsentAsZeroDesc')}
              />

              {/* Grille d'appréciations */}
              <div className="space-y-3 rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Label>{t('admin.academic.appreciationScaleLabel')}</Label>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t('admin.academic.appreciationScaleHint')}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    icon={<RiAddCircleFill />}
                    disabled={lockedRulesReadOnly}
                    onClick={() => {
                      setRulesError(null);
                      setRulesDraft((prev) => ({
                        ...prev,
                        appreciationScale: [
                          ...prev.appreciationScale,
                          suggestNextAppreciationBand(prev.appreciationScale),
                        ],
                      }));
                    }}
                  >
                    {t('admin.academic.addBandBtn')}
                  </Button>
                </div>

                <div className="space-y-2">
                  {rulesDraft.appreciationScale.map((band, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-[5.5rem_5.5rem_1fr_auto] items-center gap-2"
                    >
                      <Input
                        size="sm"
                        type="number"
                        step="0.01"
                        min={0}
                        max={20}
                        aria-label={`${t('admin.academic.bandMinLabel')} #${index + 1}`}
                        className="tabular-nums"
                        disabled={lockedRulesReadOnly}
                        value={band.min}
                        onChange={(e) => {
                          setRulesError(null);
                          const next = [...rulesDraft.appreciationScale];
                          next[index] = { ...band, min: Number(e.target.value) };
                          setRulesDraft((prev) => ({ ...prev, appreciationScale: next }));
                        }}
                      />
                      <Input
                        size="sm"
                        type="number"
                        step="0.01"
                        min={0}
                        max={20}
                        aria-label={`${t('admin.academic.bandMaxLabel')} #${index + 1}`}
                        className="tabular-nums"
                        disabled={lockedRulesReadOnly}
                        value={band.max}
                        onChange={(e) => {
                          setRulesError(null);
                          const next = [...rulesDraft.appreciationScale];
                          next[index] = { ...band, max: Number(e.target.value) };
                          setRulesDraft((prev) => ({ ...prev, appreciationScale: next }));
                        }}
                      />
                      <Input
                        size="sm"
                        aria-label={`${t('admin.academic.bandLabelLabel')} #${index + 1}`}
                        disabled={lockedRulesReadOnly}
                        value={band.label}
                        onChange={(e) => {
                          setRulesError(null);
                          const next = [...rulesDraft.appreciationScale];
                          next[index] = { ...band, label: e.target.value };
                          setRulesDraft((prev) => ({ ...prev, appreciationScale: next }));
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={lockedRulesReadOnly || rulesDraft.appreciationScale.length <= 1}
                        aria-label={`Supprimer tranche ${index + 1}`}
                        onClick={() => {
                          setRulesError(null);
                          setRulesDraft((prev) => ({
                            ...prev,
                            appreciationScale: prev.appreciationScale.filter((_, i) => i !== index),
                          }));
                        }}
                      >
                        <RiDeleteBin6Fill className="size-4 text-brick-400" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {(rulesError || liveRulesIssue) && (
                <FieldMessage tone="error">{rulesError ?? liveRulesIssue}</FieldMessage>
              )}

              <div className="flex justify-end">
                <Button
                  type="button"
                  icon={<RiSaveFill />}
                  loading={saveRulesMutation.isPending}
                  disabled={lockedRulesReadOnly}
                  onClick={() => saveRulesMutation.mutate()}
                >
                  {saveRulesMutation.isPending ? t('admin.common.saving') : t('admin.common.save')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Modale création année scolaire */}
      <Dialog open={newYearOpen} onOpenChange={setNewYearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.academic.newYearModalTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-year-label">{t('admin.academic.yearLabel')}</Label>
              <Input
                id="new-year-label"
                placeholder={t('admin.academic.yearPlaceholder')}
                value={newYearLabel}
                onChange={(e) => setNewYearLabel(e.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="new-year-start">{t('admin.academic.startDateLabel')}</Label>
                <Input
                  id="new-year-start"
                  type="date"
                  value={newYearStart}
                  onChange={(e) => setNewYearStart(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-year-end">{t('admin.academic.endDateLabel')}</Label>
                <Input
                  id="new-year-end"
                  type="date"
                  value={newYearEnd}
                  onChange={(e) => setNewYearEnd(e.target.value)}
                />
              </div>
            </div>
            <Switch
              id="new-year-active"
              checked={newYearActive}
              onCheckedChange={setNewYearActive}
              label={t('admin.academic.setActiveLabel')}
            />
            <Switch
              id="new-year-defaults"
              checked={newYearDefaults}
              onCheckedChange={setNewYearDefaults}
              label={t('admin.academic.cameroonDefaultsLabel')}
            />
            {newYearError && <FieldMessage tone="error">{newYearError}</FieldMessage>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setNewYearOpen(false)}>
              {t('admin.common.cancel')}
            </Button>
            <Button
              type="button"
              loading={createYearMutation.isPending}
              disabled={!isOnline}
              onClick={() => createYearMutation.mutate()}
            >
              {createYearMutation.isPending ? t('admin.common.creating') : t('admin.common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modale confirmation activation année */}
      <Dialog
        open={Boolean(confirmActivateYear)}
        onOpenChange={(open) => !open && setConfirmActivateYear(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('admin.academic.confirmActivateTitle', {
                label: confirmActivateYear?.label ?? '',
              })}
            </DialogTitle>
            <DialogDescription>{t('admin.academic.confirmActivateBody')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setConfirmActivateYear(null)}>
              {t('admin.common.cancel')}
            </Button>
            <Button
              type="button"
              loading={activateYearMutation.isPending}
              onClick={() =>
                confirmActivateYear && activateYearMutation.mutate(confirmActivateYear.id)
              }
            >
              {t('admin.academic.confirmActivateAction')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modale création/édition période */}
      <Dialog
        open={periodModalMode !== null}
        onOpenChange={(open) => !open && setPeriodModalMode(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {periodModalMode === 'edit'
                ? t('admin.academic.editPeriodModalTitle', { code: editingPeriod?.code ?? '' })
                : t('admin.academic.newPeriodModalTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {periodModalMode === 'create' && (
              <>
                <Dropdown
                  label={t('admin.academic.periodTypeLabel')}
                  value={periodType}
                  onChange={(v) => setPeriodType(v as PeriodType)}
                  options={[
                    {
                      value: 'sequence',
                      label: t('admin.academic.periodSequence'),
                      icon: <RiCalendar2Fill />,
                    },
                    {
                      value: 'trimester',
                      label: t('admin.academic.periodTrimester'),
                      icon: <RiCalendarCheckFill />,
                    },
                  ]}
                />

                {periodType === 'sequence' && trimesters.length > 0 && (
                  <Dropdown
                    label={t('admin.academic.periodParentLabel')}
                    value={periodParentId}
                    onChange={setPeriodParentId}
                    options={trimesters.map((tr) => ({
                      value: tr.id,
                      label: `${tr.code} · ${tr.name}`,
                      icon: <RiCalendarCheckFill />,
                    }))}
                  />
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="period-code">{t('admin.academic.periodCodeLabel')}</Label>
                    <Input
                      id="period-code"
                      placeholder={t('admin.academic.periodCodePlaceholder')}
                      value={periodCode}
                      onChange={(e) => setPeriodCode(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="period-order">{t('admin.academic.periodOrderLabel')}</Label>
                    <Input
                      id="period-order"
                      type="number"
                      min={1}
                      max={20}
                      className="tabular-nums"
                      value={periodOrder}
                      onChange={(e) => setPeriodOrder(e.target.value)}
                    />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="period-name">{t('admin.academic.periodNameLabel')}</Label>
              <Input
                id="period-name"
                placeholder={t('admin.academic.periodNamePlaceholder')}
                value={periodName}
                onChange={(e) => setPeriodName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="period-weight">{t('admin.academic.periodWeightLabel')}</Label>
              <Input
                id="period-weight"
                type="number"
                step="0.25"
                min={0.01}
                max={100}
                className="tabular-nums"
                value={periodWeight}
                onChange={(e) => setPeriodWeight(e.target.value)}
              />
            </div>

            {periodError && <FieldMessage tone="error">{periodError}</FieldMessage>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setPeriodModalMode(null)}>
              {t('admin.common.cancel')}
            </Button>
            <Button
              type="button"
              loading={savePeriodMutation.isPending}
              disabled={!isOnline}
              onClick={() => savePeriodMutation.mutate()}
            >
              {savePeriodMutation.isPending ? t('admin.common.saving') : t('admin.common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
