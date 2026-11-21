import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeAllUserDbs, getUserDb, type LyceeUserDb } from '@/db/user-db';
import { registerApiAuthBridge } from '@/lib/api/client';
import type { SyncPullPayload } from '@/lib/api/sync';
import {
  discardOutboxItem,
  enqueueGradeMutation,
  pullAllUpdates,
  pushOutbox,
  requiresEditReason,
  retryOutboxItemWithReason,
  syncNow,
} from '../engine';

const YEAR_ID = '10000000-0000-4000-8000-000000000001';
const TRIMESTER_ID = '20000000-0000-4000-8000-000000000001';
const SEQ1_ID = '20000000-0000-4000-8000-000000000002';
const CLASS_ID = '30000000-0000-4000-8000-000000000001';
const SUBJECT_ID = '40000000-0000-4000-8000-000000000001';
const CS_ID = '50000000-0000-4000-8000-000000000001';
const ASSIGNMENT_ID = '60000000-0000-4000-8000-000000000001';
const STUDENT_ID = '70000000-0000-4000-8000-000000000001';
const ENR_ID = '80000000-0000-4000-8000-000000000001';
const USER_A = '90000000-0000-4000-8000-00000000000a';
const USER_B = '90000000-0000-4000-8000-00000000000b';
const GRADE_ID = 'a0000000-0000-4000-8000-000000000001';

function buildPullPage(overrides: Partial<SyncPullPayload> = {}): SyncPullPayload {
  const now = '2026-11-21T10:00:00.000Z';
  return {
    academicYearId: YEAR_ID,
    academicYear: {
      id: YEAR_ID,
      label: '2026-2027',
      startDate: '2026-09-01',
      endDate: '2027-07-31',
      isActive: true,
      syncVersion: 1,
    },
    since: 0,
    latestCursor: 5,
    hasMore: false,
    teacherAssignments: [
      {
        id: ASSIGNMENT_ID,
        teacherId: USER_A,
        classSubjectId: CS_ID,
        academicYearId: YEAR_ID,
        isActive: true,
        syncVersion: 2,
        createdAt: now,
        updatedAt: now,
      },
    ],
    classes: [
      {
        id: CLASS_ID,
        academicYearId: YEAR_ID,
        name: '3ème A',
        level: '3ème',
        series: null,
        mainTeacherId: USER_A,
        syncVersion: 2,
        updatedAt: now,
      },
    ],
    classSubjects: [
      {
        id: CS_ID,
        classId: CLASS_ID,
        subjectId: SUBJECT_ID,
        subjectGroupId: null,
        coefficient: 4,
        syncVersion: 2,
        updatedAt: now,
      },
    ],
    enrollments: [
      {
        id: ENR_ID,
        studentId: STUDENT_ID,
        classId: CLASS_ID,
        academicYearId: YEAR_ID,
        isRepeater: false,
        status: 'active',
        syncVersion: 2,
        enrolledAt: now,
        updatedAt: now,
      },
    ],
    students: [
      {
        id: STUDENT_ID,
        matricule: '26LYC-001',
        lastName: 'Kamga',
        firstName: 'Jean',
        birthDate: '2012-05-12',
        birthPlace: 'Yaoundé',
        sex: 'M',
        syncVersion: 2,
        createdAt: now,
        updatedAt: now,
      },
    ],
    grades: [],
    periods: [
      {
        id: TRIMESTER_ID,
        academicYearId: YEAR_ID,
        parentPeriodId: null,
        type: 'trimester',
        code: 'T1',
        name: '1er Trimestre',
        orderIndex: 1,
        weight: 1,
        status: 'open',
        lockedAt: null,
        lockedBy: null,
        syncVersion: 2,
        updatedAt: now,
      },
      {
        id: SEQ1_ID,
        academicYearId: YEAR_ID,
        parentPeriodId: TRIMESTER_ID,
        type: 'sequence',
        code: 'S1',
        name: 'Séquence 1',
        orderIndex: 1,
        weight: 1,
        status: 'open',
        lockedAt: null,
        lockedBy: null,
        syncVersion: 2,
        updatedAt: now,
      },
    ],
    subjects: [
      {
        id: SUBJECT_ID,
        code: 'MATH',
        name: 'Mathématiques',
        shortName: 'Maths',
        isActive: true,
        syncVersion: 2,
        updatedAt: now,
      },
    ],
    subjectGroups: [],
    gradingRules: [],
    councilDecisions: [],
    ...overrides,
  };
}

describe('Offline Sync Engine & User-Partitioned Dexie Outbox', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    registerApiAuthBridge({
      getAccessToken: () => 'test-token',
      refreshAccessToken: async () => 'test-token',
    });
    for (const userId of [USER_A, USER_B]) {
      const db = getUserDb(userId);
      await db.delete();
    }
    closeAllUserDbs();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    closeAllUserDbs();
    vi.restoreAllMocks();
  });

  it('physically partitions IndexedDB tables and outbox per userId', async () => {
    const dbA = getUserDb(USER_A);
    const dbB = getUserDb(USER_B);

    await enqueueGradeMutation(dbA, {
      enrollmentId: ENR_ID,
      classSubjectId: CS_ID,
      periodId: SEQ1_ID,
      score: 15,
      status: 'present',
    });

    expect(await dbA.outbox.count()).toBe(1);
    expect(await dbB.outbox.count()).toBe(0);
  });

  it('paginates pullAllUpdates until hasMore=false and preserves pending outbox overlay', async () => {
    const dbA = getUserDb(USER_A);

    // Brouillon hors-ligne déjà saisi localement avant le pull
    await enqueueGradeMutation(dbA, {
      enrollmentId: ENR_ID,
      classSubjectId: CS_ID,
      periodId: SEQ1_ID,
      score: 18,
      status: 'present',
    });

    const page1 = buildPullPage({
      since: 0,
      latestCursor: 5,
      hasMore: true,
    });
    const page2 = buildPullPage({
      since: 5,
      latestCursor: 9,
      hasMore: false,
      teacherAssignments: [
        {
          id: ASSIGNMENT_ID,
          teacherId: USER_A,
          classSubjectId: CS_ID,
          academicYearId: YEAR_ID,
          isActive: false, // Affectation révoquée sur le serveur
          syncVersion: 9,
          createdAt: '2026-11-21T10:00:00.000Z',
          updatedAt: '2026-11-21T10:05:00.000Z',
        },
      ],
      grades: [
        {
          id: GRADE_ID,
          enrollmentId: ENR_ID,
          classSubjectId: CS_ID,
          periodId: SEQ1_ID,
          score: 12,
          status: 'present',
          appreciation: null,
          enteredBy: USER_A,
          syncVersion: 8,
          createdAt: '2026-11-21T10:00:00.000Z',
          updatedAt: '2026-11-21T10:02:00.000Z',
        },
      ],
    });

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(page1), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(page2), { status: 200 }));

    const result = await pullAllUpdates(dbA);

    expect(result.pages).toBe(2);
    expect(result.latestCursor).toBe(9);
    expect((await dbA.teacherAssignments.get(ASSIGNMENT_ID))?.isActive).toBe(false);
    expect((await dbA.grades.toArray())[0]?.score).toBe(12);
    // Le brouillon local outbox reste intact et n'est pas écrasé par le pull
    const pending = await dbA.outbox.toArray();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.payload.score).toBe(18);
  });

  it('reverts redundant pending edits back to server snapshot and detects mandatory reason', async () => {
    const dbA = getUserDb(USER_A);
    const targetKey = `${ENR_ID}:${CS_ID}:${SEQ1_ID}`;

    await dbA.grades.put({
      targetKey,
      id: GRADE_ID,
      enrollmentId: ENR_ID,
      classSubjectId: CS_ID,
      periodId: SEQ1_ID,
      score: 14,
      status: 'present',
      appreciation: null,
      enteredBy: USER_A,
      syncVersion: 5,
      createdAt: '2026-11-21T10:00:00.000Z',
      updatedAt: '2026-11-21T10:00:00.000Z',
    });

    const serverGrade = await dbA.grades.get(targetKey);
    expect(requiresEditReason(serverGrade, { score: 16, status: 'present' })).toBe(true);
    expect(requiresEditReason(serverGrade, { score: 14, status: 'present' })).toBe(false);
    expect(requiresEditReason(undefined, { score: 16, status: 'present' })).toBe(false);

    await enqueueGradeMutation(dbA, {
      enrollmentId: ENR_ID,
      classSubjectId: CS_ID,
      periodId: SEQ1_ID,
      score: 16,
      status: 'present',
      reason: 'Recomptage',
    });
    expect(await dbA.outbox.count()).toBe(1);

    // Remise à la note serveur : l'entrée outbox redondante est supprimée proprement
    const res = await enqueueGradeMutation(dbA, {
      enrollmentId: ENR_ID,
      classSubjectId: CS_ID,
      periodId: SEQ1_ID,
      score: 14,
      status: 'present',
    });
    expect(res.action).toBe('reverted');
    expect(await dbA.outbox.count()).toBe(0);
  });

  it('handles applied, duplicate, and rejected outcomes, preserves operationId on retry, and supports resolution', async () => {
    const dbA: LyceeUserDb = getUserDb(USER_A);
    const enr2 = '80000000-0000-4000-8000-000000000002';
    const enr3 = '80000000-0000-4000-8000-000000000003';

    const op1 = await enqueueGradeMutation(dbA, {
      enrollmentId: ENR_ID,
      classSubjectId: CS_ID,
      periodId: SEQ1_ID,
      score: 15.5,
      status: 'present',
    });
    const op2 = await enqueueGradeMutation(dbA, {
      enrollmentId: enr2,
      classSubjectId: CS_ID,
      periodId: SEQ1_ID,
      score: null,
      status: 'absent',
    });
    const op3 = await enqueueGradeMutation(dbA, {
      enrollmentId: enr3,
      classSubjectId: CS_ID,
      periodId: SEQ1_ID,
      score: 11,
      status: 'present',
    });

    // 1er essai : coupure réseau pendant POST -> doit préserver le même operationId en statut pending
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              { operationId: op1.operationId, outcome: 'applied', gradeId: GRADE_ID, syncVersion: 10 },
              { operationId: op2.operationId, outcome: 'duplicate' },
              {
                operationId: op3.operationId,
                outcome: 'rejected_validation',
                errorMessage: 'Un motif (reason) est obligatoire pour modifier une note existante.',
              },
            ],
          }),
          { status: 200 },
        ),
      );

    globalThis.fetch = fetchMock;

    await expect(pushOutbox(dbA)).rejects.toThrow();

    const afterDrop = await dbA.outbox.get(op1.targetKey);
    expect(afterDrop?.status).toBe('pending');
    expect(afterDrop?.operationId).toBe(op1.operationId);

    // 2e essai : même operationId renvoyé et réconciliation
    const pushRes = await pushOutbox(dbA);
    expect(pushRes.appliedCount).toBe(1);
    expect(pushRes.duplicateCount).toBe(1);
    expect(pushRes.failedCount).toBe(1);

    // op1 & op2 retirés de la file, op3 en échec explicite
    expect(await dbA.outbox.get(op1.targetKey)).toBeUndefined();
    expect(await dbA.outbox.get(op2.targetKey)).toBeUndefined();
    expect((await dbA.grades.get(op1.targetKey))?.score).toBe(15.5);

    const failedOp3 = await dbA.outbox.get(op3.targetKey);
    expect(failedOp3?.status).toBe('failed');
    expect(failedOp3?.outcome).toBe('rejected_validation');

    // Réessai avec motif -> génère un nouvel operationId en statut pending
    await retryOutboxItemWithReason(dbA, op3.targetKey, 'Correction erreur de saisie');
    const retried = await dbA.outbox.get(op3.targetKey);
    expect(retried?.status).toBe('pending');
    expect(retried?.operationId).not.toBe(op3.operationId);
    expect(retried?.payload.reason).toBe('Correction erreur de saisie');

    // Abandon d'un brouillon
    await discardOutboxItem(dbA, op3.targetKey);
    expect(await dbA.outbox.get(op3.targetKey)).toBeUndefined();
  });

  it('coalesces concurrent syncNow triggers cleanly and chunks >100 operations', async () => {
    const dbA = getUserDb(USER_A);

    for (let i = 0; i < 105; i += 1) {
      const hex = i.toString(16).padStart(12, '0');
      await enqueueGradeMutation(dbA, {
        enrollmentId: `80000000-0000-4000-8000-${hex}`,
        classSubjectId: CS_ID,
        periodId: SEQ1_ID,
        score: 12,
        status: 'present',
      });
    }

    const pushBatchSizes: number[] = [];
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/sync/push')) {
        const body = JSON.parse(String(init?.body)) as { operations: Array<{ operationId: string }> };
        pushBatchSizes.push(body.operations.length);
        return new Response(
          JSON.stringify({
            results: body.operations.map((o) => ({
              operationId: o.operationId,
              outcome: 'applied',
              syncVersion: 15,
            })),
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(buildPullPage()), { status: 200 });
    });

    const [s1, s2] = await Promise.all([syncNow(USER_A, { db: dbA }), syncNow(USER_A, { db: dbA })]);
    expect(pushBatchSizes).toEqual([100, 5]);
    expect(s1.appliedCount + s2.appliedCount).toBeGreaterThanOrEqual(105);
    expect(await dbA.outbox.count()).toBe(0);
  });
});
