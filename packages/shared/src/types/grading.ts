import type { GradeStatus, PeriodType, SequenceGradeDetail } from './domain.js';

export interface AppreciationBand {
  min: number;
  max: number;
  label: string;
}

export interface GradingRulesConfig {
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
}

export const CAMEROON_DEFAULT_GRADING_RULES: GradingRulesConfig = {
  trimestersCount: 3,
  sequencesPerTrimester: 2,
  sequenceWeights: [1, 1],
  trimesterWeights: [1, 1, 1],
  passingThreshold: 10,
  honorRollThreshold: 12,
  encouragementThreshold: 13,
  congratulationThreshold: 15,
  treatAbsentAsZero: true,
  appreciationScale: [
    { min: 0, max: 5.99, label: 'Très insuffisant' },
    { min: 6, max: 7.99, label: 'Insuffisant' },
    { min: 8, max: 9.99, label: 'Médiocre' },
    { min: 10, max: 11.99, label: 'Passable' },
    { min: 12, max: 13.99, label: 'Assez bien' },
    { min: 14, max: 15.99, label: 'Bien' },
    { min: 16, max: 17.99, label: 'Très bien' },
    { min: 18, max: 20, label: 'Excellent' },
  ],
};

export interface PeriodDefinitionInput {
  id: string;
  code: string;
  name: string;
  type: PeriodType;
  orderIndex: number;
  weight: number;
  parentPeriodId: string | null;
}

export interface SubjectDefinitionInput {
  classSubjectId: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  subjectShortName: string;
  subjectGroupName: string | null;
  subjectGroupOrder: number;
  coefficient: number;
  teacherName: string | null;
}

export interface RawGradeRecordInput {
  enrollmentId: string;
  classSubjectId: string;
  periodId: string;
  score: number | null;
  status: GradeStatus;
}

export interface StudentSubjectComputedResult {
  classSubjectId: string;
  subjectCode: string;
  subjectName: string;
  subjectShortName: string;
  subjectGroupName: string | null;
  subjectGroupOrder: number;
  coefficient: number;
  teacherName: string | null;
  sequenceScores: SequenceGradeDetail[];
  average: number | null;
  weightedScore: number | null;
  rank: number | null;
  classAverage: number | null;
  minScore: number | null;
  maxScore: number | null;
  appreciation: string;
}

export interface StudentComputedResult {
  enrollmentId: string;
  subjects: StudentSubjectComputedResult[];
  totalCoefficient: number;
  totalPoints: number;
  generalAverage: number | null;
  rank: number | null;
  isHonorRoll: boolean;
  autoAppreciation: string;
}

export interface ClassPeriodComputedReport {
  targetPeriodId: string;
  targetPeriodType: PeriodType | 'annual';
  classAverage: number | null;
  minClassAverage: number | null;
  maxClassAverage: number | null;
  evaluatedCount: number;
  passCount: number;
  passRate: number | null;
  students: StudentComputedResult[];
}

export interface ClassPeriodComputationInput {
  targetPeriodId: string;
  targetPeriodType: PeriodType | 'annual';
  periods: PeriodDefinitionInput[];
  subjects: SubjectDefinitionInput[];
  enrollmentIds: string[];
  grades: RawGradeRecordInput[];
  rules: GradingRulesConfig;
}

export interface GradingCalculatorContract {
  roundGrade(value: number, decimals?: number): number;
  resolveAppreciation(score: number | null, scale: AppreciationBand[]): string;
  computeClassResults(input: ClassPeriodComputationInput): ClassPeriodComputedReport;
}
