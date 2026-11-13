import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config/env.js';
import type { DbClient } from '../db/client.js';
import { createAuthService } from '../services/auth.service.js';

export async function registerAuthRoutes(
  app: FastifyInstance,
  deps: { db: DbClient; config: AppConfig },
): Promise<void> {
  const authService = createAuthService(deps.db, deps.config);

  app.post('/api/auth/login', async (request) => {
    return authService.login(request.body, (payload) => app.jwt.sign(payload));
  });

  app.post('/api/auth/refresh', async (request) => {
    return authService.refresh(request.body, (payload) => app.jwt.sign(payload));
  });

  app.post('/api/auth/logout', async (request) => {
    return authService.logout(request.body);
  });

  app.get('/api/auth/me', { preHandler: [app.authenticate] }, async (request) => {
    return request.currentUser;
  });

  app.post('/api/auth/change-password', { preHandler: [app.authenticate] }, async (request) => {
    return authService.changePassword(request.currentUser.id, request.body);
  });
}
