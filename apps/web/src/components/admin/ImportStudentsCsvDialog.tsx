import { ImportStudentsCsvSchema } from '@lycee/shared';
import {
  RiCheckDoubleFill,
  RiDownload2Fill,
  RiEdit2Fill,
  RiErrorWarningFill,
  RiFileTextFill,
  RiFilter3Fill,
  RiSchoolFill,
  RiUploadCloud2Fill,
} from '@remixicon/react';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Dropdown } from '@/components/ui/dropdown';
import { FieldMessage, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  CsvImportErrorDetailsSchema,
  generateStudentsCsvTemplate,
  importStudentsCsv,
  readCsvFileContent,
  type ClassDto,
  type ImportStudentsCsvResult,
} from '@/lib/api/admin';
import { isApiError } from '@/lib/api/errors';
import { triggerBrowserDownload } from '@/lib/api/reports';
import { t } from '@/lib/i18n';
import { getAdminErrorMessage } from './admin-utils';

type ImportScope = 'class' | 'year_column' | 'registry_only';
type CsvDelimiter = 'auto' | ';' | ',';

export function ImportStudentsCsvDialog({
  open,
  onOpenChange,
  classes,
  selectedYearId,
  defaultClassId,
  isOnline,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classes: ClassDto[];
  selectedYearId?: string;
  defaultClassId?: string;
  isOnline: boolean;
  onImported: () => Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [csvContent, setCsvContent] = useState('');
  const [scope, setScope] = useState<ImportScope>('class');
  const [targetClassId, setTargetClassId] = useState('');
  const [delimiter, setDelimiter] = useState<CsvDelimiter>('auto');
  const [reuseExistingStudents, setReuseExistingStudents] = useState(true);
  const [dryRunResult, setDryRunResult] = useState<ImportStudentsCsvResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDryRunResult(null);
    if (classes.length > 0) {
      const initialClass =
        (defaultClassId && classes.some((c) => c.id === defaultClassId)
          ? defaultClassId
          : classes[0]?.id) ?? '';
      setTargetClassId(initialClass);
      setScope('class');
    } else if (selectedYearId) {
      setTargetClassId('');
      setScope('year_column');
    } else {
      setTargetClassId('');
      setScope('registry_only');
    }
  }, [open, classes, defaultClassId, selectedYearId]);

  const buildPayload = (dryRun: boolean) => {
    const classId = scope === 'class' && targetClassId ? targetClassId : undefined;
    const academicYearId =
      scope === 'registry_only' ? undefined : selectedYearId || undefined;

    const parsed = ImportStudentsCsvSchema.safeParse({
      csvContent,
      classId,
      academicYearId,
      delimiter,
      dryRun,
      reuseExistingStudents,
    });
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? 'Paramètres d’import CSV invalides.');
    }
    return parsed.data;
  };

  const dryRunMutation = useMutation({
    mutationFn: () => importStudentsCsv(buildPayload(true)),
    onSuccess: (res) => {
      setDryRunResult(res);
      setError(null);
    },
    onError: (err) => {
      const msg = getAdminErrorMessage(err);
      setError(msg);
      toast.error(msg);
    },
  });

  const commitMutation = useMutation({
    mutationFn: () => importStudentsCsv(buildPayload(false)),
    onSuccess: async (res) => {
      await onImported();
      toast.success(
        t('admin.students.csv.importSuccess', {
          created: res.summary.studentsToCreate,
          reused: res.summary.studentsReused,
          enrolled: res.summary.enrollmentsToCreate,
        }),
      );
      setCsvContent('');
      setFileName(null);
      setDryRunResult(null);
      setError(null);
      onOpenChange(false);
    },
    onError: (err) => {
      if (isApiError(err) && err.status === 422 && err.details) {
        const parsedDetails = CsvImportErrorDetailsSchema.safeParse(err.details);
        if (parsedDetails.success) {
          setDryRunResult({
            dryRun: true,
            committed: false,
            summary: parsedDetails.data.summary,
            errors: parsedDetails.data.errors,
            preview: [],
            createdStudents: [],
            createdEnrollments: [],
          });
        }
      }
      const msg = getAdminErrorMessage(err);
      setError(msg);
      toast.error(msg);
    },
  });

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setError(null);
    setDryRunResult(null);
    try {
      const text = await readCsvFileContent(file);
      setCsvContent(text);
      setFileName(file.name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('admin.students.csv.fileInvalidType');
      setError(msg);
    }
  };

  const handleDownloadTemplate = () => {
    const className =
      classes.find((c) => c.id === targetClassId)?.name ?? classes[0]?.name ?? '3ème A';
    const content = generateStudentsCsvTemplate(className);
    const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' });
    triggerBrowserDownload(blob, 'modele-import-eleves.csv');
  };

  const resetAnalysis = () => {
    setDryRunResult(null);
    setError(null);
  };

  const canAnalyze =
    isOnline &&
    csvContent.trim().length > 0 &&
    (scope !== 'class' || Boolean(targetClassId)) &&
    !dryRunMutation.isPending &&
    !commitMutation.isPending;

  const canCommit =
    isOnline &&
    dryRunResult !== null &&
    dryRunResult.errors.length === 0 &&
    dryRunResult.summary.validRows > 0 &&
    !commitMutation.isPending;

  const scopeOptions = [
    ...(classes.length > 0
      ? [
          {
            value: 'class',
            label: t('admin.students.csv.scopeClassOption'),
            icon: <RiSchoolFill />,
          },
        ]
      : []),
    ...(selectedYearId
      ? [
          {
            value: 'year_column',
            label: t('admin.students.csv.scopeYearColumnOption'),
            icon: <RiFileTextFill />,
          },
        ]
      : []),
    {
      value: 'registry_only',
      label: t('admin.students.csv.scopeRegistryOnlyOption'),
      icon: <RiFileTextFill />,
    },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!commitMutation.isPending && !dryRunMutation.isPending) {
          onOpenChange(next);
        }
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <div className="mb-1 flex items-center gap-2.5 text-slate-600">
            <span className="grid size-9 place-items-center rounded-sm bg-violet-50 text-violet-400">
              <RiUploadCloud2Fill className="size-5" />
            </span>
            <DialogTitle>{t('admin.students.csv.modalTitle')}</DialogTitle>
          </div>
          <DialogDescription>{t('admin.students.csv.modalDesc')}</DialogDescription>
        </DialogHeader>

        {!dryRunResult ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  data-testid="students-csv-file-input"
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  className="hidden"
                  onChange={(e) => void handleFileChange(e)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  icon={<RiUploadCloud2Fill />}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {t('admin.students.csv.fileLabel')}
                </Button>
                {fileName && (
                  <Badge variant="info" icon={<RiFileTextFill />}>
                    {fileName}
                  </Badge>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                icon={<RiDownload2Fill />}
                onClick={handleDownloadTemplate}
              >
                {t('admin.students.csv.downloadTemplateBtn')}
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="students-csv-content">
                {t('admin.students.csv.contentLabel')}
              </Label>
              <Textarea
                id="students-csv-content"
                rows={6}
                className="font-mono text-xs"
                placeholder={t('admin.students.csv.contentPlaceholder')}
                value={csvContent}
                onChange={(e) => {
                  setCsvContent(e.target.value);
                  setError(null);
                }}
              />
              <FieldMessage tone="hint">{t('admin.students.csv.fileHint')}</FieldMessage>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Dropdown
                label={t('admin.students.csv.scopeLabel')}
                value={scope}
                onChange={(val) => {
                  setScope(val as ImportScope);
                  setError(null);
                }}
                options={scopeOptions}
              />

              {scope === 'class' && classes.length > 0 ? (
                <Dropdown
                  label={t('admin.students.csv.targetClassLabel')}
                  value={targetClassId}
                  onChange={(val) => {
                    setTargetClassId(val);
                    setError(null);
                  }}
                  options={classes.map((c) => ({
                    value: c.id,
                    label: c.name,
                    description: `${c.level}${c.series ? ` · Série ${c.series}` : ''}`,
                    icon: <RiSchoolFill />,
                  }))}
                />
              ) : (
                <Dropdown
                  label={t('admin.students.csv.delimiterLabel')}
                  value={delimiter}
                  onChange={(val) => {
                    setDelimiter(val as CsvDelimiter);
                    setError(null);
                  }}
                  options={[
                    {
                      value: 'auto',
                      label: t('admin.students.csv.delimiterAuto'),
                      icon: <RiFilter3Fill />,
                    },
                    {
                      value: ';',
                      label: t('admin.students.csv.delimiterSemicolon'),
                      icon: <RiFilter3Fill />,
                    },
                    {
                      value: ',',
                      label: t('admin.students.csv.delimiterComma'),
                      icon: <RiFilter3Fill />,
                    },
                  ]}
                />
              )}
            </div>

            {scope === 'class' && classes.length > 0 && (
              <div className="md:w-1/2 md:pr-1.5">
                <Dropdown
                  label={t('admin.students.csv.delimiterLabel')}
                  value={delimiter}
                  onChange={(val) => {
                    setDelimiter(val as CsvDelimiter);
                    setError(null);
                  }}
                  options={[
                    {
                      value: 'auto',
                      label: t('admin.students.csv.delimiterAuto'),
                      icon: <RiFilter3Fill />,
                    },
                    {
                      value: ';',
                      label: t('admin.students.csv.delimiterSemicolon'),
                      icon: <RiFilter3Fill />,
                    },
                    {
                      value: ',',
                      label: t('admin.students.csv.delimiterComma'),
                      icon: <RiFilter3Fill />,
                    },
                  ]}
                />
              </div>
            )}

            <Switch
              id="csv-reuse-existing"
              checked={reuseExistingStudents}
              onCheckedChange={setReuseExistingStudents}
              label={t('admin.students.csv.reuseExistingLabel')}
              description={t('admin.students.csv.reuseExistingDesc')}
            />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Résumé analyse */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
              <Card className="p-3">
                <p className="text-[11px] font-bold text-muted-foreground uppercase">
                  {t('admin.students.csv.summaryTotal')}
                </p>
                <p className="mt-1 text-xl font-extrabold tabular-nums">
                  {dryRunResult.summary.totalRows}
                </p>
              </Card>
              <Card className="p-3">
                <p className="text-[11px] font-bold text-muted-foreground uppercase">
                  {t('admin.students.csv.summaryValid')}
                </p>
                <p className="mt-1 text-xl font-extrabold text-primary tabular-nums">
                  {dryRunResult.summary.validRows}
                </p>
              </Card>
              <Card className="p-3">
                <p className="text-[11px] font-bold text-muted-foreground uppercase">
                  {t('admin.students.csv.summaryErrors')}
                </p>
                <p
                  className={`mt-1 text-xl font-extrabold tabular-nums ${
                    dryRunResult.summary.errorCount > 0 ? 'text-brick-400' : 'text-foreground'
                  }`}
                >
                  {dryRunResult.summary.errorCount}
                </p>
              </Card>
              <Card className="p-3">
                <p className="text-[11px] font-bold text-muted-foreground uppercase">
                  {t('admin.students.csv.summaryCreate')}
                </p>
                <p className="mt-1 text-xl font-extrabold tabular-nums">
                  {dryRunResult.summary.studentsToCreate}
                </p>
              </Card>
              <Card className="p-3">
                <p className="text-[11px] font-bold text-muted-foreground uppercase">
                  {t('admin.students.csv.summaryReuse')}
                </p>
                <p className="mt-1 text-xl font-extrabold tabular-nums">
                  {dryRunResult.summary.studentsReused}
                </p>
              </Card>
              <Card className="p-3">
                <p className="text-[11px] font-bold text-muted-foreground uppercase">
                  {t('admin.students.csv.summaryEnrollments')}
                </p>
                <p className="mt-1 text-xl font-extrabold tabular-nums">
                  {dryRunResult.summary.enrollmentsToCreate}
                </p>
              </Card>
            </div>

            {dryRunResult.errors.length > 0 && (
              <div className="space-y-2.5">
                <Card
                  variant="outline"
                  className="border-brick-100 bg-brick-50 p-3.5 text-xs text-brick-500"
                >
                  <div className="flex items-start gap-2 font-bold">
                    <RiErrorWarningFill className="mt-0.5 size-4 shrink-0" />
                    <div>
                      <p>
                        {t('admin.students.csv.errorsTitle', {
                          count: dryRunResult.errors.length,
                        })}
                      </p>
                      <p className="mt-0.5 font-medium opacity-90">
                        {t('admin.students.csv.errorsHint')}
                      </p>
                    </div>
                  </div>
                </Card>

                <div className="max-h-60 overflow-auto rounded-lg border border-border">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="border-b border-border bg-muted/60 font-extrabold text-muted-foreground uppercase">
                      <tr>
                        <th className="px-3 py-2">{t('admin.students.csv.colLine')}</th>
                        <th className="px-3 py-2">{t('admin.students.matriculeLabel')}</th>
                        <th className="px-3 py-2">{t('admin.students.csv.colField')}</th>
                        <th className="px-3 py-2">{t('admin.students.csv.colError')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-card">
                      {dryRunResult.errors.map((errItem, idx) => (
                        <tr key={`${errItem.line}-${idx}`}>
                          <td className="px-3 py-2 font-bold tabular-nums">{errItem.line}</td>
                          <td className="px-3 py-2 font-semibold tabular-nums">
                            {errItem.matricule ?? '—'}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {errItem.field ?? '—'}
                          </td>
                          <td className="px-3 py-2 font-medium text-brick-500">
                            {errItem.message}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {dryRunResult.preview.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-extrabold text-foreground uppercase tracking-wide">
                  {t('admin.students.csv.previewTitle', {
                    count: dryRunResult.preview.length,
                  })}
                </p>
                <div className="max-h-64 overflow-auto rounded-lg border border-border">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="border-b border-border bg-muted/60 font-extrabold text-muted-foreground uppercase">
                      <tr>
                        <th className="px-3 py-2">{t('admin.students.csv.colLine')}</th>
                        <th className="px-3 py-2">{t('admin.students.matriculeLabel')}</th>
                        <th className="px-3 py-2">Élève</th>
                        <th className="px-3 py-2">{t('admin.students.birthDateLabel')}</th>
                        <th className="px-3 py-2">{t('admin.students.sexLabel')}</th>
                        <th className="px-3 py-2">{t('admin.students.selectClassLabel')}</th>
                        <th className="px-3 py-2">{t('admin.students.csv.colAction')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-card">
                      {dryRunResult.preview.map((row) => (
                        <tr key={`${row.line}-${row.matricule}`}>
                          <td className="px-3 py-2 text-muted-foreground tabular-nums">
                            {row.line}
                          </td>
                          <td className="px-3 py-2 font-bold text-primary tabular-nums">
                            {row.matricule}
                          </td>
                          <td className="px-3 py-2 font-bold">
                            {row.lastName} {row.firstName}
                            {row.isRepeater && (
                              <Badge variant="accent" className="ml-1.5">
                                {t('grades.repeaterTag')}
                              </Badge>
                            )}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground tabular-nums">
                            {row.birthDate}
                          </td>
                          <td className="px-3 py-2 font-semibold">{row.sex}</td>
                          <td className="px-3 py-2">
                            {row.className ?? (
                              <span className="text-muted-foreground">
                                {t('admin.students.csv.noTargetClass')}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <Badge
                              variant={row.action === 'create_student' ? 'success' : 'info'}
                            >
                              {row.action === 'create_student'
                                ? t('admin.students.csv.actionCreate')
                                : t('admin.students.csv.actionReuse')}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {error && <FieldMessage tone="error">{error}</FieldMessage>}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={dryRunMutation.isPending || commitMutation.isPending}
            onClick={() => onOpenChange(false)}
          >
            {t('admin.common.cancel')}
          </Button>

          {dryRunResult ? (
            <>
              <Button
                type="button"
                variant="outline"
                icon={<RiEdit2Fill />}
                disabled={commitMutation.isPending}
                onClick={resetAnalysis}
              >
                {t('admin.students.csv.resetPreviewBtn')}
              </Button>
              <Button
                type="button"
                icon={<RiCheckDoubleFill />}
                loading={commitMutation.isPending}
                disabled={!canCommit}
                onClick={() => commitMutation.mutate()}
              >
                {commitMutation.isPending
                  ? t('admin.students.csv.committingBtn')
                  : t('admin.students.csv.commitBtn', {
                      count: dryRunResult.summary.validRows,
                    })}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              icon={<RiUploadCloud2Fill />}
              loading={dryRunMutation.isPending}
              disabled={!canAnalyze}
              onClick={() => dryRunMutation.mutate()}
            >
              {dryRunMutation.isPending
                ? t('admin.students.csv.analyzingBtn')
                : t('admin.students.csv.analyzeBtn')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
