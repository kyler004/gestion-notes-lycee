import { BulkUpsertGradesSchema } from '@lycee/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DbClient } from '../db/client.js';
import { PaginationQuerySchema } from '../lib/sql.js';
import { createGradesService } from '../services/grades.service.js';

const GradesQuerySchema = z
  .object({
    classId: z.string().uuid().optional(),
    classSubjectId: z.string().uuid().optional(),
    periodId: z.string().uuid().optional(),
  })
  .merge(PaginationQuerySchema);

const GradeAuditQuerySchema = z
  .object({
    classId: z.string().uuid().optional(),
    periodId: z.string().uuid().optional(),
    enrollmentId: z.string().uuid().optional(),
    classSubjectId: z.string().uuid().optional(),
  })
  .merge(PaginationQuerySchema);

export async function registerGradesRoutes(app: FastifyInstance, deps: { db: DbClient }): Promise<void> {
  const gradesService = createGradesService(deps.db);

  app.get(
    '/api/grades',
    { preHandler: [app.requireRoles(['teacher', 'admin', 'censor', 'principal'])] },
    async (request) => {
      const { limit, offset, ...filters } = GradesQuerySchema.parse(request.query);
      const items = await gradesService.listGrades(request.currentUser, filters, { limit, offset });
      return { grades: items };
    },
  );

  app.put(
    '/api/grades/bulk',
    { preHandler: [app.requireRoles(['teacher', 'admin', 'censor'])] },
    async (request) => {
      const body = BulkUpsertGradesSchema.parse(request.body);
      const items = await gradesService.bulkUpsertGrades(request.currentUser, body.entries);
      return { grades: items, count: items.length };
    },
  );

  app.get(
    '/api/grades/audit',
    { preHandler: [app.requireRoles(['admin', 'censor', 'principal'])] },
    async (request) => {
      const { limit, offset, ...filters } = GradeAuditQuerySchema.parse(request.query);
      const logs = await gradesService.listGradeAuditLogs(filters, { limit, offset });
      return { logs };
    },
  );
}
