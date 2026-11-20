import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../../api/src/app.js';
import { parseEnv } from '../../api/src/config/env.js';
import { seedIfEmpty } from '../../api/src/db/seed.js';
import { createTestDb } from '../../api/src/db/test-helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDistDir = path.resolve(__dirname, '../dist');

async function start(): Promise<void> {
  const config = parseEnv({
    NODE_ENV: 'test',
    PORT: '4174',
    HOST: '127.0.0.1',
    DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/e2e_test',
    JWT_ACCESS_SECRET: 'e2e-access-secret-key-min-32-chars-2026!',
    JWT_REFRESH_SECRET: 'e2e-refresh-secret-key-min-32-chars-2026!',
    CORS_ORIGIN: 'http://127.0.0.1:4174',
    TRUST_PROXY: 'false',
    AUTO_SEED: 'false',
    ADMIN_INITIAL_USERNAME: 'admin',
    ADMIN_INITIAL_PASSWORD: 'AdminLycee2026!',
    ADMIN_INITIAL_FULLNAME: 'Administrateur Principal',
  });

  const handle = await createTestDb();
  await seedIfEmpty(handle.db, config);

  const app = await buildApp({
    db: handle.db,
    config,
    enableRateLimit: false,
    logger: false,
    webDistDir,
  });

  await app.listen({ port: 4174, host: '127.0.0.1' });

  const shutdown = async () => {
    await app.close();
    await handle.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

start().catch((err) => {
  console.error('Failed to start E2E test server:', err);
  process.exit(1);
});
