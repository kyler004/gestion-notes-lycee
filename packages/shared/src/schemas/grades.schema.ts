import { z } from 'zod';
import { COUNCIL_DECISIONS, GRADE_STATUSES } from '../types/domain.js';

export const GradeEntryInputSchema = z
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
        message: 'Une note numérique entre 0 et 20 est requise lorsque le statut est "present".',
        path: ['score'],
      });
    }
    if (val.status !== 'present' && val.score !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La note doit être nulle lorsque l’élève est absent ou excusé.',
        path: ['score'],
      });
    }
  });

export const BulkUpsertGradesSchema = z.object({
  entries: z.array(GradeEntryInputSchema).min(1).max(200),
});

export const LockPeriodSchema = z.object({
  reason: z.string().trim().max(255).optional().default(''),
});

export const UnlockPeriodSchema = z.object({
  reason: z.string().trim().min(5, 'Un motif d’au moins 5 caractères est obligatoire pour déverrouiller une période.').max(255),
});

export const CouncilDecisionInputSchema = z.object({
  enrollmentId: z.string().uuid(),
  periodId: z.string().uuid(),
  generalAppreciation: z.string().trim().max(500).optional().default(''),
  decision: z.enum(COUNCIL_DECISIONS),
  absencesHours: z.number().int().min(0).max(5000).optional().default(0),
});

export const BulkCouncilDecisionsSchema = z.object({
  decisions: z.array(CouncilDecisionInputSchema).min(1).max(200),
});
