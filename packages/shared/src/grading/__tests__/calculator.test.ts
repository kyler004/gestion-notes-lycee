import { describe, expect, it } from 'vitest';
import {
  CAMEROON_DEFAULT_GRADING_RULES,
  type ClassPeriodComputationInput,
  type GradingCalculatorContract,
  type GradingRulesConfig,
  type PeriodDefinitionInput,
  type RawGradeRecordInput,
  type SubjectDefinitionInput,
} from '../../types/grading.js';
import {
  computeClassResults,
  gradingCalculator,
  resolveAppreciation,
  roundGrade,
} from '../index.js';

function makeSubject(
  id: string,
  code: string,
  name: string,
  coefficient: number,
  groupOrder = 1,
): SubjectDefinitionInput {
  return {
    classSubjectId: id,
    subjectId: `subj-${id}`,
    subjectCode: code,
    subjectName: name,
    subjectShortName: code,
    subjectGroupName: `Groupe ${groupOrder}`,
    subjectGroupOrder: groupOrder,
    coefficient,
    teacherName: `Prof ${code}`,
  };
}

function makeRules(overrides: Partial<GradingRulesConfig> = {}): GradingRulesConfig {
  return {
    ...CAMEROON_DEFAULT_GRADING_RULES,
    ...overrides,
  };
}

function buildStandardYearPeriods(): PeriodDefinitionInput[] {
  return [
    {
      id: 't1',
      code: 'T1',
      name: 'Trimestre 1',
      type: 'trimester',
      orderIndex: 1,
      weight: 1,
      parentPeriodId: null,
    },
    {
      id: 's1',
      code: 'SEQ1',
      name: 'Séquence 1',
      type: 'sequence',
      orderIndex: 1,
      weight: 1,
      parentPeriodId: 't1',
    },
    {
      id: 's2',
      code: 'SEQ2',
      name: 'Séquence 2',
      type: 'sequence',
      orderIndex: 2,
      weight: 1,
      parentPeriodId: 't1',
    },
    {
      id: 't2',
      code: 'T2',
      name: 'Trimestre 2',
      type: 'trimester',
      orderIndex: 2,
      weight: 1,
      parentPeriodId: null,
    },
    {
      id: 's3',
      code: 'SEQ3',
      name: 'Séquence 3',
      type: 'sequence',
      orderIndex: 3,
      weight: 1,
      parentPeriodId: 't2',
    },
    {
      id: 's4',
      code: 'SEQ4',
      name: 'Séquence 4',
      type: 'sequence',
      orderIndex: 4,
      weight: 1,
      parentPeriodId: 't2',
    },
    {
      id: 't3',
      code: 'T3',
      name: 'Trimestre 3',
      type: 'trimester',
      orderIndex: 3,
      weight: 1,
      parentPeriodId: null,
    },
    {
      id: 's5',
      code: 'SEQ5',
      name: 'Séquence 5',
      type: 'sequence',
      orderIndex: 5,
      weight: 1,
      parentPeriodId: 't3',
    },
    {
      id: 's6',
      code: 'SEQ6',
      name: 'Séquence 6',
      type: 'sequence',
      orderIndex: 6,
      weight: 1,
      parentPeriodId: 't3',
    },
  ];
}

describe('gradingCalculator contract & exports', () => {
  it('exposes the full GradingCalculatorContract via gradingCalculator', () => {
    const contract: GradingCalculatorContract = gradingCalculator;
    expect(contract.roundGrade).toBe(roundGrade);
    expect(contract.resolveAppreciation).toBe(resolveAppreciation);
    expect(contract.computeClassResults).toBe(computeClassResults);
  });
});

describe('roundGrade', () => {
  it('rounds positive numbers deterministically to 2 decimal places by default', () => {
    expect(roundGrade(12.344)).toBe(12.34);
    expect(roundGrade(12.345)).toBe(12.35);
    expect(roundGrade(12.346)).toBe(12.35);
    expect(roundGrade(1.005)).toBe(1.01);
    expect(roundGrade(10 / 3)).toBe(3.33);
    expect(roundGrade(20 / 3)).toBe(6.67);
    expect(roundGrade(19.995)).toBe(20);
  });

  it('supports custom decimal precisions and normalizes -0 to 0', () => {
    expect(roundGrade(12.345, 0)).toBe(12);
    expect(roundGrade(12.5, 0)).toBe(13);
    expect(roundGrade(12.345, 1)).toBe(12.3);
    expect(roundGrade(12.35, 1)).toBe(12.4);
    expect(roundGrade(12.3456, 3)).toBe(12.346);
    expect(Object.is(roundGrade(-0), 0)).toBe(true);
    expect(Object.is(roundGrade(-0.001), 0)).toBe(true);
  });
});

describe('resolveAppreciation', () => {
  const scale = CAMEROON_DEFAULT_GRADING_RULES.appreciationScale;

  it('returns empty string for null, non-finite, empty scale, or out-of-range scores', () => {
    expect(resolveAppreciation(null, scale)).toBe('');
    expect(resolveAppreciation(Number.NaN, scale)).toBe('');
    expect(resolveAppreciation(Number.POSITIVE_INFINITY, scale)).toBe('');
    expect(resolveAppreciation(12, [])).toBe('');
    expect(resolveAppreciation(-0.5, scale)).toBe('');
    expect(resolveAppreciation(20.5, scale)).toBe('');
  });

  it('matches every Cameroon default appreciation band inclusively at boundaries', () => {
    expect(resolveAppreciation(0, scale)).toBe('Très insuffisant');
    expect(resolveAppreciation(5.99, scale)).toBe('Très insuffisant');
    expect(resolveAppreciation(6, scale)).toBe('Insuffisant');
    expect(resolveAppreciation(7.99, scale)).toBe('Insuffisant');
    expect(resolveAppreciation(8, scale)).toBe('Médiocre');
    expect(resolveAppreciation(9.99, scale)).toBe('Médiocre');
    expect(resolveAppreciation(10, scale)).toBe('Passable');
    expect(resolveAppreciation(11.99, scale)).toBe('Passable');
    expect(resolveAppreciation(12, scale)).toBe('Assez bien');
    expect(resolveAppreciation(13.99, scale)).toBe('Assez bien');
    expect(resolveAppreciation(14, scale)).toBe('Bien');
    expect(resolveAppreciation(15.99, scale)).toBe('Bien');
    expect(resolveAppreciation(16, scale)).toBe('Très bien');
    expect(resolveAppreciation(17.99, scale)).toBe('Très bien');
    expect(resolveAppreciation(18, scale)).toBe('Excellent');
    expect(resolveAppreciation(20, scale)).toBe('Excellent');
  });

  it('handles unrounded edge values falling between 2-decimal band limits cleanly', () => {
    expect(resolveAppreciation(5.994, scale)).toBe('Très insuffisant');
    expect(resolveAppreciation(5.996, scale)).toBe('Insuffisant');
    expect(resolveAppreciation(11.996, scale)).toBe('Assez bien');
    expect(resolveAppreciation(20.0001, scale)).toBe('Excellent');
    expect(resolveAppreciation(-0.0001, scale)).toBe('Très insuffisant');
  });
});

describe('computeClassResults - sequence mode', () => {
  it('computes sequence averages, sequenceScores, class stats, and ignores other periods', () => {
    const periods = buildStandardYearPeriods();
    const math = makeSubject('math', 'MATH', 'Mathématiques', 4, 1);
    const fr = makeSubject('fr', 'FR', 'Français', 3, 1);

    const input: ClassPeriodComputationInput = {
      targetPeriodId: 's1',
      targetPeriodType: 'sequence',
      periods,
      subjects: [math, fr],
      enrollmentIds: ['e1', 'e2'],
      grades: [
        { enrollmentId: 'e1', classSubjectId: 'math', periodId: 's1', score: 15, status: 'present' },
        { enrollmentId: 'e1', classSubjectId: 'fr', periodId: 's1', score: 12, status: 'present' },
        // e2 has missing fr grade in s1, and a grade in s2 that must be ignored
        { enrollmentId: 'e2', classSubjectId: 'math', periodId: 's1', score: 11, status: 'present' },
        { enrollmentId: 'e2', classSubjectId: 'fr', periodId: 's2', score: 19, status: 'present' },
      ],
      rules: makeRules(),
    };

    const report = computeClassResults(input);

    expect(report.targetPeriodId).toBe('s1');
    expect(report.targetPeriodType).toBe('sequence');
    expect(report.evaluatedCount).toBe(2);
    expect(report.passCount).toBe(2);
    expect(report.passRate).toBe(100);
    expect(report.classAverage).toBe(12.36);
    expect(report.minClassAverage).toBe(11);
    expect(report.maxClassAverage).toBe(13.71);

    const e1 = report.students[0]!;
    expect(e1.enrollmentId).toBe('e1');
    expect(e1.totalCoefficient).toBe(7);
    expect(e1.totalPoints).toBe(96); // 15*4 + 12*3 = 60 + 36
    expect(e1.generalAverage).toBe(13.71); // roundGrade(96/7)
    expect(e1.rank).toBe(1);
    expect(e1.isHonorRoll).toBe(true);
    expect(e1.autoAppreciation).toBe('Assez bien');
    expect(e1.subjects[0]!.sequenceScores).toEqual([
      {
        periodId: 's1',
        code: 'SEQ1',
        name: 'Séquence 1',
        orderIndex: 1,
        weight: 1,
        score: 15,
        status: 'present',
      },
    ]);
    expect(e1.subjects[0]!.weightedScore).toBe(60);
    expect(e1.subjects[0]!.rank).toBe(1);
    expect(e1.subjects[0]!.classAverage).toBe(13);
    expect(e1.subjects[0]!.minScore).toBe(11);
    expect(e1.subjects[0]!.maxScore).toBe(15);

    const e2 = report.students[1]!;
    expect(e2.enrollmentId).toBe('e2');
    expect(e2.totalCoefficient).toBe(4); // fr missing => excluded
    expect(e2.totalPoints).toBe(44);
    expect(e2.generalAverage).toBe(11);
    expect(e2.rank).toBe(2);
    expect(e2.isHonorRoll).toBe(false);
    expect(e2.subjects[1]!.sequenceScores).toEqual([
      {
        periodId: 's1',
        code: 'SEQ1',
        name: 'Séquence 1',
        orderIndex: 1,
        weight: 1,
        score: null,
        status: null,
      },
    ]);
    expect(e2.subjects[1]!.average).toBeNull();
    expect(e2.subjects[1]!.weightedScore).toBeNull();
    expect(e2.subjects[1]!.rank).toBeNull();
    // Subject class stats still populated on excused/missing row when other students were evaluated
    expect(e2.subjects[1]!.classAverage).toBe(12);
    expect(e2.subjects[1]!.minScore).toBe(12);
    expect(e2.subjects[1]!.maxScore).toBe(12);
  });
});

describe('computeClassResults - trimester mode', () => {
  it('sorts child sequences by orderIndex, populates sequenceScores, and applies unequal sequence weights', () => {
    const periods: PeriodDefinitionInput[] = [
      // Intentionally out of order
      {
        id: 's2',
        code: 'SEQ2',
        name: 'Séquence 2',
        type: 'sequence',
        orderIndex: 2,
        weight: 2,
        parentPeriodId: 't1',
      },
      {
        id: 't1',
        code: 'T1',
        name: 'Trimestre 1',
        type: 'trimester',
        orderIndex: 1,
        weight: 1,
        parentPeriodId: null,
      },
      {
        id: 's1',
        code: 'SEQ1',
        name: 'Séquence 1',
        type: 'sequence',
        orderIndex: 1,
        weight: 1,
        parentPeriodId: 't1',
      },
      // Unrelated sequence in T2
      {
        id: 's3',
        code: 'SEQ3',
        name: 'Séquence 3',
        type: 'sequence',
        orderIndex: 3,
        weight: 1,
        parentPeriodId: 't2',
      },
    ];
    const math = makeSubject('math', 'MATH', 'Mathématiques', 4);
    const phys = makeSubject('phys', 'PHYS', 'Physique', 2);

    const report = computeClassResults({
      targetPeriodId: 't1',
      targetPeriodType: 'trimester',
      periods,
      subjects: [math, phys],
      enrollmentIds: ['e1'],
      grades: [
        { enrollmentId: 'e1', classSubjectId: 'math', periodId: 's1', score: 10, status: 'present' },
        { enrollmentId: 'e1', classSubjectId: 'math', periodId: 's2', score: 16, status: 'present' },
        // Only s2 evaluated for phys (s1 missing)
        { enrollmentId: 'e1', classSubjectId: 'phys', periodId: 's2', score: 13, status: 'present' },
        { enrollmentId: 'e1', classSubjectId: 'math', periodId: 's3', score: 20, status: 'present' },
      ],
      rules: makeRules({ sequenceWeights: [1, 2] }),
    });

    const e1 = report.students[0]!;
    const mathRes = e1.subjects[0]!;
    const physRes = e1.subjects[1]!;

    // (10*1 + 16*2) / (1 + 2) = 42 / 3 = 14
    expect(mathRes.average).toBe(14);
    expect(mathRes.weightedScore).toBe(56);
    expect(mathRes.sequenceScores).toEqual([
      {
        periodId: 's1',
        code: 'SEQ1',
        name: 'Séquence 1',
        orderIndex: 1,
        weight: 1,
        score: 10,
        status: 'present',
      },
      {
        periodId: 's2',
        code: 'SEQ2',
        name: 'Séquence 2',
        orderIndex: 2,
        weight: 2,
        score: 16,
        status: 'present',
      },
    ]);

    // Missing s1 excluded -> only s2 contributes => 13
    expect(physRes.average).toBe(13);
    expect(physRes.sequenceScores[0]).toEqual({
      periodId: 's1',
      code: 'SEQ1',
      name: 'Séquence 1',
      orderIndex: 1,
      weight: 1,
      score: null,
      status: null,
    });
    expect(physRes.sequenceScores[1]!.score).toBe(13);

    expect(e1.totalCoefficient).toBe(6);
    expect(e1.totalPoints).toBe(82); // 14*4 + 13*2 = 56 + 26
    expect(e1.generalAverage).toBe(13.67);
  });

  it('falls back to rules.sequenceWeights[idx] when sequence weight is non-positive', () => {
    const periods: PeriodDefinitionInput[] = [
      {
        id: 't1',
        code: 'T1',
        name: 'Trimestre 1',
        type: 'trimester',
        orderIndex: 1,
        weight: 1,
        parentPeriodId: null,
      },
      {
        id: 's1',
        code: 'SEQ1',
        name: 'Séquence 1',
        type: 'sequence',
        orderIndex: 1,
        weight: 0,
        parentPeriodId: 't1',
      },
      {
        id: 's2',
        code: 'SEQ2',
        name: 'Séquence 2',
        type: 'sequence',
        orderIndex: 2,
        weight: 0,
        parentPeriodId: 't1',
      },
    ];
    const math = makeSubject('math', 'MATH', 'Mathématiques', 1);

    const report = computeClassResults({
      targetPeriodId: 't1',
      targetPeriodType: 'trimester',
      periods,
      subjects: [math],
      enrollmentIds: ['e1'],
      grades: [
        { enrollmentId: 'e1', classSubjectId: 'math', periodId: 's1', score: 8, status: 'present' },
        { enrollmentId: 'e1', classSubjectId: 'math', periodId: 's2', score: 14, status: 'present' },
      ],
      rules: makeRules({ sequenceWeights: [1, 2] }),
    });

    // (8*1 + 14*2) / 3 = 36/3 = 12
    expect(report.students[0]!.subjects[0]!.average).toBe(12);
    expect(report.students[0]!.subjects[0]!.sequenceScores.map((s) => s.weight)).toEqual([1, 2]);
  });
});

describe('computeClassResults - annual mode', () => {
  it('computes annual subject average across trimesters with unequal weights and full chronological sequenceScores', () => {
    const periods: PeriodDefinitionInput[] = [
      // Shuffled order and per-trimester sequence orderIndex (1,2 per trimester)
      { id: 't3', code: 'T3', name: 'Trimestre 3', type: 'trimester', orderIndex: 3, weight: 2, parentPeriodId: null },
      { id: 's6', code: 'SEQ6', name: 'Séquence 6', type: 'sequence', orderIndex: 2, weight: 1, parentPeriodId: 't3' },
      { id: 's5', code: 'SEQ5', name: 'Séquence 5', type: 'sequence', orderIndex: 1, weight: 1, parentPeriodId: 't3' },
      { id: 't1', code: 'T1', name: 'Trimestre 1', type: 'trimester', orderIndex: 1, weight: 1, parentPeriodId: null },
      { id: 's2', code: 'SEQ2', name: 'Séquence 2', type: 'sequence', orderIndex: 2, weight: 1, parentPeriodId: 't1' },
      { id: 's1', code: 'SEQ1', name: 'Séquence 1', type: 'sequence', orderIndex: 1, weight: 1, parentPeriodId: 't1' },
      { id: 't2', code: 'T2', name: 'Trimestre 2', type: 'trimester', orderIndex: 2, weight: 1, parentPeriodId: null },
      { id: 's4', code: 'SEQ4', name: 'Séquence 4', type: 'sequence', orderIndex: 2, weight: 1, parentPeriodId: 't2' },
      { id: 's3', code: 'SEQ3', name: 'Séquence 3', type: 'sequence', orderIndex: 1, weight: 1, parentPeriodId: 't2' },
    ];
    const math = makeSubject('math', 'MATH', 'Mathématiques', 4);
    const info = makeSubject('info', 'INFO', 'Informatique', 2);

    const report = computeClassResults({
      targetPeriodId: 'annual-year',
      targetPeriodType: 'annual',
      periods,
      subjects: [math, info],
      enrollmentIds: ['e1'],
      grades: [
        // Math: T1=10 (8,12), T2=12 (10,14), T3=16 (15,17) -> (10*1 + 12*1 + 16*2)/4 = 54/4 = 13.5
        { enrollmentId: 'e1', classSubjectId: 'math', periodId: 's1', score: 8, status: 'present' },
        { enrollmentId: 'e1', classSubjectId: 'math', periodId: 's2', score: 12, status: 'present' },
        { enrollmentId: 'e1', classSubjectId: 'math', periodId: 's3', score: 10, status: 'present' },
        { enrollmentId: 'e1', classSubjectId: 'math', periodId: 's4', score: 14, status: 'present' },
        { enrollmentId: 'e1', classSubjectId: 'math', periodId: 's5', score: 15, status: 'present' },
        { enrollmentId: 'e1', classSubjectId: 'math', periodId: 's6', score: 17, status: 'present' },
        // Info: T1=12 (12, excused), T2=unevaluated, T3=15 (15,15) -> (12*1 + 15*2)/(1+2) = 42/3 = 14
        { enrollmentId: 'e1', classSubjectId: 'info', periodId: 's1', score: 12, status: 'present' },
        { enrollmentId: 'e1', classSubjectId: 'info', periodId: 's2', score: null, status: 'excused' },
        { enrollmentId: 'e1', classSubjectId: 'info', periodId: 's5', score: 15, status: 'present' },
        { enrollmentId: 'e1', classSubjectId: 'info', periodId: 's6', score: 15, status: 'present' },
      ],
      rules: makeRules({ trimesterWeights: [1, 1, 2] }),
    });

    const mathRes = report.students[0]!.subjects[0]!;
    const infoRes = report.students[0]!.subjects[1]!;

    expect(mathRes.average).toBe(13.5);
    expect(mathRes.sequenceScores.map((s) => s.code)).toEqual([
      'SEQ1',
      'SEQ2',
      'SEQ3',
      'SEQ4',
      'SEQ5',
      'SEQ6',
    ]);
    expect(infoRes.average).toBe(14);
    expect(infoRes.sequenceScores[1]!.status).toBe('excused');
    expect(infoRes.sequenceScores[2]!.status).toBeNull();

    // General avg = (13.5*4 + 14*2) / 6 = (54 + 28) / 6 = 82 / 6 = 13.67
    expect(report.students[0]!.generalAverage).toBe(13.67);
  });

  it('falls back to rules.trimesterWeights when trimester weight is invalid', () => {
    const periods = buildStandardYearPeriods().map((p) =>
      p.type === 'trimester' ? { ...p, weight: 0 } : p,
    );
    const math = makeSubject('math', 'MATH', 'Mathématiques', 1);

    const report = computeClassResults({
      targetPeriodId: 'annual',
      targetPeriodType: 'annual',
      periods,
      subjects: [math],
      enrollmentIds: ['e1'],
      grades: [
        { enrollmentId: 'e1', classSubjectId: 'math', periodId: 's1', score: 10, status: 'present' },
        { enrollmentId: 'e1', classSubjectId: 'math', periodId: 's3', score: 10, status: 'present' },
        { enrollmentId: 'e1', classSubjectId: 'math', periodId: 's5', score: 16, status: 'present' },
      ],
      rules: makeRules({ trimesterWeights: [1, 1, 2] }),
    });

    // (10*1 + 10*1 + 16*2) / 4 = 52 / 4 = 13
    expect(report.students[0]!.subjects[0]!.average).toBe(13);
  });
});

describe('computeClassResults - grade status handling', () => {
  it('handles absent with treatAbsentAsZero: true vs false, excused, and missing grades', () => {
    const periods = buildStandardYearPeriods();
    const math = makeSubject('math', 'MATH', 'Mathématiques', 4);
    const fr = makeSubject('fr', 'FR', 'Français', 3);
    const ang = makeSubject('ang', 'ANG', 'Anglais', 2);

    const grades: RawGradeRecordInput[] = [
      // math: s1 absent, s2 present 14
      { enrollmentId: 'e1', classSubjectId: 'math', periodId: 's1', score: null, status: 'absent' },
      { enrollmentId: 'e1', classSubjectId: 'math', periodId: 's2', score: 14, status: 'present' },
      // fr: s1 absent, s2 absent
      { enrollmentId: 'e1', classSubjectId: 'fr', periodId: 's1', score: null, status: 'absent' },
      { enrollmentId: 'e1', classSubjectId: 'fr', periodId: 's2', score: null, status: 'absent' },
      // ang: s1 excused, s2 missing
      { enrollmentId: 'e1', classSubjectId: 'ang', periodId: 's1', score: null, status: 'excused' },
    ];

    const withZeroReport = computeClassResults({
      targetPeriodId: 't1',
      targetPeriodType: 'trimester',
      periods,
      subjects: [math, fr, ang],
      enrollmentIds: ['e1'],
      grades,
      rules: makeRules({ treatAbsentAsZero: true }),
    });

    const e1Zero = withZeroReport.students[0]!;
    // math: (0 + 14) / 2 = 7
    expect(e1Zero.subjects[0]!.average).toBe(7);
    expect(e1Zero.subjects[0]!.sequenceScores[0]).toMatchObject({ score: null, status: 'absent' });
    // fr: (0 + 0) / 2 = 0, coefficient included!
    expect(e1Zero.subjects[1]!.average).toBe(0);
    expect(e1Zero.subjects[1]!.weightedScore).toBe(0);
    // ang: excused + missing => null, coefficient excluded!
    expect(e1Zero.subjects[2]!.average).toBeNull();
    expect(e1Zero.subjects[2]!.appreciation).toBe('');
    expect(e1Zero.totalCoefficient).toBe(7); // math(4) + fr(3)
    expect(e1Zero.totalPoints).toBe(28); // 7*4 + 0*3
    expect(e1Zero.generalAverage).toBe(4); // 28 / 7

    const excludedAbsentReport = computeClassResults({
      targetPeriodId: 't1',
      targetPeriodType: 'trimester',
      periods,
      subjects: [math, fr, ang],
      enrollmentIds: ['e1'],
      grades,
      rules: makeRules({ treatAbsentAsZero: false }),
    });

    const e1Excl = excludedAbsentReport.students[0]!;
    // math: absent excluded => 14 / 1 = 14
    expect(e1Excl.subjects[0]!.average).toBe(14);
    // fr: both absent excluded => null, coeff NOT included
    expect(e1Excl.subjects[1]!.average).toBeNull();
    expect(e1Excl.subjects[1]!.weightedScore).toBeNull();
    // ang: excused + missing => null
    expect(e1Excl.subjects[2]!.average).toBeNull();
    expect(e1Excl.totalCoefficient).toBe(4);
    expect(e1Excl.totalPoints).toBe(56);
    expect(e1Excl.generalAverage).toBe(14);
  });

  it('uses last grade record when duplicate entries exist for the same student/subject/period', () => {
    const periods = buildStandardYearPeriods();
    const math = makeSubject('math', 'MATH', 'Mathématiques', 2);

    const report = computeClassResults({
      targetPeriodId: 's1',
      targetPeriodType: 'sequence',
      periods,
      subjects: [math],
      enrollmentIds: ['e1'],
      grades: [
        { enrollmentId: 'e1', classSubjectId: 'math', periodId: 's1', score: 8, status: 'present' },
        { enrollmentId: 'e1', classSubjectId: 'math', periodId: 's1', score: 15, status: 'present' },
      ],
      rules: makeRules(),
    });

    expect(report.students[0]!.subjects[0]!.average).toBe(15);
    expect(report.students[0]!.generalAverage).toBe(15);
  });
});

describe('computeClassResults - ranking, precision, and edge cases', () => {
  it('assigns standard competition ranking (1, 2, 2, 4) for subjects and general average, with null rank for unevaluated', () => {
    const periods = buildStandardYearPeriods();
    const math = makeSubject('math', 'MATH', 'Mathématiques', 2);
    const fr = makeSubject('fr', 'FR', 'Français', 2);

    const report = computeClassResults({
      targetPeriodId: 's1',
      targetPeriodType: 'sequence',
      periods,
      subjects: [math, fr],
      enrollmentIds: ['e1', 'e2', 'e3', 'e4', 'e5'],
      grades: [
        // e1: 18 (math=18, fr=18) -> rank 1
        { enrollmentId: 'e1', classSubjectId: 'math', periodId: 's1', score: 18, status: 'present' },
        { enrollmentId: 'e1', classSubjectId: 'fr', periodId: 's1', score: 18, status: 'present' },
        // e2: 14 (math=14, fr=14) -> rank 2
        { enrollmentId: 'e2', classSubjectId: 'math', periodId: 's1', score: 14, status: 'present' },
        { enrollmentId: 'e2', classSubjectId: 'fr', periodId: 's1', score: 14, status: 'present' },
        // e3: null (both excused) -> rank null
        { enrollmentId: 'e3', classSubjectId: 'math', periodId: 's1', score: null, status: 'excused' },
        { enrollmentId: 'e3', classSubjectId: 'fr', periodId: 's1', score: null, status: 'excused' },
        // e4: 14 (math=14, fr=14) -> rank 2
        { enrollmentId: 'e4', classSubjectId: 'math', periodId: 's1', score: 14, status: 'present' },
        { enrollmentId: 'e4', classSubjectId: 'fr', periodId: 's1', score: 14, status: 'present' },
        // e5: 9 (math=9, fr=9) -> rank 4
        { enrollmentId: 'e5', classSubjectId: 'math', periodId: 's1', score: 9, status: 'present' },
        { enrollmentId: 'e5', classSubjectId: 'fr', periodId: 's1', score: 9, status: 'present' },
      ],
      rules: makeRules(),
    });

    // Preserves input enrollmentIds order
    expect(report.students.map((s) => s.enrollmentId)).toEqual(['e1', 'e2', 'e3', 'e4', 'e5']);
    expect(report.students.map((s) => s.rank)).toEqual([1, 2, null, 2, 4]);
    expect(report.students.map((s) => s.subjects[0]!.rank)).toEqual([1, 2, null, 2, 4]);
    expect(report.students.map((s) => s.subjects[1]!.rank)).toEqual([1, 2, null, 2, 4]);

    expect(report.evaluatedCount).toBe(4);
    expect(report.passCount).toBe(3); // 18, 14, 14 >= 10
    expect(report.passRate).toBe(75);
    expect(report.minClassAverage).toBe(9);
    expect(report.maxClassAverage).toBe(18);
    expect(report.classAverage).toBe(13.75); // (18+14+14+9)/4
  });

  it('uses rounded 2-decimal subjectAverage * coefficient for weightedScore and generalAverage', () => {
    const periods: PeriodDefinitionInput[] = [
      { id: 't1', code: 'T1', name: 'Trimestre 1', type: 'trimester', orderIndex: 1, weight: 1, parentPeriodId: null },
      { id: 's1', code: 'SEQ1', name: 'Séquence 1', type: 'sequence', orderIndex: 1, weight: 1, parentPeriodId: 't1' },
      { id: 's2', code: 'SEQ2', name: 'Séquence 2', type: 'sequence', orderIndex: 2, weight: 2, parentPeriodId: 't1' },
    ];
    // (10*1 + 15*2) / 3 = 40 / 3 = 13.3333... -> rounded average = 13.33
    // With coeff 3: 13.33 * 3 = 39.99 (whereas unrounded 40/3 * 3 would be 40.00)
    const math = makeSubject('math', 'MATH', 'Mathématiques', 3);

    const report = computeClassResults({
      targetPeriodId: 't1',
      targetPeriodType: 'trimester',
      periods,
      subjects: [math],
      enrollmentIds: ['e1'],
      grades: [
        { enrollmentId: 'e1', classSubjectId: 'math', periodId: 's1', score: 10, status: 'present' },
        { enrollmentId: 'e1', classSubjectId: 'math', periodId: 's2', score: 15, status: 'present' },
      ],
      rules: makeRules(),
    });

    const e1 = report.students[0]!;
    expect(e1.subjects[0]!.average).toBe(13.33);
    expect(e1.subjects[0]!.weightedScore).toBe(39.99);
    expect(e1.totalPoints).toBe(39.99);
    expect(e1.generalAverage).toBe(13.33);
  });

  it('handles zero grades as valid numeric scores (never falsy/null)', () => {
    const periods = buildStandardYearPeriods();
    const math = makeSubject('math', 'MATH', 'Mathématiques', 3);

    const report = computeClassResults({
      targetPeriodId: 's1',
      targetPeriodType: 'sequence',
      periods,
      subjects: [math],
      enrollmentIds: ['e1', 'e2'],
      grades: [
        { enrollmentId: 'e1', classSubjectId: 'math', periodId: 's1', score: 0, status: 'present' },
        { enrollmentId: 'e2', classSubjectId: 'math', periodId: 's1', score: 0, status: 'present' },
      ],
      rules: makeRules(),
    });

    expect(report.evaluatedCount).toBe(2);
    expect(report.passCount).toBe(0);
    expect(report.passRate).toBe(0);
    expect(report.classAverage).toBe(0);
    expect(report.minClassAverage).toBe(0);
    expect(report.maxClassAverage).toBe(0);
    expect(report.students[0]!.generalAverage).toBe(0);
    expect(report.students[0]!.totalCoefficient).toBe(3);
    expect(report.students[0]!.totalPoints).toBe(0);
    expect(report.students[0]!.rank).toBe(1);
    expect(report.students[1]!.rank).toBe(1);
    expect(report.students[0]!.isHonorRoll).toBe(false);
    expect(report.students[0]!.autoAppreciation).toBe('Très insuffisant');
  });

  it('handles empty class, empty subjects, and single student gracefully', () => {
    const periods = buildStandardYearPeriods();
    const math = makeSubject('math', 'MATH', 'Mathématiques', 3);

    const emptyClass = computeClassResults({
      targetPeriodId: 's1',
      targetPeriodType: 'sequence',
      periods,
      subjects: [math],
      enrollmentIds: [],
      grades: [],
      rules: makeRules(),
    });

    expect(emptyClass).toEqual({
      targetPeriodId: 's1',
      targetPeriodType: 'sequence',
      classAverage: null,
      minClassAverage: null,
      maxClassAverage: null,
      evaluatedCount: 0,
      passCount: 0,
      passRate: null,
      students: [],
    });

    const emptySubjects = computeClassResults({
      targetPeriodId: 's1',
      targetPeriodType: 'sequence',
      periods,
      subjects: [],
      enrollmentIds: ['e1'],
      grades: [],
      rules: makeRules(),
    });

    expect(emptySubjects.evaluatedCount).toBe(0);
    expect(emptySubjects.passRate).toBeNull();
    expect(emptySubjects.students[0]).toEqual({
      enrollmentId: 'e1',
      subjects: [],
      totalCoefficient: 0,
      totalPoints: 0,
      generalAverage: null,
      rank: null,
      isHonorRoll: false,
      autoAppreciation: '',
    });

    const singleStudent = computeClassResults({
      targetPeriodId: 's1',
      targetPeriodType: 'sequence',
      periods,
      subjects: [math],
      enrollmentIds: ['e1'],
      grades: [{ enrollmentId: 'e1', classSubjectId: 'math', periodId: 's1', score: 12, status: 'present' }],
      rules: makeRules({ honorRollThreshold: 12, passingThreshold: 10 }),
    });

    expect(singleStudent.evaluatedCount).toBe(1);
    expect(singleStudent.passCount).toBe(1);
    expect(singleStudent.passRate).toBe(100);
    expect(singleStudent.classAverage).toBe(12);
    expect(singleStudent.minClassAverage).toBe(12);
    expect(singleStudent.maxClassAverage).toBe(12);
    expect(singleStudent.students[0]!.rank).toBe(1);
    expect(singleStudent.students[0]!.isHonorRoll).toBe(true);
    expect(singleStudent.students[0]!.autoAppreciation).toBe('Assez bien');
  });

  it('enforces exact inclusive thresholds for passing and honor roll without mutating inputs', () => {
    const periods = buildStandardYearPeriods();
    const math = makeSubject('math', 'MATH', 'Mathématiques', 2);
    const input: ClassPeriodComputationInput = {
      targetPeriodId: 's1',
      targetPeriodType: 'sequence',
      periods: [...periods].reverse(),
      subjects: [math],
      enrollmentIds: ['pass-honor', 'pass-no-honor', 'fail'],
      grades: [
        { enrollmentId: 'pass-honor', classSubjectId: 'math', periodId: 's1', score: 12, status: 'present' },
        { enrollmentId: 'pass-no-honor', classSubjectId: 'math', periodId: 's1', score: 10, status: 'present' },
        { enrollmentId: 'fail', classSubjectId: 'math', periodId: 's1', score: 9.99, status: 'present' },
      ],
      rules: makeRules({ passingThreshold: 10, honorRollThreshold: 12 }),
    };

    const periodsSnapshot = input.periods.map((p) => p.id);
    const report = computeClassResults(input);

    expect(input.periods.map((p) => p.id)).toEqual(periodsSnapshot);
    expect(report.students[0]!.isHonorRoll).toBe(true);
    expect(report.students[1]!.isHonorRoll).toBe(false);
    expect(report.students[2]!.isHonorRoll).toBe(false);
    expect(report.passCount).toBe(2);
    expect(report.passRate).toBe(66.67);
  });
});
