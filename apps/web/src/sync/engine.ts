import { SyncGradePushOperationSchema, type GradeStatus, type SyncOutcome } from '@lycee/shared';
import {
  getUserDb,
  makeGradeTargetKey,
  type LocalOutboxOperation,
  type LocalServerGrade,
  type LyceeUserDb,
} from '@/db/user-db';
import {
  pullSyncRequest,
  pushSyncRequest,
  type SyncGradePushOperation,
  type SyncPullPayload,
} from '@/lib/api/sync';
import { normalizeScoresEqual } from '@/lib/grades/format';
import { generateUuid } from '@/lib/utils';

const META_CURSOR = 'cursor';
const META_YEAR_ID = 'academicYearId';
const META_LAST_PULL_AT = 'lastPullAt';
const META_LAST_PUSH_AT = 'lastPushAt';
const PUSH_CHUNK_SIZE = 100;
const PULL_PAGE_LIMIT = 1000;
const MAX_PULL_PAGES = 50;

export interface EnqueueGradeInput {
  enrollmentId: string;
  classSubjectId: string;
  periodId: string;
  score: number | null;
  status: GradeStatus;
  appreciation?: string | null;
  reason?: string;
}

export interface EnqueueGradeResult {
  action: 'queued' | 'reverted';
  targetKey: string;
  operationId?: string;
}

export interface SyncRunSummary {
  pushedCount: number;
  appliedCount: number;
  duplicateCount: number;
  failedCount: number;
  pulledPages: number;
  latestCursor: number;
  lastPullAt: string;
}

export function requiresEditReason(
  serverGrade: LocalServerGrade | undefined,
  next: { score: number | null; status: GradeStatus },
): boolean {
  if (!serverGrade) {
    return false;
  }
  return (
    !normalizeScoresEqual(serverGrade.score, next.score) ||
    serverGrade.status !== next.status
  );
}

async function applyPullPageToDb(
  db: LyceeUserDb,
  page: SyncPullPayload,
  resetYearTables: boolean,
): Promise<void> {
  const snapshotTables = [
    db.syncMeta,
    db.academicYears,
    db.gradingRules,
    db.periods,
    db.subjectGroups,
    db.subjects,
    db.classes,
    db.classSubjects,
    db.teacherAssignments,
    db.students,
    db.enrollments,
    db.grades,
  ];

  await db.transaction('rw', snapshotTables, async () => {
    if (resetYearTables) {
      await Promise.all([
        db.academicYears.clear(),
        db.gradingRules.clear(),
        db.periods.clear(),
        db.subjectGroups.clear(),
        db.subjects.clear(),
        db.classes.clear(),
        db.classSubjects.clear(),
        db.teacherAssignments.clear(),
        db.students.clear(),
        db.enrollments.clear(),
        db.grades.clear(),
      ]);
    }

    await db.academicYears.put(page.academicYear);
    if (page.gradingRules.length > 0) await db.gradingRules.bulkPut(page.gradingRules);
    if (page.periods.length > 0) await db.periods.bulkPut(page.periods);
    if (page.subjectGroups.length > 0) await db.subjectGroups.bulkPut(page.subjectGroups);
    if (page.subjects.length > 0) await db.subjects.bulkPut(page.subjects);
    if (page.classes.length > 0) await db.classes.bulkPut(page.classes);
    if (page.classSubjects.length > 0) await db.classSubjects.bulkPut(page.classSubjects);
    if (page.teacherAssignments.length > 0) {
      await db.teacherAssignments.bulkPut(page.teacherAssignments);
    }
    if (page.students.length > 0) await db.students.bulkPut(page.students);
    if (page.enrollments.length > 0) await db.enrollments.bulkPut(page.enrollments);
    if (page.grades.length > 0) {
      await db.grades.bulkPut(
        page.grades.map((g) => ({
          ...g,
          targetKey: makeGradeTargetKey(g.enrollmentId, g.classSubjectId, g.periodId),
        })),
      );
    }

    const now = new Date().toISOString();
    await db.syncMeta.bulkPut([
      { key: META_CURSOR, value: page.latestCursor },
      { key: META_YEAR_ID, value: page.academicYearId },
      { key: META_LAST_PULL_AT, value: now },
    ]);
  });
}

export async function pullAllUpdates(
  db: LyceeUserDb,
  options?: { reset?: boolean },
): Promise<{ pages: number; latestCursor: number; lastPullAt: string }> {
  const [cursorRow, yearRow] = await Promise.all([
    db.syncMeta.get(META_CURSOR),
    db.syncMeta.get(META_YEAR_ID),
  ]);

  let cursor = options?.reset ? 0 : Number(cursorRow?.value ?? 0);
  if (!Number.isFinite(cursor) || cursor < 0) cursor = 0;
  let storedYearId = typeof yearRow?.value === 'string' ? yearRow.value : null;

  let pages = 0;
  let hasMore = true;

  while (hasMore && pages < MAX_PULL_PAGES) {
    const page = await pullSyncRequest({
      since: cursor,
      limit: PULL_PAGE_LIMIT,
    });
    pages += 1;

    const yearChanged = storedYearId !== null && storedYearId !== page.academicYearId;
    if (yearChanged && cursor > 0) {
      // L'année scolaire active a changé : réinitialise le cache et repart du curseur 0.
      cursor = 0;
      storedYearId = page.academicYearId;
      const freshPage = await pullSyncRequest({
        since: 0,
        limit: PULL_PAGE_LIMIT,
        academicYearId: page.academicYearId,
      });
      await applyPullPageToDb(db, freshPage, true);
      cursor = freshPage.latestCursor;
      hasMore = freshPage.hasMore;
      if (hasMore && freshPage.latestCursor <= freshPage.since) {
        break;
      }
      continue;
    }

    const shouldReset = (options?.reset && pages === 1) || yearChanged;
    await applyPullPageToDb(db, page, shouldReset);
    storedYearId = page.academicYearId;

    if (page.hasMore && page.latestCursor <= cursor) {
      // Garde anti-boucle si le serveur signale hasMore sans avancée de curseur.
      break;
    }

    cursor = page.latestCursor;
    hasMore = page.hasMore;
  }

  const lastPullRow = await db.syncMeta.get(META_LAST_PULL_AT);
  return {
    pages,
    latestCursor: cursor,
    lastPullAt:
      typeof lastPullRow?.value === 'string'
        ? lastPullRow.value
        : new Date().toISOString(),
  };
}

export async function recoverInterruptedSyncingOperations(db: LyceeUserDb): Promise<number> {
  const stuck = await db.outbox.where('status').equals('syncing').toArray();
  if (stuck.length === 0) return 0;

  const now = new Date().toISOString();
  await db.outbox.bulkPut(
    stuck.map((item) => ({
      ...item,
      status: 'pending' as const,
      updatedAt: now,
    })),
  );
  return stuck.length;
}

export async function enqueueGradeMutation(
  db: LyceeUserDb,
  input: EnqueueGradeInput,
): Promise<EnqueueGradeResult> {
  const targetKey = makeGradeTargetKey(
    input.enrollmentId,
    input.classSubjectId,
    input.periodId,
  );
  const operationId = generateUuid();
  const now = new Date().toISOString();

  const normalizedPayload = {
    enrollmentId: input.enrollmentId,
    classSubjectId: input.classSubjectId,
    periodId: input.periodId,
    score: input.status === 'present' ? input.score : null,
    status: input.status,
    ...(input.appreciation !== undefined
      ? { appreciation: input.appreciation?.trim() ? input.appreciation.trim() : null }
      : {}),
    ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
  };

  SyncGradePushOperationSchema.parse({
    operationId,
    type: 'UPSERT_GRADE',
    clientTimestamp: now,
    payload: normalizedPayload,
  });

  const [serverGrade, existingOutbox] = await Promise.all([
    db.grades.get(targetKey),
    db.outbox.get(targetKey),
  ]);

  const matchesServer =
    serverGrade !== undefined &&
    normalizeScoresEqual(serverGrade.score, normalizedPayload.score) &&
    serverGrade.status === normalizedPayload.status &&
    (normalizedPayload.appreciation === undefined ||
      (normalizedPayload.appreciation ?? null) === (serverGrade.appreciation ?? null));

  if (matchesServer) {
    if (existingOutbox) {
      await db.outbox.delete(targetKey);
    }
    return { action: 'reverted', targetKey };
  }

  const record: LocalOutboxOperation = {
    targetKey,
    operationId,
    type: 'UPSERT_GRADE',
    enrollmentId: input.enrollmentId,
    classSubjectId: input.classSubjectId,
    periodId: input.periodId,
    payload: normalizedPayload,
    status: 'pending',
    attempts: 0,
    clientTimestamp: now,
    createdAt: existingOutbox?.createdAt ?? now,
    updatedAt: now,
  };

  await db.outbox.put(record);
  return { action: 'queued', targetKey, operationId };
}

export async function pushOutbox(db: LyceeUserDb): Promise<{
  pushedCount: number;
  appliedCount: number;
  duplicateCount: number;
  failedCount: number;
}> {
  await recoverInterruptedSyncingOperations(db);

  const pendingOps = await db.outbox.where('status').equals('pending').sortBy('createdAt');
  if (pendingOps.length === 0) {
    return { pushedCount: 0, appliedCount: 0, duplicateCount: 0, failedCount: 0 };
  }

  let pushedCount = 0;
  let appliedCount = 0;
  let duplicateCount = 0;
  let failedCount = 0;

  for (let i = 0; i < pendingOps.length; i += PUSH_CHUNK_SIZE) {
    const chunk = pendingOps.slice(i, i + PUSH_CHUNK_SIZE);
    const markSyncingAt = new Date().toISOString();

    await db.outbox.bulkPut(
      chunk.map((op) => ({
        ...op,
        status: 'syncing' as const,
        attempts: op.attempts + 1,
        updatedAt: markSyncingAt,
      })),
    );

    const requestOps: SyncGradePushOperation[] = chunk.map((op) => ({
      operationId: op.operationId,
      type: op.type,
      clientTimestamp: op.clientTimestamp,
      payload: op.payload,
    }));

    let results;
    try {
      results = await pushSyncRequest(requestOps);
    } catch (err) {
      // Restaure le statut pending en gardant le même operationId (idempotence garantie).
      const revertAt = new Date().toISOString();
      await db.transaction('rw', db.outbox, async () => {
        for (const op of chunk) {
          const current = await db.outbox.get(op.targetKey);
          if (current && current.operationId === op.operationId && current.status === 'syncing') {
            await db.outbox.put({
              ...current,
              status: 'pending',
              updatedAt: revertAt,
            });
          }
        }
      });
      throw err;
    }

    pushedCount += chunk.length;
    const resultByOpId = new Map(results.map((r) => [r.operationId, r]));
    const resolvedAt = new Date().toISOString();

    await db.transaction('rw', [db.outbox, db.grades, db.syncMeta], async () => {
      for (const sentOp of chunk) {
        const res = resultByOpId.get(sentOp.operationId);
        if (!res) continue;

        const currentOutbox = await db.outbox.get(sentOp.targetKey);
        const isStillSameOp = currentOutbox?.operationId === sentOp.operationId;

        if (res.outcome === 'applied') {
          appliedCount += 1;
          const existingServer = await db.grades.get(sentOp.targetKey);
          if (existingServer || res.gradeId) {
            await db.grades.put({
              targetKey: sentOp.targetKey,
              id: res.gradeId ?? existingServer?.id ?? sentOp.operationId,
              enrollmentId: sentOp.enrollmentId,
              classSubjectId: sentOp.classSubjectId,
              periodId: sentOp.periodId,
              score: sentOp.payload.score,
              status: sentOp.payload.status,
              appreciation:
                sentOp.payload.appreciation !== undefined
                  ? sentOp.payload.appreciation
                  : (existingServer?.appreciation ?? null),
              enteredBy: existingServer?.enteredBy ?? '',
              syncVersion: res.syncVersion ?? existingServer?.syncVersion ?? 0,
              createdAt: existingServer?.createdAt ?? resolvedAt,
              updatedAt: resolvedAt,
            });
          }
          if (isStillSameOp) {
            await db.outbox.delete(sentOp.targetKey);
          }
        } else if (res.outcome === 'duplicate') {
          duplicateCount += 1;
          if (isStillSameOp) {
            await db.outbox.delete(sentOp.targetKey);
          }
        } else {
          failedCount += 1;
          if (isStillSameOp && currentOutbox) {
            await db.outbox.put({
              ...currentOutbox,
              status: 'failed',
              outcome: res.outcome as SyncOutcome,
              errorMessage: res.errorMessage ?? 'Modification refusée par le serveur.',
              updatedAt: resolvedAt,
            });
          }
        }
      }

      await db.syncMeta.put({ key: META_LAST_PUSH_AT, value: resolvedAt });
    });
  }

  return { pushedCount, appliedCount, duplicateCount, failedCount };
}

export async function discardOutboxItem(db: LyceeUserDb, targetKey: string): Promise<void> {
  await db.outbox.delete(targetKey);
}

export async function retryOutboxItemWithReason(
  db: LyceeUserDb,
  targetKey: string,
  reason?: string,
): Promise<void> {
  const existing = await db.outbox.get(targetKey);
  if (!existing) return;

  const now = new Date().toISOString();
  const nextReason = reason !== undefined ? reason.trim() : existing.payload.reason;

  await db.outbox.put({
    ...existing,
    operationId: generateUuid(),
    clientTimestamp: now,
    status: 'pending',
    outcome: undefined,
    errorMessage: undefined,
    payload: {
      ...existing.payload,
      ...(nextReason ? { reason: nextReason } : {}),
    },
    updatedAt: now,
  });
}

const inFlightSyncByUser = new Map<string, Promise<SyncRunSummary>>();
const rerunRequestedByUser = new Set<string>();

export async function syncNow(
  userId: string,
  options?: { db?: LyceeUserDb; reset?: boolean },
): Promise<SyncRunSummary> {
  const existingFlight = inFlightSyncByUser.get(userId);
  if (existingFlight) {
    rerunRequestedByUser.add(userId);
    return existingFlight;
  }

  const db = options?.db ?? getUserDb(userId);

  const runPromise = (async (): Promise<SyncRunSummary> => {
    let pushedCount = 0;
    let appliedCount = 0;
    let duplicateCount = 0;
    let failedCount = 0;
    let pulledPages = 0;
    let latestCursor = 0;
    let lastPullAt = new Date().toISOString();
    let pass = 0;

    do {
      rerunRequestedByUser.delete(userId);
      pass += 1;

      const pushRes = await pushOutbox(db);
      pushedCount += pushRes.pushedCount;
      appliedCount += pushRes.appliedCount;
      duplicateCount += pushRes.duplicateCount;
      failedCount += pushRes.failedCount;

      const pullRes = await pullAllUpdates(db, {
        reset: pass === 1 && options?.reset,
      });
      pulledPages += pullRes.pages;
      latestCursor = pullRes.latestCursor;
      lastPullAt = pullRes.lastPullAt;

      const remainingPending = await db.outbox.where('status').equals('pending').count();
      if (remainingPending > 0 && pass < 3) {
        rerunRequestedByUser.add(userId);
      }
    } while (rerunRequestedByUser.has(userId) && pass < 3);

    return {
      pushedCount,
      appliedCount,
      duplicateCount,
      failedCount,
      pulledPages,
      latestCursor,
      lastPullAt,
    };
  })().finally(() => {
    inFlightSyncByUser.delete(userId);
    rerunRequestedByUser.delete(userId);
  });

  inFlightSyncByUser.set(userId, runPromise);
  return runPromise;
}
