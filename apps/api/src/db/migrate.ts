import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const MIGRATIONS_DIR = path.resolve(__dirname, '../../drizzle');

export async function runMigrations(connectionString: string): Promise<void> {
  const pool = new Pool({ connectionString });
  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  } finally {
    await pool.end();
  }
}

const isDirectExecution =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectExecution) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL est requis pour exécuter les migrations.');
    process.exit(1);
  }
  runMigrations(url)
    .then(() => {
      console.log('Migrations PostgreSQL appliquées avec succès.');
    })
    .catch((err) => {
      console.error('Échec des migrations :', err);
      process.exit(1);
    });
}
