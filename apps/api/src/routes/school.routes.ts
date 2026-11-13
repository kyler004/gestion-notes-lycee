import type { FastifyInstance } from 'fastify';
import type { DbClient } from '../db/client.js';
import { createSchoolService } from '../services/school.service.js';

export async function registerSchoolRoutes(app: FastifyInstance, deps: { db: DbClient }): Promise<void> {
  const schoolService = createSchoolService(deps.db);

  app.get('/api/school', { preHandler: [app.authenticate] }, async () => {
    return schoolService.getProfile();
  });

  app.put('/api/school', { preHandler: [app.requireRoles(['admin'])] }, async (request) => {
    return schoolService.upsertProfile(request.body);
  });

  app.put('/api/school/logo', { preHandler: [app.requireRoles(['admin'])] }, async (request) => {
    return schoolService.uploadLogo(request.body);
  });

  app.get('/api/school/logo', { preHandler: [app.authenticate] }, async (_request, reply) => {
    const logo = await schoolService.getLogo();
    return reply
      .header('Content-Security-Policy', "default-src 'none'; sandbox")
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Disposition', 'inline')
      .type(logo.mimeType)
      .send(logo.data);
  });
}
