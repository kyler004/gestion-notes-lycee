import type { SequenceGradeDetail } from '../types/domain.js';
import type {
  AppreciationBand,
  ClassPeriodComputationInput,
  ClassPeriodComputedReport,
  GradingCalculatorContract,
  PeriodDefinitionInput,
  RawGradeRecordInput,
  StudentComputedResult,
  StudentSubjectComputedResult,
} from '../types/grading.js';

export function roundGrade(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Valeur numérique invalide pour roundGrade : ${value}`);
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 10) {
    throw new RangeError(`Nombre de décimales invalide : ${decimals}`);
  }
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const [mantissa, expStr] = abs.toString().split('e');
  const baseExp = expStr ? Number(expStr) : 0;
  const shifted = Number(`${mantissa}e${baseExp + decimals}`);
  const roundedInt = Math.round(shifted);
  const [rMantissa, rExpStr] = roundedInt.toString().split('e');
  const rExp = rExpStr ? Number(rExpStr) : 0;
  const rounded = sign * Number(`${rMantissa}e${rExp - decimals}`);
  return rounded === 0 ? 0 : rounded;
}

export function resolveAppreciation(score: number | null, scale: AppreciationBand[]): string {
  if (score === null || !Number.isFinite(score) || scale.length === 0) {
    return '';
  }

  const directMatch = scale.find((band) => score >= band.min && score <= band.max);
  if (directMatch) {
    return directMatch.label;
  }

  const rounded = roundGrade(score, 2);
  const roundedMatch = scale.find((band) => rounded >= band.min && rounded <= band.max);
  return roundedMatch?.label ?? '';
}

function resolveWeight(periodWeight: number | undefined | null, fallbackWeight: number | undefined): number {
  if (typeof periodWeight === 'number' && Number.isFinite(periodWeight) && periodWeight > 0) {
    return periodWeight;
  }
  if (typeof fallbackWeight === 'number' && Number.isFinite(fallbackWeight) && fallbackWeight > 0) {
    return fallbackWeight;
  }
  return 1;
}

function buildGradeLookup(grades: RawGradeRecordInput[]): Map<string, RawGradeRecordInput> {
  const map = new Map<string, RawGradeRecordInput>();
  for (const grade of grades) {
    map.set(`${grade.enrollmentId}:${grade.classSubjectId}:${grade.periodId}`, grade);
  }
  return map;
}

function evaluateSequenceEntry(
  seq: PeriodDefinitionInput,
  weight: number,
  grade: RawGradeRecordInput | undefined,
  treatAbsentAsZero: boolean,
): { detail: SequenceGradeDetail; evaluableScore: number | null } {
  if (!grade) {
    return {
      detail: {
        periodId: seq.id,
        code: seq.code,
        name: seq.name,
        orderIndex: seq.orderIndex,
        weight,
        score: null,
        status: null,
      },
      evaluableScore: null,
    };
  }

  let normalizedScore: number | null = null;
  if (grade.status === 'present') {
    if (grade.score === null || !Number.isFinite(grade.score) || grade.score < 0 || grade.score > 20) {
      throw new RangeError(`Note invalide hors bornes [0, 20] : ${grade.score}`);
    }
    normalizedScore = grade.score;
  }

  const detail: SequenceGradeDetail = {
    periodId: seq.id,
    code: seq.code,
    name: seq.name,
    orderIndex: seq.orderIndex,
    weight,
    score: normalizedScore,
    status: grade.status,
  };

  let evaluableScore: number | null = null;
  if (grade.status === 'present') {
    evaluableScore = normalizedScore;
  } else if (grade.status === 'absent' && treatAbsentAsZero) {
    evaluableScore = 0;
  }

  return { detail, evaluableScore };
}

function computeWeightedAverage(entries: Array<{ score: number | null; weight: number }>): number | null {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const entry of entries) {
    if (entry.score !== null) {
      weightedSum += entry.score * entry.weight;
      totalWeight += entry.weight;
    }
  }

  if (totalWeight <= 0) {
    return null;
  }

  return weightedSum / totalWeight;
}

function assignCompetitionRanks<T>(
  items: T[],
  getScore: (item: T) => number | null,
  setRank: (item: T, rank: number | null) => void,
): void {
  const evaluated = items
    .map((item) => ({ item, score: getScore(item) }))
    .filter((entry): entry is { item: T; score: number } => entry.score !== null)
    .sort((a, b) => b.score - a.score);

  let currentRank = 0;
  let previousScore: number | null = null;

  for (let idx = 0; idx < evaluated.length; idx++) {
    const entry = evaluated[idx];
    if (!entry) {
      continue;
    }
    if (entry.score !== previousScore) {
      currentRank = idx + 1;
      previousScore = entry.score;
    }
    setRank(entry.item, currentRank);
  }

  for (const item of items) {
    if (getScore(item) === null) {
      setRank(item, null);
    }
  }
}

interface WeightedSequenceDescriptor {
  period: PeriodDefinitionInput;
  weight: number;
}

interface WeightedTrimesterDescriptor {
  period: PeriodDefinitionInput;
  weight: number;
  childSequences: WeightedSequenceDescriptor[];
}

export function computeClassResults(input: ClassPeriodComputationInput): ClassPeriodComputedReport {
  for (const subject of input.subjects) {
    if (!Number.isFinite(subject.coefficient) || subject.coefficient <= 0) {
      throw new RangeError(
        `Coefficient invalide pour la matière "${subject.subjectCode}" : ${subject.coefficient}`,
      );
    }
  }

  const gradeLookup = buildGradeLookup(input.grades);

  let sequenceTarget: WeightedSequenceDescriptor | null = null;
  let trimesterSequences: WeightedSequenceDescriptor[] = [];
  let annualTrimesters: WeightedTrimesterDescriptor[] = [];

  if (input.targetPeriodType === 'sequence') {
    const foundPeriod = input.periods.find((p) => p.id === input.targetPeriodId);
    const seqPeriod: PeriodDefinitionInput = foundPeriod ?? {
      id: input.targetPeriodId,
      code: '',
      name: '',
      type: 'sequence',
      orderIndex: 1,
      weight: 1,
      parentPeriodId: null,
    };
    sequenceTarget = {
      period: seqPeriod,
      weight: resolveWeight(foundPeriod?.weight, input.rules.sequenceWeights[0]),
    };
  } else if (input.targetPeriodType === 'trimester') {
    trimesterSequences = input.periods
      .filter((p) => p.type === 'sequence' && p.parentPeriodId === input.targetPeriodId)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((seq, idx) => ({
        period: seq,
        weight: resolveWeight(seq.weight, input.rules.sequenceWeights[idx]),
      }));
  } else {
    annualTrimesters = input.periods
      .filter((p) => p.type === 'trimester')
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((trimester, tIdx) => {
        const childSequences = input.periods
          .filter((p) => p.type === 'sequence' && p.parentPeriodId === trimester.id)
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((seq, sIdx) => ({
            period: seq,
            weight: resolveWeight(seq.weight, input.rules.sequenceWeights[sIdx]),
          }));
        return {
          period: trimester,
          weight: resolveWeight(trimester.weight, input.rules.trimesterWeights[tIdx]),
          childSequences,
        };
      });
  }

  const students: StudentComputedResult[] = input.enrollmentIds.map((enrollmentId) => {
    let totalCoefficient = 0;
    let rawTotalPoints = 0;

    const subjects: StudentSubjectComputedResult[] = input.subjects.map((subject) => {
      let sequenceScores: SequenceGradeDetail[] = [];
      let rawAverage: number | null = null;

      if (input.targetPeriodType === 'sequence' && sequenceTarget) {
        const grade = gradeLookup.get(`${enrollmentId}:${subject.classSubjectId}:${sequenceTarget.period.id}`);
        const { detail, evaluableScore } = evaluateSequenceEntry(
          sequenceTarget.period,
          sequenceTarget.weight,
          grade,
          input.rules.treatAbsentAsZero,
        );
        sequenceScores = [detail];
        rawAverage = evaluableScore;
      } else if (input.targetPeriodType === 'trimester') {
        const evaluatedEntries = trimesterSequences.map((seqDesc) => {
          const grade = gradeLookup.get(`${enrollmentId}:${subject.classSubjectId}:${seqDesc.period.id}`);
          const { detail, evaluableScore } = evaluateSequenceEntry(
            seqDesc.period,
            seqDesc.weight,
            grade,
            input.rules.treatAbsentAsZero,
          );
          return { detail, evaluableScore, weight: seqDesc.weight };
        });
        sequenceScores = evaluatedEntries.map((entry) => entry.detail);
        rawAverage = computeWeightedAverage(
          evaluatedEntries.map((entry) => ({ score: entry.evaluableScore, weight: entry.weight })),
        );
      } else {
        const allSequenceScores: SequenceGradeDetail[] = [];
        const trimesterAverages: Array<{ score: number | null; weight: number }> = [];

        for (const trimester of annualTrimesters) {
          const seqEntries = trimester.childSequences.map((seqDesc) => {
            const grade = gradeLookup.get(`${enrollmentId}:${subject.classSubjectId}:${seqDesc.period.id}`);
            const { detail, evaluableScore } = evaluateSequenceEntry(
              seqDesc.period,
              seqDesc.weight,
              grade,
              input.rules.treatAbsentAsZero,
            );
            allSequenceScores.push(detail);
            return { score: evaluableScore, weight: seqDesc.weight };
          });

          const rawTrimesterAvg = computeWeightedAverage(seqEntries);
          const roundedTrimesterAvg = rawTrimesterAvg !== null ? roundGrade(rawTrimesterAvg) : null;
          trimesterAverages.push({ score: roundedTrimesterAvg, weight: trimester.weight });
        }

        sequenceScores = allSequenceScores;
        rawAverage = computeWeightedAverage(trimesterAverages);
      }

      const average = rawAverage !== null ? roundGrade(rawAverage) : null;
      const weightedScore = average !== null ? roundGrade(average * subject.coefficient) : null;

      if (average !== null) {
        totalCoefficient += subject.coefficient;
        rawTotalPoints += average * subject.coefficient;
      }

      return {
        classSubjectId: subject.classSubjectId,
        subjectCode: subject.subjectCode,
        subjectName: subject.subjectName,
        subjectShortName: subject.subjectShortName,
        subjectGroupName: subject.subjectGroupName,
        subjectGroupOrder: subject.subjectGroupOrder,
        coefficient: subject.coefficient,
        teacherName: subject.teacherName,
        sequenceScores,
        average,
        weightedScore,
        rank: null,
        classAverage: null,
        minScore: null,
        maxScore: null,
        appreciation: resolveAppreciation(average, input.rules.appreciationScale),
      };
    });

    const generalAverage = totalCoefficient > 0 ? roundGrade(rawTotalPoints / totalCoefficient) : null;

    return {
      enrollmentId,
      subjects,
      totalCoefficient: roundGrade(totalCoefficient),
      totalPoints: roundGrade(rawTotalPoints),
      generalAverage,
      rank: null,
      isHonorRoll: generalAverage !== null && generalAverage >= input.rules.honorRollThreshold,
      autoAppreciation: resolveAppreciation(generalAverage, input.rules.appreciationScale),
    };
  });

  // Compute per-subject class statistics and competition rankings
  for (let subIdx = 0; subIdx < input.subjects.length; subIdx++) {
    const subjectRows: StudentSubjectComputedResult[] = [];
    for (const student of students) {
      const row = student.subjects[subIdx];
      if (row) {
        subjectRows.push(row);
      }
    }

    const evaluatedScores = subjectRows
      .map((row) => row.average)
      .filter((avg): avg is number => avg !== null);

    if (evaluatedScores.length > 0) {
      const subjectClassAverage = roundGrade(
        evaluatedScores.reduce((acc, val) => acc + val, 0) / evaluatedScores.length,
      );
      const minScore = Math.min(...evaluatedScores);
      const maxScore = Math.max(...evaluatedScores);

      for (const row of subjectRows) {
        row.classAverage = subjectClassAverage;
        row.minScore = minScore;
        row.maxScore = maxScore;
      }

      assignCompetitionRanks(
        subjectRows,
        (row) => row.average,
        (row, rank) => {
          row.rank = rank;
        },
      );
    }
  }

  // Compute overall student rankings and class-level statistics
  assignCompetitionRanks(
    students,
    (student) => student.generalAverage,
    (student, rank) => {
      student.rank = rank;
    },
  );

  const evaluatedAverages = students
    .map((student) => student.generalAverage)
    .filter((avg): avg is number => avg !== null);

  const evaluatedCount = evaluatedAverages.length;
  const passCount = evaluatedAverages.filter((avg) => avg >= input.rules.passingThreshold).length;

  return {
    targetPeriodId: input.targetPeriodId,
    targetPeriodType: input.targetPeriodType,
    classAverage:
      evaluatedCount > 0
        ? roundGrade(evaluatedAverages.reduce((acc, val) => acc + val, 0) / evaluatedCount)
        : null,
    minClassAverage: evaluatedCount > 0 ? Math.min(...evaluatedAverages) : null,
    maxClassAverage: evaluatedCount > 0 ? Math.max(...evaluatedAverages) : null,
    evaluatedCount,
    passCount,
    passRate: evaluatedCount > 0 ? roundGrade((passCount / evaluatedCount) * 100) : null,
    students,
  };
}

export const gradingCalculator: GradingCalculatorContract = {
  roundGrade,
  resolveAppreciation,
  computeClassResults,
};
