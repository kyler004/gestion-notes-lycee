import {
  type AuthUserPayload,
  CAMEROON_DEFAULT_GRADING_RULES,
  type CouncilDecisionType,
  gradingCalculator,
  type GradingCalculatorContract,
  type GradingRulesConfig,
  type PeriodDefinitionInput,
  type PeriodStatus,
  type PeriodType,
  type RawGradeRecordInput,
  type SubjectDefinitionInput,
} from '@lycee/shared';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { type DbClient, nextSyncVersion } from '../db/client.js';
import {
  classSubjects,
  classes,
  councilDecisions,
  enrollments,
  grades,
  gradingRules,
  periodAuditLogs,
  periodStudentResults,
  periodSubjectResults,
  periods,
  students,
  subjectGroups,
  subjects,
  teacherAssignments,
  users,
} from '../db/schema.js';
import { BadRequestError, ConflictError, NotFoundError } from '../lib/errors.js';
import { fallbackGradingCalculator } from '../lib/grading-fallback.js';

export interface CouncilDecisionInput {
  enrollmentId: string;
  periodId: string;
  generalAppreciation: string;
  decision: CouncilDecisionType;
  absencesHours: number;
}

export interface CouncilDecisionFilters {
  classId?: string;
  periodId?: string;
}

export interface PeriodDto {
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
}

export interface SubjectCompletenessDto {
  classSubjectId: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  subjectShortName: string;
  expectedStudents: number;
  gradedCount: number;
  missingCount: number;
  isComplete: boolean;
}

export interface ClassCompletenessDto {
  classId: string;
  className: string;
  level: string;
  expectedStudents: number;
  isComplete: boolean;
  subjects: SubjectCompletenessDto[];
}

export interface PeriodCompletenessDto {
  periodId: string;
  periodCode: string;
  periodName: string;
  periodType: PeriodType;
  status: PeriodStatus;
  isComplete: boolean;
  classes: ClassCompletenessDto[];
}

export interface CouncilDecisionDto {
  id: string;
  enrollmentId: string;
  studentId: string;
  studentMatricule: string;
  studentLastName: string;
  studentFirstName: string;
  classId: string;
  periodId: string;
  generalAppreciation: string;
  decision: CouncilDecisionType;
  absencesHours: number;
  decidedBy: string;
  syncVersion: number;
  updatedAt: string;
}

function toPeriodDto(p: typeof periods.$inferSelect): PeriodDto {
  return {
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
  };
}

export function createValidationService(
  db: DbClient,
  calculator: GradingCalculatorContract = gradingCalculator,
) {
  async function getPeriodCompleteness(periodId: string): Promise<PeriodCompletenessDto> {
    const [period] = await db.select().from(periods).where(eq(periods.id, periodId)).limit(1);
    if (!period) {
      throw new NotFoundError('Période introuvable.');
    }

    const yearClasses = await db
      .select()
      .from(classes)
      .where(eq(classes.academicYearId, period.academicYearId))
      .orderBy(asc(classes.name));

    let targetGradePeriodIds: string[] = [];
    if (period.type === 'sequence') {
      targetGradePeriodIds = [period.id];
    } else {
      const childSequences = await db
        .select({ id: periods.id })
        .from(periods)
        .where(
          and(
            eq(periods.academicYearId, period.academicYearId),
            eq(periods.parentPeriodId, period.id),
            eq(periods.type, 'sequence'),
          ),
        );
      targetGradePeriodIds = childSequences.map((s) => s.id);
    }

    const activeEnrollments = await db
      .select({
        id: enrollments.id,
        classId: enrollments.classId,
      })
      .from(enrollments)
      .where(and(eq(enrollments.academicYearId, period.academicYearId), eq(enrollments.status, 'active')));

    const enrollmentsByClass = new Map<string, string[]>();
    for (const enr of activeEnrollments) {
      const list = enrollmentsByClass.get(enr.classId) ?? [];
      list.push(enr.id);
      enrollmentsByClass.set(enr.classId, list);
    }

    const classIds = yearClasses.map((c) => c.id);
    const allClassSubjects =
      classIds.length > 0
        ? await db
            .select({
              id: classSubjects.id,
              classId: classSubjects.classId,
              subjectId: classSubjects.subjectId,
              subjectCode: subjects.code,
              subjectName: subjects.name,
              subjectShortName: subjects.shortName,
            })
            .from(classSubjects)
            .innerJoin(subjects, eq(classSubjects.subjectId, subjects.id))
            .where(inArray(classSubjects.classId, classIds))
            .orderBy(asc(subjects.name))
        : [];

    const classSubjectsByClass = new Map<string, typeof allClassSubjects>();
    for (const cs of allClassSubjects) {
      const list = classSubjectsByClass.get(cs.classId) ?? [];
      list.push(cs);
      classSubjectsByClass.set(cs.classId, list);
    }

    const gradeRows =
      targetGradePeriodIds.length > 0
        ? await db
            .select({
              enrollmentId: grades.enrollmentId,
              classSubjectId: grades.classSubjectId,
              periodId: grades.periodId,
              status: grades.status,
              score: grades.score,
            })
            .from(grades)
            .where(inArray(grades.periodId, targetGradePeriodIds))
        : [];

    // Track per (enrollmentId:classSubjectId) which target periods have a valid grade entry
    const gradedPeriodsByKey = new Map<string, Set<string>>();
    for (const g of gradeRows) {
      if (g.status !== 'present' || g.score !== null) {
        const key = `${g.enrollmentId}:${g.classSubjectId}`;
        const set = gradedPeriodsByKey.get(key) ?? new Set<string>();
        set.add(g.periodId);
        gradedPeriodsByKey.set(key, set);
      }
    }

    const classResults: ClassCompletenessDto[] = yearClasses.map((cls) => {
      const classEnrollmentIds = enrollmentsByClass.get(cls.id) ?? [];
      const expectedStudents = classEnrollmentIds.length;
      const clsSubjects = classSubjectsByClass.get(cls.id) ?? [];

      const subjectEntries: SubjectCompletenessDto[] = clsSubjects.map((cs) => {
        let gradedCount = 0;
        if (targetGradePeriodIds.length > 0) {
          for (const enrollmentId of classEnrollmentIds) {
            const set = gradedPeriodsByKey.get(`${enrollmentId}:${cs.id}`);
            if (set && targetGradePeriodIds.every((pid) => set.has(pid))) {
              gradedCount += 1;
            }
          }
        }

        const missingCount = Math.max(0, expectedStudents - gradedCount);
        const isComplete =
          period.type === 'trimester' && targetGradePeriodIds.length === 0
            ? expectedStudents === 0
            : missingCount === 0;

        return {
          classSubjectId: cs.id,
          subjectId: cs.subjectId,
          subjectCode: cs.subjectCode,
          subjectName: cs.subjectName,
          subjectShortName: cs.subjectShortName,
          expectedStudents,
          gradedCount,
          missingCount,
          isComplete,
        };
      });

      return {
        classId: cls.id,
        className: cls.name,
        level: cls.level,
        expectedStudents,
        isComplete: subjectEntries.every((s) => s.isComplete),
        subjects: subjectEntries,
      };
    });

    return {
      periodId: period.id,
      periodCode: period.code,
      periodName: period.name,
      periodType: period.type,
      status: period.status,
      isComplete: classResults.every((c) => c.isComplete),
      classes: classResults,
    };
  }

  async function lockPeriod(
    periodId: string,
    currentUser: AuthUserPayload,
    reason = '',
  ): Promise<{
    period: PeriodDto;
    snapshots: { studentResultsCount: number; subjectResultsCount: number };
  }> {
    return db.transaction(async (tx) => {
      const txDb = tx as unknown as DbClient;

      const [period] = await tx.select().from(periods).where(eq(periods.id, periodId)).limit(1);
      if (!period) {
        throw new NotFoundError('Période introuvable.');
      }

      if (period.status === 'locked') {
        throw new ConflictError('La période est déjà verrouillée.');
      }

      const yearPeriods = await tx
        .select()
        .from(periods)
        .where(eq(periods.academicYearId, period.academicYearId))
        .orderBy(asc(periods.orderIndex));

      const periodsInput: PeriodDefinitionInput[] = yearPeriods.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        type: p.type,
        orderIndex: p.orderIndex,
        weight: Number(p.weight),
        parentPeriodId: p.parentPeriodId,
      }));

      const [dbRules] = await tx
        .select()
        .from(gradingRules)
        .where(eq(gradingRules.academicYearId, period.academicYearId))
        .limit(1);

      const rules: GradingRulesConfig = dbRules
        ? {
            trimestersCount: dbRules.trimestersCount,
            sequencesPerTrimester: dbRules.sequencesPerTrimester,
            sequenceWeights: dbRules.sequenceWeights,
            trimesterWeights: dbRules.trimesterWeights,
            passingThreshold: Number(dbRules.passingThreshold),
            honorRollThreshold: Number(dbRules.honorRollThreshold),
            encouragementThreshold: Number(dbRules.encouragementThreshold),
            congratulationThreshold: Number(dbRules.congratulationThreshold),
            treatAbsentAsZero: dbRules.treatAbsentAsZero,
            appreciationScale: dbRules.appreciationScale,
          }
        : CAMEROON_DEFAULT_GRADING_RULES;

      const relevantGradePeriodIds =
        period.type === 'trimester'
          ? [
              period.id,
              ...yearPeriods
                .filter((p) => p.type === 'sequence' && p.parentPeriodId === period.id)
                .map((p) => p.id),
            ]
          : [period.id];

      // Clear any stale snapshots for this periodId
      await tx.delete(periodSubjectResults).where(eq(periodSubjectResults.periodId, period.id));
      await tx.delete(periodStudentResults).where(eq(periodStudentResults.periodId, period.id));

      const yearClasses = await tx
        .select()
        .from(classes)
        .where(eq(classes.academicYearId, period.academicYearId))
        .orderBy(asc(classes.name));

      const allPeriodGrades =
        relevantGradePeriodIds.length > 0
          ? await tx.select().from(grades).where(inArray(grades.periodId, relevantGradePeriodIds))
          : [];

      let totalStudentSnapshots = 0;
      let totalSubjectSnapshots = 0;

      for (const cls of yearClasses) {
        const classEnrollments = await tx
          .select({ id: enrollments.id })
          .from(enrollments)
          .where(
            and(
              eq(enrollments.classId, cls.id),
              eq(enrollments.academicYearId, period.academicYearId),
              eq(enrollments.status, 'active'),
            ),
          );

        if (classEnrollments.length === 0) {
          continue;
        }

        const enrollmentIds = classEnrollments.map((e) => e.id);
        const enrollmentIdSet = new Set(enrollmentIds);

        const csRows = await tx
          .select({
            classSubjectId: classSubjects.id,
            subjectId: classSubjects.subjectId,
            subjectCode: subjects.code,
            subjectName: subjects.name,
            subjectShortName: subjects.shortName,
            subjectGroupName: subjectGroups.name,
            subjectGroupOrder: subjectGroups.orderIndex,
            coefficient: classSubjects.coefficient,
          })
          .from(classSubjects)
          .innerJoin(subjects, eq(classSubjects.subjectId, subjects.id))
          .leftJoin(subjectGroups, eq(classSubjects.subjectGroupId, subjectGroups.id))
          .where(eq(classSubjects.classId, cls.id));

        const csIds = csRows.map((cs) => cs.classSubjectId);
        const csIdSet = new Set(csIds);

        const teacherNameByCs = new Map<string, string>();
        if (csIds.length > 0) {
          const assignmentRows = await tx
            .select({
              classSubjectId: teacherAssignments.classSubjectId,
              teacherName: users.fullName,
            })
            .from(teacherAssignments)
            .innerJoin(users, eq(teacherAssignments.teacherId, users.id))
            .where(and(inArray(teacherAssignments.classSubjectId, csIds), eq(teacherAssignments.isActive, true)));

          for (const row of assignmentRows) {
            const existingName = teacherNameByCs.get(row.classSubjectId);
            teacherNameByCs.set(
              row.classSubjectId,
              existingName ? `${existingName}, ${row.teacherName}` : row.teacherName,
            );
          }
        }

        const subjectsInput: SubjectDefinitionInput[] = csRows.map((cs) => ({
          classSubjectId: cs.classSubjectId,
          subjectId: cs.subjectId,
          subjectCode: cs.subjectCode,
          subjectName: cs.subjectName,
          subjectShortName: cs.subjectShortName,
          subjectGroupName: cs.subjectGroupName ?? null,
          subjectGroupOrder: cs.subjectGroupOrder ?? 999,
          coefficient: Number(cs.coefficient),
          teacherName: teacherNameByCs.get(cs.classSubjectId) ?? null,
        }));

        const classGradesInput: RawGradeRecordInput[] = allPeriodGrades
          .filter((g) => enrollmentIdSet.has(g.enrollmentId) && csIdSet.has(g.classSubjectId))
          .map((g) => ({
            enrollmentId: g.enrollmentId,
            classSubjectId: g.classSubjectId,
            periodId: g.periodId,
            score: g.score !== null ? Number(g.score) : null,
            status: g.status,
          }));

        const report = calculator.computeClassResults({
          targetPeriodId: period.id,
          targetPeriodType: period.type,
          periods: periodsInput,
          subjects: subjectsInput,
          enrollmentIds,
          grades: classGradesInput,
          rules,
        });

        const studentSnapshots = report.students.map((s) => ({
          periodId: period.id,
          classId: cls.id,
          enrollmentId: s.enrollmentId,
          totalCoefficient: s.totalCoefficient.toFixed(2),
          totalPoints: s.totalPoints.toFixed(2),
          generalAverage: s.generalAverage !== null ? s.generalAverage.toFixed(2) : null,
          rank: s.rank,
          classSize: enrollmentIds.length,
          classAverage: report.classAverage !== null ? report.classAverage.toFixed(2) : null,
          minClassAverage: report.minClassAverage !== null ? report.minClassAverage.toFixed(2) : null,
          maxClassAverage: report.maxClassAverage !== null ? report.maxClassAverage.toFixed(2) : null,
          passRate: report.passRate !== null ? report.passRate.toFixed(2) : null,
          isHonorRoll: s.isHonorRoll,
          autoAppreciation: s.autoAppreciation,
        }));

        if (studentSnapshots.length > 0) {
          await tx.insert(periodStudentResults).values(studentSnapshots);
          totalStudentSnapshots += studentSnapshots.length;
        }

        const subjectSnapshots = report.students.flatMap((s) =>
          s.subjects.map((sub) => ({
            periodId: period.id,
            classId: cls.id,
            enrollmentId: s.enrollmentId,
            classSubjectId: sub.classSubjectId,
            sequenceScoresJson: sub.sequenceScores,
            average: sub.average !== null ? sub.average.toFixed(2) : null,
            weightedScore: sub.weightedScore !== null ? sub.weightedScore.toFixed(2) : null,
            rank: sub.rank,
            classAverage: sub.classAverage !== null ? sub.classAverage.toFixed(2) : null,
            minScore: sub.minScore !== null ? sub.minScore.toFixed(2) : null,
            maxScore: sub.maxScore !== null ? sub.maxScore.toFixed(2) : null,
            appreciation: sub.appreciation,
          })),
        );

        if (subjectSnapshots.length > 0) {
          await tx.insert(periodSubjectResults).values(subjectSnapshots);
          totalSubjectSnapshots += subjectSnapshots.length;
        }
      }

      const now = new Date();
      const syncVersion = await nextSyncVersion(txDb);
      const [updatedPeriod] = await tx
        .update(periods)
        .set({
          status: 'locked',
          lockedAt: now,
          lockedBy: currentUser.id,
          syncVersion,
          updatedAt: now,
        })
        .where(eq(periods.id, period.id))
        .returning();

      if (!updatedPeriod) {
        throw new Error('Échec du verrouillage de la période.');
      }

      await tx.insert(periodAuditLogs).values({
        periodId: period.id,
        action: 'locked',
        actorId: currentUser.id,
        reason,
      });

      return {
        period: toPeriodDto(updatedPeriod),
        snapshots: {
          studentResultsCount: totalStudentSnapshots,
          subjectResultsCount: totalSubjectSnapshots,
        },
      };
    });
  }

  async function unlockPeriod(
    periodId: string,
    currentUser: AuthUserPayload,
    reason: string,
  ): Promise<{ period: PeriodDto }> {
    return db.transaction(async (tx) => {
      const txDb = tx as unknown as DbClient;

      const [period] = await tx.select().from(periods).where(eq(periods.id, periodId)).limit(1);
      if (!period) {
        throw new NotFoundError('Période introuvable.');
      }

      if (period.status !== 'locked') {
        throw new ConflictError('La période est déjà ouverte.');
      }

      await tx.delete(periodSubjectResults).where(eq(periodSubjectResults.periodId, period.id));
      await tx.delete(periodStudentResults).where(eq(periodStudentResults.periodId, period.id));

      const now = new Date();
      const syncVersion = await nextSyncVersion(txDb);
      const [updatedPeriod] = await tx
        .update(periods)
        .set({
          status: 'open',
          lockedAt: null,
          lockedBy: null,
          syncVersion,
          updatedAt: now,
        })
        .where(eq(periods.id, period.id))
        .returning();

      if (!updatedPeriod) {
        throw new Error('Échec du déverrouillage de la période.');
      }

      await tx.insert(periodAuditLogs).values({
        periodId: period.id,
        action: 'unlocked',
        actorId: currentUser.id,
        reason,
      });

      return { period: toPeriodDto(updatedPeriod) };
    });
  }

  async function bulkUpsertCouncilDecisions(
    currentUser: AuthUserPayload,
    decisionsInput: CouncilDecisionInput[],
  ): Promise<CouncilDecisionDto[]> {
    return db.transaction(async (tx) => {
      const txDb = tx as unknown as DbClient;
      const savedList: CouncilDecisionDto[] = [];

      for (const item of decisionsInput) {
        const [enrollment] = await tx
          .select({
            id: enrollments.id,
            studentId: enrollments.studentId,
            classId: enrollments.classId,
            academicYearId: enrollments.academicYearId,
          })
          .from(enrollments)
          .where(eq(enrollments.id, item.enrollmentId))
          .limit(1);

        if (!enrollment) {
          throw new NotFoundError('Inscription élève introuvable.');
        }

        const [period] = await tx
          .select({ id: periods.id, academicYearId: periods.academicYearId })
          .from(periods)
          .where(eq(periods.id, item.periodId))
          .limit(1);

        if (!period) {
          throw new NotFoundError('Période introuvable.');
        }

        if (enrollment.academicYearId !== period.academicYearId) {
          throw new BadRequestError("La période et l'inscription n'appartiennent pas à la même année scolaire.");
        }

        const [student] = await tx
          .select({
            matricule: students.matricule,
            lastName: students.lastName,
            firstName: students.firstName,
          })
          .from(students)
          .where(eq(students.id, enrollment.studentId))
          .limit(1);

        const syncVersion = await nextSyncVersion(txDb);
        const now = new Date();

        const [saved] = await tx
          .insert(councilDecisions)
          .values({
            enrollmentId: item.enrollmentId,
            periodId: item.periodId,
            generalAppreciation: item.generalAppreciation,
            decision: item.decision,
            absencesHours: item.absencesHours,
            decidedBy: currentUser.id,
            syncVersion,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [councilDecisions.enrollmentId, councilDecisions.periodId],
            set: {
              generalAppreciation: item.generalAppreciation,
              decision: item.decision,
              absencesHours: item.absencesHours,
              decidedBy: currentUser.id,
              syncVersion,
              updatedAt: now,
            },
          })
          .returning();

        if (!saved) {
          throw new Error("Échec d'enregistrement de la décision du conseil.");
        }

        savedList.push({
          id: saved.id,
          enrollmentId: saved.enrollmentId,
          studentId: enrollment.studentId,
          studentMatricule: student?.matricule ?? '',
          studentLastName: student?.lastName ?? '',
          studentFirstName: student?.firstName ?? '',
          classId: enrollment.classId,
          periodId: saved.periodId,
          generalAppreciation: saved.generalAppreciation,
          decision: saved.decision,
          absencesHours: saved.absencesHours,
          decidedBy: saved.decidedBy,
          syncVersion: saved.syncVersion,
          updatedAt: saved.updatedAt.toISOString(),
        });
      }

      return savedList;
    });
  }

  async function listCouncilDecisions(
    currentUser: AuthUserPayload,
    filters: CouncilDecisionFilters,
  ): Promise<CouncilDecisionDto[]> {
    const conditions = [];
    if (filters.classId) {
      conditions.push(eq(enrollments.classId, filters.classId));
    }
    if (filters.periodId) {
      conditions.push(eq(councilDecisions.periodId, filters.periodId));
    }

    if (currentUser.role === 'teacher') {
      const assignedClassRows = await db
        .select({ classId: classSubjects.classId })
        .from(teacherAssignments)
        .innerJoin(classSubjects, eq(teacherAssignments.classSubjectId, classSubjects.id))
        .where(and(eq(teacherAssignments.teacherId, currentUser.id), eq(teacherAssignments.isActive, true)));

      const mainTeacherClassRows = await db
        .select({ classId: classes.id })
        .from(classes)
        .where(eq(classes.mainTeacherId, currentUser.id));

      const allowedClassIds = [
        ...new Set([
          ...assignedClassRows.map((r) => r.classId),
          ...mainTeacherClassRows.map((r) => r.classId),
        ]),
      ];

      if (allowedClassIds.length === 0) {
        return [];
      }

      conditions.push(inArray(enrollments.classId, allowedClassIds));
    }

    const rows = await db
      .select({
        id: councilDecisions.id,
        enrollmentId: councilDecisions.enrollmentId,
        studentId: enrollments.studentId,
        studentMatricule: students.matricule,
        studentLastName: students.lastName,
        studentFirstName: students.firstName,
        classId: enrollments.classId,
        periodId: councilDecisions.periodId,
        generalAppreciation: councilDecisions.generalAppreciation,
        decision: councilDecisions.decision,
        absencesHours: councilDecisions.absencesHours,
        decidedBy: councilDecisions.decidedBy,
        syncVersion: councilDecisions.syncVersion,
        updatedAt: councilDecisions.updatedAt,
      })
      .from(councilDecisions)
      .innerJoin(enrollments, eq(councilDecisions.enrollmentId, enrollments.id))
      .innerJoin(students, eq(enrollments.studentId, students.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(students.lastName), asc(students.firstName));

    return rows.map((row) => ({
      id: row.id,
      enrollmentId: row.enrollmentId,
      studentId: row.studentId,
      studentMatricule: row.studentMatricule,
      studentLastName: row.studentLastName,
      studentFirstName: row.studentFirstName,
      classId: row.classId,
      periodId: row.periodId,
      generalAppreciation: row.generalAppreciation,
      decision: row.decision,
      absencesHours: row.absencesHours,
      decidedBy: row.decidedBy,
      syncVersion: row.syncVersion,
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  return {
    getPeriodCompleteness,
    lockPeriod,
    unlockPeriod,
    bulkUpsertCouncilDecisions,
    listCouncilDecisions,
  };
}
