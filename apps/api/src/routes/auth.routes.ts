import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config/env.js';
import type { DbClient } from '../db/client.js';
import { AppError } from '../lib/errors.js';
import { createAuthService } from '../services/auth.service.js';

export async function registerAuthRoutes(
  app: FastifyInstance,
  deps: { db: DbClient; config: AppConfig },
): Promise<void> {
  const authService = createAuthService(deps.db, deps.config);

  const checkLoginIpRateLimit = app.hasDecorator('createRateLimit')
    ? app.createRateLimit({
        max: 30,
        timeWindow: '1 minute',
        keyGenerator: (request) => request.ip,
      })
    : null;

  app.post(
    '/api/auth/login',
    {
      config: {
        rateLimit: {
          hook: 'preValidation',
          max: 10,
          timeWindow: '15 minutes',
          keyGenerator: (request) => {
            const body = request.body as { username?: unknown } | undefined;
            const username =
              typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';
            return `${request.ip}:${username}`;
          },
        },
      },
      preValidation: async (request, reply) => {
        if (!checkLoginIpRateLimit) return;
        const result = await checkLoginIpRateLimit(request);
        if (!result.isAllowed && result.isExceeded) {
          reply
            .header('x-ratelimit-limit', result.max)
            .header('x-ratelimit-remaining', 0)
            .header('x-ratelimit-reset', result.ttlInSeconds)
            .header('retry-after', result.ttlInSeconds);
          throw new AppError(
            429,
            'RATE_LIMIT_EXCEEDED',
            'Trop de tentatives de connexion depuis cette adresse IP. Réessayez plus tard.',
          );
        }
      },
    },
    async (request) => {
      return authService.login(request.body, (payload) => app.jwt.sign(payload));
    },
  );

  app.post(
    '/api/auth/refresh',
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
        },
      },
    },
    async (request) => {
      return authService.refresh(request.body, (payload) => app.jwt.sign(payload));
    },
  );

  app.post(
    '/api/auth/logout',
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
        },
      },
    },
    async (request) => {
      return authService.logout(request.body);
    },
  );

  app.post(
    '/api/auth/logout-all',
    {
      preHandler: [app.authenticate],
      config: {
        rateLimit: {
          hook: 'preHandler',
          max: 15,
          timeWindow: '1 minute',
          keyGenerator: (request) => request.currentUser?.id ?? request.ip,
        },
      },
    },
    async (request) => {
      return authService.logoutAll(request.currentUser.id);
    },
  );

  app.get('/api/auth/me', { preHandler: [app.authenticate] }, async (request) => {
    return request.currentUser;
  });

  app.post(
    '/api/auth/change-password',
    {
      preHandler: [app.authenticate],
      config: {
        rateLimit: {
          hook: 'preHandler',
          max: 5,
          timeWindow: '15 minutes',
          keyGenerator: (request) => request.currentUser?.id ?? request.ip,
        },
      },
    },
    async (request) => {
      return authService.changePassword(request.currentUser.id, request.body);
    },
  );
}
