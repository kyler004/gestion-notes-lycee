import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1).default('postgres://postgres:postgres@localhost:5432/gestion_notes'),
  JWT_ACCESS_SECRET: z.string().min(16).default('dev-access-secret-change-in-production-32chars'),
  JWT_REFRESH_SECRET: z.string().min(16).default('dev-refresh-secret-change-in-production-32chars'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  TYPST_BIN: z.string().default('typst'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  ADMIN_INITIAL_USERNAME: z.string().default('admin'),
  ADMIN_INITIAL_PASSWORD: z.string().default('AdminLycee2026!'),
  ADMIN_INITIAL_FULLNAME: z.string().default('Administrateur Principal'),
});

export type AppConfig = z.infer<typeof EnvSchema>;

export function parseEnv(source: Record<string, string | undefined> = process.env): AppConfig {
  return EnvSchema.parse(source);
}
