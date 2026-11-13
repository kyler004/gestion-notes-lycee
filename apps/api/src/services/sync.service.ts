import type {
  AppreciationBand,
  AuthUserPayload,
  CouncilDecisionType,
  EnrollmentStatus,
  GradeStatus,
  PeriodStatus,
  PeriodType,
  StudentSex,
  SyncOutcome,
} from '@lycee/shared';
import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';
import { acquireSyncWriteLock, type DbClient, nextSyncVersion } from '../db/client.js';
import {
  academicYears,
  classSubjects,
  classes,
  councilDecisions,
  enrollments,
  gradeAuditLogs,
  grades,
  gradingRules,
  periods,
  students,
  subjectGroups,
  subjects,
  syncOperations,
  teacherAssignments,
} from '../db/schema.js';
import { ForbiddenError, NotFoundError } from '../lib/errors.js';
import { nextAuditTimestamp } from './grades.service.js';

export interface SyncPullQuery {
  since: number;
  academicYearId?: string;
  limit?: number;
}

export interface SyncGradePushOperation {
  operationId: string;
  type: 'UPSERT_GRADE';
  clientTimestamp: string;
  payload: {
    enrollmentId: string;
    classSubjectId: string;
    periodId: string;
    score: number | null;
    status: GradeStatus;
    appreciation?: string | null;
    reason?: string;
  };
}

export interface SyncPushOperationResult {
  operationId: string;
  outcome: SyncOutcome;
  gradeId?: string;
  entityId?: string | null;
  syncVersion?: number;
  errorMessage?: string;
}

export interface SyncPullPayload {
  academicYearId: string;
  academicYear: {
    id: string;
    label: string;
    startDate: string;
    endDate: string;
    isActive: boolean;
    syncVersion: number;
  };
  since: number;
  latestCursor: number;
  hasMore: boolean;
  teacherAssignments: Array<{
    id: string;
    teacherId: string;
    classSubjectId: string;
    academicYearId: string;
    isActive: boolean;
    syncVersion: number;
    createdAt: string;
    updatedAt: string;
  }>;
  classes: Array<{
    id: string;
    academicYearId: string;
    name: string;
    level: string;
    series: string | null;
    mainTeacherId: string | null;
    syncVersion: number;
    updatedAt: string;
  }>;
  classSubjects: Array<{
    id: string;
    classId: string;
    subjectId: string;
    subjectGroupId: string | null;
    coefficient: number;
    syncVersion: number;
    updatedAt: string;
  }>;
  enrollments: Array<{
    id: string;
    studentId: string;
    classId: string;
    academicYearId: string;
    isRepeater: boolean;
    status: EnrollmentStatus;
    syncVersion: number;
    enrolledAt: string;
    updatedAt: string;
  }>;
  students: Array<{
    id: string;
    matricule: string;
    lastName: string;
    firstName: string;
    birthDate: string;
    birthPlace: string;
    sex: StudentSex;
    syncVersion: number;
    createdAt: string;
    updatedAt: string;
  }>;
  grades: Array<{
    id: string;
    enrollmentId: string;
    classSubjectId: string;
    periodId: string;
    score: number | null;
    status: GradeStatus;
    appreciation: string | null;
    enteredBy: string;
    syncVersion: number;
    createdAt: string;
    updatedAt: string;
  }>;
  periods: Array<{
    id: string;
    academicYearId: string;
    parentPeriodId: string | null;
    type: PeriodType;
    code: string;
    name: string;
    orderIndex: number;
    weight: number;
    status: PeriodStatus;
    lockedAt: string | null;
    lockedBy: string | null;
    syncVersion: number;
    updatedAt: string;
  }>;
  subjects: Array<{
    id: string;
    code: string;
    name: string;
    shortName: string;
    isActive: boolean;
    syncVersion: number;
    updatedAt: string;
  }>;
  subjectGroups: Array<{
    id: string;
    academicYearId: string;
    name: string;
    orderIndex: number;
    syncVersion: number;
  }>;
  gradingRules: Array<{
    id: string;
    academicYearId: string;
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
    syncVersion: number;
    updatedAt: string;
  }>;
  councilDecisions: Array<{
    id: string;
    enrollmentId: string;
    periodId: string;
    generalAppreciation: string;
    decision: CouncilDecisionType;
    absencesHours: number;
    decidedBy: string;
    syncVersion: number;
    updatedAt: string;
  }>;
}

const MIN_CLIENT_TIMESTAMP_MS = Date.UTC(2020, 0, 1);
const MAX_CLIENT_CLOCK_SKEW_MS = 5 * 60_000;

function computeOverflowCutoff<T extends { syncVersion: number }>(
  rows: T[],
  since: number,
  limit: number,
): { overflow: boolean; cutoff: number | null } {
  const deltas = rows.filter((row) => row.syncVersion > since);
  if (deltas.length <= limit) {
    return { overflow: false, cutoff: null };
  }

  const nth = deltas[limit - 1];
  const next = deltas[limit];
  const first = deltas[0];
  if (!nth || !next || !first) {
    return { overflow: false, cutoff: null };
  }

  if (next.syncVersion > nth.syncVersion) {
    return { overflow: true, cutoff: nth.syncVersion };
  }
  if (nth.syncVersion > first.syncVersion) {
    return { overflow: true, cutoff: nth.syncVersion - 1 };
  }
  return { overflow: true, cutoff: null };
}

function trimWithCutoff<T extends { syncVersion: number }>(
  rows: T[],
  since: number,
  safeCutoff: number | null,
  limit: number,
): T[] {
  const backfill = rows.filter((row) => row.syncVersion <= since);
  let deltas = rows.filter((row) => row.syncVersion > since);

  if (safeCutoff !== null) {
    deltas = deltas.filter((row) => row.syncVersion <= safeCutoff);
  }
  if (deltas.length > limit) {
    deltas = deltas.slice(0, limit);
  }

  return [...backfill, ...deltas];
}

export function createSyncService(db: DbClient) {
  async function pull(currentUser: AuthUserPayload, query: SyncPullQuery): Promise<SyncPullPayload> {
    if (
      currentUser.role !== 'teacher' &&
      currentUser.role !== 'secretary' &&
      currentUser.role !== 'admin' &&
      currentUser.role !== 'censor' &&
      currentUser.role !== 'principal'
    ) {
      throw new ForbiddenError('Accès refusé.');
    }

    const since = query.since;
    const limit = Math.min(Math.max(query.limit ?? 1000, 1), 2000);

    return db.transaction(async (tx) => {
      // Snapshot consistent across all table reads in sync/pull (SEC-HIGH-10).
      await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`);

      const [year] = query.academicYearId
        ? await tx.select().from(academicYears).where(eq(academicYears.id, query.academicYearId)).limit(1)
        : await tx.select().from(academicYears).where(eq(academicYears.isActive, true)).limit(1);

      if (!year) {
        throw new NotFoundError(
          query.academicYearId ? 'Année scolaire introuvable.' : 'Aucune année scolaire active trouvée.',
        );
      }

      const [periodRowsRaw, subjectRowsRaw, subjectGroupRowsRaw, gradingRuleRowsRaw] = await Promise.all([
        tx
          .select()
          .from(periods)
          .where(and(eq(periods.academicYearId, year.id), gt(periods.syncVersion, since)))
          .orderBy(asc(periods.syncVersion), asc(periods.id))
          .limit(limit + 1),
        tx
          .select()
          .from(subjects)
          .where(gt(subjects.syncVersion, since))
          .orderBy(asc(subjects.syncVersion), asc(subjects.id))
          .limit(limit + 1),
        tx
          .select()
          .from(subjectGroups)
          .where(and(eq(subjectGroups.academicYearId, year.id), gt(subjectGroups.syncVersion, since)))
          .orderBy(asc(subjectGroups.syncVersion), asc(subjectGroups.id))
          .limit(limit + 1),
        tx
          .select()
          .from(gradingRules)
          .where(and(eq(gradingRules.academicYearId, year.id), gt(gradingRules.syncVersion, since)))
          .orderBy(asc(gradingRules.syncVersion), asc(gradingRules.id))
          .limit(limit + 1),
      ]);

      let teacherAssignmentRowsRaw: Array<typeof teacherAssignments.$inferSelect> = [];
      let classRowsRaw: Array<typeof classes.$inferSelect> = [];
      let classSubjectRowsRaw: Array<typeof classSubjects.$inferSelect> = [];
      let enrollmentRowsRaw: Array<typeof enrollments.$inferSelect> = [];
      let studentRowsRaw: Array<typeof students.$inferSelect> = [];
      let gradeRowsRaw: Array<typeof grades.$inferSelect> = [];
      let councilDecisionRowsRaw: Array<typeof councilDecisions.$inferSelect> = [];

      if (currentUser.role === 'teacher') {
        const allTeacherAssignments = await tx
          .select()
          .from(teacherAssignments)
          .where(and(eq(teacherAssignments.teacherId, currentUser.id), eq(teacherAssignments.academicYearId, year.id)))
          .orderBy(asc(teacherAssignments.syncVersion), asc(teacherAssignments.id));

        // Include deactivated assignments where syncVersion > since so PWA removes revoked assignments.
        teacherAssignmentRowsRaw = allTeacherAssignments.filter((a) => a.syncVersion > since);

        const activeAssignments = allTeacherAssignments.filter((a) => a.isActive);
        const activeClassSubjectIds = activeAssignments.map((a) => a.classSubjectId);
        const newlyAssignedCsIds = new Set(
          activeAssignments.filter((a) => a.syncVersion > since).map((a) => a.classSubjectId),
        );

        if (activeClassSubjectIds.length > 0) {
          const activeClassSubjectsAll = await tx
            .select()
            .from(classSubjects)
            .where(inArray(classSubjects.id, activeClassSubjectIds))
            .orderBy(asc(classSubjects.syncVersion), asc(classSubjects.id));

          // Backfill classSubject, class, enrollments, students, and grades when a new assignment enters scope (SEC-MED-12).
          classSubjectRowsRaw = activeClassSubjectsAll.filter(
            (cs) => cs.syncVersion > since || newlyAssignedCsIds.has(cs.id),
          );

          const activeClassIds = [...new Set(activeClassSubjectsAll.map((cs) => cs.classId))];
          const newlyAssignedClassIds = new Set(
            activeClassSubjectsAll.filter((cs) => newlyAssignedCsIds.has(cs.id)).map((cs) => cs.classId),
          );

          if (activeClassIds.length > 0) {
            const activeClassesAll = await tx
              .select()
              .from(classes)
              .where(and(eq(classes.academicYearId, year.id), inArray(classes.id, activeClassIds)))
              .orderBy(asc(classes.syncVersion), asc(classes.id));

            classRowsRaw = activeClassesAll.filter(
              (c) => c.syncVersion > since || newlyAssignedClassIds.has(c.id),
            );

            const activeEnrollmentsAll = await tx
              .select()
              .from(enrollments)
              .where(and(eq(enrollments.academicYearId, year.id), inArray(enrollments.classId, activeClassIds)))
              .orderBy(asc(enrollments.syncVersion), asc(enrollments.id));

            enrollmentRowsRaw = activeEnrollmentsAll.filter(
              (e) => e.syncVersion > since || newlyAssignedClassIds.has(e.classId),
            );

            const newlyScopedEnrollmentIds = new Set(enrollmentRowsRaw.map((e) => e.id));
            const backfillStudentIds = new Set(enrollmentRowsRaw.map((e) => e.studentId));
            const activeStudentIds = [...new Set(activeEnrollmentsAll.map((e) => e.studentId))];

            if (activeStudentIds.length > 0) {
              const activeStudentsAll = await tx
                .select()
                .from(students)
                .where(inArray(students.id, activeStudentIds))
                .orderBy(asc(students.syncVersion), asc(students.id));

              studentRowsRaw = activeStudentsAll.filter(
                (s) => s.syncVersion > since || backfillStudentIds.has(s.id),
              );
            }

            const joinedGrades = await tx
              .select({ grade: grades })
              .from(grades)
              .innerJoin(periods, eq(grades.periodId, periods.id))
              .where(
                and(
                  eq(periods.academicYearId, year.id),
                  inArray(grades.classSubjectId, activeClassSubjectIds),
                ),
              )
              .orderBy(asc(grades.syncVersion), asc(grades.id));

            gradeRowsRaw = joinedGrades
              .map((r) => r.grade)
              .filter(
                (g) =>
                  g.syncVersion > since ||
                  newlyAssignedCsIds.has(g.classSubjectId) ||
                  newlyScopedEnrollmentIds.has(g.enrollmentId),
              );
          }
        }
      } else if (currentUser.role === 'secretary') {
        // Explicit role scope for secretary: school structure & rosters only, zero teacher assignments, raw grades, or council decisions (SEC-MED-11).
        classRowsRaw = await tx
          .select()
          .from(classes)
          .where(and(eq(classes.academicYearId, year.id), gt(classes.syncVersion, since)))
          .orderBy(asc(classes.syncVersion), asc(classes.id))
          .limit(limit + 1);

        const joinedClassSubjects = await tx
          .select({ cs: classSubjects })
          .from(classSubjects)
          .innerJoin(classes, eq(classSubjects.classId, classes.id))
          .where(and(eq(classes.academicYearId, year.id), gt(classSubjects.syncVersion, since)))
          .orderBy(asc(classSubjects.syncVersion), asc(classSubjects.id))
          .limit(limit + 1);
        classSubjectRowsRaw = joinedClassSubjects.map((r) => r.cs);

        enrollmentRowsRaw = await tx
          .select()
          .from(enrollments)
          .where(and(eq(enrollments.academicYearId, year.id), gt(enrollments.syncVersion, since)))
          .orderBy(asc(enrollments.syncVersion), asc(enrollments.id))
          .limit(limit + 1);

        const yearEnrollments = await tx
          .select({ studentId: enrollments.studentId })
          .from(enrollments)
          .where(eq(enrollments.academicYearId, year.id));
        const yearStudentIds = [...new Set(yearEnrollments.map((e) => e.studentId))];

        if (yearStudentIds.length > 0) {
          studentRowsRaw = await tx
            .select()
            .from(students)
            .where(and(inArray(students.id, yearStudentIds), gt(students.syncVersion, since)))
            .orderBy(asc(students.syncVersion), asc(students.id))
            .limit(limit + 1);
        }
      } else {
        // admin | censor | principal
        teacherAssignmentRowsRaw = await tx
          .select()
          .from(teacherAssignments)
          .where(and(eq(teacherAssignments.academicYearId, year.id), gt(teacherAssignments.syncVersion, since)))
          .orderBy(asc(teacherAssignments.syncVersion), asc(teacherAssignments.id))
          .limit(limit + 1);

        classRowsRaw = await tx
          .select()
          .from(classes)
          .where(and(eq(classes.academicYearId, year.id), gt(classes.syncVersion, since)))
          .orderBy(asc(classes.syncVersion), asc(classes.id))
          .limit(limit + 1);

        const joinedClassSubjects = await tx
          .select({ cs: classSubjects })
          .from(classSubjects)
          .innerJoin(classes, eq(classSubjects.classId, classes.id))
          .where(and(eq(classes.academicYearId, year.id), gt(classSubjects.syncVersion, since)))
          .orderBy(asc(classSubjects.syncVersion), asc(classSubjects.id))
          .limit(limit + 1);
        classSubjectRowsRaw = joinedClassSubjects.map((r) => r.cs);

        enrollmentRowsRaw = await tx
          .select()
          .from(enrollments)
          .where(and(eq(enrollments.academicYearId, year.id), gt(enrollments.syncVersion, since)))
          .orderBy(asc(enrollments.syncVersion), asc(enrollments.id))
          .limit(limit + 1);

        const yearEnrollments = await tx
          .select({ studentId: enrollments.studentId })
          .from(enrollments)
          .where(eq(enrollments.academicYearId, year.id));
        const yearStudentIds = [...new Set(yearEnrollments.map((e) => e.studentId))];

        if (yearStudentIds.length > 0) {
          studentRowsRaw = await tx
            .select()
            .from(students)
            .where(and(inArray(students.id, yearStudentIds), gt(students.syncVersion, since)))
            .orderBy(asc(students.syncVersion), asc(students.id))
            .limit(limit + 1);
        }

        const joinedGrades = await tx
          .select({ grade: grades })
          .from(grades)
          .innerJoin(periods, eq(grades.periodId, periods.id))
          .where(and(eq(periods.academicYearId, year.id), gt(grades.syncVersion, since)))
          .orderBy(asc(grades.syncVersion), asc(grades.id))
          .limit(limit + 1);
        gradeRowsRaw = joinedGrades.map((r) => r.grade);

        const joinedDecisions = await tx
          .select({ decision: councilDecisions })
          .from(councilDecisions)
          .innerJoin(periods, eq(councilDecisions.periodId, periods.id))
          .where(and(eq(periods.academicYearId, year.id), gt(councilDecisions.syncVersion, since)))
          .orderBy(asc(councilDecisions.syncVersion), asc(councilDecisions.id))
          .limit(limit + 1);
        councilDecisionRowsRaw = joinedDecisions.map((r) => r.decision);
      }

      const overflowChecks = [
        computeOverflowCutoff(teacherAssignmentRowsRaw, since, limit),
        computeOverflowCutoff(classRowsRaw, since, limit),
        computeOverflowCutoff(classSubjectRowsRaw, since, limit),
        computeOverflowCutoff(enrollmentRowsRaw, since, limit),
        computeOverflowCutoff(studentRowsRaw, since, limit),
        computeOverflowCutoff(gradeRowsRaw, since, limit),
        computeOverflowCutoff(periodRowsRaw, since, limit),
        computeOverflowCutoff(subjectRowsRaw, since, limit),
        computeOverflowCutoff(subjectGroupRowsRaw, since, limit),
        computeOverflowCutoff(gradingRuleRowsRaw, since, limit),
        computeOverflowCutoff(councilDecisionRowsRaw, since, limit),
      ];

      const hasMore = overflowChecks.some((c) => c.overflow);
      const validCutoffs = overflowChecks
        .map((c) => c.cutoff)
        .filter((cutoff): cutoff is number => cutoff !== null);
      const safeCutoff = validCutoffs.length > 0 ? Math.min(...validCutoffs) : null;

      const teacherAssignmentRows = trimWithCutoff(teacherAssignmentRowsRaw, since, safeCutoff, limit);
      const classRows = trimWithCutoff(classRowsRaw, since, safeCutoff, limit);
      const classSubjectRows = trimWithCutoff(classSubjectRowsRaw, since, safeCutoff, limit);
      const enrollmentRows = trimWithCutoff(enrollmentRowsRaw, since, safeCutoff, limit);
      const studentRows = trimWithCutoff(studentRowsRaw, since, safeCutoff, limit);
      const gradeRows = trimWithCutoff(gradeRowsRaw, since, safeCutoff, limit);
      const periodRows = trimWithCutoff(periodRowsRaw, since, safeCutoff, limit);
      const subjectRows = trimWithCutoff(subjectRowsRaw, since, safeCutoff, limit);
      const subjectGroupRows = trimWithCutoff(subjectGroupRowsRaw, since, safeCutoff, limit);
      const gradingRuleRows = trimWithCutoff(gradingRuleRowsRaw, since, safeCutoff, limit);
      const councilDecisionRows = trimWithCutoff(councilDecisionRowsRaw, since, safeCutoff, limit);

      let maxSyncVersionSeen = since;
      const considerVersion = (v: number) => {
        if (v > maxSyncVersionSeen && (safeCutoff === null || v <= safeCutoff)) {
          maxSyncVersionSeen = v;
        }
      };

      if (year.syncVersion > since && (!hasMore || (safeCutoff !== null && year.syncVersion <= safeCutoff))) {
        considerVersion(year.syncVersion);
      }
      for (const r of teacherAssignmentRows) considerVersion(r.syncVersion);
      for (const r of classRows) considerVersion(r.syncVersion);
      for (const r of classSubjectRows) considerVersion(r.syncVersion);
      for (const r of enrollmentRows) considerVersion(r.syncVersion);
      for (const r of studentRows) considerVersion(r.syncVersion);
      for (const r of gradeRows) considerVersion(r.syncVersion);
      for (const r of periodRows) considerVersion(r.syncVersion);
      for (const r of subjectRows) considerVersion(r.syncVersion);
      for (const r of subjectGroupRows) considerVersion(r.syncVersion);
      for (const r of gradingRuleRows) considerVersion(r.syncVersion);
      for (const r of councilDecisionRows) considerVersion(r.syncVersion);

      if (hasMore && safeCutoff === null) {
        maxSyncVersionSeen = since;
      }

      return {
        academicYearId: year.id,
        academicYear: {
          id: year.id,
          label: year.label,
          startDate: year.startDate,
          endDate: year.endDate,
          isActive: year.isActive,
          syncVersion: year.syncVersion,
        },
        since,
        latestCursor: maxSyncVersionSeen,
        hasMore,
        teacherAssignments: teacherAssignmentRows.map((a) => ({
          id: a.id,
          teacherId: a.teacherId,
          classSubjectId: a.classSubjectId,
          academicYearId: a.academicYearId,
          isActive: a.isActive,
          syncVersion: a.syncVersion,
          createdAt: a.createdAt.toISOString(),
          updatedAt: a.updatedAt.toISOString(),
        })),
        classes: classRows.map((c) => ({
          id: c.id,
          academicYearId: c.academicYearId,
          name: c.name,
          level: c.level,
          series: c.series,
          mainTeacherId: c.mainTeacherId,
          syncVersion: c.syncVersion,
          updatedAt: c.updatedAt.toISOString(),
        })),
        classSubjects: classSubjectRows.map((cs) => ({
          id: cs.id,
          classId: cs.classId,
          subjectId: cs.subjectId,
          subjectGroupId: cs.subjectGroupId,
          coefficient: Number(cs.coefficient),
          syncVersion: cs.syncVersion,
          updatedAt: cs.updatedAt.toISOString(),
        })),
        enrollments: enrollmentRows.map((e) => ({
          id: e.id,
          studentId: e.studentId,
          classId: e.classId,
          academicYearId: e.academicYearId,
          isRepeater: e.isRepeater,
          status: e.status,
          syncVersion: e.syncVersion,
          enrolledAt: e.enrolledAt.toISOString(),
          updatedAt: e.updatedAt.toISOString(),
        })),
        students: studentRows.map((s) => ({
          id: s.id,
          matricule: s.matricule,
          lastName: s.lastName,
          firstName: s.firstName,
          birthDate: s.birthDate,
          birthPlace: s.birthPlace,
          sex: s.sex,
          syncVersion: s.syncVersion,
          createdAt: s.createdAt.toISOString(),
          updatedAt: s.updatedAt.toISOString(),
        })),
        grades: gradeRows.map((g) => ({
          id: g.id,
          enrollmentId: g.enrollmentId,
          classSubjectId: g.classSubjectId,
          periodId: g.periodId,
          score: g.score !== null ? Number(g.score) : null,
          status: g.status,
          appreciation: g.appreciation,
          enteredBy: g.enteredBy,
          syncVersion: g.syncVersion,
          createdAt: g.createdAt.toISOString(),
          updatedAt: g.updatedAt.toISOString(),
        })),
        periods: periodRows.map((p) => ({
          id: p.id,
          academicYearId: p.academicYearId,
          parentPeriodId: p.parentPeriodId,
          type: p.type,
          code: p.code,
          name: p.name,
          orderIndex: p.orderIndex,
          weight: Number(p.weight),
          status: p.status,
          lockedAt: p.lockedAt ? p.lockedAt.toISOString() : null,
          lockedBy: p.lockedBy,
          syncVersion: p.syncVersion,
          updatedAt: p.updatedAt.toISOString(),
        })),
        subjects: subjectRows.map((s) => ({
          id: s.id,
          code: s.code,
          name: s.name,
          shortName: s.shortName,
          isActive: s.isActive,
          syncVersion: s.syncVersion,
          updatedAt: s.updatedAt.toISOString(),
        })),
        subjectGroups: subjectGroupRows.map((sg) => ({
          id: sg.id,
          academicYearId: sg.academicYearId,
          name: sg.name,
          orderIndex: sg.orderIndex,
          syncVersion: sg.syncVersion,
        })),
        gradingRules: gradingRuleRows.map((gr) => ({
          id: gr.id,
          academicYearId: gr.academicYearId,
          trimestersCount: gr.trimestersCount,
          sequencesPerTrimester: gr.sequencesPerTrimester,
          sequenceWeights: gr.sequenceWeights,
          trimesterWeights: gr.trimesterWeights,
          passingThreshold: Number(gr.passingThreshold),
          honorRollThreshold: Number(gr.honorRollThreshold),
          encouragementThreshold: Number(gr.encouragementThreshold),
          congratulationThreshold: Number(gr.congratulationThreshold),
          treatAbsentAsZero: gr.treatAbsentAsZero,
          appreciationScale: gr.appreciationScale,
          syncVersion: gr.syncVersion,
          updatedAt: gr.updatedAt.toISOString(),
        })),
        councilDecisions: councilDecisionRows.map((cd) => ({
          id: cd.id,
          enrollmentId: cd.enrollmentId,
          periodId: cd.periodId,
          generalAppreciation: cd.generalAppreciation,
          decision: cd.decision,
          absencesHours: cd.absencesHours,
          decidedBy: cd.decidedBy,
          syncVersion: cd.syncVersion,
          updatedAt: cd.updatedAt.toISOString(),
        })),
      };
    });
  }

  async function processPushOperation(
    currentUser: AuthUserPayload,
    op: SyncGradePushOperation,
  ): Promise<SyncPushOperationResult> {
    return db.transaction(async (tx) => {
      const txDb = tx as unknown as DbClient;

      const setOpResult = async (
        outcome: Exclude<SyncOutcome, 'duplicate'>,
        entityId: string | null,
        errorMessage: string | null,
      ) => {
        await tx
          .update(syncOperations)
          .set({ outcome, entityId, errorMessage })
          .where(
            and(
              eq(syncOperations.userId, currentUser.id),
              eq(syncOperations.operationId, op.operationId),
            ),
          );
      };

      // 1. Atomic idempotency reservation scoped to (userId, operationId) (SEC-MED-09 / SEC-MED-10).
      const [reservedOp] = await tx
        .insert(syncOperations)
        .values({
          operationId: op.operationId,
          userId: currentUser.id,
          entityType: 'grade',
          entityId: null,
          outcome: 'applied',
          errorMessage: null,
        })
        .onConflictDoNothing({ target: [syncOperations.userId, syncOperations.operationId] })
        .returning();

      if (!reservedOp) {
        const [existingOp] = await tx
          .select()
          .from(syncOperations)
          .where(
            and(
              eq(syncOperations.userId, currentUser.id),
              eq(syncOperations.operationId, op.operationId),
            ),
          )
          .limit(1);

        return {
          operationId: op.operationId,
          outcome: 'duplicate',
          entityId: existingOp?.entityId ?? null,
        };
      }

      // 2. Verify permissions FIRST (before entity/period lookups to prevent IDOR oracles, SEC-MED-11).
      let isAuthorized = currentUser.role === 'admin' || currentUser.role === 'censor';
      if (!isAuthorized && currentUser.role === 'teacher') {
        const [assignment] = await tx
          .select({ id: teacherAssignments.id })
          .from(teacherAssignments)
          .where(
            and(
              eq(teacherAssignments.teacherId, currentUser.id),
              eq(teacherAssignments.classSubjectId, op.payload.classSubjectId),
              eq(teacherAssignments.isActive, true),
            ),
          )
          .limit(1);
        isAuthorized = Boolean(assignment);
      }

      if (!isAuthorized) {
        const errorMessage =
          "Action non autorisée : vous n'êtes pas affecté à cette matière ou votre rôle ne permet pas la modification des notes.";
        await setOpResult('rejected_forbidden', null, errorMessage);
        return {
          operationId: op.operationId,
          outcome: 'rejected_forbidden',
          errorMessage,
        };
      }

      // 3. Validate clientTimestamp bounds (SEC-MED-14).
      const clientTs = new Date(op.clientTimestamp);
      const clientTsMs = clientTs.getTime();
      if (
        Number.isNaN(clientTsMs) ||
        clientTsMs < MIN_CLIENT_TIMESTAMP_MS ||
        clientTsMs > Date.now() + MAX_CLIENT_CLOCK_SKEW_MS
      ) {
        const errorMessage = 'Horodatage client invalide ou hors plage autorisée.';
        await setOpResult('rejected_validation', null, errorMessage);
        return {
          operationId: op.operationId,
          outcome: 'rejected_validation',
          errorMessage,
        };
      }

      // 4. Lock period & parent trimester FOR SHARE in ascending UUID order (SEC-HIGH-06/07).
      const [periodProbe] = await tx
        .select({ id: periods.id, parentPeriodId: periods.parentPeriodId })
        .from(periods)
        .where(eq(periods.id, op.payload.periodId))
        .limit(1);

      let period: typeof periods.$inferSelect | undefined;
      let parentPeriod: typeof periods.$inferSelect | undefined;
      if (periodProbe) {
        const periodIdsToLock = Array.from(
          new Set([
            periodProbe.id,
            ...(periodProbe.parentPeriodId ? [periodProbe.parentPeriodId] : []),
          ]),
        ).sort();

        const lockedPeriods = await tx
          .select()
          .from(periods)
          .where(inArray(periods.id, periodIdsToLock))
          .orderBy(asc(periods.id))
          .for('share');

        period = lockedPeriods.find((p) => p.id === periodProbe.id);
        parentPeriod = periodProbe.parentPeriodId
          ? lockedPeriods.find((p) => p.id === periodProbe.parentPeriodId)
          : undefined;
      }

      const [enrollment] = await tx
        .select()
        .from(enrollments)
        .where(eq(enrollments.id, op.payload.enrollmentId))
        .limit(1);
      const [classSubject] = await tx
        .select()
        .from(classSubjects)
        .where(eq(classSubjects.id, op.payload.classSubjectId))
        .limit(1);

      let validationError: string | null = null;
      if (!period) {
        validationError = 'Période introuvable.';
      } else if (!enrollment) {
        validationError = 'Inscription élève introuvable.';
      } else if (!classSubject) {
        validationError = 'Matière de classe introuvable.';
      } else if (enrollment.status !== 'active') {
        validationError = 'Impossible de synchroniser une note pour une inscription inactive.';
      } else if (enrollment.classId !== classSubject.classId) {
        validationError = "L'inscription élève n'appartient pas à la classe de cette matière.";
      } else if (period.academicYearId !== enrollment.academicYearId) {
        validationError = "La période et l'inscription n'appartiennent pas à la même année scolaire.";
      } else if (period.type !== 'sequence') {
        validationError = 'Les notes ne peuvent être synchronisées que sur une période de type séquence.';
      }

      if (validationError !== null) {
        await setOpResult('rejected_validation', null, validationError);
        return {
          operationId: op.operationId,
          outcome: 'rejected_validation',
          errorMessage: validationError,
        };
      }

      // 5. Verify sequence and parent trimester are not locked (SEC-HIGH-07).
      if (period!.status === 'locked' || parentPeriod?.status === 'locked') {
        const lockedTarget = period!.status === 'locked' ? period! : parentPeriod!;
        const errorMessage = `La période "${lockedTarget.name}" (${lockedTarget.code}) est verrouillée : modification refusée.`;
        await setOpResult('rejected_locked', null, errorMessage);
        return {
          operationId: op.operationId,
          outcome: 'rejected_locked',
          errorMessage,
        };
      }

      // 6. Acquire write lock, lock existing grade row FOR UPDATE, validate reason on edit, upsert & audit (SEC-MED-09/14).
      await acquireSyncWriteLock(txDb);

      const [existingGrade] = await tx
        .select()
        .from(grades)
        .where(
          and(
            eq(grades.enrollmentId, op.payload.enrollmentId),
            eq(grades.classSubjectId, op.payload.classSubjectId),
            eq(grades.periodId, op.payload.periodId),
          ),
        )
        .for('update')
        .limit(1);

      const scoreStr = op.payload.score !== null ? op.payload.score.toFixed(2) : null;
      if (existingGrade) {
        const existingScoreStr = existingGrade.score !== null ? Number(existingGrade.score).toFixed(2) : null;
        const scoreOrStatusChanged = scoreStr !== existingScoreStr || op.payload.status !== existingGrade.status;
        if (scoreOrStatusChanged && !op.payload.reason?.trim()) {
          const errorMessage = 'Un motif (reason) est obligatoire pour modifier une note existante.';
          await setOpResult('rejected_validation', null, errorMessage);
          return {
            operationId: op.operationId,
            outcome: 'rejected_validation',
            errorMessage,
          };
        }
      }

      const syncVersion = await nextSyncVersion(txDb);
      const now = new Date();
      const resolvedAppreciation =
        op.payload.appreciation !== undefined ? op.payload.appreciation : (existingGrade?.appreciation ?? null);

      let savedGrade: typeof grades.$inferSelect;
      if (existingGrade) {
        const [updated] = await tx
          .update(grades)
          .set({
            score: scoreStr,
            status: op.payload.status,
            appreciation: resolvedAppreciation,
            enteredBy: currentUser.id,
            lastOperationId: op.operationId,
            syncVersion,
            updatedAt: now,
          })
          .where(eq(grades.id, existingGrade.id))
          .returning();
        if (!updated) {
          throw new Error('Échec de mise à jour de la note lors de la synchronisation.');
        }
        savedGrade = updated;
      } else {
        const [inserted] = await tx
          .insert(grades)
          .values({
            enrollmentId: op.payload.enrollmentId,
            classSubjectId: op.payload.classSubjectId,
            periodId: op.payload.periodId,
            score: scoreStr,
            status: op.payload.status,
            appreciation: resolvedAppreciation,
            enteredBy: currentUser.id,
            lastOperationId: op.operationId,
            syncVersion,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (!inserted) {
          throw new Error("Échec d'insertion de la note lors de la synchronisation.");
        }
        savedGrade = inserted;
      }

      await tx.insert(gradeAuditLogs).values({
        gradeId: savedGrade.id,
        enrollmentId: op.payload.enrollmentId,
        classSubjectId: op.payload.classSubjectId,
        periodId: op.payload.periodId,
        previousScore: existingGrade?.score ?? null,
        newScore: scoreStr,
        previousStatus: existingGrade?.status ?? null,
        newStatus: op.payload.status,
        previousAppreciation: existingGrade?.appreciation ?? null,
        newAppreciation: resolvedAppreciation,
        changedBy: currentUser.id,
        reason: op.payload.reason?.trim() ?? '',
        clientTimestamp: clientTs,
        serverTimestamp: nextAuditTimestamp(),
        operationId: op.operationId,
      });

      await setOpResult('applied', savedGrade.id, null);

      return {
        operationId: op.operationId,
        outcome: 'applied',
        gradeId: savedGrade.id,
        syncVersion,
      };
    });
  }

  async function push(
    currentUser: AuthUserPayload,
    operations: SyncGradePushOperation[],
  ): Promise<SyncPushOperationResult[]> {
    const results: SyncPushOperationResult[] = [];
    for (const op of operations) {
      const outcome = await processPushOperation(currentUser, op);
      results.push(outcome);
    }
    return results;
  }

  return {
    pull,
    push,
  };
}
