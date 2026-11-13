import type { AuthUserPayload, GradeStatus } from '@lycee/shared';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { acquireSyncWriteLock, type DbClient, nextSyncVersion } from '../db/client.js';
import {
  classSubjects,
  enrollments,
  gradeAuditLogs,
  grades,
  periods,
  students,
  subjects,
  teacherAssignments,
  users,
} from '../db/schema.js';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../lib/errors.js';
import type { PaginationQuery } from '../lib/sql.js';

let lastAuditTimestampMs = 0;

export function nextAuditTimestamp(): Date {
  const nowMs = Date.now();
  lastAuditTimestampMs = nowMs > lastAuditTimestampMs ? nowMs : lastAuditTimestampMs + 1;
  return new Date(lastAuditTimestampMs);
}

export interface GradeListFilters {
  classId?: string;
  classSubjectId?: string;
  periodId?: string;
}

export interface GradeEntryInput {
  enrollmentId: string;
  classSubjectId: string;
  periodId: string;
  score: number | null;
  status: GradeStatus;
  appreciation?: string | null;
  reason?: string;
}

export interface GradeAuditFilters {
  classId?: string;
  periodId?: string;
  enrollmentId?: string;
  classSubjectId?: string;
}

export interface GradeDto {
  id: string;
  enrollmentId: string;
  studentId: string;
  classId: string;
  classSubjectId: string;
  periodId: string;
  score: number | null;
  status: GradeStatus;
  appreciation: string | null;
  enteredBy: string;
  syncVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface GradeAuditLogDto {
  id: string;
  gradeId: string;
  enrollmentId: string;
  classId: string;
  studentId: string;
  studentMatricule: string;
  studentLastName: string;
  studentFirstName: string;
  classSubjectId: string;
  subjectCode: string;
  subjectName: string;
  periodId: string;
  periodCode: string;
  periodName: string;
  previousScore: number | null;
  newScore: number | null;
  previousStatus: GradeStatus | null;
  newStatus: GradeStatus;
  previousAppreciation: string | null;
  newAppreciation: string | null;
  changedBy: string;
  changedByName: string;
  reason: string;
  clientTimestamp: string | null;
  serverTimestamp: string;
  operationId: string | null;
}

export function createGradesService(db: DbClient) {
  async function listGrades(
    currentUser: AuthUserPayload,
    filters: GradeListFilters,
    pagination: PaginationQuery = { limit: 100, offset: 0 },
  ): Promise<GradeDto[]> {
    const conditions = [];

    if (filters.classId) {
      conditions.push(eq(enrollments.classId, filters.classId));
    }
    if (filters.classSubjectId) {
      conditions.push(eq(grades.classSubjectId, filters.classSubjectId));
    }
    if (filters.periodId) {
      conditions.push(eq(grades.periodId, filters.periodId));
    }

    if (currentUser.role === 'teacher') {
      if (filters.classSubjectId) {
        const [assignment] = await db
          .select({ id: teacherAssignments.id })
          .from(teacherAssignments)
          .where(
            and(
              eq(teacherAssignments.teacherId, currentUser.id),
              eq(teacherAssignments.classSubjectId, filters.classSubjectId),
              eq(teacherAssignments.isActive, true),
            ),
          )
          .limit(1);

        if (!assignment) {
          throw new ForbiddenError("Vous n'êtes pas affecté à cette matière.");
        }
      } else {
        const activeAssignments = await db
          .select({ classSubjectId: teacherAssignments.classSubjectId })
          .from(teacherAssignments)
          .where(
            and(
              eq(teacherAssignments.teacherId, currentUser.id),
              eq(teacherAssignments.isActive, true),
            ),
          );

        if (activeAssignments.length === 0) {
          return [];
        }

        conditions.push(
          inArray(
            grades.classSubjectId,
            activeAssignments.map((a) => a.classSubjectId),
          ),
        );
      }
    } else if (
      currentUser.role !== 'admin' &&
      currentUser.role !== 'censor' &&
      currentUser.role !== 'principal'
    ) {
      throw new ForbiddenError('Accès refusé.');
    }

    const rows = await db
      .select({
        id: grades.id,
        enrollmentId: grades.enrollmentId,
        studentId: enrollments.studentId,
        classId: enrollments.classId,
        classSubjectId: grades.classSubjectId,
        periodId: grades.periodId,
        score: grades.score,
        status: grades.status,
        appreciation: grades.appreciation,
        enteredBy: grades.enteredBy,
        syncVersion: grades.syncVersion,
        createdAt: grades.createdAt,
        updatedAt: grades.updatedAt,
      })
      .from(grades)
      .innerJoin(enrollments, eq(grades.enrollmentId, enrollments.id))
      .innerJoin(students, eq(enrollments.studentId, students.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(students.lastName, students.firstName, grades.createdAt)
      .limit(pagination.limit)
      .offset(pagination.offset);

    return rows.map((row) => ({
      id: row.id,
      enrollmentId: row.enrollmentId,
      studentId: row.studentId,
      classId: row.classId,
      classSubjectId: row.classSubjectId,
      periodId: row.periodId,
      score: row.score !== null ? Number(row.score) : null,
      status: row.status,
      appreciation: row.appreciation,
      enteredBy: row.enteredBy,
      syncVersion: row.syncVersion,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async function bulkUpsertGrades(currentUser: AuthUserPayload, entries: GradeEntryInput[]): Promise<GradeDto[]> {
    return db.transaction(async (tx) => {
      const txDb = tx as unknown as DbClient;

      // 1. Verify role & active teacher assignments FIRST to avoid IDOR/existence oracle leaks (SEC-MED-11).
      if (currentUser.role === 'teacher') {
        const distinctCsIds = Array.from(new Set(entries.map((e) => e.classSubjectId)));
        const activeAssignments =
          distinctCsIds.length > 0
            ? await tx
                .select({ classSubjectId: teacherAssignments.classSubjectId })
                .from(teacherAssignments)
                .where(
                  and(
                    eq(teacherAssignments.teacherId, currentUser.id),
                    inArray(teacherAssignments.classSubjectId, distinctCsIds),
                    eq(teacherAssignments.isActive, true),
                  ),
                )
            : [];

        const assignedSet = new Set(activeAssignments.map((a) => a.classSubjectId));
        for (const entry of entries) {
          if (!assignedSet.has(entry.classSubjectId)) {
            throw new ForbiddenError("Vous n'êtes pas affecté à cette matière.");
          }
        }
      } else if (currentUser.role !== 'admin' && currentUser.role !== 'censor') {
        throw new ForbiddenError('Accès refusé.');
      }

      // 2. Acquire FOR SHARE locks on all involved periods + parent trimesters in ascending UUID order (SEC-HIGH-06/07).
      const distinctPeriodIds = Array.from(new Set(entries.map((e) => e.periodId))).sort();
      const probedPeriods =
        distinctPeriodIds.length > 0
          ? await tx
              .select({ id: periods.id, parentPeriodId: periods.parentPeriodId })
              .from(periods)
              .where(inArray(periods.id, distinctPeriodIds))
          : [];

      const periodIdsToLock = Array.from(
        new Set([
          ...distinctPeriodIds,
          ...probedPeriods.map((p) => p.parentPeriodId).filter((pid): pid is string => pid !== null),
        ]),
      ).sort();

      const lockedPeriods =
        periodIdsToLock.length > 0
          ? await tx
              .select()
              .from(periods)
              .where(inArray(periods.id, periodIdsToLock))
              .orderBy(asc(periods.id))
              .for('share')
          : [];

      const periodMap = new Map(lockedPeriods.map((p) => [p.id, p]));
      const classSubjectCache = new Map<string, typeof classSubjects.$inferSelect>();
      const enrollmentCache = new Map<string, typeof enrollments.$inferSelect>();

      for (const entry of entries) {
        const period = periodMap.get(entry.periodId);
        if (!period) {
          throw new NotFoundError('Période introuvable.');
        }

        if (period.type !== 'sequence') {
          throw new BadRequestError('La saisie des notes est uniquement autorisée sur une séquence.');
        }

        const parentPeriod = period.parentPeriodId ? periodMap.get(period.parentPeriodId) : undefined;
        if (period.status === 'locked' || parentPeriod?.status === 'locked') {
          throw new ConflictError('Période verrouillée');
        }

        let classSubject = classSubjectCache.get(entry.classSubjectId);
        if (!classSubject) {
          const [foundCs] = await tx
            .select()
            .from(classSubjects)
            .where(eq(classSubjects.id, entry.classSubjectId))
            .limit(1);
          if (!foundCs) {
            throw new NotFoundError('Matière de classe introuvable.');
          }
          classSubject = foundCs;
          classSubjectCache.set(entry.classSubjectId, classSubject);
        }

        let enrollment = enrollmentCache.get(entry.enrollmentId);
        if (!enrollment) {
          const [foundEnrollment] = await tx
            .select()
            .from(enrollments)
            .where(eq(enrollments.id, entry.enrollmentId))
            .limit(1);
          if (!foundEnrollment) {
            throw new NotFoundError('Inscription élève introuvable.');
          }
          enrollment = foundEnrollment;
          enrollmentCache.set(entry.enrollmentId, enrollment);
        }

        if (enrollment.status !== 'active') {
          throw new BadRequestError('Impossible de saisir ou modifier une note pour une inscription inactive.');
        }

        if (enrollment.classId !== classSubject.classId) {
          throw new BadRequestError("L'inscription élève n'appartient pas à la classe de cette matière.");
        }

        if (enrollment.academicYearId !== period.academicYearId) {
          throw new BadRequestError("La période et l'inscription n'appartiennent pas à la même année scolaire.");
        }
      }

      // 3. Serialize grade writes AFTER period locks & validations (SEC-MED-09 / SEC-HIGH-10).
      await acquireSyncWriteLock(txDb);

      const results: GradeDto[] = [];

      for (const entry of entries) {
        const enrollment = enrollmentCache.get(entry.enrollmentId)!;

        const [existing] = await tx
          .select()
          .from(grades)
          .where(
            and(
              eq(grades.enrollmentId, entry.enrollmentId),
              eq(grades.classSubjectId, entry.classSubjectId),
              eq(grades.periodId, entry.periodId),
            ),
          )
          .for('update')
          .limit(1);

        const scoreStr = entry.score !== null ? entry.score.toFixed(2) : null;
        if (existing) {
          const existingScoreStr = existing.score !== null ? Number(existing.score).toFixed(2) : null;
          const scoreOrStatusChanged = scoreStr !== existingScoreStr || entry.status !== existing.status;
          if (scoreOrStatusChanged && !entry.reason?.trim()) {
            throw new BadRequestError(
              'Un motif (reason) est obligatoire pour modifier une note existante.',
            );
          }
        }

        const syncVersion = await nextSyncVersion(txDb);
        const now = new Date();
        const resolvedAppreciation =
          entry.appreciation !== undefined ? entry.appreciation : (existing?.appreciation ?? null);

        let savedGrade: typeof grades.$inferSelect;
        if (existing) {
          const [updated] = await tx
            .update(grades)
            .set({
              score: scoreStr,
              status: entry.status,
              appreciation: resolvedAppreciation,
              enteredBy: currentUser.id,
              syncVersion,
              updatedAt: now,
            })
            .where(eq(grades.id, existing.id))
            .returning();
          if (!updated) {
            throw new Error('Échec de mise à jour de la note.');
          }
          savedGrade = updated;
        } else {
          const [inserted] = await tx
            .insert(grades)
            .values({
              enrollmentId: entry.enrollmentId,
              classSubjectId: entry.classSubjectId,
              periodId: entry.periodId,
              score: scoreStr,
              status: entry.status,
              appreciation: resolvedAppreciation,
              enteredBy: currentUser.id,
              syncVersion,
              createdAt: now,
              updatedAt: now,
            })
            .returning();
          if (!inserted) {
            throw new Error("Échec d'insertion de la note.");
          }
          savedGrade = inserted;
        }

        await tx.insert(gradeAuditLogs).values({
          gradeId: savedGrade.id,
          enrollmentId: entry.enrollmentId,
          classSubjectId: entry.classSubjectId,
          periodId: entry.periodId,
          previousScore: existing?.score ?? null,
          newScore: scoreStr,
          previousStatus: existing?.status ?? null,
          newStatus: entry.status,
          previousAppreciation: existing?.appreciation ?? null,
          newAppreciation: resolvedAppreciation,
          changedBy: currentUser.id,
          reason: entry.reason?.trim() ?? '',
          serverTimestamp: nextAuditTimestamp(),
        });

        results.push({
          id: savedGrade.id,
          enrollmentId: savedGrade.enrollmentId,
          studentId: enrollment.studentId,
          classId: enrollment.classId,
          classSubjectId: savedGrade.classSubjectId,
          periodId: savedGrade.periodId,
          score: savedGrade.score !== null ? Number(savedGrade.score) : null,
          status: savedGrade.status,
          appreciation: savedGrade.appreciation,
          enteredBy: savedGrade.enteredBy,
          syncVersion: savedGrade.syncVersion,
          createdAt: savedGrade.createdAt.toISOString(),
          updatedAt: savedGrade.updatedAt.toISOString(),
        });
      }

      return results;
    });
  }

  async function listGradeAuditLogs(
    filters: GradeAuditFilters,
    pagination: PaginationQuery = { limit: 100, offset: 0 },
  ): Promise<GradeAuditLogDto[]> {
    const conditions = [];
    if (filters.classId) {
      conditions.push(eq(enrollments.classId, filters.classId));
    }
    if (filters.periodId) {
      conditions.push(eq(gradeAuditLogs.periodId, filters.periodId));
    }
    if (filters.enrollmentId) {
      conditions.push(eq(gradeAuditLogs.enrollmentId, filters.enrollmentId));
    }
    if (filters.classSubjectId) {
      conditions.push(eq(gradeAuditLogs.classSubjectId, filters.classSubjectId));
    }

    const rows = await db
      .select({
        id: gradeAuditLogs.id,
        gradeId: gradeAuditLogs.gradeId,
        enrollmentId: gradeAuditLogs.enrollmentId,
        classId: enrollments.classId,
        studentId: enrollments.studentId,
        studentMatricule: students.matricule,
        studentLastName: students.lastName,
        studentFirstName: students.firstName,
        classSubjectId: gradeAuditLogs.classSubjectId,
        subjectCode: subjects.code,
        subjectName: subjects.name,
        periodId: gradeAuditLogs.periodId,
        periodCode: periods.code,
        periodName: periods.name,
        previousScore: gradeAuditLogs.previousScore,
        newScore: gradeAuditLogs.newScore,
        previousStatus: gradeAuditLogs.previousStatus,
        newStatus: gradeAuditLogs.newStatus,
        previousAppreciation: gradeAuditLogs.previousAppreciation,
        newAppreciation: gradeAuditLogs.newAppreciation,
        changedBy: gradeAuditLogs.changedBy,
        changedByName: users.fullName,
        reason: gradeAuditLogs.reason,
        clientTimestamp: gradeAuditLogs.clientTimestamp,
        serverTimestamp: gradeAuditLogs.serverTimestamp,
        operationId: gradeAuditLogs.operationId,
      })
      .from(gradeAuditLogs)
      .innerJoin(enrollments, eq(gradeAuditLogs.enrollmentId, enrollments.id))
      .innerJoin(students, eq(enrollments.studentId, students.id))
      .innerJoin(classSubjects, eq(gradeAuditLogs.classSubjectId, classSubjects.id))
      .innerJoin(subjects, eq(classSubjects.subjectId, subjects.id))
      .innerJoin(periods, eq(gradeAuditLogs.periodId, periods.id))
      .innerJoin(users, eq(gradeAuditLogs.changedBy, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(gradeAuditLogs.serverTimestamp), desc(gradeAuditLogs.id))
      .limit(pagination.limit)
      .offset(pagination.offset);

    return rows.map((row) => ({
      id: row.id,
      gradeId: row.gradeId,
      enrollmentId: row.enrollmentId,
      classId: row.classId,
      studentId: row.studentId,
      studentMatricule: row.studentMatricule,
      studentLastName: row.studentLastName,
      studentFirstName: row.studentFirstName,
      classSubjectId: row.classSubjectId,
      subjectCode: row.subjectCode,
      subjectName: row.subjectName,
      periodId: row.periodId,
      periodCode: row.periodCode,
      periodName: row.periodName,
      previousScore: row.previousScore !== null ? Number(row.previousScore) : null,
      newScore: row.newScore !== null ? Number(row.newScore) : null,
      previousStatus: row.previousStatus,
      newStatus: row.newStatus,
      previousAppreciation: row.previousAppreciation,
      newAppreciation: row.newAppreciation,
      changedBy: row.changedBy,
      changedByName: row.changedByName,
      reason: row.reason,
      clientTimestamp: row.clientTimestamp ? row.clientTimestamp.toISOString() : null,
      serverTimestamp: row.serverTimestamp.toISOString(),
      operationId: row.operationId,
    }));
  }

  return {
    listGrades,
    bulkUpsertGrades,
    listGradeAuditLogs,
  };
}
