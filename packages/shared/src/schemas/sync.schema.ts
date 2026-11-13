import { z } from 'zod';
import { GRADE_STATUSES } from '../types/domain.js';

export const SyncPullQuerySchema = z.object({
  since: z.coerce.number().int().min(0).default(0),
  academicYearId: z.string().uuid().optional(),
});

export const SyncGradePushOperationSchema = z.object({
  operationId: z.string().uuid(),
  type: z.literal('UPSERT_GRADE'),
  clientTimestamp: z.string().datetime(),
  payload: z
    .object({
      enrollmentId: z.string().uuid(),
      classSubjectId: z.string().uuid(),
      periodId: z.string().uuid(),
      score: z.number().min(0).max(20).nullable(),
      status: z.enum(GRADE_STATUSES),
      appreciation: z.string().trim().max(255).nullable().optional(),
      reason: z.string().trim().max(255).optional(),
    })
    .superRefine((val, ctx) => {
      if (val.status === 'present' && val.score === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Une note entre 0 et 20 est requise quand status = "present".',
          path: ['score'],
        });
      }
      if (val.status !== 'present' && val.score !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'La note doit être null quand status != "present".',
          path: ['score'],
        });
      }
    }),
});

export const SyncPushRequestSchema = z.object({
  operations: z.array(SyncGradePushOperationSchema).min(1).max(500),
});
