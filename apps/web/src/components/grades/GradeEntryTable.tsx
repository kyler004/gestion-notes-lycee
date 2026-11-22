import type { GradeStatus } from '@lycee/shared';
import {
  RiCheckboxCircleFill,
  RiEdit2Fill,
  RiErrorWarningFill,
  RiLockFill,
  RiUploadCloud2Fill,
} from '@remixicon/react';
import {
  columnSizingFeature,
  createColumnHelper,
  tableFeatures,
  useTable,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { toast } from 'sonner';
import { StatusSegment } from '@/components/grades/StatusSegment';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { formatEditableScore, parseGradeScoreInput } from '@/lib/grades/format';
import type { GradeGridRow } from '@/lib/grades/workspace';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const VIRTUALIZE_THRESHOLD = 40;

function useIsDesktopViewport(): boolean {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
    return window.matchMedia('(min-width: 768px)')?.matches ?? true;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(min-width: 768px)');
    if (!mql) return;
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    setIsDesktop(mql.matches);
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, []);

  return isDesktop;
}

interface GridCallbacksContextValue {
  onCommitScore: (row: GradeGridRow, score: number | null) => Promise<boolean> | boolean;
  onCommitStatus: (row: GradeGridRow, status: GradeStatus) => Promise<boolean> | boolean;
  onEditAppreciation: (row: GradeGridRow) => void;
  onOpenOutbox: () => void;
  registerInputRef: (enrollmentId: string, el: HTMLInputElement | null) => void;
  focusInput: (enrollmentId: string) => void;
  moveFocus: (currentEnrollmentId: string, delta: number) => void;
}

const GridCallbacksContext = createContext<GridCallbacksContextValue | null>(null);

function useGridCallbacks(): GridCallbacksContextValue {
  const ctx = useContext(GridCallbacksContext);
  if (!ctx) {
    throw new Error('GridCallbacksContext indisponible.');
  }
  return ctx;
}

function ScoreCell({ row }: { row: GradeGridRow }) {
  const { onCommitScore, onCommitStatus, registerInputRef, moveFocus } = useGridCallbacks();
  const isPresentOrEmpty = row.effectiveStatus === null || row.effectiveStatus === 'present';
  const [draft, setDraft] = useState(() =>
    isPresentOrEmpty ? formatEditableScore(row.effectiveScore) : '',
  );
  const [focused, setFocused] = useState(false);
  const [invalidMsg, setInvalidMsg] = useState<string | null>(null);
  const skipNextBlurRef = useRef(false);

  useEffect(() => {
    if (!focused) {
      setDraft(isPresentOrEmpty ? formatEditableScore(row.effectiveScore) : '');
      setInvalidMsg(null);
    }
  }, [focused, isPresentOrEmpty, row.effectiveScore, row.effectiveStatus]);

  const commitDraft = async (): Promise<boolean> => {
    if (!row.isEditable) return true;
    const parsed = parseGradeScoreInput(draft);
    if (parsed.kind === 'invalid') {
      setInvalidMsg(parsed.message);
      toast.error(parsed.message);
      return false;
    }

    setInvalidMsg(null);
    if (parsed.kind === 'empty') {
      return await onCommitScore(row, null);
    }

    return await onCommitScore(row, parsed.score);
  };

  const handleKeyDown = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      skipNextBlurRef.current = true;
      setDraft(isPresentOrEmpty ? formatEditableScore(row.effectiveScore) : '');
      setInvalidMsg(null);
      return;
    }

    if ((e.key === 'a' || e.key === 'A') && row.isEditable) {
      e.preventDefault();
      skipNextBlurRef.current = true;
      setInvalidMsg(null);
      const committed = await onCommitStatus(row, 'absent');
      if (committed) {
        moveFocus(row.enrollment.id, 1);
      }
      return;
    }

    if ((e.key === 'e' || e.key === 'E') && row.isEditable) {
      e.preventDefault();
      skipNextBlurRef.current = true;
      setInvalidMsg(null);
      const committed = await onCommitStatus(row, 'excused');
      if (committed) {
        moveFocus(row.enrollment.id, 1);
      }
      return;
    }

    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      skipNextBlurRef.current = true;
      const ok = await commitDraft();
      if (ok) {
        moveFocus(row.enrollment.id, 1);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      skipNextBlurRef.current = true;
      const ok = await commitDraft();
      if (ok) {
        moveFocus(row.enrollment.id, -1);
      }
    }
  };

  if (!isPresentOrEmpty) {
    return (
      <div className="flex h-10 w-28 items-center justify-center rounded-md border border-border bg-muted/60 text-xs font-bold text-muted-foreground tabular-nums">
        {row.effectiveStatus === 'absent' ? t('grades.statusAbsent') : t('grades.statusExcused')}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex h-10 w-28 items-center rounded-md border bg-card px-2.5 transition-all focus-within:ring-3',
        invalidMsg || row.syncState === 'failed'
          ? 'border-brick-300 focus-within:border-brick-400 focus-within:ring-brick-300/15'
          : row.syncState === 'pending'
            ? 'border-amber-300 focus-within:border-primary focus-within:ring-ring/15'
            : 'border-input hover:border-slate-300 focus-within:border-primary focus-within:ring-ring/15',
        !row.isEditable && 'bg-muted/65 opacity-70',
      )}
    >
      <input
        ref={(el) => registerInputRef(row.enrollment.id, el)}
        type="text"
        inputMode="decimal"
        aria-label={`Note pour ${row.fullName}`}
        aria-invalid={Boolean(invalidMsg) || undefined}
        disabled={!row.isEditable}
        value={draft}
        placeholder="—"
        onFocus={(e) => {
          skipNextBlurRef.current = false;
          setFocused(true);
          e.currentTarget.select();
        }}
        onChange={(e) => {
          skipNextBlurRef.current = false;
          const val = e.target.value;
          setDraft(val);
          const parsed = parseGradeScoreInput(val);
          setInvalidMsg(parsed.kind === 'invalid' ? parsed.message : null);
        }}
        onKeyDown={(e) => void handleKeyDown(e)}
        onBlur={() => {
          setFocused(false);
          if (skipNextBlurRef.current) {
            skipNextBlurRef.current = false;
            return;
          }
          const parsed = parseGradeScoreInput(draft);
          if (parsed.kind === 'invalid') {
            setDraft(formatEditableScore(row.effectiveScore));
            setInvalidMsg(null);
            return;
          }
          void commitDraft();
        }}
        className="min-w-0 flex-1 bg-transparent text-center text-sm font-bold text-foreground tabular-nums placeholder:text-muted-foreground/70 focus:outline-none disabled:cursor-not-allowed"
      />
      <span className="shrink-0 pl-1 text-[11px] font-semibold text-muted-foreground tabular-nums">
        /20
      </span>
    </div>
  );
}

function SyncCell({ row }: { row: GradeGridRow }) {
  const { onOpenOutbox } = useGridCallbacks();

  switch (row.syncState) {
    case 'failed':
      return (
        <button
          type="button"
          onClick={onOpenOutbox}
          className="cursor-pointer rounded-sm transition-opacity hover:opacity-85"
          title={row.syncErrorMessage}
        >
          <Badge variant="destructive" icon={<RiErrorWarningFill />}>
            {t('sync.statusFailed')}
          </Badge>
        </button>
      );
    case 'pending':
      return (
        <Badge variant="warning" icon={<RiUploadCloud2Fill />}>
          {t('sync.statusPending')}
        </Badge>
      );
    case 'syncing':
      return (
        <Badge variant="info" icon={<Spinner className="[&_svg]:size-3" />}>
          {t('sync.statusSyncing')}
        </Badge>
      );
    case 'synced':
      return (
        <Badge variant="success" icon={<RiCheckboxCircleFill />}>
          {t('sync.synced')}
        </Badge>
      );
    default:
      return <span className="text-xs font-medium text-muted-foreground">—</span>;
  }
}

function formatRank(rank: number | null): string {
  if (rank === null) return '—';
  return rank === 1 ? '1er' : `${rank}e`;
}

const gradeTableFeatures = tableFeatures({ columnSizingFeature });
const colHelper = createColumnHelper<typeof gradeTableFeatures, GradeGridRow>();

const gradeColumns = colHelper.columns([
  colHelper.accessor('rowIndex', {
    id: 'index',
    size: 56,
    header: () => <span>{t('grades.colIndex')}</span>,
    cell: ({ row }) => (
      <span className="text-xs font-bold text-muted-foreground tabular-nums">
        {row.original.rowIndex}
      </span>
    ),
  }),
  colHelper.accessor('fullName', {
    id: 'student',
    size: 240,
    header: () => <span>{t('grades.colStudent')}</span>,
    cell: ({ row }) => {
      const r = row.original;
      return (
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-bold text-foreground">{r.fullName}</span>
            {r.enrollment.isRepeater && (
              <Badge variant="neutral" className="px-1.5 py-0.5 text-[10px]">
                {t('grades.repeaterTag')}
              </Badge>
            )}
            {r.enrollment.status !== 'active' && (
              <Badge variant="warning" className="px-1.5 py-0.5 text-[10px]">
                {t('grades.inactiveTag')}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs font-medium text-muted-foreground tabular-nums">
            {r.student.matricule}
          </p>
        </div>
      );
    },
  }),
  colHelper.display({
    id: 'status',
    size: 205,
    header: () => <span>{t('grades.colStatus')}</span>,
    cell: ({ row }) => {
      const r = row.original;
      const { onCommitStatus, focusInput } = useGridCallbacks();
      return (
        <StatusSegment
          value={r.effectiveStatus}
          disabled={!r.isEditable}
          studentName={r.fullName}
          onChange={(next) => {
            void onCommitStatus(r, next);
            if (next === 'present') {
              window.requestAnimationFrame(() => focusInput(r.enrollment.id));
            }
          }}
        />
      );
    },
  }),
  colHelper.display({
    id: 'score',
    size: 136,
    header: () => <span>{t('grades.colScore')}</span>,
    cell: ({ row }) => <ScoreCell row={row.original} />,
  }),
  colHelper.display({
    id: 'appreciation',
    size: 190,
    header: () => <span>{t('grades.colAppreciation')}</span>,
    cell: ({ row }) => {
      const r = row.original;
      const { onEditAppreciation } = useGridCallbacks();
      const custom = r.effectiveAppreciation;
      const label = custom || r.autoAppreciation;

      return (
        <div className="flex items-center gap-2">
          {label ? (
            <Badge variant={custom ? 'accent' : 'neutral'} className="max-w-36 truncate">
              {label}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
          {r.isEditable && r.effectiveStatus !== null && (
            <button
              type="button"
              onClick={() => onEditAppreciation(r)}
              aria-label={`Appréciation pour ${r.fullName}`}
              title={t('grades.appreciationModalTitle')}
              className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-sm text-slate-300 transition-colors hover:bg-muted hover:text-foreground"
            >
              <RiEdit2Fill className="size-4" />
            </button>
          )}
        </div>
      );
    },
  }),
  colHelper.accessor('rank', {
    id: 'rank',
    size: 72,
    header: () => <span>{t('grades.colRank')}</span>,
    cell: ({ row }) => (
      <span className="text-sm font-extrabold text-slate-500 tabular-nums">
        {formatRank(row.original.rank)}
      </span>
    ),
  }),
  colHelper.display({
    id: 'sync',
    size: 132,
    header: () => <span>{t('grades.colSync')}</span>,
    cell: ({ row }) => <SyncCell row={row.original} />,
  }),
]);

export function GradeEntryTable({
  rows,
  isLocked,
  onCommitScore,
  onCommitStatus,
  onEditAppreciation,
  onOpenOutbox,
}: {
  rows: GradeGridRow[];
  isLocked: boolean;
  onCommitScore: (row: GradeGridRow, score: number | null) => Promise<boolean> | boolean;
  onCommitStatus: (row: GradeGridRow, status: GradeStatus) => Promise<boolean> | boolean;
  onEditAppreciation: (row: GradeGridRow) => void;
  onOpenOutbox: () => void;
}) {
  const isDesktop = useIsDesktopViewport();
  const inputRefs = useRef(new Map<string, HTMLInputElement>());
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const table = useTable({
    features: gradeTableFeatures,
    columns: gradeColumns,
    data: rows,
    getRowId: (r) => r.targetKey,
  });

  const tableRows = table.getRowModel().rows;
  const shouldVirtualize = isDesktop && tableRows.length > VIRTUALIZE_THRESHOLD;

  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 68,
    getItemKey: (idx) => tableRows[idx]?.id ?? String(idx),
    overscan: 8,
    enabled: shouldVirtualize,
  });

  const registerInputRef = useCallback((enrollmentId: string, el: HTMLInputElement | null) => {
    if (el) {
      inputRefs.current.set(enrollmentId, el);
    } else {
      inputRefs.current.delete(enrollmentId);
    }
  }, []);

  const focusInput = useCallback((enrollmentId: string) => {
    inputRefs.current.get(enrollmentId)?.focus();
  }, []);

  const moveFocus = useCallback(
    (currentEnrollmentId: string, delta: number) => {
      const idx = rows.findIndex((r) => r.enrollment.id === currentEnrollmentId);
      if (idx === -1) return;
      const nextIdx = idx + delta;
      if (nextIdx < 0 || nextIdx >= rows.length) return;
      const targetRow = rows[nextIdx];
      if (!targetRow) return;

      if (shouldVirtualize) {
        rowVirtualizer.scrollToIndex(nextIdx, { align: 'auto' });
      }
      window.requestAnimationFrame(() => {
        inputRefs.current.get(targetRow.enrollment.id)?.focus();
      });
    },
    [rows, rowVirtualizer, shouldVirtualize],
  );

  const ctxValue: GridCallbacksContextValue = {
    onCommitScore,
    onCommitStatus,
    onEditAppreciation,
    onOpenOutbox,
    registerInputRef,
    focusInput,
    moveFocus,
  };

  return (
    <GridCallbacksContext.Provider value={ctxValue}>
      {isDesktop ? (
        <Card variant="elevated" className="overflow-hidden">
          <div
            ref={scrollContainerRef}
            className={cn('overflow-x-auto', shouldVirtualize && 'max-h-[62vh] overflow-y-auto')}
          >
            <table className="w-full min-w-[920px] table-fixed border-collapse text-left">
              <thead
                className={cn(
                  'sticky top-0 z-10 bg-slate-600 text-xs font-bold tracking-wider text-slate-50 uppercase',
                  shouldVirtualize && 'block w-full',
                )}
              >
                {table.getHeaderGroups().map((group) => (
                  <tr
                    key={group.id}
                    className={cn(shouldVirtualize && 'table w-full table-fixed')}
                  >
                    {group.headers.map((header) => (
                      <th
                        key={header.id}
                        style={{ width: header.getSize() }}
                        className="px-4 py-3.5 whitespace-nowrap"
                      >
                        {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>

              {shouldVirtualize ? (
                <tbody
                  className="relative block divide-y divide-border"
                  style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
                >
                  {rowVirtualizer.getVirtualItems().map((vItem) => {
                    const row = tableRows[vItem.index];
                    if (!row) return null;
                    return (
                      <tr
                        key={row.id}
                        data-index={vItem.index}
                        ref={rowVirtualizer.measureElement}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          transform: `translateY(${vItem.start}px)`,
                          display: 'table',
                          tableLayout: 'fixed',
                        }}
                        className={cn(
                          'transition-colors hover:bg-muted/45',
                          row.original.syncState === 'failed' && 'bg-brick-50/25',
                          row.original.syncState === 'pending' && 'bg-amber-50/20',
                        )}
                      >
                        {row.getAllCells().map((cell) => (
                          <td
                            key={cell.id}
                            style={{ width: cell.column.getSize() }}
                            className="px-4 py-3 align-middle"
                          >
                            <table.FlexRender cell={cell} />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              ) : (
                <tbody className="divide-y divide-border">
                  {tableRows.map((row) => (
                    <tr
                      key={row.id}
                      className={cn(
                        'transition-colors hover:bg-muted/45',
                        row.original.syncState === 'failed' && 'bg-brick-50/25',
                        row.original.syncState === 'pending' && 'bg-amber-50/20',
                      )}
                    >
                      {row.getAllCells().map((cell) => (
                        <td
                          key={cell.id}
                          style={{ width: cell.column.getSize() }}
                          className="px-4 py-3 align-middle"
                        >
                          <table.FlexRender cell={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/40 px-4 py-2.5 text-xs font-medium text-muted-foreground">
            <span className="flex items-center gap-1.5">
              {isLocked ? (
                <>
                  <RiLockFill className="size-3.5 text-slate-400" />
                  <span>{t('grades.lockedBannerTitle')}</span>
                </>
              ) : (
                <span>{t('grades.keyboardHint')}</span>
              )}
            </span>
            <span className="tabular-nums font-semibold">{rows.length} élève(s)</span>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.targetKey} variant="default" className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold text-muted-foreground tabular-nums">
                      #{r.rowIndex}
                    </span>
                    <p className="truncate text-sm font-bold text-foreground">{r.fullName}</p>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                    {r.student.matricule} · Rang : {formatRank(r.rank)}
                  </p>
                </div>
                <SyncCell row={r} />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <StatusSegment
                  value={r.effectiveStatus}
                  disabled={!r.isEditable}
                  studentName={r.fullName}
                  onChange={(next) => {
                    void onCommitStatus(r, next);
                    if (next === 'present') {
                      window.requestAnimationFrame(() => focusInput(r.enrollment.id));
                    }
                  }}
                />
                <ScoreCell row={r} />
              </div>

              {(r.effectiveAppreciation || r.autoAppreciation || r.isEditable) && (
                <div className="flex items-center justify-between gap-2 border-t border-border pt-2.5">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {r.effectiveAppreciation || r.autoAppreciation || '—'}
                  </span>
                  {r.isEditable && r.effectiveStatus !== null && (
                    <button
                      type="button"
                      onClick={() => onEditAppreciation(r)}
                      className="inline-flex cursor-pointer items-center gap-1 text-xs font-bold text-primary"
                    >
                      <RiEdit2Fill className="size-3.5" />
                      <span>Appréciation</span>
                    </button>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </GridCallbacksContext.Provider>
  );
}
