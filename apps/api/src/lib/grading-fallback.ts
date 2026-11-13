import type {
  AppreciationBand,
  ClassPeriodComputationInput,
  ClassPeriodComputedReport,
  GradingCalculatorContract,
} from '@lycee/shared';

function roundGrade(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Valeur numérique invalide pour roundGrade : ${value}`);
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

function resolveAppreciation(score: number | null, scale: AppreciationBand[]): string {
  if (score === null) return '';
  const band = scale.find((b) => score >= b.min && score <= b.max);
  return band?.label ?? '';
}

/**
 * Fallback léger utilisé uniquement par les tests isolés des services D/E pendant la Vague 1.
 * En Vague 2, il est remplacé par l'implémentation complète d'Agent A dans @lycee/shared.
 */
export const fallbackGradingCalculator: GradingCalculatorContract = {
  roundGrade,
  resolveAppreciation,
  computeClassResults(input: ClassPeriodComputationInput): ClassPeriodComputedReport {
    const gradeByKey = new Map<string, { score: number | null; status: string }>();
    for (const g of input.grades) {
      if (g.periodId === input.targetPeriodId) {
        gradeByKey.set(`${g.enrollmentId}:${g.classSubjectId}`, {
          score: g.score,
          status: g.status,
        });
      }
    }

    const students = input.enrollmentIds.map((enrollmentId) => {
      let totalCoefficient = 0;
      let totalPoints = 0;
      const subjects = input.subjects.map((sub) => {
        const g = gradeByKey.get(`${enrollmentId}:${sub.classSubjectId}`);
        const avg =
          g?.status === 'present'
            ? g.score
            : g?.status === 'absent' && input.rules.treatAbsentAsZero
              ? 0
              : null;
        const weighted = avg !== null ? roundGrade(avg * sub.coefficient) : null;
        if (avg !== null) {
          totalCoefficient += sub.coefficient;
          totalPoints += avg * sub.coefficient;
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
          sequenceScores: [],
          average: avg !== null ? roundGrade(avg) : null,
          weightedScore: weighted,
          rank: null,
          classAverage: null,
          minScore: null,
          maxScore: null,
          appreciation: resolveAppreciation(avg, input.rules.appreciationScale),
        };
      });

      const generalAverage = totalCoefficient > 0 ? roundGrade(totalPoints / totalCoefficient) : null;
      return {
        enrollmentId,
        subjects,
        totalCoefficient: roundGrade(totalCoefficient),
        totalPoints: roundGrade(totalPoints),
        generalAverage,
        rank: null as number | null,
        isHonorRoll: generalAverage !== null && generalAverage >= input.rules.honorRollThreshold,
        autoAppreciation: resolveAppreciation(generalAverage, input.rules.appreciationScale),
      };
    });

    const ranked = [...students]
      .filter((s) => s.generalAverage !== null)
      .sort((a, b) => (b.generalAverage ?? 0) - (a.generalAverage ?? 0));
    let currentRank = 0;
    let prevScore: number | null = null;
    ranked.forEach((s, idx) => {
      if (s.generalAverage !== prevScore) {
        currentRank = idx + 1;
        prevScore = s.generalAverage;
      }
      s.rank = currentRank;
    });

    const avgs = ranked.map((s) => s.generalAverage as number);
    const passCount = avgs.filter((a) => a >= input.rules.passingThreshold).length;
    return {
      targetPeriodId: input.targetPeriodId,
      targetPeriodType: input.targetPeriodType,
      classAverage: avgs.length > 0 ? roundGrade(avgs.reduce((acc, v) => acc + v, 0) / avgs.length) : null,
      minClassAverage: avgs.length > 0 ? Math.min(...avgs) : null,
      maxClassAverage: avgs.length > 0 ? Math.max(...avgs) : null,
      evaluatedCount: avgs.length,
      passCount,
      passRate: avgs.length > 0 ? roundGrade((passCount / avgs.length) * 100) : null,
      students,
    };
  },
};
