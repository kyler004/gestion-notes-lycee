import { createHash } from 'node:crypto';
import {
  type AuthUserPayload,
  ClassPeriodReportQuerySchema,
  type GradingCalculatorContract,
  SchoolStatsQuerySchema,
  StudentBulletinQuerySchema,
} from '@lycee/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { DbClient } from '../db/client.js';
import { classes, classSubjects, enrollments, teacherAssignments } from '../db/schema.js';
import { ForbiddenError, NotFoundError } from '../lib/errors.js';
import type { PdfRenderer } from '../services/pdf.service.js';
import { createResultsService } from '../services/results.service.js';

const ClassIdParamSchema = z.object({
  classId: z.string().uuid(),
});

const EnrollmentIdParamSchema = z.object({
  enrollmentId: z.string().uuid(),
});

function computePayloadEtag(payload: { generatedAt?: string }): string {
  const { generatedAt: _ignoredGeneratedAt, ...deterministicPayload } = payload;
  const hash = createHash('sha256').update(JSON.stringify(deterministicPayload)).digest('hex');
  return `"${hash}"`;
}

function isEtagMatch(headerValue: string | string[] | undefined, etag: string): boolean {
  if (!headerValue) return false;
  const raw = Array.isArray(headerValue) ? headerValue.join(',') : headerValue;
  const normalize = (value: string): string => value.trim().replace(/^W\//i, '');
  const target = normalize(etag);
  const targetUnquoted = target.replaceAll('"', '');
  return raw
    .split(',')
    .map(normalize)
    .some((candidate) => candidate === '*' || candidate === target || candidate === targetUnquoted);
}

function sanitizeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'document';
}

function sendPdfResponse(
  reply: FastifyReply,
  pdfBuffer: Buffer,
  etag: string,
  fileName: string,
): FastifyReply {
  return reply
    .header('Content-Type', 'application/pdf')
    .header('Cache-Control', 'private, max-age=300')
    .header('ETag', etag)
    .header('Content-Disposition', `inline; filename="${fileName}"`)
    .send(pdfBuffer);
}

function sendNotModifiedResponse(reply: FastifyReply, etag: string): FastifyReply {
  return reply
    .header('ETag', etag)
    .header('Cache-Control', 'private, max-age=300')
    .code(304)
    .send();
}

async function assertTeacherClassAccess(
  db: DbClient,
  user: AuthUserPayload,
  classId: string,
): Promise<void> {
  if (user.role !== 'teacher') {
    return;
  }

  const [cls] = await db
    .select({
      id: classes.id,
      mainTeacherId: classes.mainTeacherId,
    })
    .from(classes)
    .where(eq(classes.id, classId))
    .limit(1);

  if (!cls) {
    throw new NotFoundError('Classe introuvable.');
  }

  if (cls.mainTeacherId === user.id) {
    return;
  }

  const [assignment] = await db
    .select({ id: teacherAssignments.id })
    .from(teacherAssignments)
    .innerJoin(classSubjects, eq(teacherAssignments.classSubjectId, classSubjects.id))
    .where(
      and(
        eq(teacherAssignments.teacherId, user.id),
        eq(teacherAssignments.isActive, true),
        eq(classSubjects.classId, classId),
      ),
    )
    .limit(1);

  if (!assignment) {
    throw new ForbiddenError('Accès refusé : vous n’êtes pas affecté à cette classe.');
  }
}

export async function registerReportsRoutes(
  app: FastifyInstance,
  deps: { db: DbClient; pdfRenderer: PdfRenderer; calculator?: GradingCalculatorContract },
): Promise<void> {
  const resultsService = createResultsService(deps.db, deps.calculator);

  app.get(
    '/api/reports/class-results',
    { preHandler: [app.authenticate] },
    async (request) => {
      const query = ClassPeriodReportQuerySchema.parse(request.query);
      await assertTeacherClassAccess(deps.db, request.currentUser, query.classId);
      return resultsService.getClassResults(query.classId, query.periodId);
    },
  );

  app.get(
    '/api/reports/honor-roll',
    { preHandler: [app.authenticate] },
    async (request) => {
      const query = ClassPeriodReportQuerySchema.parse(request.query);
      await assertTeacherClassAccess(deps.db, request.currentUser, query.classId);
      return resultsService.getHonorRoll(query.classId, query.periodId);
    },
  );

  app.get(
    '/api/reports/school-stats',
    { preHandler: [app.requireRoles(['admin', 'censor', 'principal'])] },
    async (request) => {
      const query = SchoolStatsQuerySchema.parse(request.query);
      return resultsService.getSchoolStats(query.academicYearId, query.periodId);
    },
  );

  app.get(
    '/api/reports/bulletins/student/:enrollmentId/pdf',
    { preHandler: [app.requireRoles(['admin', 'censor', 'principal', 'secretary', 'teacher'])] },
    async (request, reply) => {
      const params = EnrollmentIdParamSchema.parse(request.params);
      const query = StudentBulletinQuerySchema.parse(request.query);

      if (request.currentUser.role === 'teacher') {
        const [enr] = await dbLookupEnrollment(deps.db, params.enrollmentId);
        if (!enr) {
          throw new NotFoundError('Inscription élève introuvable.');
        }
        await assertTeacherClassAccess(deps.db, request.currentUser, enr.classId);
      }

      const payload = await resultsService.buildBulletinPayload({
        enrollmentId: params.enrollmentId,
        periodId: query.periodId,
      });

      const etag = computePayloadEtag(payload);
      if (isEtagMatch(request.headers['if-none-match'], etag)) {
        return sendNotModifiedResponse(reply, etag);
      }

      const pdfBuffer = await deps.pdfRenderer.renderBulletin(payload);
      const studentCode = payload.students[0]?.matricule ?? params.enrollmentId;
      const fileName = `bulletin-${sanitizeFilePart(studentCode)}-${sanitizeFilePart(payload.period.code)}.pdf`;
      return sendPdfResponse(reply, pdfBuffer, etag, fileName);
    },
  );

  app.get(
    '/api/reports/bulletins/class/:classId/pdf',
    { preHandler: [app.requireRoles(['admin', 'censor', 'principal', 'secretary'])] },
    async (request, reply) => {
      const params = ClassIdParamSchema.parse(request.params);
      const query = StudentBulletinQuerySchema.parse(request.query);

      const payload = await resultsService.buildBulletinPayload({
        classId: params.classId,
        periodId: query.periodId,
      });

      const etag = computePayloadEtag(payload);
      if (isEtagMatch(request.headers['if-none-match'], etag)) {
        return sendNotModifiedResponse(reply, etag);
      }

      const pdfBuffer = await deps.pdfRenderer.renderBulletin(payload);
      const fileName = `bulletins-${sanitizeFilePart(payload.classInfo.name)}-${sanitizeFilePart(payload.period.code)}.pdf`;
      return sendPdfResponse(reply, pdfBuffer, etag, fileName);
    },
  );

  app.get(
    '/api/reports/honor-roll/:classId/pdf',
    { preHandler: [app.requireRoles(['admin', 'censor', 'principal', 'secretary'])] },
    async (request, reply) => {
      const params = ClassIdParamSchema.parse(request.params);
      const query = StudentBulletinQuerySchema.parse(request.query);

      const payload = await resultsService.buildHonorRollPayload(params.classId, query.periodId);

      const etag = computePayloadEtag(payload);
      if (isEtagMatch(request.headers['if-none-match'], etag)) {
        return sendNotModifiedResponse(reply, etag);
      }

      const pdfBuffer = await deps.pdfRenderer.renderHonorRoll(payload);
      const fileName = `tableau-honneur-${sanitizeFilePart(payload.classInfo.name)}-${sanitizeFilePart(payload.period.code)}.pdf`;
      return sendPdfResponse(reply, pdfBuffer, etag, fileName);
    },
  );

  app.get(
    '/api/reports/class-list/:classId/pdf',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const params = ClassIdParamSchema.parse(request.params);
      await assertTeacherClassAccess(deps.db, request.currentUser, params.classId);

      const payload = await resultsService.buildClassListPayload(params.classId);

      const etag = computePayloadEtag(payload);
      if (isEtagMatch(request.headers['if-none-match'], etag)) {
        return sendNotModifiedResponse(reply, etag);
      }

      const pdfBuffer = await deps.pdfRenderer.renderClassList(payload);
      const fileName = `liste-classe-${sanitizeFilePart(payload.classInfo.name)}.pdf`;
      return sendPdfResponse(reply, pdfBuffer, etag, fileName);
    },
  );
}

async function dbLookupEnrollment(db: DbClient, enrollmentId: string) {
  return db
    .select({ id: enrollments.id, classId: enrollments.classId })
    .from(enrollments)
    .where(eq(enrollments.id, enrollmentId))
    .limit(1);
}
