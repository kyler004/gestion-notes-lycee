import {
  CreateAcademicYearSchema,
  CreateClassSchema,
  CreatePeriodSchema,
  GradingRulesSchema,
  UpdateClassSchema,
  UpdatePeriodSchema,
} from '@lycee/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DbClient } from '../db/client.js';
import {
  activateAcademicYear,
  createAcademicYear,
  createClass,
  createPeriod,
  getGradingRules,
  listAcademicYears,
  listClasses,
  listPeriods,
  updateClass,
  updatePeriod,
  upsertGradingRules,
} from '../services/academic.service.js';

const IdParamSchema = z.object({
  id: z.string().uuid(),
});

const YearIdParamSchema = z.object({
  yearId: z.string().uuid(),
});

const ClassesQuerySchema = z.object({
  academicYearId: z.string().uuid().optional(),
});

export async function registerAcademicRoutes(
  app: FastifyInstance,
  deps: { db: DbClient },
): Promise<void> {
  const { db } = deps;

  app.get(
    '/api/academic-years',
    { preHandler: [app.authenticate] },
    async () => {
      const academicYears = await listAcademicYears(db);
      return { academicYears };
    },
  );

  app.post(
    '/api/academic-years',
    { preHandler: [app.requireRoles(['admin', 'censor'])] },
    async (request, reply) => {
      const input = CreateAcademicYearSchema.parse(request.body);
      const result = await createAcademicYear(db, input);
      return reply.status(201).send(result);
    },
  );

  app.patch(
    '/api/academic-years/:id/activate',
    { preHandler: [app.requireRoles(['admin', 'censor'])] },
    async (request) => {
      const { id } = IdParamSchema.parse(request.params);
      return activateAcademicYear(db, id);
    },
  );

  app.get(
    '/api/academic-years/:yearId/grading-rules',
    { preHandler: [app.authenticate] },
    async (request) => {
      const { yearId } = YearIdParamSchema.parse(request.params);
      return getGradingRules(db, yearId);
    },
  );

  app.put(
    '/api/academic-years/:yearId/grading-rules',
    { preHandler: [app.requireRoles(['admin', 'censor'])] },
    async (request) => {
      const { yearId } = YearIdParamSchema.parse(request.params);
      const input = GradingRulesSchema.parse(request.body);
      return upsertGradingRules(db, yearId, input);
    },
  );

  app.get(
    '/api/academic-years/:yearId/periods',
    { preHandler: [app.authenticate] },
    async (request) => {
      const { yearId } = YearIdParamSchema.parse(request.params);
      const periods = await listPeriods(db, yearId);
      return { periods };
    },
  );

  app.post(
    '/api/periods',
    { preHandler: [app.requireRoles(['admin', 'censor'])] },
    async (request, reply) => {
      const input = CreatePeriodSchema.parse(request.body);
      const created = await createPeriod(db, input);
      return reply.status(201).send(created);
    },
  );

  app.patch(
    '/api/periods/:id',
    { preHandler: [app.requireRoles(['admin', 'censor'])] },
    async (request) => {
      const { id } = IdParamSchema.parse(request.params);
      const input = UpdatePeriodSchema.parse(request.body);
      return updatePeriod(db, id, input);
    },
  );

  app.get(
    '/api/classes',
    { preHandler: [app.authenticate] },
    async (request) => {
      const { academicYearId } = ClassesQuerySchema.parse(request.query);
      const classes = await listClasses(db, academicYearId);
      return { classes };
    },
  );

  app.post(
    '/api/classes',
    { preHandler: [app.requireRoles(['admin', 'censor'])] },
    async (request, reply) => {
      const input = CreateClassSchema.parse(request.body);
      const created = await createClass(db, input);
      return reply.status(201).send(created);
    },
  );

  app.patch(
    '/api/classes/:id',
    { preHandler: [app.requireRoles(['admin', 'censor'])] },
    async (request) => {
      const { id } = IdParamSchema.parse(request.params);
      const input = UpdateClassSchema.parse(request.body);
      return updateClass(db, id, input);
    },
  );
}
