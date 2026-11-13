import {
  CAMEROON_DEFAULT_GRADING_RULES,
  type BulletinReportPayload,
  type BulletinStudentData,
  type BulletinSubjectRow,
  type ClassListReportPayload,
  type ClassPeriodComputationInput,
  type ClassPeriodComputedReport,
  type CouncilDecisionType,
  type GradeStatus,
  gradingCalculator,
  type GradingCalculatorContract,
  type GradingRulesConfig,
  type HonorRollReportPayload,
  type PeriodDefinitionInput,
  type PeriodStatus,
  type PeriodType,
  type RawGradeRecordInput,
  type SchoolProfileDto,
  type SequenceGradeDetail,
  type SubjectDefinitionInput,
} from '@lycee/shared';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { DbClient } from '../db/client.js';
import {
  academicYears,
  classes,
  classSubjects,
  councilDecisions,
  enrollments,
  grades,
  gradingRules,
  periods,
  periodStudentResults,
  periodSubjectResults,
  schoolProfile,
  students,
  subjectGroups,
  subjects,
  teacherAssignments,
  users,
} from '../db/schema.js';
import { BadRequestError, NotFoundError } from '../lib/errors.js';
import { fallbackGradingCalculator } from '../lib/grading-fallback.js';

export type ReportSchoolPayload = Omit<SchoolProfileDto, 'id' | 'updatedAt'> & {
  logoBase64DataUri: string | null;
};

export interface ClassResultsStatistics {
  classSize: number;
  evaluatedCount: number;
  passCount: number;
  passRate: number | null;
  classAverage: number | null;
  minClassAverage: number | null;
  maxClassAverage: number | null;
  honorRollCount: number;
  honorRollThreshold: number;
  passingThreshold: number;
}

export interface ClassResultsReport {
  academicYearId: string;
  academicYearLabel: string;
  isOfficial: boolean;
  fromSnapshot: boolean;
  period: {
    id: string;
    code: string;
    name: string;
    type: PeriodType;
    status: PeriodStatus;
    isOfficial: boolean;
    lockedAt: string | null;
  };
  classInfo: {
    id: string;
    name: string;
    level: string;
    series: string | null;
    mainTeacherId: string | null;
    mainTeacherName: string | null;
  };
  statistics: ClassResultsStatistics;
  students: BulletinStudentData[];
}

export interface HonorRollEntry {
  enrollmentId: string;
  studentId: string;
  rank: number;
  matricule: string;
  lastName: string;
  firstName: string;
  fullName: string;
  generalAverage: number;
  appreciation: string;
  autoAppreciation: string;
  councilDecision: CouncilDecisionType;
}

export interface HonorRollReport {
  academicYearId: string;
  academicYearLabel: string;
  isOfficial: boolean;
  period: {
    id: string;
    code: string;
    name: string;
    type: PeriodType;
    status: PeriodStatus;
    isOfficial: boolean;
  };
  classInfo: {
    id: string;
    name: string;
    level: string;
    series: string | null;
  };
  honorRollThreshold: number;
  entries: HonorRollEntry[];
}

export interface SchoolClassStatsEntry {
  classId: string;
  className: string;
  level: string;
  series: string | null;
  totalStudents: number;
  evaluatedStudents: number;
  passCount: number;
  average: number | null;
  passRate: number | null;
  minAverage: number | null;
  maxAverage: number | null;
}

export interface SchoolStatsReport {
  academicYearId: string;
  academicYearLabel: string;
  period: {
    id: string;
    code: string;
    name: string;
    type: PeriodType;
    status: PeriodStatus;
    isOfficial: boolean;
  };
  totalStudents: number;
  evaluatedStudents: number;
  overallAverage: number | null;
  overallPassRate: number | null;
  classes: SchoolClassStatsEntry[];
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'fr', { sensitivity: 'base' });
}

function normalizeSequenceDetail(detail: SequenceGradeDetail): SequenceGradeDetail {
  return {
    periodId: detail.periodId,
    code: detail.code,
    name: detail.name,
    orderIndex: detail.orderIndex,
    weight: detail.weight,
    score: detail.score,
    status: detail.status,
  };
}

function buildSequenceScoresFromGrades(
  childSequences: PeriodDefinitionInput[],
  enrollmentId: string,
  classSubjectId: string,
  gradeLookup: Map<string, { score: number | null; status: GradeStatus }>,
): SequenceGradeDetail[] {
  return childSequences.map((seq) => {
    const raw = gradeLookup.get(`${enrollmentId}:${classSubjectId}:${seq.id}`);
    return normalizeSequenceDetail({
      periodId: seq.id,
      code: seq.code,
      name: seq.name,
      orderIndex: seq.orderIndex,
      weight: seq.weight,
      score: raw ? raw.score : null,
      status: raw ? raw.status : null,
    });
  });
}

function assignCompetitionRanks<T>(
  items: T[],
  getScore: (item: T) => number | null,
  setRank: (item: T, rank: number | null) => void,
): void {
  const ranked = items
    .filter((item) => getScore(item) !== null)
    .sort((a, b) => (getScore(b) as number) - (getScore(a) as number));

  for (const item of items) {
    if (getScore(item) === null) {
      setRank(item, null);
    }
  }

  let currentRank = 0;
  let prevScore: number | null = null;
  ranked.forEach((item, index) => {
    const score = getScore(item) as number;
    if (score !== prevScore) {
      currentRank = index + 1;
      prevScore = score;
    }
    setRank(item, currentRank);
  });
}

function enhanceFallbackComputation(
  report: ClassPeriodComputedReport,
  input: ClassPeriodComputationInput,
  childSequences: PeriodDefinitionInput[],
  gradeLookup: Map<string, { score: number | null; status: GradeStatus }>,
  calculator: GradingCalculatorContract,
): ClassPeriodComputedReport {
  const isTrimesterWithChildren = input.targetPeriodType === 'trimester' && childSequences.length > 0;

  const students = report.students.map((student) => {
    if (!isTrimesterWithChildren) {
      return {
        ...student,
        subjects: student.subjects.map((sub) => ({ ...sub })),
      };
    }

    let totalCoefficient = 0;
    let totalPoints = 0;

    const subjects = student.subjects.map((sub) => {
      const sequenceScores = buildSequenceScoresFromGrades(
        childSequences,
        student.enrollmentId,
        sub.classSubjectId,
        gradeLookup,
      );

      let weightedSum = 0;
      let weightTotal = 0;
      sequenceScores.forEach((seq, idx) => {
        const effective =
          seq.status === 'present'
            ? seq.score
            : seq.status === 'absent' && input.rules.treatAbsentAsZero
              ? 0
              : null;
        if (effective !== null) {
          const w = seq.weight > 0 ? seq.weight : (input.rules.sequenceWeights[idx] ?? 1);
          weightedSum += effective * w;
          weightTotal += w;
        }
      });

      let average: number | null = null;
      if (weightTotal > 0) {
        average = calculator.roundGrade(weightedSum / weightTotal);
      } else {
        const direct = gradeLookup.get(`${student.enrollmentId}:${sub.classSubjectId}:${input.targetPeriodId}`);
        if (direct?.status === 'present' && direct.score !== null) {
          average = calculator.roundGrade(direct.score);
        } else if (direct?.status === 'absent' && input.rules.treatAbsentAsZero) {
          average = 0;
        }
      }

      const weightedScore = average !== null ? calculator.roundGrade(average * sub.coefficient) : null;
      if (average !== null) {
        totalCoefficient += sub.coefficient;
        totalPoints += average * sub.coefficient;
      }

      return {
        ...sub,
        sequenceScores,
        average,
        weightedScore,
        appreciation: calculator.resolveAppreciation(average, input.rules.appreciationScale),
      };
    });

    const generalAverage = totalCoefficient > 0 ? calculator.roundGrade(totalPoints / totalCoefficient) : null;
    return {
      ...student,
      subjects,
      totalCoefficient: calculator.roundGrade(totalCoefficient),
      totalPoints: calculator.roundGrade(totalPoints),
      generalAverage,
      rank: null as number | null,
      isHonorRoll: generalAverage !== null && generalAverage >= input.rules.honorRollThreshold,
      autoAppreciation: calculator.resolveAppreciation(generalAverage, input.rules.appreciationScale),
    };
  });

  // Compute per-subject class stats & subject ranks
  for (const subjectDef of input.subjects) {
    const subjectEntries = students
      .map((st) => st.subjects.find((s) => s.classSubjectId === subjectDef.classSubjectId))
      .filter((s): s is NonNullable<typeof s> => s !== undefined);

    const scores = subjectEntries
      .map((s) => s.average)
      .filter((avg): avg is number => avg !== null);

    const classAverage =
      scores.length > 0 ? calculator.roundGrade(scores.reduce((acc, v) => acc + v, 0) / scores.length) : null;
    const minScore = scores.length > 0 ? Math.min(...scores) : null;
    const maxScore = scores.length > 0 ? Math.max(...scores) : null;

    for (const entry of subjectEntries) {
      entry.classAverage = classAverage;
      entry.minScore = minScore;
      entry.maxScore = maxScore;
    }

    assignCompetitionRanks(
      subjectEntries,
      (item) => item.average,
      (item, rank) => {
        item.rank = rank;
      },
    );
  }

  assignCompetitionRanks(
    students,
    (st) => st.generalAverage,
    (st, rank) => {
      st.rank = rank;
    },
  );

  const evaluatedAverages = students
    .map((st) => st.generalAverage)
    .filter((avg): avg is number => avg !== null);
  const passCount = evaluatedAverages.filter((avg) => avg >= input.rules.passingThreshold).length;

  return {
    targetPeriodId: input.targetPeriodId,
    targetPeriodType: input.targetPeriodType,
    classAverage:
      evaluatedAverages.length > 0
        ? calculator.roundGrade(evaluatedAverages.reduce((acc, v) => acc + v, 0) / evaluatedAverages.length)
        : null,
    minClassAverage: evaluatedAverages.length > 0 ? Math.min(...evaluatedAverages) : null,
    maxClassAverage: evaluatedAverages.length > 0 ? Math.max(...evaluatedAverages) : null,
    evaluatedCount: evaluatedAverages.length,
    passCount,
    passRate:
      evaluatedAverages.length > 0
        ? calculator.roundGrade((passCount / evaluatedAverages.length) * 100)
        : null,
    students,
  };
}

export function createResultsService(
  db: DbClient,
  calculator: GradingCalculatorContract = gradingCalculator,
) {
  async function getSchoolProfilePayload(): Promise<ReportSchoolPayload> {
    const [row] = await db.select().from(schoolProfile).where(eq(schoolProfile.id, 1)).limit(1);

    if (!row) {
      return {
        name: 'Lycée',
        motto: 'Paix - Travail - Patrie',
        country: 'République du Cameroun',
        ministry: 'Ministère des Enseignements Secondaires',
        region: '',
        delegation: '',
        city: '',
        phone: '',
        email: '',
        hasLogo: false,
        logoMimeType: null,
        logoBase64DataUri: null,
      };
    }

    const hasLogo = Boolean(row.logoData && row.logoData.length > 0);
    const logoMimeType = hasLogo ? (row.logoMimeType ?? 'image/png') : null;
    const logoBase64DataUri =
      hasLogo && row.logoData
        ? `data:${logoMimeType};base64,${Buffer.from(row.logoData).toString('base64')}`
        : null;

    return {
      name: row.name,
      motto: row.motto,
      country: row.country,
      ministry: row.ministry,
      region: row.region,
      delegation: row.delegation,
      city: row.city,
      phone: row.phone,
      email: row.email,
      hasLogo,
      logoMimeType,
      logoBase64DataUri,
    };
  }

  async function loadGradingRules(academicYearId: string): Promise<GradingRulesConfig> {
    const [row] = await db
      .select()
      .from(gradingRules)
      .where(eq(gradingRules.academicYearId, academicYearId))
      .limit(1);

    if (!row) {
      return CAMEROON_DEFAULT_GRADING_RULES;
    }

    return {
      trimestersCount: row.trimestersCount,
      sequencesPerTrimester: row.sequencesPerTrimester,
      sequenceWeights:
        row.sequenceWeights.length > 0
          ? row.sequenceWeights
          : CAMEROON_DEFAULT_GRADING_RULES.sequenceWeights,
      trimesterWeights:
        row.trimesterWeights.length > 0
          ? row.trimesterWeights
          : CAMEROON_DEFAULT_GRADING_RULES.trimesterWeights,
      passingThreshold:
        toNumber(row.passingThreshold) ?? CAMEROON_DEFAULT_GRADING_RULES.passingThreshold,
      honorRollThreshold:
        toNumber(row.honorRollThreshold) ?? CAMEROON_DEFAULT_GRADING_RULES.honorRollThreshold,
      encouragementThreshold:
        toNumber(row.encouragementThreshold) ??
        CAMEROON_DEFAULT_GRADING_RULES.encouragementThreshold,
      congratulationThreshold:
        toNumber(row.congratulationThreshold) ??
        CAMEROON_DEFAULT_GRADING_RULES.congratulationThreshold,
      treatAbsentAsZero: row.treatAbsentAsZero,
      appreciationScale:
        row.appreciationScale.length > 0
          ? row.appreciationScale
          : CAMEROON_DEFAULT_GRADING_RULES.appreciationScale,
    };
  }

  async function loadClassSubjectDefinitions(
    classId: string,
    academicYearId: string,
  ): Promise<SubjectDefinitionInput[]> {
    const rows = await db
      .select({
        classSubjectId: classSubjects.id,
        subjectId: subjects.id,
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
      .where(eq(classSubjects.classId, classId));

    const classSubjectIds = rows.map((r) => r.classSubjectId);
    const teacherByClassSubject = new Map<string, string>();

    if (classSubjectIds.length > 0) {
      const assignmentRows = await db
        .select({
          classSubjectId: teacherAssignments.classSubjectId,
          teacherName: users.fullName,
        })
        .from(teacherAssignments)
        .innerJoin(users, eq(teacherAssignments.teacherId, users.id))
        .where(
          and(
            eq(teacherAssignments.academicYearId, academicYearId),
            eq(teacherAssignments.isActive, true),
            inArray(teacherAssignments.classSubjectId, classSubjectIds),
          ),
        )
        .orderBy(asc(teacherAssignments.createdAt), asc(users.fullName));

      for (const assignment of assignmentRows) {
        if (!teacherByClassSubject.has(assignment.classSubjectId)) {
          teacherByClassSubject.set(assignment.classSubjectId, assignment.teacherName);
        }
      }
    }

    const mapped: SubjectDefinitionInput[] = rows.map((r) => ({
      classSubjectId: r.classSubjectId,
      subjectId: r.subjectId,
      subjectCode: r.subjectCode,
      subjectName: r.subjectName,
      subjectShortName: r.subjectShortName,
      subjectGroupName: r.subjectGroupName ?? null,
      subjectGroupOrder: r.subjectGroupOrder ?? 999,
      coefficient: toNumber(r.coefficient) ?? 1,
      teacherName: teacherByClassSubject.get(r.classSubjectId) ?? null,
    }));

    mapped.sort((a, b) => {
      if (a.subjectGroupOrder !== b.subjectGroupOrder) {
        return a.subjectGroupOrder - b.subjectGroupOrder;
      }
      const byName = compareText(a.subjectName, b.subjectName);
      if (byName !== 0) return byName;
      return compareText(a.subjectCode, b.subjectCode);
    });

    return mapped;
  }

  async function getClassResults(classId: string, periodId: string): Promise<ClassResultsReport> {
    const [cls] = await db.select().from(classes).where(eq(classes.id, classId)).limit(1);
    if (!cls) {
      throw new NotFoundError('Classe introuvable.');
    }

    const [period] = await db.select().from(periods).where(eq(periods.id, periodId)).limit(1);
    if (!period) {
      throw new NotFoundError('Période introuvable.');
    }

    if (cls.academicYearId !== period.academicYearId) {
      throw new BadRequestError(
        'La classe et la période n’appartiennent pas à la même année scolaire.',
      );
    }

    const [year] = await db
      .select()
      .from(academicYears)
      .where(eq(academicYears.id, cls.academicYearId))
      .limit(1);
    if (!year) {
      throw new NotFoundError('Année scolaire introuvable.');
    }

    let mainTeacherName: string | null = null;
    if (cls.mainTeacherId) {
      const [teacher] = await db
        .select({ fullName: users.fullName })
        .from(users)
        .where(eq(users.id, cls.mainTeacherId))
        .limit(1);
      mainTeacherName = teacher?.fullName ?? null;
    }

    const rules = await loadGradingRules(cls.academicYearId);
    const subjectDefs = await loadClassSubjectDefinitions(cls.id, cls.academicYearId);
    const subjectDefMap = new Map(subjectDefs.map((s) => [s.classSubjectId, s]));

    const allYearPeriods = await db
      .select()
      .from(periods)
      .where(eq(periods.academicYearId, cls.academicYearId))
      .orderBy(asc(periods.orderIndex), asc(periods.code));

    const periodInputs: PeriodDefinitionInput[] = allYearPeriods.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      type: p.type,
      orderIndex: p.orderIndex,
      weight: toNumber(p.weight) ?? 1,
      parentPeriodId: p.parentPeriodId,
    }));

    const childSequences = periodInputs
      .filter((p) => p.type === 'sequence' && p.parentPeriodId === period.id)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    const isOfficial = period.status === 'locked';

    // Check snapshot when period is locked
    const snapshotStudentRows = isOfficial
      ? await db
          .select()
          .from(periodStudentResults)
          .where(
            and(
              eq(periodStudentResults.periodId, period.id),
              eq(periodStudentResults.classId, cls.id),
            ),
          )
      : [];

    if (isOfficial && snapshotStudentRows.length > 0) {
      const snapshotSubjectRows = await db
        .select()
        .from(periodSubjectResults)
        .where(
          and(
            eq(periodSubjectResults.periodId, period.id),
            eq(periodSubjectResults.classId, cls.id),
          ),
        );

      const snapshotEnrollmentIds = snapshotStudentRows.map((r) => r.enrollmentId);

      const enrollmentRows = await db
        .select({
          enrollmentId: enrollments.id,
          studentId: students.id,
          matricule: students.matricule,
          lastName: students.lastName,
          firstName: students.firstName,
          birthDate: students.birthDate,
          birthPlace: students.birthPlace,
          sex: students.sex,
          isRepeater: enrollments.isRepeater,
        })
        .from(enrollments)
        .innerJoin(students, eq(enrollments.studentId, students.id))
        .where(inArray(enrollments.id, snapshotEnrollmentIds));

      const enrollmentById = new Map(enrollmentRows.map((e) => [e.enrollmentId, e]));

      const decisionRows = await db
        .select()
        .from(councilDecisions)
        .where(
          and(
            eq(councilDecisions.periodId, period.id),
            inArray(councilDecisions.enrollmentId, snapshotEnrollmentIds),
          ),
        );
      const decisionByEnrollment = new Map(decisionRows.map((d) => [d.enrollmentId, d]));

      // Fallback grade lookup for trimester sequenceScores if snapshot sequenceScoresJson is empty
      const needsChildGradeBackfill =
        period.type === 'trimester' &&
        childSequences.length > 0 &&
        snapshotSubjectRows.some((r) => r.sequenceScoresJson.length === 0);

      const gradeLookup = new Map<string, { score: number | null; status: GradeStatus }>();
      if (needsChildGradeBackfill) {
        const childSeqIds = childSequences.map((s) => s.id);
        const rawGradeRows = await db
          .select()
          .from(grades)
          .where(
            and(
              inArray(grades.enrollmentId, snapshotEnrollmentIds),
              inArray(grades.periodId, childSeqIds),
            ),
          );
        for (const g of rawGradeRows) {
          gradeLookup.set(`${g.enrollmentId}:${g.classSubjectId}:${g.periodId}`, {
            score: toNumber(g.score),
            status: g.status,
          });
        }
      }

      const subjectRowsByEnrollment = new Map<string, typeof snapshotSubjectRows>();
      for (const sr of snapshotSubjectRows) {
        const list = subjectRowsByEnrollment.get(sr.enrollmentId) ?? [];
        list.push(sr);
        subjectRowsByEnrollment.set(sr.enrollmentId, list);
      }

      const bulletinStudents: BulletinStudentData[] = [];

      for (const snap of snapshotStudentRows) {
        const studentInfo = enrollmentById.get(snap.enrollmentId);
        if (!studentInfo) continue;

        const rawSubs = subjectRowsByEnrollment.get(snap.enrollmentId) ?? [];
        const subjectRows: BulletinSubjectRow[] = rawSubs.map((sr) => {
          const def = subjectDefMap.get(sr.classSubjectId);
          let seqScores: SequenceGradeDetail[] = [];
          if (period.type === 'trimester') {
            if (sr.sequenceScoresJson.length > 0) {
              seqScores = [...sr.sequenceScoresJson]
                .sort((a, b) => a.orderIndex - b.orderIndex)
                .map(normalizeSequenceDetail);
            } else if (childSequences.length > 0) {
              seqScores = buildSequenceScoresFromGrades(
                childSequences,
                snap.enrollmentId,
                sr.classSubjectId,
                gradeLookup,
              );
            }
          }

          return {
            classSubjectId: sr.classSubjectId,
            subjectCode: def?.subjectCode ?? '',
            subjectName: def?.subjectName ?? sr.classSubjectId,
            subjectShortName: def?.subjectShortName ?? '',
            subjectGroupName: def?.subjectGroupName ?? null,
            subjectGroupOrder: def?.subjectGroupOrder ?? 999,
            coefficient: def?.coefficient ?? 1,
            teacherName: def?.teacherName ?? null,
            sequenceScores: seqScores,
            average: toNumber(sr.average),
            weightedScore: toNumber(sr.weightedScore),
            rank: sr.rank,
            classAverage: toNumber(sr.classAverage),
            minScore: toNumber(sr.minScore),
            maxScore: toNumber(sr.maxScore),
            appreciation: sr.appreciation,
          };
        });

        subjectRows.sort((a, b) => {
          if (a.subjectGroupOrder !== b.subjectGroupOrder) {
            return a.subjectGroupOrder - b.subjectGroupOrder;
          }
          const byName = compareText(a.subjectName, b.subjectName);
          if (byName !== 0) return byName;
          return compareText(a.subjectCode, b.subjectCode);
        });

        const decision = decisionByEnrollment.get(snap.enrollmentId);
        bulletinStudents.push({
          enrollmentId: snap.enrollmentId,
          studentId: studentInfo.studentId,
          matricule: studentInfo.matricule,
          lastName: studentInfo.lastName,
          firstName: studentInfo.firstName,
          birthDate: studentInfo.birthDate,
          birthPlace: studentInfo.birthPlace,
          sex: studentInfo.sex,
          isRepeater: studentInfo.isRepeater,
          subjects: subjectRows,
          totalCoefficient: toNumber(snap.totalCoefficient) ?? 0,
          totalPoints: toNumber(snap.totalPoints) ?? 0,
          generalAverage: toNumber(snap.generalAverage),
          rank: snap.rank,
          classSize: snap.classSize,
          classAverage: toNumber(snap.classAverage),
          minClassAverage: toNumber(snap.minClassAverage),
          maxClassAverage: toNumber(snap.maxClassAverage),
          passRate: toNumber(snap.passRate),
          isHonorRoll: snap.isHonorRoll,
          autoAppreciation: snap.autoAppreciation,
          councilDecision: decision?.decision ?? 'none',
          councilAppreciation: decision?.generalAppreciation ?? '',
          absencesHours: decision?.absencesHours ?? 0,
        });
      }

      bulletinStudents.sort((a, b) => {
        const byLast = compareText(a.lastName, b.lastName);
        if (byLast !== 0) return byLast;
        const byFirst = compareText(a.firstName, b.firstName);
        if (byFirst !== 0) return byFirst;
        return compareText(a.matricule, b.matricule);
      });

      const firstSnap = snapshotStudentRows[0];
      const evaluatedCount = bulletinStudents.filter((s) => s.generalAverage !== null).length;
      const passCount = bulletinStudents.filter(
        (s) => s.generalAverage !== null && s.generalAverage >= rules.passingThreshold,
      ).length;
      const honorRollCount = bulletinStudents.filter((s) => s.isHonorRoll).length;

      return {
        academicYearId: year.id,
        academicYearLabel: year.label,
        isOfficial: true,
        fromSnapshot: true,
        period: {
          id: period.id,
          code: period.code,
          name: period.name,
          type: period.type,
          status: period.status,
          isOfficial: true,
          lockedAt: period.lockedAt ? period.lockedAt.toISOString() : null,
        },
        classInfo: {
          id: cls.id,
          name: cls.name,
          level: cls.level,
          series: cls.series,
          mainTeacherId: cls.mainTeacherId,
          mainTeacherName,
        },
        statistics: {
          classSize: firstSnap?.classSize ?? bulletinStudents.length,
          evaluatedCount,
          passCount,
          passRate: toNumber(firstSnap?.passRate),
          classAverage: toNumber(firstSnap?.classAverage),
          minClassAverage: toNumber(firstSnap?.minClassAverage),
          maxClassAverage: toNumber(firstSnap?.maxClassAverage),
          honorRollCount,
          honorRollThreshold: rules.honorRollThreshold,
          passingThreshold: rules.passingThreshold,
        },
        students: bulletinStudents,
      };
    }

    // Dynamic calculation path
    const activeEnrollments = await db
      .select({
        enrollmentId: enrollments.id,
        studentId: students.id,
        matricule: students.matricule,
        lastName: students.lastName,
        firstName: students.firstName,
        birthDate: students.birthDate,
        birthPlace: students.birthPlace,
        sex: students.sex,
        isRepeater: enrollments.isRepeater,
      })
      .from(enrollments)
      .innerJoin(students, eq(enrollments.studentId, students.id))
      .where(and(eq(enrollments.classId, cls.id), eq(enrollments.status, 'active')));

    activeEnrollments.sort((a, b) => {
      const byLast = compareText(a.lastName, b.lastName);
      if (byLast !== 0) return byLast;
      const byFirst = compareText(a.firstName, b.firstName);
      if (byFirst !== 0) return byFirst;
      return compareText(a.matricule, b.matricule);
    });

    const enrollmentIds = activeEnrollments.map((e) => e.enrollmentId);
    const periodIds = periodInputs.map((p) => p.id);

    const rawGradesRows =
      enrollmentIds.length > 0 && periodIds.length > 0
        ? await db
            .select()
            .from(grades)
            .where(
              and(
                inArray(grades.enrollmentId, enrollmentIds),
                inArray(grades.periodId, periodIds),
              ),
            )
        : [];

    const rawGrades: RawGradeRecordInput[] = rawGradesRows.map((g) => ({
      enrollmentId: g.enrollmentId,
      classSubjectId: g.classSubjectId,
      periodId: g.periodId,
      score: toNumber(g.score),
      status: g.status,
    }));

    const gradeLookup = new Map<string, { score: number | null; status: GradeStatus }>();
    for (const g of rawGrades) {
      gradeLookup.set(`${g.enrollmentId}:${g.classSubjectId}:${g.periodId}`, {
        score: g.score,
        status: g.status,
      });
    }

    const computationInput: ClassPeriodComputationInput = {
      targetPeriodId: period.id,
      targetPeriodType: period.type,
      periods: periodInputs,
      subjects: subjectDefs,
      enrollmentIds,
      grades: rawGrades,
      rules,
    };

    let computed = calculator.computeClassResults(computationInput);
    if (calculator === fallbackGradingCalculator) {
      computed = enhanceFallbackComputation(
        computed,
        computationInput,
        childSequences,
        gradeLookup,
        calculator,
      );
    }

    const decisionRows =
      enrollmentIds.length > 0
        ? await db
            .select()
            .from(councilDecisions)
            .where(
              and(
                eq(councilDecisions.periodId, period.id),
                inArray(councilDecisions.enrollmentId, enrollmentIds),
              ),
            )
        : [];
    const decisionByEnrollment = new Map(decisionRows.map((d) => [d.enrollmentId, d]));

    const computedByEnrollment = new Map(computed.students.map((s) => [s.enrollmentId, s]));
    const classSize = activeEnrollments.length;

    const bulletinStudents: BulletinStudentData[] = activeEnrollments.map((enr) => {
      const comp = computedByEnrollment.get(enr.enrollmentId);
      const decision = decisionByEnrollment.get(enr.enrollmentId);

      const subjectRows: BulletinSubjectRow[] = (comp?.subjects ?? []).map((sub) => {
        let sequenceScores: SequenceGradeDetail[] = [];
        if (period.type === 'trimester') {
          if (sub.sequenceScores.length > 0) {
            sequenceScores = [...sub.sequenceScores]
              .sort((a, b) => a.orderIndex - b.orderIndex)
              .map(normalizeSequenceDetail);
          } else if (childSequences.length > 0) {
            sequenceScores = buildSequenceScoresFromGrades(
              childSequences,
              enr.enrollmentId,
              sub.classSubjectId,
              gradeLookup,
            );
          }
        }

        return {
          classSubjectId: sub.classSubjectId,
          subjectCode: sub.subjectCode,
          subjectName: sub.subjectName,
          subjectShortName: sub.subjectShortName,
          subjectGroupName: sub.subjectGroupName,
          subjectGroupOrder: sub.subjectGroupOrder,
          coefficient: sub.coefficient,
          teacherName: sub.teacherName,
          sequenceScores,
          average: sub.average,
          weightedScore: sub.weightedScore,
          rank: sub.rank,
          classAverage: sub.classAverage,
          minScore: sub.minScore,
          maxScore: sub.maxScore,
          appreciation: sub.appreciation,
        };
      });

      subjectRows.sort((a, b) => {
        if (a.subjectGroupOrder !== b.subjectGroupOrder) {
          return a.subjectGroupOrder - b.subjectGroupOrder;
        }
        const byName = compareText(a.subjectName, b.subjectName);
        if (byName !== 0) return byName;
        return compareText(a.subjectCode, b.subjectCode);
      });

      return {
        enrollmentId: enr.enrollmentId,
        studentId: enr.studentId,
        matricule: enr.matricule,
        lastName: enr.lastName,
        firstName: enr.firstName,
        birthDate: enr.birthDate,
        birthPlace: enr.birthPlace,
        sex: enr.sex,
        isRepeater: enr.isRepeater,
        subjects: subjectRows,
        totalCoefficient: comp?.totalCoefficient ?? 0,
        totalPoints: comp?.totalPoints ?? 0,
        generalAverage: comp?.generalAverage ?? null,
        rank: comp?.rank ?? null,
        classSize,
        classAverage: computed.classAverage,
        minClassAverage: computed.minClassAverage,
        maxClassAverage: computed.maxClassAverage,
        passRate: computed.passRate,
        isHonorRoll: comp?.isHonorRoll ?? false,
        autoAppreciation: comp?.autoAppreciation ?? '',
        councilDecision: decision?.decision ?? 'none',
        councilAppreciation: decision?.generalAppreciation ?? '',
        absencesHours: decision?.absencesHours ?? 0,
      };
    });

    const honorRollCount = bulletinStudents.filter((s) => s.isHonorRoll).length;

    return {
      academicYearId: year.id,
      academicYearLabel: year.label,
      isOfficial,
      fromSnapshot: false,
      period: {
        id: period.id,
        code: period.code,
        name: period.name,
        type: period.type,
        status: period.status,
        isOfficial,
        lockedAt: period.lockedAt ? period.lockedAt.toISOString() : null,
      },
      classInfo: {
        id: cls.id,
        name: cls.name,
        level: cls.level,
        series: cls.series,
        mainTeacherId: cls.mainTeacherId,
        mainTeacherName,
      },
      statistics: {
        classSize,
        evaluatedCount: computed.evaluatedCount,
        passCount: computed.passCount,
        passRate: computed.passRate,
        classAverage: computed.classAverage,
        minClassAverage: computed.minClassAverage,
        maxClassAverage: computed.maxClassAverage,
        honorRollCount,
        honorRollThreshold: rules.honorRollThreshold,
        passingThreshold: rules.passingThreshold,
      },
      students: bulletinStudents,
    };
  }

  async function getHonorRoll(classId: string, periodId: string): Promise<HonorRollReport> {
    const classResults = await getClassResults(classId, periodId);

    const eligible = classResults.students
      .filter((s) => s.isHonorRoll && s.generalAverage !== null)
      .sort((a, b) => {
        const rankA = a.rank ?? Number.MAX_SAFE_INTEGER;
        const rankB = b.rank ?? Number.MAX_SAFE_INTEGER;
        if (rankA !== rankB) return rankA - rankB;
        const avgDiff = (b.generalAverage ?? 0) - (a.generalAverage ?? 0);
        if (avgDiff !== 0) return avgDiff;
        const byLast = compareText(a.lastName, b.lastName);
        if (byLast !== 0) return byLast;
        return compareText(a.firstName, b.firstName);
      });

    const entries: HonorRollEntry[] = eligible.map((s) => ({
      enrollmentId: s.enrollmentId,
      studentId: s.studentId,
      rank: s.rank ?? 0,
      matricule: s.matricule,
      lastName: s.lastName,
      firstName: s.firstName,
      fullName: `${s.lastName} ${s.firstName}`.trim(),
      generalAverage: s.generalAverage as number,
      appreciation: s.councilAppreciation.trim().length > 0 ? s.councilAppreciation : s.autoAppreciation,
      autoAppreciation: s.autoAppreciation,
      councilDecision: s.councilDecision,
    }));

    return {
      academicYearId: classResults.academicYearId,
      academicYearLabel: classResults.academicYearLabel,
      isOfficial: classResults.isOfficial,
      period: {
        id: classResults.period.id,
        code: classResults.period.code,
        name: classResults.period.name,
        type: classResults.period.type,
        status: classResults.period.status,
        isOfficial: classResults.period.isOfficial,
      },
      classInfo: {
        id: classResults.classInfo.id,
        name: classResults.classInfo.name,
        level: classResults.classInfo.level,
        series: classResults.classInfo.series,
      },
      honorRollThreshold: classResults.statistics.honorRollThreshold,
      entries,
    };
  }

  async function getSchoolStats(academicYearId: string, periodId: string): Promise<SchoolStatsReport> {
    const [year] = await db
      .select()
      .from(academicYears)
      .where(eq(academicYears.id, academicYearId))
      .limit(1);
    if (!year) {
      throw new NotFoundError('Année scolaire introuvable.');
    }

    const [period] = await db.select().from(periods).where(eq(periods.id, periodId)).limit(1);
    if (!period) {
      throw new NotFoundError('Période introuvable.');
    }

    if (period.academicYearId !== academicYearId) {
      throw new BadRequestError('La période n’appartient pas à cette année scolaire.');
    }

    const isOfficial = period.status === 'locked';

    const yearClasses = await db
      .select()
      .from(classes)
      .where(eq(classes.academicYearId, academicYearId))
      .orderBy(asc(classes.level), asc(classes.name));

    if (yearClasses.length === 0) {
      return {
        academicYearId: year.id,
        academicYearLabel: year.label,
        period: {
          id: period.id,
          code: period.code,
          name: period.name,
          type: period.type,
          status: period.status,
          isOfficial,
        },
        totalStudents: 0,
        evaluatedStudents: 0,
        overallAverage: null,
        overallPassRate: null,
        classes: [],
      };
    }

    const rules = await loadGradingRules(academicYearId);
    const classIds = yearClasses.map((cls) => cls.id);

    const snapshotStudentRows = isOfficial
      ? await db
          .select({
            classId: periodStudentResults.classId,
            enrollmentId: periodStudentResults.enrollmentId,
            generalAverage: periodStudentResults.generalAverage,
            classSize: periodStudentResults.classSize,
            classAverage: periodStudentResults.classAverage,
            minClassAverage: periodStudentResults.minClassAverage,
            maxClassAverage: periodStudentResults.maxClassAverage,
            passRate: periodStudentResults.passRate,
          })
          .from(periodStudentResults)
          .where(
            and(
              eq(periodStudentResults.periodId, period.id),
              inArray(periodStudentResults.classId, classIds),
            ),
          )
      : [];

    const snapshotsByClass = new Map<string, typeof snapshotStudentRows>();
    for (const row of snapshotStudentRows) {
      const list = snapshotsByClass.get(row.classId) ?? [];
      list.push(row);
      snapshotsByClass.set(row.classId, list);
    }

    const uncachedClassIds = yearClasses
      .filter((cls) => (snapshotsByClass.get(cls.id)?.length ?? 0) === 0)
      .map((cls) => cls.id);

    let periodInputs: PeriodDefinitionInput[] = [];
    let childSequences: PeriodDefinitionInput[] = [];
    const subjectsByClass = new Map<string, SubjectDefinitionInput[]>();
    const enrollmentsByClass = new Map<
      string,
      Array<{
        enrollmentId: string;
        classId: string;
        lastName: string;
        firstName: string;
        matricule: string;
      }>
    >();
    const gradesByClass = new Map<string, RawGradeRecordInput[]>();

    if (uncachedClassIds.length > 0) {
      const allYearPeriods = await db
        .select()
        .from(periods)
        .where(eq(periods.academicYearId, academicYearId))
        .orderBy(asc(periods.orderIndex), asc(periods.code));

      periodInputs = allYearPeriods.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        type: p.type,
        orderIndex: p.orderIndex,
        weight: toNumber(p.weight) ?? 1,
        parentPeriodId: p.parentPeriodId,
      }));

      childSequences = periodInputs
        .filter((p) => p.type === 'sequence' && p.parentPeriodId === period.id)
        .sort((a, b) => a.orderIndex - b.orderIndex);

      const csRows = await db
        .select({
          classId: classSubjects.classId,
          classSubjectId: classSubjects.id,
          subjectId: subjects.id,
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
        .where(inArray(classSubjects.classId, uncachedClassIds));

      const csIds = csRows.map((row) => row.classSubjectId);
      const teacherByClassSubject = new Map<string, string>();

      if (csIds.length > 0) {
        const assignmentRows = await db
          .select({
            classSubjectId: teacherAssignments.classSubjectId,
            teacherName: users.fullName,
          })
          .from(teacherAssignments)
          .innerJoin(users, eq(teacherAssignments.teacherId, users.id))
          .where(
            and(
              eq(teacherAssignments.academicYearId, academicYearId),
              eq(teacherAssignments.isActive, true),
              inArray(teacherAssignments.classSubjectId, csIds),
            ),
          )
          .orderBy(asc(teacherAssignments.createdAt), asc(users.fullName));

        for (const assignment of assignmentRows) {
          if (!teacherByClassSubject.has(assignment.classSubjectId)) {
            teacherByClassSubject.set(assignment.classSubjectId, assignment.teacherName);
          }
        }
      }

      for (const row of csRows) {
        const list = subjectsByClass.get(row.classId) ?? [];
        list.push({
          classSubjectId: row.classSubjectId,
          subjectId: row.subjectId,
          subjectCode: row.subjectCode,
          subjectName: row.subjectName,
          subjectShortName: row.subjectShortName,
          subjectGroupName: row.subjectGroupName ?? null,
          subjectGroupOrder: row.subjectGroupOrder ?? 999,
          coefficient: toNumber(row.coefficient) ?? 1,
          teacherName: teacherByClassSubject.get(row.classSubjectId) ?? null,
        });
        subjectsByClass.set(row.classId, list);
      }

      for (const list of subjectsByClass.values()) {
        list.sort((a, b) => {
          if (a.subjectGroupOrder !== b.subjectGroupOrder) {
            return a.subjectGroupOrder - b.subjectGroupOrder;
          }
          const byName = compareText(a.subjectName, b.subjectName);
          if (byName !== 0) return byName;
          return compareText(a.subjectCode, b.subjectCode);
        });
      }

      const activeEnrollments = await db
        .select({
          enrollmentId: enrollments.id,
          classId: enrollments.classId,
          lastName: students.lastName,
          firstName: students.firstName,
          matricule: students.matricule,
        })
        .from(enrollments)
        .innerJoin(students, eq(enrollments.studentId, students.id))
        .where(
          and(inArray(enrollments.classId, uncachedClassIds), eq(enrollments.status, 'active')),
        );

      const classByEnrollment = new Map<string, string>();
      for (const enr of activeEnrollments) {
        classByEnrollment.set(enr.enrollmentId, enr.classId);
        const list = enrollmentsByClass.get(enr.classId) ?? [];
        list.push(enr);
        enrollmentsByClass.set(enr.classId, list);
      }

      for (const list of enrollmentsByClass.values()) {
        list.sort((a, b) => {
          const byLast = compareText(a.lastName, b.lastName);
          if (byLast !== 0) return byLast;
          const byFirst = compareText(a.firstName, b.firstName);
          if (byFirst !== 0) return byFirst;
          return compareText(a.matricule, b.matricule);
        });
      }

      const enrollmentIds = activeEnrollments.map((enr) => enr.enrollmentId);
      const periodIds = periodInputs.map((p) => p.id);

      if (enrollmentIds.length > 0 && periodIds.length > 0) {
        const rawGradesRows = await db
          .select({
            enrollmentId: grades.enrollmentId,
            classSubjectId: grades.classSubjectId,
            periodId: grades.periodId,
            score: grades.score,
            status: grades.status,
          })
          .from(grades)
          .where(
            and(
              inArray(grades.enrollmentId, enrollmentIds),
              inArray(grades.periodId, periodIds),
            ),
          );

        for (const g of rawGradesRows) {
          const clsId = classByEnrollment.get(g.enrollmentId);
          if (!clsId) continue;
          const list = gradesByClass.get(clsId) ?? [];
          list.push({
            enrollmentId: g.enrollmentId,
            classSubjectId: g.classSubjectId,
            periodId: g.periodId,
            score: toNumber(g.score),
            status: g.status,
          });
          gradesByClass.set(clsId, list);
        }
      }
    }

    let totalStudents = 0;
    let evaluatedStudents = 0;
    let totalPassCount = 0;
    let sumEvaluatedAverages = 0;
    const perClass: SchoolClassStatsEntry[] = [];

    for (const cls of yearClasses) {
      const snaps = snapshotsByClass.get(cls.id);

      if (snaps && snaps.length > 0) {
        const firstSnap = snaps[0];
        const classSize = firstSnap?.classSize ?? snaps.length;
        let classEvaluatedCount = 0;
        let classPassCount = 0;

        for (const snap of snaps) {
          const avg = toNumber(snap.generalAverage);
          if (avg !== null) {
            classEvaluatedCount += 1;
            sumEvaluatedAverages += avg;
            if (avg >= rules.passingThreshold) {
              classPassCount += 1;
            }
          }
        }

        totalStudents += classSize;
        evaluatedStudents += classEvaluatedCount;
        totalPassCount += classPassCount;

        perClass.push({
          classId: cls.id,
          className: cls.name,
          level: cls.level,
          series: cls.series,
          totalStudents: classSize,
          evaluatedStudents: classEvaluatedCount,
          passCount: classPassCount,
          average: toNumber(firstSnap?.classAverage),
          passRate: toNumber(firstSnap?.passRate),
          minAverage: toNumber(firstSnap?.minClassAverage),
          maxAverage: toNumber(firstSnap?.maxClassAverage),
        });
        continue;
      }

      const classEnrollments = enrollmentsByClass.get(cls.id) ?? [];
      const enrollmentIds = classEnrollments.map((enr) => enr.enrollmentId);
      const classRawGrades = gradesByClass.get(cls.id) ?? [];
      const classSubjectDefs = subjectsByClass.get(cls.id) ?? [];

      const computationInput: ClassPeriodComputationInput = {
        targetPeriodId: period.id,
        targetPeriodType: period.type,
        periods: periodInputs,
        subjects: classSubjectDefs,
        enrollmentIds,
        grades: classRawGrades,
        rules,
      };

      let computed = calculator.computeClassResults(computationInput);
      if (calculator === fallbackGradingCalculator) {
        const gradeLookup = new Map<string, { score: number | null; status: GradeStatus }>();
        for (const g of classRawGrades) {
          gradeLookup.set(`${g.enrollmentId}:${g.classSubjectId}:${g.periodId}`, {
            score: g.score,
            status: g.status,
          });
        }
        computed = enhanceFallbackComputation(
          computed,
          computationInput,
          childSequences,
          gradeLookup,
          calculator,
        );
      }

      const classSize = classEnrollments.length;
      totalStudents += classSize;
      evaluatedStudents += computed.evaluatedCount;
      totalPassCount += computed.passCount;

      for (const st of computed.students) {
        if (st.generalAverage !== null) {
          sumEvaluatedAverages += st.generalAverage;
        }
      }

      perClass.push({
        classId: cls.id,
        className: cls.name,
        level: cls.level,
        series: cls.series,
        totalStudents: classSize,
        evaluatedStudents: computed.evaluatedCount,
        passCount: computed.passCount,
        average: computed.classAverage,
        passRate: computed.passRate,
        minAverage: computed.minClassAverage,
        maxAverage: computed.maxClassAverage,
      });
    }

    const overallAverage =
      evaluatedStudents > 0 ? calculator.roundGrade(sumEvaluatedAverages / evaluatedStudents) : null;
    const overallPassRate =
      evaluatedStudents > 0 ? calculator.roundGrade((totalPassCount / evaluatedStudents) * 100) : null;

    return {
      academicYearId: year.id,
      academicYearLabel: year.label,
      period: {
        id: period.id,
        code: period.code,
        name: period.name,
        type: period.type,
        status: period.status,
        isOfficial,
      },
      totalStudents,
      evaluatedStudents,
      overallAverage,
      overallPassRate,
      classes: perClass,
    };
  }

  async function buildBulletinPayload(options: {
    classId?: string;
    enrollmentId?: string;
    periodId: string;
  }): Promise<BulletinReportPayload> {
    if (!options.classId && !options.enrollmentId) {
      throw new BadRequestError('classId ou enrollmentId est requis.');
    }

    let targetClassId = options.classId;

    if (options.enrollmentId) {
      const [enr] = await db
        .select()
        .from(enrollments)
        .where(eq(enrollments.id, options.enrollmentId))
        .limit(1);
      if (!enr) {
        throw new NotFoundError('Inscription élève introuvable.');
      }
      if (targetClassId && targetClassId !== enr.classId) {
        throw new BadRequestError('L’inscription ne correspond pas à la classe demandée.');
      }
      targetClassId = enr.classId;
    }

    const [school, classResults] = await Promise.all([
      getSchoolProfilePayload(),
      getClassResults(targetClassId as string, options.periodId),
    ]);

    let selectedStudents = classResults.students;
    if (options.enrollmentId) {
      const single = classResults.students.find((s) => s.enrollmentId === options.enrollmentId);
      if (!single) {
        throw new NotFoundError('Aucun résultat trouvé pour cet élève.');
      }
      selectedStudents = [single];
    }

    return {
      school,
      academicYearLabel: classResults.academicYearLabel,
      period: {
        id: classResults.period.id,
        code: classResults.period.code,
        name: classResults.period.name,
        type: classResults.period.type,
        isOfficial: classResults.period.isOfficial,
        lockedAt: classResults.period.lockedAt,
      },
      classInfo: {
        id: classResults.classInfo.id,
        name: classResults.classInfo.name,
        level: classResults.classInfo.level,
        series: classResults.classInfo.series,
        mainTeacherName: classResults.classInfo.mainTeacherName,
      },
      generatedAt: new Date().toISOString(),
      students: selectedStudents,
    };
  }

  async function buildClassListPayload(classId: string): Promise<ClassListReportPayload> {
    const [cls] = await db.select().from(classes).where(eq(classes.id, classId)).limit(1);
    if (!cls) {
      throw new NotFoundError('Classe introuvable.');
    }

    const [year] = await db
      .select()
      .from(academicYears)
      .where(eq(academicYears.id, cls.academicYearId))
      .limit(1);
    if (!year) {
      throw new NotFoundError('Année scolaire introuvable.');
    }

    let mainTeacherName: string | null = null;
    if (cls.mainTeacherId) {
      const [teacher] = await db
        .select({ fullName: users.fullName })
        .from(users)
        .where(eq(users.id, cls.mainTeacherId))
        .limit(1);
      mainTeacherName = teacher?.fullName ?? null;
    }

    const [school, enrollmentRows] = await Promise.all([
      getSchoolProfilePayload(),
      db
        .select({
          matricule: students.matricule,
          lastName: students.lastName,
          firstName: students.firstName,
          birthDate: students.birthDate,
          sex: students.sex,
          isRepeater: enrollments.isRepeater,
          status: enrollments.status,
        })
        .from(enrollments)
        .innerJoin(students, eq(enrollments.studentId, students.id))
        .where(eq(enrollments.classId, cls.id)),
    ]);

    enrollmentRows.sort((a, b) => {
      const byLast = compareText(a.lastName, b.lastName);
      if (byLast !== 0) return byLast;
      const byFirst = compareText(a.firstName, b.firstName);
      if (byFirst !== 0) return byFirst;
      return compareText(a.matricule, b.matricule);
    });

    return {
      school,
      academicYearLabel: year.label,
      classInfo: {
        id: cls.id,
        name: cls.name,
        level: cls.level,
        series: cls.series,
        mainTeacherName,
      },
      generatedAt: new Date().toISOString(),
      students: enrollmentRows.map((row, index) => ({
        order: index + 1,
        matricule: row.matricule,
        lastName: row.lastName,
        firstName: row.firstName,
        birthDate: row.birthDate,
        sex: row.sex,
        isRepeater: row.isRepeater,
        status: row.status,
      })),
    };
  }

  async function buildHonorRollPayload(
    classId: string,
    periodId: string,
  ): Promise<HonorRollReportPayload> {
    const [school, honorRoll] = await Promise.all([
      getSchoolProfilePayload(),
      getHonorRoll(classId, periodId),
    ]);

    return {
      school,
      academicYearLabel: honorRoll.academicYearLabel,
      period: {
        id: honorRoll.period.id,
        code: honorRoll.period.code,
        name: honorRoll.period.name,
        isOfficial: honorRoll.period.isOfficial,
      },
      classInfo: {
        id: honorRoll.classInfo.id,
        name: honorRoll.classInfo.name,
        level: honorRoll.classInfo.level,
      },
      honorRollThreshold: honorRoll.honorRollThreshold,
      generatedAt: new Date().toISOString(),
      entries: honorRoll.entries.map((e) => ({
        rank: e.rank,
        matricule: e.matricule,
        fullName: e.fullName,
        generalAverage: e.generalAverage,
        appreciation: e.appreciation,
        councilDecision: e.councilDecision,
      })),
    };
  }

  return {
    getClassResults,
    getHonorRoll,
    getSchoolStats,
    buildBulletinPayload,
    buildClassListPayload,
    buildHonorRollPayload,
  };
}

export type ResultsService = ReturnType<typeof createResultsService>;
