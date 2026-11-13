import {
  CreateEnrollmentSchema,
  CreateStudentSchema,
  ENROLLMENT_STATUSES,
  UpdateEnrollmentSchema,
  UpdateStudentSchema,
} from '@lycee/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DbClient } from '../db/client.js';
import {
  createEnrollment,
  createStudent,
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

const StudentsQuerySchema = z.object({
  q: z.string().optional(),
});

const ClassStudentsQuerySchema = z.object({
  status: z.enum(ENROLLMENT_STATUSES).optional(),
});

export async function registerStudentsRoutes(
  app: FastifyInstance,
  deps: { db: DbClient },
): Promise<void> {
  const { db } = deps;

  app.get(
    '/api/students',
    { preHandler: [app.requireRoles(['admin', 'censor', 'principal', 'secretary'])] },
    async (request) => {
      const { q } = StudentsQuerySchema.parse(request.query);
      const students = await listStudents(db, q);
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
      const { status } = ClassStudentsQuerySchema.parse(request.query);
      const students = await listClassStudents(db, classId, request.currentUser, status);
      return { classId, students };
    },
  );
}
