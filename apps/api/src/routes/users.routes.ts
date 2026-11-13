import type { FastifyInstance } from 'fastify';
import type { DbClient } from '../db/client.js';
import { createUsersService } from '../services/users.service.js';

export async function registerUsersRoutes(app: FastifyInstance, deps: { db: DbClient }): Promise<void> {
  const usersService = createUsersService(deps.db);

  app.get(
    '/api/users',
    { preHandler: [app.requireRoles(['admin', 'censor', 'principal', 'secretary'])] },
    async (request) => {
      return usersService.listUsers(request.query);
    },
  );

  app.post(
    '/api/users',
    { preHandler: [app.requireRoles(['admin', 'censor'])] },
    async (request, reply) => {
      const created = await usersService.createUser(request.body, request.currentUser.role);
      return reply.status(201).send(created);
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/api/users/:id',
    { preHandler: [app.requireRoles(['admin', 'censor'])] },
    async (request) => {
      return usersService.updateUser(request.params.id, request.body, request.currentUser.role);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/users/:id/reset-password',
    { preHandler: [app.requireRoles(['admin'])] },
    async (request) => {
      return usersService.resetPassword(request.params.id, request.body, request.currentUser.role);
    },
  );
}
