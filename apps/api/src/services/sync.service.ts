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
import { and, eq, gt, inArray } from 'drizzle-orm';
import { type DbClient, nextSyncVersion } from '../db/client.js';
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
import { NotFoundError } from '../lib/errors.js';
import { nextAuditTimestamp } from './grades.service.js';

export interface SyncPullQuery {
  since: number;
  academicYearId?: string;
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
    lastOperationId: string | null;
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

export function createSyncService(db: DbClient) {
  async function pull(currentUser: AuthUserPayload, query: SyncPullQuery): Promise<SyncPullPayload> {
    const since = query.since;

    const [year] = query.academicYearId
      ? await db.select().from(academicYears).where(eq(academicYears.id, query.academicYearId)).limit(1)
      : await db.select().from(academicYears).where(eq(academicYears.isActive, true)).limit(1);

    if (!year) {
      throw new NotFoundError(
        query.academicYearId ? 'Année scolaire introuvable.' : 'Aucune année scolaire active trouvée.',
      );
    }

    const [periodRows, subjectRows, subjectGroupRows, gradingRuleRows] = await Promise.all([
      db
        .select()
        .from(periods)
        .where(and(eq(periods.academicYearId, year.id), gt(periods.syncVersion, since))),
      db.select().from(subjects).where(gt(subjects.syncVersion, since)),
      db
        .select()
        .from(subjectGroups)
        .where(and(eq(subjectGroups.academicYearId, year.id), gt(subjectGroups.syncVersion, since))),
      db
        .select()
        .from(gradingRules)
        .where(and(eq(gradingRules.academicYearId, year.id), gt(gradingRules.syncVersion, since))),
    ]);

    let teacherAssignmentRows: Array<typeof teacherAssignments.$inferSelect> = [];
    let classRows: Array<typeof classes.$inferSelect> = [];
    let classSubjectRows: Array<typeof classSubjects.$inferSelect> = [];
    let enrollmentRows: Array<typeof enrollments.$inferSelect> = [];
    let studentRows: Array<typeof students.$inferSelect> = [];
    let gradeRows: Array<typeof grades.$inferSelect> = [];
    let councilDecisionRows: Array<typeof councilDecisions.$inferSelect> = [];

    if (currentUser.role === 'teacher') {
      const allTeacherAssignments = await db
        .select()
        .from(teacherAssignments)
        .where(and(eq(teacherAssignments.teacherId, currentUser.id), eq(teacherAssignments.academicYearId, year.id)));

      // Include deactivated assignments where syncVersion > since so PWA removes revoked assignments
      teacherAssignmentRows = allTeacherAssignments.filter((a) => a.syncVersion > since);

      const activeClassSubjectIds = allTeacherAssignments.filter((a) => a.isActive).map((a) => a.classSubjectId);

      if (activeClassSubjectIds.length > 0) {
        const activeClassSubjectsAll = await db
          .select()
          .from(classSubjects)
          .where(inArray(classSubjects.id, activeClassSubjectIds));

        classSubjectRows = activeClassSubjectsAll.filter((cs) => cs.syncVersion > since);
        const activeClassIds = [...new Set(activeClassSubjectsAll.map((cs) => cs.classId))];

        if (activeClassIds.length > 0) {
          classRows = await db
            .select()
            .from(classes)
            .where(
              and(eq(classes.academicYearId, year.id), inArray(classes.id, activeClassIds), gt(classes.syncVersion, since)),
            );

          const activeEnrollmentsAll = await db
            .select()
            .from(enrollments)
            .where(and(eq(enrollments.academicYearId, year.id), inArray(enrollments.classId, activeClassIds)));

          enrollmentRows = activeEnrollmentsAll.filter((e) => e.syncVersion > since);
          const activeStudentIds = [...new Set(activeEnrollmentsAll.map((e) => e.studentId))];

          if (activeStudentIds.length > 0) {
            studentRows = await db
              .select()
              .from(students)
              .where(and(inArray(students.id, activeStudentIds), gt(students.syncVersion, since)));
          }
        }

        const joinedGrades = await db
          .select({ grade: grades })
          .from(grades)
          .innerJoin(periods, eq(grades.periodId, periods.id))
          .where(
            and(
              eq(periods.academicYearId, year.id),
              inArray(grades.classSubjectId, activeClassSubjectIds),
              gt(grades.syncVersion, since),
            ),
          );
        gradeRows = joinedGrades.map((r) => r.grade);
      }
    } else {
      teacherAssignmentRows = await db
        .select()
        .from(teacherAssignments)
        .where(and(eq(teacherAssignments.academicYearId, year.id), gt(teacherAssignments.syncVersion, since)));

      classRows = await db
        .select()
        .from(classes)
        .where(and(eq(classes.academicYearId, year.id), gt(classes.syncVersion, since)));

      const joinedClassSubjects = await db
        .select({ cs: classSubjects })
        .from(classSubjects)
        .innerJoin(classes, eq(classSubjects.classId, classes.id))
        .where(and(eq(classes.academicYearId, year.id), gt(classSubjects.syncVersion, since)));
      classSubjectRows = joinedClassSubjects.map((r) => r.cs);

      enrollmentRows = await db
        .select()
        .from(enrollments)
        .where(and(eq(enrollments.academicYearId, year.id), gt(enrollments.syncVersion, since)));

      const yearEnrollments = await db
        .select({ studentId: enrollments.studentId })
        .from(enrollments)
        .where(eq(enrollments.academicYearId, year.id));
      const yearStudentIds = [...new Set(yearEnrollments.map((e) => e.studentId))];

      if (yearStudentIds.length > 0) {
        studentRows = await db
          .select()
          .from(students)
          .where(and(inArray(students.id, yearStudentIds), gt(students.syncVersion, since)));
      }

      const joinedGrades = await db
        .select({ grade: grades })
        .from(grades)
        .innerJoin(periods, eq(grades.periodId, periods.id))
        .where(and(eq(periods.academicYearId, year.id), gt(grades.syncVersion, since)));
      gradeRows = joinedGrades.map((r) => r.grade);

      const joinedDecisions = await db
        .select({ decision: councilDecisions })
        .from(councilDecisions)
        .innerJoin(periods, eq(councilDecisions.periodId, periods.id))
        .where(and(eq(periods.academicYearId, year.id), gt(councilDecisions.syncVersion, since)));
      councilDecisionRows = joinedDecisions.map((r) => r.decision);
    }

    let maxSyncVersionSeen = since;
    const considerVersion = (v: number) => {
      if (v > maxSyncVersionSeen) {
        maxSyncVersionSeen = v;
      }
    };

    if (year.syncVersion > since) {
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
        lastOperationId: g.lastOperationId,
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
  }

  async function processPushOperation(
    currentUser: AuthUserPayload,
    op: SyncGradePushOperation,
  ): Promise<SyncPushOperationResult> {
    return db.transaction(async (tx) => {
      const txDb = tx as unknown as DbClient;

      // 1. Idempotency check
      const [existingOp] = await tx
        .select()
        .from(syncOperations)
        .where(eq(syncOperations.operationId, op.operationId))
        .limit(1);

      if (existingOp) {
        if (existingOp.userId !== currentUser.id) {
          return {
            operationId: op.operationId,
            outcome: 'rejected_forbidden',
            errorMessage: "Identifiant d'opération déjà utilisé par un autre utilisateur.",
          };
        }
        return {
          operationId: op.operationId,
          outcome: 'duplicate',
          entityId: existingOp.entityId,
        };
      }

      // 2. Load and validate referenced entities
      const [period] = await tx.select().from(periods).where(eq(periods.id, op.payload.periodId)).limit(1);
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
      } else if (enrollment.classId !== classSubject.classId) {
        validationError = "L'inscription élève n'appartient pas à la classe de cette matière.";
      } else if (period.academicYearId !== enrollment.academicYearId) {
        validationError = "La période et l'inscription n'appartiennent pas à la même année scolaire.";
      } else if (period.type !== 'sequence') {
        validationError = 'Les notes ne peuvent être synchronisées que sur une période de type séquence.';
      }

      if (validationError !== null) {
        await tx.insert(syncOperations).values({
          operationId: op.operationId,
          userId: currentUser.id,
          entityType: 'grade',
          entityId: null,
          outcome: 'rejected_validation',
          errorMessage: validationError,
        });

        return {
          operationId: op.operationId,
          outcome: 'rejected_validation',
          errorMessage: validationError,
        };
      }

      // 3. Verify permissions: admin/censor OR active teacher_assignment
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
        await tx.insert(syncOperations).values({
          operationId: op.operationId,
          userId: currentUser.id,
          entityType: 'grade',
          entityId: null,
          outcome: 'rejected_forbidden',
          errorMessage,
        });

        return {
          operationId: op.operationId,
          outcome: 'rejected_forbidden',
          errorMessage,
        };
      }

      // 4. Verify period is not locked
      // period is guaranteed defined because validationError checked !period
      if (period!.status === 'locked') {
        const errorMessage = `La période "${period!.name}" (${period!.code}) est verrouillée : modification refusée.`;
        await tx.insert(syncOperations).values({
          operationId: op.operationId,
          userId: currentUser.id,
          entityType: 'grade',
          entityId: null,
          outcome: 'rejected_locked',
          errorMessage,
        });

        return {
          operationId: op.operationId,
          outcome: 'rejected_locked',
          errorMessage,
        };
      }

      // 5. Upsert grade, log audit trail, record sync_operations
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
        .limit(1);

      const syncVersion = await nextSyncVersion(txDb);
      const now = new Date();
      const scoreStr = op.payload.score !== null ? op.payload.score.toFixed(2) : null;
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
        changedBy: currentUser.id,
        reason: op.payload.reason ?? '',
        clientTimestamp: new Date(op.clientTimestamp),
        serverTimestamp: nextAuditTimestamp(),
        operationId: op.operationId,
      });

      await tx.insert(syncOperations).values({
        operationId: op.operationId,
        userId: currentUser.id,
        entityType: 'grade',
        entityId: savedGrade.id,
        outcome: 'applied',
        errorMessage: null,
      });

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
