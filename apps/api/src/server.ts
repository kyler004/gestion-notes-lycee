import 'dotenv/config';
import { buildApp } from './app.js';
import { parseEnv } from './config/env.js';
import { createPgDb } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { seedIfEmpty } from './db/seed.js';

async function start(): Promise<void> {
  const config = parseEnv(process.env);

  if (process.env.AUTO_MIGRATE !== 'false') {
    await runMigrations(config.DATABASE_URL);
  }

  const pgConnection = createPgDb(config.DATABASE_URL);
  if (config.AUTO_SEED) {
    await seedIfEmpty(pgConnection.db, config);
  }

  const app = await buildApp({
    db: pgConnection.db,
    config,
    logger: config.NODE_ENV !== 'test',
  });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`Signal ${signal} reçu, arrêt gracieux...`);
    try {
      await app.close();
      await pgConnection.close();
      process.exit(0);
    } catch (error) {
      app.log.error(error, 'Erreur lors de la fermeture du serveur');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({
    host: config.HOST,
    port: config.PORT,
  });
}

start().catch((error) => {
  console.error('Impossible de démarrer le serveur :', error);
  process.exit(1);
});
