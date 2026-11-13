import {
  CreateSubjectGroupSchema,
  CreateSubjectSchema,
  CreateTeacherAssignmentSchema,
  UpdateSubjectSchema,
  UpsertClassSubjectSchema,
} from '@lycee/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DbClient } from '../db/client.js';
import { PaginationQuerySchema } from '../lib/sql.js';
import {
  createOrReactivateTeacherAssignment,
  createSubject,
  createSubjectGroup,
  deactivateTeacherAssignment,
  listClassSubjects,
  listMyTeacherAssignments,
  listSubjectGroups,
  listSubjects,
  listTeacherAssignments,
  updateSubject,
  upsertClassSubject,
} from '../services/subjects.service.js';

const IdParamSchema = z.object({
  id: z.string().uuid(),
});

const ClassIdParamSchema = z.object({
  classId: z.string().uuid(),
});

const BooleanFlagQuerySchema = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

const SubjectGroupsQuerySchema = z
  .object({
    academicYearId: z.string().uuid().optional(),
  })
  .merge(PaginationQuerySchema);

const SubjectsQuerySchema = z
  .object({
    activeOnly: BooleanFlagQuerySchema,
  })
  .merge(PaginationQuerySchema);

const TeacherAssignmentsQuerySchema = z
  .object({
    academicYearId: z.string().uuid().optional(),
    classId: z.string().uuid().optional(),
    teacherId: z.string().uuid().optional(),
    includeInactive: BooleanFlagQuerySchema,
  })
  .merge(PaginationQuerySchema);

const MyAssignmentsQuerySchema = z
  .object({
    academicYearId: z.string().uuid().optional(),
  })
  .merge(PaginationQuerySchema);

export async function registerSubjectsRoutes(
  app: FastifyInstance,
  deps: { db: DbClient },
): Promise<void> {
  const { db } = deps;

  app.get(
    '/api/subject-groups',
    { preHandler: [app.authenticate] },
    async (request) => {
      const { academicYearId, limit, offset } = SubjectGroupsQuerySchema.parse(request.query);
      const subjectGroups = await listSubjectGroups(db, academicYearId, { limit, offset });
      return { subjectGroups };
    },
  );

  app.post(
    '/api/subject-groups',
    { preHandler: [app.requireRoles(['admin', 'censor'])] },
    async (request, reply) => {
      const input = CreateSubjectGroupSchema.parse(request.body);
      const created = await createSubjectGroup(db, input);
      return reply.status(201).send(created);
    },
  );

  app.get(
    '/api/subjects',
    { preHandler: [app.authenticate] },
    async (request) => {
      const { activeOnly, limit, offset } = SubjectsQuerySchema.parse(request.query);
      const subjects = await listSubjects(db, activeOnly, { limit, offset });
      return { subjects };
    },
  );

  app.post(
    '/api/subjects',
    { preHandler: [app.requireRoles(['admin', 'censor'])] },
    async (request, reply) => {
      const input = CreateSubjectSchema.parse(request.body);
      const created = await createSubject(db, input);
      return reply.status(201).send(created);
    },
  );

  app.patch(
    '/api/subjects/:id',
    { preHandler: [app.requireRoles(['admin', 'censor'])] },
    async (request) => {
      const { id } = IdParamSchema.parse(request.params);
      const input = UpdateSubjectSchema.parse(request.body);
      return updateSubject(db, id, input);
    },
  );

  app.get(
    '/api/classes/:classId/subjects',
    { preHandler: [app.authenticate] },
    async (request) => {
      const { classId } = ClassIdParamSchema.parse(request.params);
      const pagination = PaginationQuerySchema.parse(request.query);
      const classSubjects = await listClassSubjects(db, classId, request.currentUser, pagination);
      return { classId, classSubjects };
    },
  );

  app.put(
    '/api/class-subjects',
    { preHandler: [app.requireRoles(['admin', 'censor'])] },
    async (request) => {
      const input = UpsertClassSubjectSchema.parse(request.body);
      return upsertClassSubject(db, input);
    },
  );

  app.get(
    '/api/teacher-assignments',
    { preHandler: [app.requireRoles(['admin', 'censor', 'principal'])] },
    async (request) => {
      const { limit, offset, ...filters } = TeacherAssignmentsQuerySchema.parse(request.query);
      const assignments = await listTeacherAssignments(db, filters, { limit, offset });
      return { assignments };
    },
  );

  app.post(
    '/api/teacher-assignments',
    { preHandler: [app.requireRoles(['admin', 'censor'])] },
    async (request, reply) => {
      const input = CreateTeacherAssignmentSchema.parse(request.body);
      const { assignment, created } = await createOrReactivateTeacherAssignment(db, input);
      return reply.status(created ? 201 : 200).send(assignment);
    },
  );

  app.delete(
    '/api/teacher-assignments/:id',
    { preHandler: [app.requireRoles(['admin', 'censor'])] },
    async (request) => {
      const { id } = IdParamSchema.parse(request.params);
      return deactivateTeacherAssignment(db, id);
    },
  );

  app.get(
    '/api/teachers/me/assignments',
    { preHandler: [app.authenticate] },
    async (request) => {
      const { academicYearId, limit, offset } = MyAssignmentsQuerySchema.parse(request.query);
      const assignments = await listMyTeacherAssignments(
        db,
        request.currentUser.id,
        academicYearId,
        { limit, offset },
      );
      return { assignments };
    },
  );
}
