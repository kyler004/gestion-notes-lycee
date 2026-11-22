import {
  AppreciationBandSchema,
  COUNCIL_DECISIONS,
  ENROLLMENT_STATUSES,
  GRADE_STATUSES,
  PERIOD_STATUSES,
  PERIOD_TYPES,
  STUDENT_SEXES,
  SYNC_OUTCOMES,
  SyncGradePushOperationSchema,
} from '@lycee/shared';
import { z } from 'zod';
import { apiRequest } from './client';

export const SyncPullPayloadSchema = z.object({
  academicYearId: z.string().uuid(),
  academicYear: z.object({
    id: z.string().uuid(),
    label: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    isActive: z.boolean(),
    syncVersion: z.number(),
  }),
  since: z.number(),
  latestCursor: z.number(),
  hasMore: z.boolean(),
  teacherAssignments: z.array(
    z.object({
      id: z.string().uuid(),
      teacherId: z.string().uuid(),
      classSubjectId: z.string().uuid(),
      academicYearId: z.string().uuid(),
      isActive: z.boolean(),
      syncVersion: z.number(),
      createdAt: z.string(),
      updatedAt: z.string(),
    }),
  ),
  classes: z.array(
    z.object({
      id: z.string().uuid(),
      academicYearId: z.string().uuid(),
      name: z.string(),
      level: z.string(),
      series: z.string().nullable(),
      mainTeacherId: z.string().uuid().nullable(),
      syncVersion: z.number(),
      updatedAt: z.string(),
    }),
  ),
  classSubjects: z.array(
    z.object({
      id: z.string().uuid(),
      classId: z.string().uuid(),
      subjectId: z.string().uuid(),
      subjectGroupId: z.string().uuid().nullable(),
      coefficient: z.number(),
      syncVersion: z.number(),
      updatedAt: z.string(),
    }),
  ),
  enrollments: z.array(
    z.object({
      id: z.string().uuid(),
      studentId: z.string().uuid(),
      classId: z.string().uuid(),
      academicYearId: z.string().uuid(),
      isRepeater: z.boolean(),
      status: z.enum(ENROLLMENT_STATUSES),
      syncVersion: z.number(),
      enrolledAt: z.string(),
      updatedAt: z.string(),
    }),
  ),
  students: z.array(
    z.object({
      id: z.string().uuid(),
      matricule: z.string(),
      lastName: z.string(),
      firstName: z.string(),
      birthDate: z.string(),
      birthPlace: z.string(),
      sex: z.enum(STUDENT_SEXES),
      syncVersion: z.number(),
      createdAt: z.string(),
      updatedAt: z.string(),
    }),
  ),
  grades: z.array(
    z.object({
      id: z.string().uuid(),
      enrollmentId: z.string().uuid(),
      classSubjectId: z.string().uuid(),
      periodId: z.string().uuid(),
      score: z.number().nullable(),
      status: z.enum(GRADE_STATUSES),
      appreciation: z.string().nullable(),
      enteredBy: z.string().uuid(),
      syncVersion: z.number(),
      createdAt: z.string(),
      updatedAt: z.string(),
    }),
  ),
  periods: z.array(
    z.object({
      id: z.string().uuid(),
      academicYearId: z.string().uuid(),
      parentPeriodId: z.string().uuid().nullable(),
      type: z.enum(PERIOD_TYPES),
      code: z.string(),
      name: z.string(),
      orderIndex: z.number(),
      weight: z.number(),
      status: z.enum(PERIOD_STATUSES),
      lockedAt: z.string().nullable(),
      lockedBy: z.string().uuid().nullable(),
      syncVersion: z.number(),
      updatedAt: z.string(),
    }),
  ),
  subjects: z.array(
    z.object({
      id: z.string().uuid(),
      code: z.string(),
      name: z.string(),
      shortName: z.string(),
      isActive: z.boolean(),
      syncVersion: z.number(),
      updatedAt: z.string(),
    }),
  ),
  subjectGroups: z.array(
    z.object({
      id: z.string().uuid(),
      academicYearId: z.string().uuid(),
      name: z.string(),
      orderIndex: z.number(),
      syncVersion: z.number(),
    }),
  ),
  gradingRules: z.array(
    z.object({
      id: z.string().uuid(),
      academicYearId: z.string().uuid(),
      trimestersCount: z.number(),
      sequencesPerTrimester: z.number(),
      sequenceWeights: z.array(z.number()),
      trimesterWeights: z.array(z.number()),
      passingThreshold: z.number(),
      honorRollThreshold: z.number(),
      encouragementThreshold: z.number(),
      congratulationThreshold: z.number(),
      treatAbsentAsZero: z.boolean(),
      appreciationScale: z.array(AppreciationBandSchema),
      syncVersion: z.number(),
      updatedAt: z.string(),
    }),
  ),
  councilDecisions: z.array(
    z.object({
      id: z.string().uuid(),
      enrollmentId: z.string().uuid(),
      periodId: z.string().uuid(),
      generalAppreciation: z.string(),
      decision: z.enum(COUNCIL_DECISIONS),
      absencesHours: z.number(),
      decidedBy: z.string().uuid(),
      syncVersion: z.number(),
      updatedAt: z.string(),
    }),
  ),
});

export type SyncPullPayload = z.infer<typeof SyncPullPayloadSchema>;
export type SyncGradePushOperation = z.infer<typeof SyncGradePushOperationSchema>;

export const SyncPushResultItemSchema = z.object({
  operationId: z.string().uuid(),
  outcome: z.enum(SYNC_OUTCOMES),
  gradeId: z.string().uuid().optional(),
  entityId: z.string().uuid().nullable().optional(),
  syncVersion: z.number().optional(),
  errorMessage: z.string().optional(),
});

export const SyncPushResponseSchema = z.object({
  results: z.array(SyncPushResultItemSchema),
});

export type SyncPushOperationResult = z.infer<typeof SyncPushResultItemSchema>;

export async function pullSyncRequest(params: {
  since: number;
  limit?: number;
  academicYearId?: string;
}): Promise<SyncPullPayload> {
  const search = new URLSearchParams();
  search.set('since', String(params.since));
  if (params.limit !== undefined) {
    search.set('limit', String(params.limit));
  }
  if (params.academicYearId) {
    search.set('academicYearId', params.academicYearId);
  }

  return apiRequest(`/api/sync/pull?${search.toString()}`, {
    method: 'GET',
    schema: SyncPullPayloadSchema,
  });
}

export async function pushSyncRequest(
  operations: SyncGradePushOperation[],
): Promise<SyncPushOperationResult[]> {
  const res = await apiRequest('/api/sync/push', {
    method: 'POST',
    body: { operations },
    schema: SyncPushResponseSchema,
  });
  return res.results;
}
