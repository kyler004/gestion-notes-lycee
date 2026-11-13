import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, 'BAD_REQUEST', message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentification requise.') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Action non autorisée pour ce rôle.') {
    super(403, 'FORBIDDEN', message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Ressource introuvable.') {
    super(404, 'NOT_FOUND', message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(409, 'CONFLICT', message, details);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(422, 'VALIDATION_ERROR', message, details);
  }
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      });
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Données invalides.',
          details: error.flatten(),
        },
      });
    }

    const fastifyErr = error as { statusCode?: number; code?: string; message?: string };
    if (fastifyErr.statusCode && fastifyErr.statusCode < 500) {
      return reply.status(fastifyErr.statusCode).send({
        error: {
          code: fastifyErr.code ?? 'REQUEST_ERROR',
          message: fastifyErr.message ?? 'Requête invalide.',
        },
      });
    }

    app.log.error(error);
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Une erreur interne est survenue.',
      },
    });
  });
}
