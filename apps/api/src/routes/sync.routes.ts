import { SyncPullQuerySchema, SyncPushRequestSchema } from '@lycee/shared';
import type { FastifyInstance } from 'fastify';
import type { DbClient } from '../db/client.js';
import { createSyncService } from '../services/sync.service.js';

export async function registerSyncRoutes(app: FastifyInstance, deps: { db: DbClient }): Promise<void> {
  const syncService = createSyncService(deps.db);

  app.get('/api/sync/pull', { preHandler: [app.authenticate] }, async (request) => {
    const query = SyncPullQuerySchema.parse(request.query);
    return syncService.pull(request.currentUser, query);
  });

  app.post(
    '/api/sync/push',
    { preHandler: [app.requireRoles(['teacher', 'admin', 'censor'])] },
    async (request) => {
      const body = SyncPushRequestSchema.parse(request.body);
      const results = await syncService.push(request.currentUser, body.operations);
      return { results };
    },
  );
}
