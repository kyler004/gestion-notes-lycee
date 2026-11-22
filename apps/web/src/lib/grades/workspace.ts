import {
  CAMEROON_DEFAULT_GRADING_RULES,
  computeClassResults,
  resolveAppreciation,
  type GradeStatus,
  type GradingRulesConfig,
  type PeriodDefinitionInput,
  type RawGradeRecordInput,
  type SubjectDefinitionInput,
  type SyncOutcome,
  type UserRole,
} from '@lycee/shared';
import type {
  LocalAcademicYear,
  LocalClass,
  LocalClassSubject,
  LocalEnrollment,
  LocalGradingRules,
  LocalOutboxOperation,
  LocalPeriod,
  LocalServerGrade,
  LocalStudent,
  LocalSubject,
  LocalSubjectGroup,
  LocalTeacherAssignment,
} from '@/db/user-db';

export type CellSyncState = 'empty' | 'synced' | 'pending' | 'syncing' | 'failed';

export interface GradeGridRow {
  targetKey: string;
  rowIndex: number;
  enrollment: LocalEnrollment;
  student: LocalStudent;
  fullName: string;
  serverGrade?: LocalServerGrade;
  outboxOp?: LocalOutboxOperation;
  /** Note affichée (brouillon outbox ou note serveur). */
  effectiveScore: number | null;
  /** Statut saisi (`null` si aucune saisie encore effectuée). */
  effectiveStatus: GradeStatus | null;
  effectiveAppreciation: string | null;
  autoAppreciation: string;
  rank: number | null;
  syncState: CellSyncState;
  syncOutcome?: SyncOutcome;
  syncErrorMessage?: string;
  isEditable: boolean;
}

export interface SelectableClassOption {
  classInfo: LocalClass;
  activeStudentCount: number;
  subjectOptions: Array<{
    classSubject: LocalClassSubject;
    subject: LocalSubject;
    subjectGroup: LocalSubjectGroup | null;
  }>;
}

export interface SelectableSequenceOption {
  period: LocalPeriod;
  parentTrimester: LocalPeriod | null;
  isLocked: boolean;
}

export interface ComputedGradeWorkspace {
  academicYear: LocalAcademicYear | null;
  rules: GradingRulesConfig;
  classOptions: SelectableClassOption[];
  sequenceOptions: SelectableSequenceOption[];
  selectedClass: SelectableClassOption | null;
  selectedSubject: SelectableClassOption['subjectOptions'][number] | null;
  selectedSequence: SelectableSequenceOption | null;
  rows: GradeGridRow[];
  hasAnyServerGrades: boolean;
  stats: {
    activeCount: number;
    filledCount: number;
    missingCount: number;
    attentionCount: number;
    classAverage: number | null;
    minScore: number | null;
    maxScore: number | null;
    passCount: number;
    passRate: number | null;
  };
}

export function buildGradeWorkspace(params: {
  userId: string;
  role: UserRole | undefined;
  academicYears: LocalAcademicYear[];
  gradingRules: LocalGradingRules[];
  periods: LocalPeriod[];
  subjectGroups: LocalSubjectGroup[];
  subjects: LocalSubject[];
  classes: LocalClass[];
  classSubjects: LocalClassSubject[];
  teacherAssignments: LocalTeacherAssignment[];
  enrollments: LocalEnrollment[];
  students: LocalStudent[];
  serverGrades: LocalServerGrade[];
  outboxOps: LocalOutboxOperation[];
  selectedClassId?: string;
  selectedClassSubjectId?: string;
  selectedPeriodId?: string;
}): ComputedGradeWorkspace {
  const academicYear =
    params.academicYears.find((y) => y.isActive) ?? params.academicYears[0] ?? null;

  const yearRulesRow = academicYear
    ? params.gradingRules.find((r) => r.academicYearId === academicYear.id)
    : params.gradingRules[0];

  const rules: GradingRulesConfig = yearRulesRow
    ? {
        trimestersCount: yearRulesRow.trimestersCount,
        sequencesPerTrimester: yearRulesRow.sequencesPerTrimester,
        sequenceWeights: yearRulesRow.sequenceWeights,
        trimesterWeights: yearRulesRow.trimesterWeights,
        passingThreshold: yearRulesRow.passingThreshold,
        honorRollThreshold: yearRulesRow.honorRollThreshold,
        encouragementThreshold: yearRulesRow.encouragementThreshold,
        congratulationThreshold: yearRulesRow.congratulationThreshold,
        treatAbsentAsZero: yearRulesRow.treatAbsentAsZero,
        appreciationScale: yearRulesRow.appreciationScale,
      }
    : CAMEROON_DEFAULT_GRADING_RULES;

  const yearPeriods = academicYear
    ? params.periods.filter((p) => p.academicYearId === academicYear.id)
    : params.periods;
  const periodsById = new Map(yearPeriods.map((p) => [p.id, p]));

  const sequenceOptions: SelectableSequenceOption[] = yearPeriods
    .filter((p) => p.type === 'sequence')
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((seq) => {
      const parentTrimester = seq.parentPeriodId
        ? (periodsById.get(seq.parentPeriodId) ?? null)
        : null;
      return {
        period: seq,
        parentTrimester,
        isLocked: seq.status === 'locked' || parentTrimester?.status === 'locked',
      };
    });

  const subjectsById = new Map(params.subjects.map((s) => [s.id, s]));
  const subjectGroupsById = new Map(params.subjectGroups.map((g) => [g.id, g]));

  const allowedClassSubjectIds =
    params.role === 'teacher'
      ? new Set(
          params.teacherAssignments
            .filter(
              (a) =>
                a.teacherId === params.userId &&
                a.isActive &&
                (!academicYear || a.academicYearId === academicYear.id),
            )
            .map((a) => a.classSubjectId),
        )
      : null;

  const activeEnrollmentsByClass = new Map<string, number>();
  for (const enr of params.enrollments) {
    if (enr.status === 'active') {
      activeEnrollmentsByClass.set(
        enr.classId,
        (activeEnrollmentsByClass.get(enr.classId) ?? 0) + 1,
      );
    }
  }

  const classSubjectsByClass = new Map<string, SelectableClassOption['subjectOptions']>();
  for (const cs of params.classSubjects) {
    if (allowedClassSubjectIds && !allowedClassSubjectIds.has(cs.id)) {
      continue;
    }
    const subject = subjectsById.get(cs.subjectId);
    if (!subject) continue;

    const list = classSubjectsByClass.get(cs.classId) ?? [];
    list.push({
      classSubject: cs,
      subject,
      subjectGroup: cs.subjectGroupId ? (subjectGroupsById.get(cs.subjectGroupId) ?? null) : null,
    });
    classSubjectsByClass.set(cs.classId, list);
  }

  const classOptions: SelectableClassOption[] = params.classes
    .filter((c) => !academicYear || c.academicYearId === academicYear.id)
    .filter((c) => {
      const subjectsForClass = classSubjectsByClass.get(c.id) ?? [];
      return params.role === 'teacher'
        ? subjectsForClass.length > 0
        : subjectsForClass.length > 0 || true;
    })
    .filter((c) => (classSubjectsByClass.get(c.id)?.length ?? 0) > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    .map((classInfo) => ({
      classInfo,
      activeStudentCount: activeEnrollmentsByClass.get(classInfo.id) ?? 0,
      subjectOptions: (classSubjectsByClass.get(classInfo.id) ?? []).sort((a, b) =>
        a.subject.name.localeCompare(b.subject.name, 'fr'),
      ),
    }));

  const selectedClass =
    classOptions.find((c) => c.classInfo.id === params.selectedClassId) ?? classOptions[0] ?? null;

  const selectedSubject =
    selectedClass?.subjectOptions.find(
      (s) => s.classSubject.id === params.selectedClassSubjectId,
    ) ??
    selectedClass?.subjectOptions[0] ??
    null;

  const selectedSequence =
    sequenceOptions.find((s) => s.period.id === params.selectedPeriodId) ??
    sequenceOptions.find((s) => !s.isLocked) ??
    sequenceOptions[0] ??
    null;

  if (!selectedClass || !selectedSubject || !selectedSequence) {
    return {
      academicYear,
      rules,
      classOptions,
      sequenceOptions,
      selectedClass,
      selectedSubject,
      selectedSequence,
      rows: [],
      hasAnyServerGrades: false,
      stats: {
        activeCount: 0,
        filledCount: 0,
        missingCount: 0,
        attentionCount: 0,
        classAverage: null,
        minScore: null,
        maxScore: null,
        passCount: 0,
        passRate: null,
      },
    };
  }

  const studentsById = new Map(params.students.map((s) => [s.id, s]));
  const serverGradeByEnrollment = new Map<string, LocalServerGrade>();
  for (const g of params.serverGrades) {
    if (
      g.classSubjectId === selectedSubject.classSubject.id &&
      g.periodId === selectedSequence.period.id
    ) {
      serverGradeByEnrollment.set(g.enrollmentId, g);
    }
  }

  const outboxByEnrollment = new Map<string, LocalOutboxOperation>();
  for (const op of params.outboxOps) {
    if (
      op.classSubjectId === selectedSubject.classSubject.id &&
      op.periodId === selectedSequence.period.id
    ) {
      outboxByEnrollment.set(op.enrollmentId, op);
    }
  }

  const classEnrollments = params.enrollments
    .filter((e) => e.classId === selectedClass.classInfo.id)
    .filter(
      (e) =>
        e.status === 'active' ||
        serverGradeByEnrollment.has(e.id) ||
        outboxByEnrollment.has(e.id),
    )
    .map((enr) => {
      const student = studentsById.get(enr.studentId);
      return student ? { enrollment: enr, student } : null;
    })
    .filter((item): item is { enrollment: LocalEnrollment; student: LocalStudent } => item !== null)
    .sort((a, b) => {
      const byLast = a.student.lastName.localeCompare(b.student.lastName, 'fr');
      if (byLast !== 0) return byLast;
      const byFirst = a.student.firstName.localeCompare(b.student.firstName, 'fr');
      if (byFirst !== 0) return byFirst;
      return a.student.matricule.localeCompare(b.student.matricule, 'fr');
    });

  const activeEnrollmentIds = classEnrollments
    .filter((e) => e.enrollment.status === 'active')
    .map((e) => e.enrollment.id);

  const periodDefs: PeriodDefinitionInput[] = yearPeriods.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    type: p.type,
    orderIndex: p.orderIndex,
    weight: p.weight,
    parentPeriodId: p.parentPeriodId,
  }));

  const subjectDef: SubjectDefinitionInput = {
    classSubjectId: selectedSubject.classSubject.id,
    subjectId: selectedSubject.subject.id,
    subjectCode: selectedSubject.subject.code,
    subjectName: selectedSubject.subject.name,
    subjectShortName: selectedSubject.subject.shortName,
    subjectGroupName: selectedSubject.subjectGroup?.name ?? null,
    subjectGroupOrder: selectedSubject.subjectGroup?.orderIndex ?? 99,
    coefficient: selectedSubject.classSubject.coefficient,
    teacherName: null,
  };

  const rawGradesForCalc: RawGradeRecordInput[] = [];
  for (const { enrollment } of classEnrollments) {
    if (enrollment.status !== 'active') continue;
    const serverGrade = serverGradeByEnrollment.get(enrollment.id);
    const outboxOp = outboxByEnrollment.get(enrollment.id);
    const status = outboxOp ? outboxOp.payload.status : serverGrade?.status;
    const score = outboxOp ? outboxOp.payload.score : (serverGrade?.score ?? null);

    if (status && (status !== 'present' || score !== null)) {
      rawGradesForCalc.push({
        enrollmentId: enrollment.id,
        classSubjectId: selectedSubject.classSubject.id,
        periodId: selectedSequence.period.id,
        score,
        status,
      });
    }
  }

  const report = computeClassResults({
    targetPeriodId: selectedSequence.period.id,
    targetPeriodType: 'sequence',
    periods: periodDefs,
    subjects: [subjectDef],
    enrollmentIds: activeEnrollmentIds,
    grades: rawGradesForCalc,
    rules,
  });

  const computedByEnrollment = new Map(
    report.students.map((st) => [st.enrollmentId, st.subjects[0]]),
  );

  let filledCount = 0;
  let attentionCount = 0;
  let hasAnyServerGrades = false;

  const rows: GradeGridRow[] = classEnrollments.map(({ enrollment, student }, idx) => {
    const serverGrade = serverGradeByEnrollment.get(enrollment.id);
    const outboxOp = outboxByEnrollment.get(enrollment.id);
    if (serverGrade) hasAnyServerGrades = true;

    const effectiveScore = outboxOp ? outboxOp.payload.score : (serverGrade?.score ?? null);
    const effectiveStatus = outboxOp ? outboxOp.payload.status : (serverGrade?.status ?? null);
    const effectiveAppreciation =
      outboxOp && outboxOp.payload.appreciation !== undefined
        ? outboxOp.payload.appreciation
        : (serverGrade?.appreciation ?? null);

    if (enrollment.status === 'active' && effectiveStatus !== null) {
      filledCount += 1;
    }

    let syncState: CellSyncState = 'empty';
    if (outboxOp) {
      syncState = outboxOp.status;
      attentionCount += 1;
    } else if (serverGrade) {
      syncState = 'synced';
    }

    const computedSubject = computedByEnrollment.get(enrollment.id);
    const autoAppreciation =
      computedSubject?.appreciation ??
      (effectiveStatus === 'present'
        ? resolveAppreciation(effectiveScore, rules.appreciationScale)
        : effectiveStatus === 'absent'
          ? rules.treatAbsentAsZero
            ? resolveAppreciation(0, rules.appreciationScale)
            : 'Absent'
          : effectiveStatus === 'excused'
            ? 'Excusé'
            : '');

    return {
      targetKey: `${enrollment.id}:${selectedSubject.classSubject.id}:${selectedSequence.period.id}`,
      rowIndex: idx + 1,
      enrollment,
      student,
      fullName: `${student.lastName.toUpperCase()} ${student.firstName}`,
      serverGrade,
      outboxOp,
      effectiveScore,
      effectiveStatus,
      effectiveAppreciation,
      autoAppreciation,
      rank: computedSubject?.rank ?? null,
      syncState,
      syncOutcome: outboxOp?.outcome,
      syncErrorMessage: outboxOp?.errorMessage,
      isEditable: enrollment.status === 'active' && !selectedSequence.isLocked,
    };
  });

  const firstComputedSubject = report.students.find((s) => s.subjects[0]?.classAverage !== null)
    ?.subjects[0];

  return {
    academicYear,
    rules,
    classOptions,
    sequenceOptions,
    selectedClass,
    selectedSubject,
    selectedSequence,
    rows,
    hasAnyServerGrades,
    stats: {
      activeCount: activeEnrollmentIds.length,
      filledCount,
      missingCount: Math.max(0, activeEnrollmentIds.length - filledCount),
      attentionCount,
      classAverage: firstComputedSubject?.classAverage ?? report.classAverage,
      minScore: firstComputedSubject?.minScore ?? report.minClassAverage,
      maxScore: firstComputedSubject?.maxScore ?? report.maxClassAverage,
      passCount: report.passCount,
      passRate: report.passRate,
    },
  };
}
