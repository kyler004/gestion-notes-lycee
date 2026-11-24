import {
  CreateEnrollmentSchema,
  CreateStudentSchema,
  ENROLLMENT_STATUSES,
  ImportStudentsCsvSchema,
  UpdateEnrollmentSchema,
  UpdateStudentSchema,
} from '@lycee/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DbClient } from '../db/client.js';
import { PaginationQuerySchema } from '../lib/sql.js';
import {
  createEnrollment,
  createStudent,
  importStudentsCsv,
  listClassStudents,
  listStudents,
  updateEnrollment,
  updateStudent,
} from '../services/students.service.js';

const IdParamSchema = z.object({
  id: z.string().uuid(),
});

const ClassIdParamSchema = z.object({
  classId: z.string().uuid(),
});

const StudentsQuerySchema = z
  .object({
    q: z.string().trim().max(100).optional(),
  })
  .merge(PaginationQuerySchema);

const ClassStudentsQuerySchema = z
  .object({
    status: z.enum(ENROLLMENT_STATUSES).optional(),
  })
  .merge(PaginationQuerySchema);

export async function registerStudentsRoutes(
  app: FastifyInstance,
  deps: { db: DbClient },
): Promise<void> {
  const { db } = deps;

  app.get(
    '/api/students',
    { preHandler: [app.requireRoles(['admin', 'censor', 'principal', 'secretary'])] },
    async (request) => {
      const { q, limit, offset } = StudentsQuerySchema.parse(request.query);
      const students = await listStudents(db, q, { limit, offset });
      return { students };
    },
  );

  app.post(
    '/api/students',
    { preHandler: [app.requireRoles(['admin', 'censor', 'secretary'])] },
    async (request, reply) => {
      const input = CreateStudentSchema.parse(request.body);
      const created = await createStudent(db, input);
      return reply.status(201).send(created);
    },
  );

  app.post(
    '/api/students/import-csv',
    {
      preHandler: [app.requireRoles(['admin', 'censor', 'secretary'])],
      config: {
        rateLimit: {
          hook: 'preHandler',
          max: 10,
          timeWindow: '1 minute',
          keyGenerator: (request) => request.currentUser?.id ?? request.ip,
        },
      },
    },
    async (request, reply) => {
      const input = ImportStudentsCsvSchema.parse(request.body);
      const result = await importStudentsCsv(db, input);
      return reply.status(result.committed ? 201 : 200).send(result);
    },
  );

  app.patch(
    '/api/students/:id',
    { preHandler: [app.requireRoles(['admin', 'censor', 'secretary'])] },
    async (request) => {
      const { id } = IdParamSchema.parse(request.params);
      const input = UpdateStudentSchema.parse(request.body);
      return updateStudent(db, id, input);
    },
  );

  app.post(
    '/api/enrollments',
    { preHandler: [app.requireRoles(['admin', 'censor', 'secretary'])] },
    async (request, reply) => {
      const input = CreateEnrollmentSchema.parse(request.body);
      const created = await createEnrollment(db, input);
      return reply.status(201).send(created);
    },
  );

  app.patch(
    '/api/enrollments/:id',
    { preHandler: [app.requireRoles(['admin', 'censor', 'secretary'])] },
    async (request) => {
      const { id } = IdParamSchema.parse(request.params);
      const input = UpdateEnrollmentSchema.parse(request.body);
      return updateEnrollment(db, id, input);
    },
  );

  app.get(
    '/api/classes/:classId/students',
    { preHandler: [app.authenticate] },
    async (request) => {
      const { classId } = ClassIdParamSchema.parse(request.params);
      const { status, limit, offset } = ClassStudentsQuerySchema.parse(request.query);
      const students = await listClassStudents(db, classId, request.currentUser, status, {
        limit,
        offset,
      });
      return { classId, students };
    },
  );
}
