import { randomUUID } from 'node:crypto';
import type { GradingCalculatorContract } from '@lycee/shared';
import { desc, eq } from 'drizzle-orm';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type DbClient, nextSyncVersion } from '../db/client.js';
import {
  academicYears,
  classSubjects,
  classes,
  enrollments,
  gradeAuditLogs,
  grades,
  gradingRules,
  periodAuditLogs,
  periodStudentResults,
  periodSubjectResults,
  periods,
  students,
  subjectGroups,
  subjects,
  syncOperations,
  teacherAssignments,
  users,
} from '../db/schema.js';
import { createTestDb, type TestDbHandle } from '../db/test-helpers.js';
import { registerErrorHandler } from '../lib/errors.js';
import { fallbackGradingCalculator } from '../lib/grading-fallback.js';
import { authPlugin } from '../plugins/auth.js';
import { registerGradesRoutes } from '../routes/grades.routes.js';
import { registerSyncRoutes } from '../routes/sync.routes.js';
import { registerValidationRoutes } from '../routes/validation.routes.js';

interface TestFixture {
  app: FastifyInstance;
  db: DbClient;
  yearId: string;
  trimester1Id: string;
  seq1Id: string;
  seq2Id: string;
  class6AId: string;
  class5BId: string;
  mathSubjectId: string;
  frSubjectId: string;
  cs6AMathId: string;
  cs6AFrId: string;
  cs5BMathId: string;
  enrAliceId: string;
  enrBobId: string;
  enrCharlieId: string;
  studentAliceId: string;
  studentBobId: string;
  studentCharlieId: string;
  adminUser: { id: string; token: string };
  censorUser: { id: string; token: string };
  principalUser: { id: string; token: string };
  teacherMathUser: { id: string; token: string };
  teacherFrUser: { id: string; token: string };
  secretaryUser: { id: string; token: string };
  assignmentMath6AId: string;
}

async function buildApp(db: DbClient, calculator?: GradingCalculatorContract): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);
  await app.register(authPlugin, {
    jwtAccessSecret: 'test-access-secret-must-be-long-enough',
    jwtAccessTtl: '15m',
    db,
  });
  await registerGradesRoutes(app, { db });
  await registerSyncRoutes(app, { db });
  await registerValidationRoutes(app, { db, calculator });
  await app.ready();
  return app;
}

async function seedFixture(calculator?: GradingCalculatorContract): Promise<{
  dbHandle: TestDbHandle;
  fx: TestFixture;
}> {
  const dbHandle = await createTestDb();
  const db = dbHandle.db;
  const app = await buildApp(db, calculator);

  const createUser = async (
    username: string,
    fullName: string,
    role: 'admin' | 'censor' | 'principal' | 'teacher' | 'secretary',
  ) => {
    const [u] = await db
      .insert(users)
      .values({
        username,
        fullName,
        role,
        passwordHash: 'scrypt:00:00',
        isActive: true,
      })
      .returning();
    if (!u) throw new Error('User insert failed');
    const token = app.jwt.sign({
      sub: u.id,
      ver: u.tokenVersion,
    });
    return { id: u.id, token };
  };

  const adminUser = await createUser('admin', 'Administrateur Test', 'admin');
  const censorUser = await createUser('censor', 'Censeur Test', 'censor');
  const principalUser = await createUser('principal', 'Proviseur Test', 'principal');
  const teacherMathUser = await createUser('prof.math', 'Prof Maths', 'teacher');
  const teacherFrUser = await createUser('prof.fr', 'Prof Français', 'teacher');
  const secretaryUser = await createUser('secretaire', 'Secrétaire Test', 'secretary');

  const [year] = await db
    .insert(academicYears)
    .values({
      label: '2025-2026',
      startDate: '2025-09-01',
      endDate: '2026-06-30',
      isActive: true,
      syncVersion: await nextSyncVersion(db),
    })
    .returning();
  if (!year) throw new Error('Year insert failed');

  await db.insert(gradingRules).values({
    academicYearId: year.id,
    trimestersCount: 3,
    sequencesPerTrimester: 2,
    sequenceWeights: [1, 1],
    trimesterWeights: [1, 1, 1],
    passingThreshold: '10.00',
    honorRollThreshold: '12.00',
    encouragementThreshold: '13.00',
    congratulationThreshold: '15.00',
    treatAbsentAsZero: true,
    appreciationScale: [
      { min: 0, max: 9.99, label: 'Insuffisant' },
      { min: 10, max: 11.99, label: 'Passable' },
      { min: 12, max: 13.99, label: 'Assez bien' },
      { min: 14, max: 15.99, label: 'Bien' },
      { min: 16, max: 20, label: 'Très bien' },
    ],
    syncVersion: await nextSyncVersion(db),
  });

  const [trimester1] = await db
    .insert(periods)
    .values({
      academicYearId: year.id,
      type: 'trimester',
      code: 'T1',
      name: '1er Trimestre',
      orderIndex: 1,
      weight: '1.00',
      status: 'open',
      syncVersion: await nextSyncVersion(db),
    })
    .returning();
  if (!trimester1) throw new Error('Trimester insert failed');

  const [seq1] = await db
    .insert(periods)
    .values({
      academicYearId: year.id,
      parentPeriodId: trimester1.id,
      type: 'sequence',
      code: 'SEQ1',
      name: '1ère Séquence',
      orderIndex: 1,
      weight: '1.00',
      status: 'open',
      syncVersion: await nextSyncVersion(db),
    })
    .returning();
  if (!seq1) throw new Error('Seq1 insert failed');

  const [seq2] = await db
    .insert(periods)
    .values({
      academicYearId: year.id,
      parentPeriodId: trimester1.id,
      type: 'sequence',
      code: 'SEQ2',
      name: '2ème Séquence',
      orderIndex: 2,
      weight: '1.00',
      status: 'open',
      syncVersion: await nextSyncVersion(db),
    })
    .returning();
  if (!seq2) throw new Error('Seq2 insert failed');

  const [class6A] = await db
    .insert(classes)
    .values({
      academicYearId: year.id,
      name: '6ème A',
      level: '6ème',
      mainTeacherId: teacherMathUser.id,
      syncVersion: await nextSyncVersion(db),
    })
    .returning();
  if (!class6A) throw new Error('Class 6A insert failed');

  const [class5B] = await db
    .insert(classes)
    .values({
      academicYearId: year.id,
      name: '5ème B',
      level: '5ème',
      syncVersion: await nextSyncVersion(db),
    })
    .returning();
  if (!class5B) throw new Error('Class 5B insert failed');

  const [grpSci] = await db
    .insert(subjectGroups)
    .values({
      academicYearId: year.id,
      name: 'Sciences',
      orderIndex: 1,
      syncVersion: await nextSyncVersion(db),
    })
    .returning();
  if (!grpSci) throw new Error('Subject group insert failed');

  const [mathSub] = await db
    .insert(subjects)
    .values({
      code: 'MATH',
      name: 'Mathématiques',
      shortName: 'Maths',
      syncVersion: await nextSyncVersion(db),
    })
    .returning();
  if (!mathSub) throw new Error('Math subject insert failed');

  const [frSub] = await db
    .insert(subjects)
    .values({
      code: 'FR',
      name: 'Français',
      shortName: 'Fr',
      syncVersion: await nextSyncVersion(db),
    })
    .returning();
  if (!frSub) throw new Error('French subject insert failed');

  const [cs6AMath] = await db
    .insert(classSubjects)
    .values({
      classId: class6A.id,
      subjectId: mathSub.id,
      subjectGroupId: grpSci.id,
      coefficient: '4.00',
      syncVersion: await nextSyncVersion(db),
    })
    .returning();
  if (!cs6AMath) throw new Error('cs6AMath insert failed');

  const [cs6AFr] = await db
    .insert(classSubjects)
    .values({
      classId: class6A.id,
      subjectId: frSub.id,
      coefficient: '3.00',
      syncVersion: await nextSyncVersion(db),
    })
    .returning();
  if (!cs6AFr) throw new Error('cs6AFr insert failed');

  const [cs5BMath] = await db
    .insert(classSubjects)
    .values({
      classId: class5B.id,
      subjectId: mathSub.id,
      subjectGroupId: grpSci.id,
      coefficient: '4.00',
      syncVersion: await nextSyncVersion(db),
    })
    .returning();
  if (!cs5BMath) throw new Error('cs5BMath insert failed');

  const [assignMath6A] = await db
    .insert(teacherAssignments)
    .values({
      teacherId: teacherMathUser.id,
      classSubjectId: cs6AMath.id,
      academicYearId: year.id,
      isActive: true,
      syncVersion: await nextSyncVersion(db),
    })
    .returning();
  if (!assignMath6A) throw new Error('assignMath6A insert failed');

  await db.insert(teacherAssignments).values({
    teacherId: teacherFrUser.id,
    classSubjectId: cs6AFr.id,
    academicYearId: year.id,
    isActive: true,
    syncVersion: await nextSyncVersion(db),
  });

  await db.insert(teacherAssignments).values({
    teacherId: teacherFrUser.id,
    classSubjectId: cs5BMath.id,
    academicYearId: year.id,
    isActive: true,
    syncVersion: await nextSyncVersion(db),
  });

  const [studentAlice] = await db
    .insert(students)
    .values({
      matricule: '25L001',
      lastName: 'ABENA',
      firstName: 'Alice',
      birthDate: '2013-04-12',
      birthPlace: 'Yaoundé',
      sex: 'F',
      syncVersion: await nextSyncVersion(db),
    })
    .returning();
  if (!studentAlice) throw new Error('Alice insert failed');

  const [studentBob] = await db
    .insert(students)
    .values({
      matricule: '25L002',
      lastName: 'BIYA',
      firstName: 'Bob',
      birthDate: '2013-09-21',
      birthPlace: 'Douala',
      sex: 'M',
      syncVersion: await nextSyncVersion(db),
    })
    .returning();
  if (!studentBob) throw new Error('Bob insert failed');

  const [studentCharlie] = await db
    .insert(students)
    .values({
      matricule: '25L003',
      lastName: 'CHOUA',
      firstName: 'Charlie',
      birthDate: '2012-01-15',
      birthPlace: 'Bafoussam',
      sex: 'M',
      syncVersion: await nextSyncVersion(db),
    })
    .returning();
  if (!studentCharlie) throw new Error('Charlie insert failed');

  const [enrAlice] = await db
    .insert(enrollments)
    .values({
      studentId: studentAlice.id,
      classId: class6A.id,
      academicYearId: year.id,
      status: 'active',
      syncVersion: await nextSyncVersion(db),
    })
    .returning();
  if (!enrAlice) throw new Error('enrAlice insert failed');

  const [enrBob] = await db
    .insert(enrollments)
    .values({
      studentId: studentBob.id,
      classId: class6A.id,
      academicYearId: year.id,
      status: 'active',
      syncVersion: await nextSyncVersion(db),
    })
    .returning();
  if (!enrBob) throw new Error('enrBob insert failed');

  const [enrCharlie] = await db
    .insert(enrollments)
    .values({
      studentId: studentCharlie.id,
      classId: class5B.id,
      academicYearId: year.id,
      status: 'active',
      syncVersion: await nextSyncVersion(db),
    })
    .returning();
  if (!enrCharlie) throw new Error('enrCharlie insert failed');

  return {
    dbHandle,
    fx: {
      app,
      db,
      yearId: year.id,
      trimester1Id: trimester1.id,
      seq1Id: seq1.id,
      seq2Id: seq2.id,
      class6AId: class6A.id,
      class5BId: class5B.id,
      mathSubjectId: mathSub.id,
      frSubjectId: frSub.id,
      cs6AMathId: cs6AMath.id,
      cs6AFrId: cs6AFr.id,
      cs5BMathId: cs5BMath.id,
      enrAliceId: enrAlice.id,
      enrBobId: enrBob.id,
      enrCharlieId: enrCharlie.id,
      studentAliceId: studentAlice.id,
      studentBobId: studentBob.id,
      studentCharlieId: studentCharlie.id,
      adminUser,
      censorUser,
      principalUser,
      teacherMathUser,
      teacherFrUser,
      secretaryUser,
      assignmentMath6AId: assignMath6A.id,
    },
  };
}

describe('Grades, Offline Sync, Period Locking & Council Decisions', () => {
  let dbHandle: TestDbHandle;
  let fx: TestFixture;

  beforeEach(async () => {
    const setup = await seedFixture();
    dbHandle = setup.dbHandle;
    fx = setup.fx;
  });

  afterEach(async () => {
    await fx.app.close();
    await dbHandle.close();
  });

  describe('Grades CRUD & Audit Trail', () => {
    it('allows assigned teacher to bulk upsert grades, updates previousScore->newScore in audit logs, and returns newest first', async () => {
      // Initial entry
      const res1 = await fx.app.inject({
        method: 'PUT',
        url: '/api/grades/bulk',
        headers: { authorization: `Bearer ${fx.teacherMathUser.token}` },
        payload: {
          entries: [
            {
              enrollmentId: fx.enrAliceId,
              classSubjectId: fx.cs6AMathId,
              periodId: fx.seq1Id,
              score: 14.5,
              status: 'present',
              reason: 'Saisie initiale',
            },
            {
              enrollmentId: fx.enrBobId,
              classSubjectId: fx.cs6AMathId,
              periodId: fx.seq1Id,
              score: null,
              status: 'absent',
              reason: 'Absent au devoir',
            },
          ],
        },
      });

      expect(res1.statusCode).toBe(200);
      const body1 = res1.json();
      expect(body1.count).toBe(2);
      expect(body1.grades[0].score).toBe(14.5);

      // Update Alice's grade
      const res2 = await fx.app.inject({
        method: 'PUT',
        url: '/api/grades/bulk',
        headers: { authorization: `Bearer ${fx.censorUser.token}` },
        payload: {
          entries: [
            {
              enrollmentId: fx.enrAliceId,
              classSubjectId: fx.cs6AMathId,
              periodId: fx.seq1Id,
              score: 16.25,
              status: 'present',
              reason: 'Recomptage copie',
            },
          ],
        },
      });
      expect(res2.statusCode).toBe(200);

      // Teacher reads grades for their assigned classSubject
      const getRes = await fx.app.inject({
        method: 'GET',
        url: `/api/grades?classId=${fx.class6AId}&classSubjectId=${fx.cs6AMathId}&periodId=${fx.seq1Id}`,
        headers: { authorization: `Bearer ${fx.teacherMathUser.token}` },
      });
      expect(getRes.statusCode).toBe(200);
      const gradesList = getRes.json().grades;
      expect(gradesList).toHaveLength(2);
      expect(gradesList.find((g: { enrollmentId: string }) => g.enrollmentId === fx.enrAliceId).score).toBe(16.25);

      // Audit logs (admin/censor/principal) ordered newest first with classId filter
      const auditRes = await fx.app.inject({
        method: 'GET',
        url: `/api/grades/audit?classId=${fx.class6AId}&enrollmentId=${fx.enrAliceId}&periodId=${fx.seq1Id}`,
        headers: { authorization: `Bearer ${fx.principalUser.token}` },
      });
      expect(auditRes.statusCode).toBe(200);
      const logs = auditRes.json().logs;
      expect(logs).toHaveLength(2);
      // Newest first
      expect(logs[0].previousScore).toBe(14.5);
      expect(logs[0].newScore).toBe(16.25);
      expect(logs[0].reason).toBe('Recomptage copie');
      expect(logs[1].previousScore).toBeNull();
      expect(logs[1].newScore).toBe(14.5);

      // Teacher and secretary cannot read audit logs
      const teacherAudit = await fx.app.inject({
        method: 'GET',
        url: '/api/grades/audit',
        headers: { authorization: `Bearer ${fx.teacherMathUser.token}` },
      });
      expect(teacherAudit.statusCode).toBe(403);
    });

    it('rolls back entire grades/bulk batch when any entry targets a locked period', async () => {
      // Lock SEQ1
      await fx.app.inject({
        method: 'POST',
        url: `/api/periods/${fx.seq1Id}/lock`,
        headers: { authorization: `Bearer ${fx.adminUser.token}` },
      });

      // Attempt bulk upsert mixing open SEQ2 and locked SEQ1 -> whole transaction rolls back
      const res = await fx.app.inject({
        method: 'PUT',
        url: '/api/grades/bulk',
        headers: { authorization: `Bearer ${fx.adminUser.token}` },
        payload: {
          entries: [
            {
              enrollmentId: fx.enrAliceId,
              classSubjectId: fx.cs6AMathId,
              periodId: fx.seq2Id,
              score: 18,
              status: 'present',
            },
            {
              enrollmentId: fx.enrAliceId,
              classSubjectId: fx.cs6AMathId,
              periodId: fx.seq1Id,
              score: 15,
              status: 'present',
            },
          ],
        },
      });
      expect(res.statusCode).toBe(409);

      const seq2Grades = await fx.db.select().from(grades).where(eq(grades.periodId, fx.seq2Id));
      expect(seq2Grades).toHaveLength(0);
    });

    it('rejects teacher reading or writing grades for unassigned classSubject, and rejects invalid enrollment/period', async () => {
      // Teacher Math cannot read French grades
      const getForbidden = await fx.app.inject({
        method: 'GET',
        url: `/api/grades?classSubjectId=${fx.cs6AFrId}&periodId=${fx.seq1Id}`,
        headers: { authorization: `Bearer ${fx.teacherMathUser.token}` },
      });
      expect(getForbidden.statusCode).toBe(403);

      // Teacher Math cannot write French grades
      const putForbidden = await fx.app.inject({
        method: 'PUT',
        url: '/api/grades/bulk',
        headers: { authorization: `Bearer ${fx.teacherMathUser.token}` },
        payload: {
          entries: [
            {
              enrollmentId: fx.enrAliceId,
              classSubjectId: fx.cs6AFrId,
              periodId: fx.seq1Id,
              score: 12,
              status: 'present',
            },
          ],
        },
      });
      expect(putForbidden.statusCode).toBe(403);

      // Secretary cannot write grades
      const secForbidden = await fx.app.inject({
        method: 'PUT',
        url: '/api/grades/bulk',
        headers: { authorization: `Bearer ${fx.secretaryUser.token}` },
        payload: {
          entries: [
            {
              enrollmentId: fx.enrAliceId,
              classSubjectId: fx.cs6AMathId,
              periodId: fx.seq1Id,
              score: 12,
              status: 'present',
            },
          ],
        },
      });
      expect(secForbidden.statusCode).toBe(403);

      // Cross-class enrollment mismatch (Charlie is in 5B, cs6AMath is in 6A)
      const mismatchRes = await fx.app.inject({
        method: 'PUT',
        url: '/api/grades/bulk',
        headers: { authorization: `Bearer ${fx.adminUser.token}` },
        payload: {
          entries: [
            {
              enrollmentId: fx.enrCharlieId,
              classSubjectId: fx.cs6AMathId,
              periodId: fx.seq1Id,
              score: 11,
              status: 'present',
            },
          ],
        },
      });
      expect(mismatchRes.statusCode).toBe(400);

      // Trimester period cannot take direct grades
      const trimesterRes = await fx.app.inject({
        method: 'PUT',
        url: '/api/grades/bulk',
        headers: { authorization: `Bearer ${fx.adminUser.token}` },
        payload: {
          entries: [
            {
              enrollmentId: fx.enrAliceId,
              classSubjectId: fx.cs6AMathId,
              periodId: fx.trimester1Id,
              score: 11,
              status: 'present',
            },
          ],
        },
      });
      expect(trimesterRes.statusCode).toBe(400);
    });
  });

  describe('Offline Sync (Pull & Push)', () => {
    it('handles applied, duplicate on replay, rejected_forbidden, and rejected_locked independently in the same push batch', async () => {
      // Lock SEQ1 first
      const lockRes = await fx.app.inject({
        method: 'POST',
        url: `/api/periods/${fx.seq1Id}/lock`,
        headers: { authorization: `Bearer ${fx.censorUser.token}` },
      });
      expect(lockRes.statusCode).toBe(200);

      const opLockedId = randomUUID();
      const opOpenId = randomUUID();
      const opForbiddenId = randomUUID();
      const opValidationId = randomUUID();
      const ts = new Date().toISOString();

      const pushRes = await fx.app.inject({
        method: 'POST',
        url: '/api/sync/push',
        headers: { authorization: `Bearer ${fx.teacherMathUser.token}` },
        payload: {
          operations: [
            {
              operationId: opLockedId,
              type: 'UPSERT_GRADE',
              clientTimestamp: ts,
              payload: {
                enrollmentId: fx.enrAliceId,
                classSubjectId: fx.cs6AMathId,
                periodId: fx.seq1Id,
                score: 15,
                status: 'present',
              },
            },
            {
              operationId: opOpenId,
              type: 'UPSERT_GRADE',
              clientTimestamp: ts,
              payload: {
                enrollmentId: fx.enrAliceId,
                classSubjectId: fx.cs6AMathId,
                periodId: fx.seq2Id,
                score: 17.5,
                status: 'present',
                reason: 'Sync hors-ligne SEQ2',
              },
            },
            {
              operationId: opForbiddenId,
              type: 'UPSERT_GRADE',
              clientTimestamp: ts,
              payload: {
                enrollmentId: fx.enrAliceId,
                classSubjectId: fx.cs6AFrId,
                periodId: fx.seq2Id,
                score: 13,
                status: 'present',
              },
            },
            {
              operationId: opValidationId,
              type: 'UPSERT_GRADE',
              clientTimestamp: ts,
              payload: {
                enrollmentId: fx.enrCharlieId,
                classSubjectId: fx.cs6AMathId,
                periodId: fx.seq2Id,
                score: 10,
                status: 'present',
              },
            },
          ],
        },
      });

      expect(pushRes.statusCode).toBe(200);
      const results = pushRes.json().results;
      expect(results).toHaveLength(4);

      expect(results[0]).toMatchObject({
        operationId: opLockedId,
        outcome: 'rejected_locked',
      });
      expect(results[0].errorMessage).toContain('verrouillée');

      expect(results[1]).toMatchObject({
        operationId: opOpenId,
        outcome: 'applied',
      });
      expect(results[1].gradeId).toBeTruthy();
      expect(results[1].syncVersion).toBeGreaterThan(0);

      expect(results[2]).toMatchObject({
        operationId: opForbiddenId,
        outcome: 'rejected_forbidden',
      });

      expect(results[3]).toMatchObject({
        operationId: opValidationId,
        outcome: 'rejected_validation',
      });

      // Verify grade and audit log created for opOpenId
      const [auditRow] = await fx.db
        .select()
        .from(gradeAuditLogs)
        .where(eq(gradeAuditLogs.operationId, opOpenId));
      expect(auditRow).toBeDefined();
      expect(Number(auditRow?.newScore)).toBe(17.5);
      expect(auditRow?.clientTimestamp).not.toBeNull();

      // Replay the same operations -> duplicate outcome
      const replayRes = await fx.app.inject({
        method: 'POST',
        url: '/api/sync/push',
        headers: { authorization: `Bearer ${fx.teacherMathUser.token}` },
        payload: {
          operations: [
            {
              operationId: opOpenId,
              type: 'UPSERT_GRADE',
              clientTimestamp: ts,
              payload: {
                enrollmentId: fx.enrAliceId,
                classSubjectId: fx.cs6AMathId,
                periodId: fx.seq2Id,
                score: 17.5,
                status: 'present',
              },
            },
          ],
        },
      });
      expect(replayRes.statusCode).toBe(200);
      expect(replayRes.json().results[0]).toEqual({
        operationId: opOpenId,
        outcome: 'duplicate',
        entityId: results[1].gradeId,
      });

      // Secretary is blocked by route guard from sync/push (403)
      const secOpId = randomUUID();
      const secPush = await fx.app.inject({
        method: 'POST',
        url: '/api/sync/push',
        headers: { authorization: `Bearer ${fx.secretaryUser.token}` },
        payload: {
          operations: [
            {
              operationId: secOpId,
              type: 'UPSERT_GRADE',
              clientTimestamp: ts,
              payload: {
                enrollmentId: fx.enrAliceId,
                classSubjectId: fx.cs6AMathId,
                periodId: fx.seq2Id,
                score: 12,
                status: 'present',
              },
            },
          ],
        },
      });
      expect(secPush.statusCode).toBe(403);

      const opsRows = await fx.db.select().from(syncOperations);
      expect(opsRows).toHaveLength(4);
    });

    it('enforces strict role isolation and incremental cursor filtering on sync/pull', async () => {
      // Add a grade for 5B Math (assigned to teacherFr, NOT teacherMath) and 6A Math (assigned to teacherMath)
      await fx.app.inject({
        method: 'PUT',
        url: '/api/grades/bulk',
        headers: { authorization: `Bearer ${fx.adminUser.token}` },
        payload: {
          entries: [
            {
              enrollmentId: fx.enrAliceId,
              classSubjectId: fx.cs6AMathId,
              periodId: fx.seq1Id,
              score: 14,
              status: 'present',
            },
            {
              enrollmentId: fx.enrCharlieId,
              classSubjectId: fx.cs5BMathId,
              periodId: fx.seq1Id,
              score: 11,
              status: 'present',
            },
          ],
        },
      });

      // Full pull for teacherMath
      const pull1 = await fx.app.inject({
        method: 'GET',
        url: '/api/sync/pull?since=0',
        headers: { authorization: `Bearer ${fx.teacherMathUser.token}` },
      });
      expect(pull1.statusCode).toBe(200);
      const data1 = pull1.json();

      // teacherMath only sees class 6A, classSubject cs6AMath, students Alice & Bob (NOT Charlie or 5B)
      expect(data1.classes.map((c: { id: string }) => c.id)).toEqual([fx.class6AId]);
      expect(data1.classSubjects.map((cs: { id: string }) => cs.id)).toEqual([fx.cs6AMathId]);
      expect(data1.students.map((s: { id: string }) => s.id).sort()).toEqual(
        [fx.studentAliceId, fx.studentBobId].sort(),
      );
      expect(data1.grades).toHaveLength(1);
      expect(data1.grades[0].classSubjectId).toBe(fx.cs6AMathId);

      const cursor1: number = data1.latestCursor;
      expect(cursor1).toBeGreaterThan(0);

      // Pull again at cursor1 -> nothing changed -> latestCursor === cursor1
      const pull2 = await fx.app.inject({
        method: 'GET',
        url: `/api/sync/pull?since=${cursor1}`,
        headers: { authorization: `Bearer ${fx.teacherMathUser.token}` },
      });
      expect(pull2.statusCode).toBe(200);
      const data2 = pull2.json();
      expect(data2.grades).toHaveLength(0);
      expect(data2.classes).toHaveLength(0);
      expect(data2.latestCursor).toBe(cursor1);

      // Update Bob's grade and deactivate teacherMath's assignment -> incremental pull sees deactivated assignment
      await fx.app.inject({
        method: 'PUT',
        url: '/api/grades/bulk',
        headers: { authorization: `Bearer ${fx.adminUser.token}` },
        payload: {
          entries: [
            {
              enrollmentId: fx.enrBobId,
              classSubjectId: fx.cs6AMathId,
              periodId: fx.seq1Id,
              score: 18,
              status: 'present',
            },
          ],
        },
      });

      const vDeactivate = await nextSyncVersion(fx.db);
      await fx.db
        .update(teacherAssignments)
        .set({ isActive: false, syncVersion: vDeactivate, updatedAt: new Date() })
        .where(eq(teacherAssignments.id, fx.assignmentMath6AId));

      const pull3 = await fx.app.inject({
        method: 'GET',
        url: `/api/sync/pull?since=${cursor1}`,
        headers: { authorization: `Bearer ${fx.teacherMathUser.token}` },
      });
      expect(pull3.statusCode).toBe(200);
      const data3 = pull3.json();
      // Deactivated assignment IS returned so PWA removes revoked class
      expect(data3.teacherAssignments).toHaveLength(1);
      expect(data3.teacherAssignments[0].isActive).toBe(false);
      // Since assignment is now inactive, grades/classes belonging to active assignments are empty
      expect(data3.grades).toHaveLength(0);
      expect(data3.latestCursor).toBe(vDeactivate);

      // Secretary sees school structure/rosters without raw grades, assignments, or council decisions (SEC-MED-11)
      const secretaryPull = await fx.app.inject({
        method: 'GET',
        url: '/api/sync/pull?since=0',
        headers: { authorization: `Bearer ${fx.secretaryUser.token}` },
      });
      expect(secretaryPull.statusCode).toBe(200);
      expect(secretaryPull.json().classes).toHaveLength(2);
      expect(secretaryPull.json().grades).toHaveLength(0);
      expect(secretaryPull.json().teacherAssignments).toHaveLength(0);
      expect(secretaryPull.json().councilDecisions).toHaveLength(0);

      // Admin sees school-wide records including grades
      const adminPull = await fx.app.inject({
        method: 'GET',
        url: '/api/sync/pull?since=0',
        headers: { authorization: `Bearer ${fx.adminUser.token}` },
      });
      expect(adminPull.statusCode).toBe(200);
      expect(adminPull.json().classes).toHaveLength(2);
      expect(adminPull.json().grades).toHaveLength(3);
    });
  });

  describe('Period Completeness, Locking, Exceptional Unlocking & Council Decisions', () => {
    it('reports completeness per class and classSubject', async () => {
      // Grade only Alice in 6A Math for SEQ1
      await fx.app.inject({
        method: 'PUT',
        url: '/api/grades/bulk',
        headers: { authorization: `Bearer ${fx.adminUser.token}` },
        payload: {
          entries: [
            {
              enrollmentId: fx.enrAliceId,
              classSubjectId: fx.cs6AMathId,
              periodId: fx.seq1Id,
              score: 15,
              status: 'present',
            },
          ],
        },
      });

      const compRes1 = await fx.app.inject({
        method: 'GET',
        url: `/api/periods/${fx.seq1Id}/completeness`,
        headers: { authorization: `Bearer ${fx.censorUser.token}` },
      });
      expect(compRes1.statusCode).toBe(200);
      const comp1 = compRes1.json();
      expect(comp1.isComplete).toBe(false);
      const cls6A = comp1.classes.find((c: { classId: string }) => c.classId === fx.class6AId);
      const mathStat = cls6A.subjects.find(
        (s: { classSubjectId: string }) => s.classSubjectId === fx.cs6AMathId,
      );
      expect(mathStat).toMatchObject({
        expectedStudents: 2,
        gradedCount: 1,
        missingCount: 1,
        isComplete: false,
      });

      // Grade remaining entries for all subjects across both classes
      await fx.app.inject({
        method: 'PUT',
        url: '/api/grades/bulk',
        headers: { authorization: `Bearer ${fx.adminUser.token}` },
        payload: {
          entries: [
            {
              enrollmentId: fx.enrBobId,
              classSubjectId: fx.cs6AMathId,
              periodId: fx.seq1Id,
              score: 12,
              status: 'present',
            },
            {
              enrollmentId: fx.enrAliceId,
              classSubjectId: fx.cs6AFrId,
              periodId: fx.seq1Id,
              score: 14,
              status: 'present',
            },
            {
              enrollmentId: fx.enrBobId,
              classSubjectId: fx.cs6AFrId,
              periodId: fx.seq1Id,
              score: 10,
              status: 'present',
            },
            {
              enrollmentId: fx.enrCharlieId,
              classSubjectId: fx.cs5BMathId,
              periodId: fx.seq1Id,
              score: 16,
              status: 'present',
            },
          ],
        },
      });

      const compRes2 = await fx.app.inject({
        method: 'GET',
        url: `/api/periods/${fx.seq1Id}/completeness`,
        headers: { authorization: `Bearer ${fx.principalUser.token}` },
      });
      expect(compRes2.statusCode).toBe(200);
      expect(compRes2.json().isComplete).toBe(true);
    });

    it('locks sequence, creates snapshot tables + audit log, blocks bulk edits with 409, and enforces unlock permissions & mandatory reason', async () => {
      // Populate grades for SEQ1
      await fx.app.inject({
        method: 'PUT',
        url: '/api/grades/bulk',
        headers: { authorization: `Bearer ${fx.adminUser.token}` },
        payload: {
          entries: [
            {
              enrollmentId: fx.enrAliceId,
              classSubjectId: fx.cs6AMathId,
              periodId: fx.seq1Id,
              score: 16,
              status: 'present',
            },
            {
              enrollmentId: fx.enrAliceId,
              classSubjectId: fx.cs6AFrId,
              periodId: fx.seq1Id,
              score: 12,
              status: 'present',
            },
            {
              enrollmentId: fx.enrBobId,
              classSubjectId: fx.cs6AMathId,
              periodId: fx.seq1Id,
              score: 8,
              status: 'present',
            },
            {
              enrollmentId: fx.enrBobId,
              classSubjectId: fx.cs6AFrId,
              periodId: fx.seq1Id,
              score: 10,
              status: 'present',
            },
            {
              enrollmentId: fx.enrCharlieId,
              classSubjectId: fx.cs5BMathId,
              periodId: fx.seq1Id,
              score: 14,
              status: 'present',
            },
          ],
        },
      });

      // Censor CAN lock SEQ1
      const lockRes = await fx.app.inject({
        method: 'POST',
        url: `/api/periods/${fx.seq1Id}/lock`,
        headers: { authorization: `Bearer ${fx.censorUser.token}` },
        payload: { reason: 'Validation conseil SEQ1' },
      });
      expect(lockRes.statusCode).toBe(200);
      expect(lockRes.json().period.status).toBe('locked');
      expect(lockRes.json().snapshots.studentResultsCount).toBe(3);
      expect(lockRes.json().snapshots.subjectResultsCount).toBe(5);

      // Verify snapshot rows in DB
      const studentSnapshots = await fx.db
        .select()
        .from(periodStudentResults)
        .where(eq(periodStudentResults.periodId, fx.seq1Id));
      expect(studentSnapshots).toHaveLength(3);

      const aliceSnap = studentSnapshots.find((s) => s.enrollmentId === fx.enrAliceId);
      // (16*4 + 12*3) / 7 = 100 / 7 = 14.29
      expect(Number(aliceSnap?.generalAverage)).toBe(14.29);
      expect(aliceSnap?.rank).toBe(1);
      expect(aliceSnap?.isHonorRoll).toBe(true);

      const subjectSnapshots = await fx.db
        .select()
        .from(periodSubjectResults)
        .where(eq(periodSubjectResults.periodId, fx.seq1Id));
      expect(subjectSnapshots).toHaveLength(5);

      // Verify period_audit_logs
      const lockLogs = await fx.db
        .select()
        .from(periodAuditLogs)
        .where(eq(periodAuditLogs.periodId, fx.seq1Id));
      expect(lockLogs).toHaveLength(1);
      expect(lockLogs[0]?.action).toBe('locked');

      // PUT /api/grades/bulk on locked period returns 409 ConflictError('Période verrouillée')
      const editLocked = await fx.app.inject({
        method: 'PUT',
        url: '/api/grades/bulk',
        headers: { authorization: `Bearer ${fx.adminUser.token}` },
        payload: {
          entries: [
            {
              enrollmentId: fx.enrAliceId,
              classSubjectId: fx.cs6AMathId,
              periodId: fx.seq1Id,
              score: 19,
              status: 'present',
            },
          ],
        },
      });
      expect(editLocked.statusCode).toBe(409);
      expect(editLocked.json().error.message).toBe('Période verrouillée');

      // Censor CANNOT unlock -> 403
      const censorUnlock = await fx.app.inject({
        method: 'POST',
        url: `/api/periods/${fx.seq1Id}/unlock`,
        headers: { authorization: `Bearer ${fx.censorUser.token}` },
        payload: { reason: 'Tentative censeur' },
      });
      expect(censorUnlock.statusCode).toBe(403);

      // Teacher CANNOT unlock -> 403
      const teacherUnlock = await fx.app.inject({
        method: 'POST',
        url: `/api/periods/${fx.seq1Id}/unlock`,
        headers: { authorization: `Bearer ${fx.teacherMathUser.token}` },
        payload: { reason: 'Tentative enseignant' },
      });
      expect(teacherUnlock.statusCode).toBe(403);

      // Principal unlocking without reason -> 400
      const missingReasonUnlock = await fx.app.inject({
        method: 'POST',
        url: `/api/periods/${fx.seq1Id}/unlock`,
        headers: { authorization: `Bearer ${fx.principalUser.token}` },
        payload: { reason: 'abc' },
      });
      expect(missingReasonUnlock.statusCode).toBe(400);

      // Principal unlocking with valid reason -> 200, deletes snapshots, logs 'unlocked'
      const validUnlock = await fx.app.inject({
        method: 'POST',
        url: `/api/periods/${fx.seq1Id}/unlock`,
        headers: { authorization: `Bearer ${fx.principalUser.token}` },
        payload: { reason: 'Correction erreur saisie copie Maths' },
      });
      expect(validUnlock.statusCode).toBe(200);
      expect(validUnlock.json().period.status).toBe('open');
      expect(validUnlock.json().period.lockedAt).toBeNull();

      const remainingStudentSnaps = await fx.db
        .select()
        .from(periodStudentResults)
        .where(eq(periodStudentResults.periodId, fx.seq1Id));
      expect(remainingStudentSnaps).toHaveLength(0);

      const remainingSubjectSnaps = await fx.db
        .select()
        .from(periodSubjectResults)
        .where(eq(periodSubjectResults.periodId, fx.seq1Id));
      expect(remainingSubjectSnaps).toHaveLength(0);

      // Re-lock and verify Admin can also unlock
      const relockRes = await fx.app.inject({
        method: 'POST',
        url: `/api/periods/${fx.seq1Id}/lock`,
        headers: { authorization: `Bearer ${fx.adminUser.token}` },
      });
      expect(relockRes.statusCode).toBe(200);

      const adminUnlock = await fx.app.inject({
        method: 'POST',
        url: `/api/periods/${fx.seq1Id}/unlock`,
        headers: { authorization: `Bearer ${fx.adminUser.token}` },
        payload: { reason: 'Déverrouillage exceptionnel par admin' },
      });
      expect(adminUnlock.statusCode).toBe(200);
      expect(adminUnlock.json().period.status).toBe('open');

      const allPeriodLogs = await fx.db
        .select()
        .from(periodAuditLogs)
        .where(eq(periodAuditLogs.periodId, fx.seq1Id))
        .orderBy(desc(periodAuditLogs.createdAt));
      expect(allPeriodLogs).toHaveLength(4);
      expect(allPeriodLogs.map((l) => l.action)).toContain('unlocked');
      expect(allPeriodLogs.map((l) => l.reason)).toContain('Correction erreur saisie copie Maths');
    });

    it('passes child sequences and their grades when locking a trimester period', async () => {
      const capturedInputs: Parameters<GradingCalculatorContract['computeClassResults']>[0][] = [];
      const spyCalculator: GradingCalculatorContract = {
        ...fallbackGradingCalculator,
        computeClassResults(input) {
          capturedInputs.push(input);
          return fallbackGradingCalculator.computeClassResults(input);
        },
      };

      const customApp = await buildApp(fx.db, spyCalculator);
      try {
        await customApp.inject({
          method: 'PUT',
          url: '/api/grades/bulk',
          headers: { authorization: `Bearer ${fx.adminUser.token}` },
          payload: {
            entries: [
              {
                enrollmentId: fx.enrAliceId,
                classSubjectId: fx.cs6AMathId,
                periodId: fx.seq1Id,
                score: 14,
                status: 'present',
              },
              {
                enrollmentId: fx.enrAliceId,
                classSubjectId: fx.cs6AMathId,
                periodId: fx.seq2Id,
                score: 16,
                status: 'present',
              },
            ],
          },
        });

        const lockTrimesterRes = await customApp.inject({
          method: 'POST',
          url: `/api/periods/${fx.trimester1Id}/lock`,
          headers: { authorization: `Bearer ${fx.adminUser.token}` },
        });
        expect(lockTrimesterRes.statusCode).toBe(200);
        expect(lockTrimesterRes.json().period.status).toBe('locked');

        const class6AInput = capturedInputs.find((i) => i.enrollmentIds.includes(fx.enrAliceId));
        expect(class6AInput).toBeDefined();
        expect(class6AInput?.targetPeriodType).toBe('trimester');
        expect(class6AInput?.periods.map((p) => p.id)).toContain(fx.seq1Id);
        expect(class6AInput?.periods.map((p) => p.id)).toContain(fx.seq2Id);
        expect(class6AInput?.grades).toHaveLength(2);
        expect(class6AInput?.grades.map((g) => g.periodId).sort()).toEqual([fx.seq1Id, fx.seq2Id].sort());
      } finally {
        await customApp.close();
      }
    });

    it('manages council decisions bulk upsert and role-scoped listing', async () => {
      const putRes = await fx.app.inject({
        method: 'PUT',
        url: '/api/council-decisions/bulk',
        headers: { authorization: `Bearer ${fx.censorUser.token}` },
        payload: {
          decisions: [
            {
              enrollmentId: fx.enrAliceId,
              periodId: fx.trimester1Id,
              generalAppreciation: 'Excellent trimestre, élève sérieuse.',
              decision: 'congratulations',
              absencesHours: 2,
            },
            {
              enrollmentId: fx.enrCharlieId,
              periodId: fx.trimester1Id,
              generalAppreciation: 'Peut mieux faire.',
              decision: 'encouragement',
              absencesHours: 6,
            },
          ],
        },
      });
      expect(putRes.statusCode).toBe(200);
      expect(putRes.json().count).toBe(2);

      // Teacher cannot write council decisions
      const teacherPut = await fx.app.inject({
        method: 'PUT',
        url: '/api/council-decisions/bulk',
        headers: { authorization: `Bearer ${fx.teacherMathUser.token}` },
        payload: {
          decisions: [
            {
              enrollmentId: fx.enrAliceId,
              periodId: fx.trimester1Id,
              generalAppreciation: 'Test',
              decision: 'honor_roll',
              absencesHours: 0,
            },
          ],
        },
      });
      expect(teacherPut.statusCode).toBe(403);

      // Admin sees all decisions for trimester
      const adminList = await fx.app.inject({
        method: 'GET',
        url: `/api/council-decisions?periodId=${fx.trimester1Id}`,
        headers: { authorization: `Bearer ${fx.adminUser.token}` },
      });
      expect(adminList.statusCode).toBe(200);
      expect(adminList.json().decisions).toHaveLength(2);

      // teacherMath (mainTeacherId of class 6A) sees class 6A (Alice), not 5B (Charlie)
      const teacherList = await fx.app.inject({
        method: 'GET',
        url: `/api/council-decisions?periodId=${fx.trimester1Id}`,
        headers: { authorization: `Bearer ${fx.teacherMathUser.token}` },
      });
      expect(teacherList.statusCode).toBe(200);
      expect(teacherList.json().decisions).toHaveLength(1);
      expect(teacherList.json().decisions[0].enrollmentId).toBe(fx.enrAliceId);

      // teacherFr is only a subject teacher (not mainTeacherId of any class) -> sees [] globally and 403 for classId
      const subjectTeacherList = await fx.app.inject({
        method: 'GET',
        url: `/api/council-decisions?periodId=${fx.trimester1Id}`,
        headers: { authorization: `Bearer ${fx.teacherFrUser.token}` },
      });
      expect(subjectTeacherList.statusCode).toBe(200);
      expect(subjectTeacherList.json().decisions).toHaveLength(0);

      const subjectTeacherClassList = await fx.app.inject({
        method: 'GET',
        url: `/api/council-decisions?classId=${fx.class6AId}`,
        headers: { authorization: `Bearer ${fx.teacherFrUser.token}` },
      });
      expect(subjectTeacherClassList.statusCode).toBe(403);
    });
  });
});
