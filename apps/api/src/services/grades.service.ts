import type { AuthUserPayload, GradeStatus } from '@lycee/shared';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { type DbClient, nextSyncVersion } from '../db/client.js';
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
  lastOperationId: string | null;
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
  changedBy: string;
  changedByName: string;
  reason: string;
  clientTimestamp: string | null;
  serverTimestamp: string;
  operationId: string | null;
}

export function createGradesService(db: DbClient) {
  async function listGrades(currentUser: AuthUserPayload, filters: GradeListFilters): Promise<GradeDto[]> {
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
        lastOperationId: grades.lastOperationId,
        syncVersion: grades.syncVersion,
        createdAt: grades.createdAt,
        updatedAt: grades.updatedAt,
      })
      .from(grades)
      .innerJoin(enrollments, eq(grades.enrollmentId, enrollments.id))
      .innerJoin(students, eq(enrollments.studentId, students.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(students.lastName, students.firstName, grades.createdAt);

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
      lastOperationId: row.lastOperationId,
      syncVersion: row.syncVersion,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async function bulkUpsertGrades(currentUser: AuthUserPayload, entries: GradeEntryInput[]): Promise<GradeDto[]> {
    return db.transaction(async (tx) => {
      const txDb = tx as unknown as DbClient;
      const periodCache = new Map<string, typeof periods.$inferSelect>();
      const classSubjectCache = new Map<string, typeof classSubjects.$inferSelect>();
      const enrollmentCache = new Map<string, typeof enrollments.$inferSelect>();
      const teacherAuthCache = new Map<string, boolean>();

      const results: GradeDto[] = [];

      for (const entry of entries) {
        let period = periodCache.get(entry.periodId);
        if (!period) {
          const [foundPeriod] = await tx
            .select()
            .from(periods)
            .where(eq(periods.id, entry.periodId))
            .limit(1);
          if (!foundPeriod) {
            throw new NotFoundError('Période introuvable.');
          }
          period = foundPeriod;
          periodCache.set(entry.periodId, period);
        }

        if (period.type !== 'sequence') {
          throw new BadRequestError('La saisie des notes est uniquement autorisée sur une séquence.');
        }

        if (period.status === 'locked') {
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

        if (enrollment.classId !== classSubject.classId) {
          throw new BadRequestError("L'inscription élève n'appartient pas à la classe de cette matière.");
        }

        if (enrollment.academicYearId !== period.academicYearId) {
          throw new BadRequestError("La période et l'inscription n'appartiennent pas à la même année scolaire.");
        }

        if (currentUser.role === 'teacher') {
          let isAssigned = teacherAuthCache.get(entry.classSubjectId);
          if (isAssigned === undefined) {
            const [assignment] = await tx
              .select({ id: teacherAssignments.id })
              .from(teacherAssignments)
              .where(
                and(
                  eq(teacherAssignments.teacherId, currentUser.id),
                  eq(teacherAssignments.classSubjectId, entry.classSubjectId),
                  eq(teacherAssignments.isActive, true),
                ),
              )
              .limit(1);
            isAssigned = Boolean(assignment);
            teacherAuthCache.set(entry.classSubjectId, isAssigned);
          }

          if (!isAssigned) {
            throw new ForbiddenError("Vous n'êtes pas affecté à cette matière.");
          }
        }

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
          .limit(1);

        const syncVersion = await nextSyncVersion(txDb);
        const now = new Date();
        const scoreStr = entry.score !== null ? entry.score.toFixed(2) : null;
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
          changedBy: currentUser.id,
          reason: entry.reason ?? '',
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
          lastOperationId: savedGrade.lastOperationId,
          syncVersion: savedGrade.syncVersion,
          createdAt: savedGrade.createdAt.toISOString(),
          updatedAt: savedGrade.updatedAt.toISOString(),
        });
      }

      return results;
    });
  }

  async function listGradeAuditLogs(filters: GradeAuditFilters): Promise<GradeAuditLogDto[]> {
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
      .orderBy(desc(gradeAuditLogs.serverTimestamp), desc(gradeAuditLogs.id));

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
