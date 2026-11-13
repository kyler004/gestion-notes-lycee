import fastifyJwt from '@fastify/jwt';
import type { AuthUserPayload, UserRole } from '@lycee/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';
import type { DbClient } from '../db/client.js';
import { users } from '../db/schema.js';
import { ForbiddenError, UnauthorizedError } from '../lib/errors.js';

export const JWT_ISSUER = 'lycee-api';
export const JWT_AUDIENCE = 'lycee-client';

const JwtClaimsSchema = z.object({
  sub: z.string().uuid(),
  ver: z.number().int().positive(),
});

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      ver: number;
    };
    user: {
      sub: string;
      ver: number;
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
    sign: {
      algorithm: 'HS256',
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE,
      expiresIn: opts.jwtAccessTtl,
    },
    verify: {
      algorithms: ['HS256'],
      allowedIss: JWT_ISSUER,
      allowedAud: JWT_AUDIENCE,
      requiredClaims: ['sub', 'exp', 'iat', 'ver'],
    },
  });

  app.decorateRequest('currentUser', undefined as unknown as AuthUserPayload);

  app.decorate('authenticate', async (request: FastifyRequest) => {
    try {
      await request.jwtVerify();
    } catch {
      throw new UnauthorizedError('Jeton d’authentification invalide ou expiré.');
    }

    const parsedClaims = JwtClaimsSchema.safeParse(request.user);
    if (!parsedClaims.success) {
      throw new UnauthorizedError('Jeton d’authentification invalide.');
    }

    const [dbUser] = await opts.db
      .select({
        id: users.id,
        username: users.username,
        fullName: users.fullName,
        role: users.role,
        isActive: users.isActive,
        tokenVersion: users.tokenVersion,
      })
      .from(users)
      .where(eq(users.id, parsedClaims.data.sub))
      .limit(1);

    if (!dbUser || !dbUser.isActive || dbUser.tokenVersion !== parsedClaims.data.ver) {
      throw new UnauthorizedError('Compte utilisateur inactif, session révoquée ou introuvable.');
    }

    request.currentUser = {
      id: dbUser.id,
      username: dbUser.username,
      fullName: dbUser.fullName,
      role: dbUser.role,
      isActive: dbUser.isActive,
    };
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
