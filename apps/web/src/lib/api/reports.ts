import {
  COUNCIL_DECISIONS,
  type CouncilDecisionInputSchema,
  GRADE_STATUSES,
  PERIOD_STATUSES,
  PERIOD_TYPES,
  STUDENT_SEXES,
} from '@lycee/shared';
import { z } from 'zod';
import { PeriodDtoSchema } from './admin';
import { apiFetchFile, apiRequest } from './client';

export const SubjectCompletenessDtoSchema = z.object({
  classSubjectId: z.string().uuid(),
  subjectId: z.string().uuid(),
  subjectCode: z.string(),
  subjectName: z.string(),
  subjectShortName: z.string(),
  expectedStudents: z.number().int(),
  gradedCount: z.number().int(),
  missingCount: z.number().int(),
  isComplete: z.boolean(),
});
export type SubjectCompletenessDto = z.infer<typeof SubjectCompletenessDtoSchema>;

export const ClassCompletenessDtoSchema = z.object({
  classId: z.string().uuid(),
  className: z.string(),
  level: z.string(),
  expectedStudents: z.number().int(),
  isComplete: z.boolean(),
  subjects: z.array(SubjectCompletenessDtoSchema),
});
export type ClassCompletenessDto = z.infer<typeof ClassCompletenessDtoSchema>;

export const PeriodCompletenessDtoSchema = z.object({
  periodId: z.string().uuid(),
  periodCode: z.string(),
  periodName: z.string(),
  periodType: z.enum(PERIOD_TYPES),
  status: z.enum(PERIOD_STATUSES),
  isComplete: z.boolean(),
  classes: z.array(ClassCompletenessDtoSchema),
});
export type PeriodCompletenessDto = z.infer<typeof PeriodCompletenessDtoSchema>;

export const LockPeriodResponseSchema = z.object({
  period: PeriodDtoSchema,
  snapshots: z.object({
    studentResultsCount: z.number().int(),
    subjectResultsCount: z.number().int(),
  }),
});
export type LockPeriodResponse = z.infer<typeof LockPeriodResponseSchema>;

export const UnlockPeriodResponseSchema = z.object({
  period: PeriodDtoSchema,
});
export type UnlockPeriodResponse = z.infer<typeof UnlockPeriodResponseSchema>;

export const CouncilDecisionDtoSchema = z.object({
  id: z.string().uuid(),
  enrollmentId: z.string().uuid(),
  studentId: z.string().uuid(),
  studentMatricule: z.string(),
  studentLastName: z.string(),
  studentFirstName: z.string(),
  classId: z.string().uuid(),
  periodId: z.string().uuid(),
  generalAppreciation: z.string(),
  decision: z.enum(COUNCIL_DECISIONS),
  absencesHours: z.number().int(),
  decidedBy: z.string().uuid(),
  syncVersion: z.number().int(),
  updatedAt: z.string(),
});
export type CouncilDecisionDto = z.infer<typeof CouncilDecisionDtoSchema>;

export const SequenceGradeDetailSchema = z.object({
  periodId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  orderIndex: z.number().int(),
  weight: z.number(),
  score: z.number().nullable(),
  status: z.enum(GRADE_STATUSES).nullable(),
});

export const BulletinSubjectRowSchema = z.object({
  classSubjectId: z.string().uuid(),
  subjectCode: z.string(),
  subjectName: z.string(),
  subjectShortName: z.string(),
  subjectGroupName: z.string().nullable(),
  subjectGroupOrder: z.number(),
  coefficient: z.number(),
  teacherName: z.string().nullable(),
  sequenceScores: z.array(SequenceGradeDetailSchema),
  average: z.number().nullable(),
  weightedScore: z.number().nullable(),
  rank: z.number().int().nullable(),
  classAverage: z.number().nullable(),
  minScore: z.number().nullable(),
  maxScore: z.number().nullable(),
  appreciation: z.string(),
});
export type BulletinSubjectRowDto = z.infer<typeof BulletinSubjectRowSchema>;

export const BulletinStudentDataSchema = z.object({
  enrollmentId: z.string().uuid(),
  studentId: z.string().uuid(),
  matricule: z.string(),
  lastName: z.string(),
  firstName: z.string(),
  birthDate: z.string(),
  birthPlace: z.string(),
  sex: z.enum(STUDENT_SEXES),
  isRepeater: z.boolean(),
  subjects: z.array(BulletinSubjectRowSchema),
  totalCoefficient: z.number(),
  totalPoints: z.number(),
  generalAverage: z.number().nullable(),
  rank: z.number().int().nullable(),
  classSize: z.number().int(),
  classAverage: z.number().nullable(),
  minClassAverage: z.number().nullable(),
  maxClassAverage: z.number().nullable(),
  passRate: z.number().nullable(),
  isHonorRoll: z.boolean(),
  autoAppreciation: z.string(),
  councilDecision: z.enum(COUNCIL_DECISIONS),
  councilAppreciation: z.string(),
  absencesHours: z.number().int(),
});
export type BulletinStudentDto = z.infer<typeof BulletinStudentDataSchema>;

export const ClassResultsReportSchema = z.object({
  academicYearId: z.string().uuid(),
  academicYearLabel: z.string(),
  isOfficial: z.boolean(),
  fromSnapshot: z.boolean(),
  period: z.object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    type: z.enum(PERIOD_TYPES),
    status: z.enum(PERIOD_STATUSES),
    isOfficial: z.boolean(),
    lockedAt: z.string().nullable(),
  }),
  classInfo: z.object({
    id: z.string().uuid(),
    name: z.string(),
    level: z.string(),
    series: z.string().nullable(),
    mainTeacherId: z.string().uuid().nullable(),
    mainTeacherName: z.string().nullable(),
  }),
  statistics: z.object({
    classSize: z.number().int(),
    evaluatedCount: z.number().int(),
    passCount: z.number().int(),
    passRate: z.number().nullable(),
    classAverage: z.number().nullable(),
    minClassAverage: z.number().nullable(),
    maxClassAverage: z.number().nullable(),
    honorRollCount: z.number().int(),
    honorRollThreshold: z.number(),
    passingThreshold: z.number(),
  }),
  students: z.array(BulletinStudentDataSchema),
});
export type ClassResultsReportDto = z.infer<typeof ClassResultsReportSchema>;

export const HonorRollEntrySchema = z.object({
  enrollmentId: z.string().uuid(),
  studentId: z.string().uuid(),
  rank: z.number().int(),
  matricule: z.string(),
  lastName: z.string(),
  firstName: z.string(),
  fullName: z.string(),
  generalAverage: z.number(),
  appreciation: z.string(),
  autoAppreciation: z.string(),
  councilDecision: z.enum(COUNCIL_DECISIONS),
});
export type HonorRollEntryDto = z.infer<typeof HonorRollEntrySchema>;

export const HonorRollReportSchema = z.object({
  academicYearId: z.string().uuid(),
  academicYearLabel: z.string(),
  isOfficial: z.boolean(),
  period: z.object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    type: z.enum(PERIOD_TYPES),
    status: z.enum(PERIOD_STATUSES),
    isOfficial: z.boolean(),
  }),
  classInfo: z.object({
    id: z.string().uuid(),
    name: z.string(),
    level: z.string(),
    series: z.string().nullable(),
  }),
  honorRollThreshold: z.number(),
  entries: z.array(HonorRollEntrySchema),
});
export type HonorRollReportDto = z.infer<typeof HonorRollReportSchema>;

export const SchoolClassStatsEntrySchema = z.object({
  classId: z.string().uuid(),
  className: z.string(),
  level: z.string(),
  series: z.string().nullable(),
  totalStudents: z.number().int(),
  evaluatedStudents: z.number().int(),
  passCount: z.number().int(),
  average: z.number().nullable(),
  passRate: z.number().nullable(),
  minAverage: z.number().nullable(),
  maxAverage: z.number().nullable(),
});
export type SchoolClassStatsEntryDto = z.infer<typeof SchoolClassStatsEntrySchema>;

export const SchoolStatsReportSchema = z.object({
  academicYearId: z.string().uuid(),
  academicYearLabel: z.string(),
  period: z.object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    type: z.enum(PERIOD_TYPES),
    status: z.enum(PERIOD_STATUSES),
    isOfficial: z.boolean(),
  }),
  totalStudents: z.number().int(),
  evaluatedStudents: z.number().int(),
  overallAverage: z.number().nullable(),
  overallPassRate: z.number().nullable(),
  classes: z.array(SchoolClassStatsEntrySchema),
});
export type SchoolStatsReportDto = z.infer<typeof SchoolStatsReportSchema>;

export const GradeAuditLogDtoSchema = z.object({
  id: z.string().uuid(),
  gradeId: z.string().uuid(),
  enrollmentId: z.string().uuid(),
  classId: z.string().uuid(),
  studentId: z.string().uuid(),
  studentMatricule: z.string(),
  studentLastName: z.string(),
  studentFirstName: z.string(),
  classSubjectId: z.string().uuid(),
  subjectCode: z.string(),
  subjectName: z.string(),
  periodId: z.string().uuid(),
  periodCode: z.string(),
  periodName: z.string(),
  previousScore: z.number().nullable(),
  newScore: z.number().nullable(),
  previousStatus: z.enum(GRADE_STATUSES).nullable(),
  newStatus: z.enum(GRADE_STATUSES),
  previousAppreciation: z.string().nullable(),
  newAppreciation: z.string().nullable(),
  changedBy: z.string().uuid(),
  changedByName: z.string(),
  reason: z.string(),
  clientTimestamp: z.string().nullable(),
  serverTimestamp: z.string(),
  operationId: z.string().nullable(),
});
export type GradeAuditLogDto = z.infer<typeof GradeAuditLogDtoSchema>;

function buildQuery(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') {
      qs.set(k, String(v));
    }
  }
  const encoded = qs.toString();
  return encoded ? `?${encoded}` : '';
}

// ── Validation & Verrouillage ──

export async function getPeriodCompleteness(periodId: string): Promise<PeriodCompletenessDto> {
  return apiRequest(`/api/periods/${periodId}/completeness`, {
    schema: PeriodCompletenessDtoSchema,
  });
}

export async function lockPeriod(periodId: string, reason = ''): Promise<LockPeriodResponse> {
  return apiRequest(`/api/periods/${periodId}/lock`, {
    method: 'POST',
    body: { reason },
    schema: LockPeriodResponseSchema,
  });
}

export async function unlockPeriod(periodId: string, reason: string): Promise<UnlockPeriodResponse> {
  return apiRequest(`/api/periods/${periodId}/unlock`, {
    method: 'POST',
    body: { reason },
    schema: UnlockPeriodResponseSchema,
  });
}

// ── Conseil de classe ──

export async function listCouncilDecisions(filters: {
  classId?: string;
  periodId?: string;
}): Promise<CouncilDecisionDto[]> {
  const qs = buildQuery({ classId: filters.classId, periodId: filters.periodId, limit: 200 });
  const res = await apiRequest(`/api/council-decisions${qs}`, {
    schema: z.object({ decisions: z.array(CouncilDecisionDtoSchema) }),
  });
  return res.decisions;
}

export async function bulkUpsertCouncilDecisions(
  decisions: Array<z.infer<typeof CouncilDecisionInputSchema>>,
): Promise<{ decisions: CouncilDecisionDto[]; count: number }> {
  return apiRequest('/api/council-decisions/bulk', {
    method: 'PUT',
    body: { decisions },
    schema: z.object({
      decisions: z.array(CouncilDecisionDtoSchema),
      count: z.number().int(),
    }),
  });
}

// ── Résultats, Statistiques & Audit ──

export async function getSchoolStats(
  academicYearId: string,
  periodId: string,
): Promise<SchoolStatsReportDto> {
  const qs = buildQuery({ academicYearId, periodId });
  return apiRequest(`/api/reports/school-stats${qs}`, {
    schema: SchoolStatsReportSchema,
  });
}

export async function getClassResults(
  classId: string,
  periodId: string,
): Promise<ClassResultsReportDto> {
  const qs = buildQuery({ classId, periodId });
  return apiRequest(`/api/reports/class-results${qs}`, {
    schema: ClassResultsReportSchema,
  });
}

export async function getHonorRoll(
  classId: string,
  periodId: string,
): Promise<HonorRollReportDto> {
  const qs = buildQuery({ classId, periodId });
  return apiRequest(`/api/reports/honor-roll${qs}`, {
    schema: HonorRollReportSchema,
  });
}

export async function listGradeAuditLogs(filters: {
  classId?: string;
  periodId?: string;
  enrollmentId?: string;
  classSubjectId?: string;
  limit?: number;
}): Promise<GradeAuditLogDto[]> {
  const qs = buildQuery({
    classId: filters.classId,
    periodId: filters.periodId,
    enrollmentId: filters.enrollmentId,
    classSubjectId: filters.classSubjectId,
    limit: filters.limit ?? 200,
  });
  const res = await apiRequest(`/api/grades/audit${qs}`, {
    schema: z.object({ logs: z.array(GradeAuditLogDtoSchema) }),
  });
  return res.logs;
}

// ── Téléchargements PDF Typst ──

export function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function downloadStudentBulletinPdf(
  enrollmentId: string,
  periodId: string,
): Promise<{ blob: Blob; filename: string }> {
  const { blob, filename } = await apiFetchFile(
    `/api/reports/bulletins/student/${enrollmentId}/pdf${buildQuery({ periodId })}`,
  );
  return { blob, filename: filename ?? `bulletin-${enrollmentId}.pdf` };
}

export async function downloadClassBulletinsPdf(
  classId: string,
  periodId: string,
): Promise<{ blob: Blob; filename: string }> {
  const { blob, filename } = await apiFetchFile(
    `/api/reports/bulletins/class/${classId}/pdf${buildQuery({ periodId })}`,
  );
  return { blob, filename: filename ?? `bulletins-classe-${classId}.pdf` };
}

export async function downloadHonorRollPdf(
  classId: string,
  periodId: string,
): Promise<{ blob: Blob; filename: string }> {
  const { blob, filename } = await apiFetchFile(
    `/api/reports/honor-roll/${classId}/pdf${buildQuery({ periodId })}`,
  );
  return { blob, filename: filename ?? `tableau-honneur-${classId}.pdf` };
}

export async function downloadClassListPdf(
  classId: string,
): Promise<{ blob: Blob; filename: string }> {
  const { blob, filename } = await apiFetchFile(`/api/reports/class-list/${classId}/pdf`);
  return { blob, filename: filename ?? `liste-classe-${classId}.pdf` };
}
