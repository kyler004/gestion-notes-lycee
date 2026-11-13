import {
  BulkCouncilDecisionsSchema,
  type GradingCalculatorContract,
  LockPeriodSchema,
  UnlockPeriodSchema,
} from '@lycee/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DbClient } from '../db/client.js';
import { createValidationService } from '../services/validation.service.js';

const PeriodIdParamSchema = z.object({
  periodId: z.string().uuid(),
});

const CouncilDecisionsQuerySchema = z.object({
  classId: z.string().uuid().optional(),
  periodId: z.string().uuid().optional(),
});

export async function registerValidationRoutes(
  app: FastifyInstance,
  deps: { db: DbClient; calculator?: GradingCalculatorContract },
): Promise<void> {
  const validationService = createValidationService(deps.db, deps.calculator);

  app.get(
    '/api/periods/:periodId/completeness',
    { preHandler: [app.requireRoles(['admin', 'censor', 'principal'])] },
    async (request) => {
      const { periodId } = PeriodIdParamSchema.parse(request.params);
      return validationService.getPeriodCompleteness(periodId);
    },
  );

  app.post(
    '/api/periods/:periodId/lock',
    { preHandler: [app.requireRoles(['admin', 'censor', 'principal'])] },
    async (request) => {
      const { periodId } = PeriodIdParamSchema.parse(request.params);
      const body = LockPeriodSchema.parse(request.body ?? {});
      return validationService.lockPeriod(periodId, request.currentUser, body.reason);
    },
  );

  app.post(
    '/api/periods/:periodId/unlock',
    { preHandler: [app.requireRoles(['admin', 'principal'])] },
    async (request) => {
      const { periodId } = PeriodIdParamSchema.parse(request.params);
      const body = UnlockPeriodSchema.parse(request.body ?? {});
      return validationService.unlockPeriod(periodId, request.currentUser, body.reason);
    },
  );

  app.put(
    '/api/council-decisions/bulk',
    { preHandler: [app.requireRoles(['admin', 'censor', 'principal'])] },
    async (request) => {
      const body = BulkCouncilDecisionsSchema.parse(request.body);
      const decisions = await validationService.bulkUpsertCouncilDecisions(
        request.currentUser,
        body.decisions,
      );
      return { decisions, count: decisions.length };
    },
  );

  app.get('/api/council-decisions', { preHandler: [app.authenticate] }, async (request) => {
    const query = CouncilDecisionsQuerySchema.parse(request.query);
    const decisions = await validationService.listCouncilDecisions(request.currentUser, query);
    return { decisions };
  });
}
