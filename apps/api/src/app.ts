import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { gradingCalculator, type GradingCalculatorContract } from '@lycee/shared';
import { sql } from 'drizzle-orm';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from './config/env.js';
import type { DbClient } from './db/client.js';
import { registerErrorHandler } from './lib/errors.js';
import { authPlugin } from './plugins/auth.js';
import { registerAcademicRoutes } from './routes/academic.routes.js';
import { registerAuthRoutes } from './routes/auth.routes.js';
import { registerGradesRoutes } from './routes/grades.routes.js';
import { registerReportsRoutes } from './routes/reports.routes.js';
import { registerSchoolRoutes } from './routes/school.routes.js';
import { registerStudentsRoutes } from './routes/students.routes.js';
import { registerSubjectsRoutes } from './routes/subjects.routes.js';
import { registerSyncRoutes } from './routes/sync.routes.js';
import { registerUsersRoutes } from './routes/users.routes.js';
import { registerValidationRoutes } from './routes/validation.routes.js';
import { type PdfRenderer, TypstPdfRenderer } from './services/pdf.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface BuildAppOptions {
  db: DbClient;
  config: AppConfig;
  pdfRenderer?: PdfRenderer;
  calculator?: GradingCalculatorContract;
  enableRateLimit?: boolean;
  logger?: boolean;
  webDistDir?: string;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const {
    db,
    config,
    pdfRenderer = new TypstPdfRenderer(config.TYPST_BIN),
    calculator = gradingCalculator,
    enableRateLimit = config.NODE_ENV !== 'test',
    logger = config.NODE_ENV === 'development',
    webDistDir = path.resolve(__dirname, '../../../web/dist'),
  } = options;

  const app = Fastify({
    logger,
    bodyLimit: 2 * 1024 * 1024,
  });

  registerErrorHandler(app);

  await app.register(helmet, {
    contentSecurityPolicy: false,
  });

  await app.register(cors, {
    origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(',').map((s) => s.trim()),
    credentials: true,
  });

  if (enableRateLimit) {
    await app.register(rateLimit, {
      max: 200,
      timeWindow: '1 minute',
    });
  }

  await app.register(authPlugin, {
    jwtAccessSecret: config.JWT_ACCESS_SECRET,
    jwtAccessTtl: config.JWT_ACCESS_TTL,
    db,
  });

  app.get('/health', async () => {
    await db.execute(sql`SELECT 1`);
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  });

  await registerAuthRoutes(app, { db, config });
  await registerUsersRoutes(app, { db });
  await registerSchoolRoutes(app, { db });
  await registerAcademicRoutes(app, { db });
  await registerStudentsRoutes(app, { db });
  await registerSubjectsRoutes(app, { db });
  await registerGradesRoutes(app, { db });
  await registerSyncRoutes(app, { db });
  await registerValidationRoutes(app, { db, calculator });
  await registerReportsRoutes(app, { db, pdfRenderer, calculator });

  if (existsSync(webDistDir)) {
    await app.register(fastifyStatic, {
      root: webDistDir,
      prefix: '/',
      wildcard: false,
    });

    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith('/api/') || request.url === '/health') {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'Route API introuvable.',
          },
        });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}
