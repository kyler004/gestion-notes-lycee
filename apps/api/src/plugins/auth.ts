import fastifyJwt from '@fastify/jwt';
import type { AuthUserPayload, UserRole } from '@lycee/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { DbClient } from '../db/client.js';
import { users } from '../db/schema.js';
import { ForbiddenError, UnauthorizedError } from '../lib/errors.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      username: string;
      fullName: string;
      role: UserRole;
    };
    user: {
      sub: string;
      username: string;
      fullName: string;
      role: UserRole;
    };
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    currentUser: AuthUserPayload;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRoles: (roles: readonly UserRole[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export interface AuthPluginOptions {
  jwtAccessSecret: string;
  jwtAccessTtl: string;
  db: DbClient;
}

export const authPlugin = fp<AuthPluginOptions>(async (app: FastifyInstance, opts) => {
  await app.register(fastifyJwt, {
    secret: opts.jwtAccessSecret,
    sign: { expiresIn: opts.jwtAccessTtl },
  });

  app.decorateRequest('currentUser', undefined as unknown as AuthUserPayload);

  app.decorate('authenticate', async (request: FastifyRequest) => {
    try {
      await request.jwtVerify();
    } catch {
      throw new UnauthorizedError('Jeton d’authentification invalide ou expiré.');
    }

    const [dbUser] = await opts.db
      .select({
        id: users.id,
        username: users.username,
        fullName: users.fullName,
        role: users.role,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, request.user.sub))
      .limit(1);

    if (!dbUser || !dbUser.isActive) {
      throw new UnauthorizedError('Compte utilisateur inactif ou introuvable.');
    }

    request.currentUser = dbUser;
  });

  app.decorate('requireRoles', (roles: readonly UserRole[]) => {
    return async (request: FastifyRequest) => {
      await app.authenticate(request, undefined as unknown as FastifyReply);
      if (!roles.includes(request.currentUser.role)) {
        throw new ForbiddenError(`Rôle insuffisant. Rôles autorisés : ${roles.join(', ')}`);
      }
    };
  });
});
