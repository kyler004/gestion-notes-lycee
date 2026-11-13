import { isIP } from 'node:net';
import { z } from 'zod';

const KNOWN_WEAK_JWT_SECRETS = new Set([
  'dev-access-secret-change-in-production-32chars',
  'dev-refresh-secret-change-in-production-32chars',
  'change-me-access-secret-min-32-chars-dev-only',
  'change-me-refresh-secret-min-32-chars-dev-only',
  'test-access-secret-must-be-at-least-32-chars',
  'test-refresh-secret-must-be-at-least-32-chars',
]);

const KNOWN_DEFAULT_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/gestion_notes';
const KNOWN_DEFAULT_ADMIN_PASSWORD = 'AdminLycee2026!';
const NAMED_PROXY_RANGES = new Set(['loopback', 'linklocal', 'uniquelocal']);

function isValidCidrOrIp(token: string): boolean {
  if (NAMED_PROXY_RANGES.has(token)) {
    return true;
  }
  const slashIdx = token.indexOf('/');
  if (slashIdx === -1) {
    return isIP(token) !== 0;
  }
  const ipPart = token.slice(0, slashIdx);
  const maskPart = token.slice(slashIdx + 1);
  if (!/^\d+$/.test(maskPart)) {
    return false;
  }
  const mask = Number(maskPart);
  const ipVersion = isIP(ipPart);
  if (ipVersion === 4) {
    return mask >= 0 && mask <= 32;
  }
  if (ipVersion === 6) {
    return mask >= 0 && mask <= 128;
  }
  return false;
}

export type FastifyTrustProxyValue = false | string[] | ((address: string, hop: number) => boolean);

export function parseTrustProxy(raw: string): FastifyTrustProxyValue {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toLowerCase() === 'false') {
    return false;
  }
  if (trimmed.toLowerCase() === 'true') {
    throw new Error(
      "TRUST_PROXY='true' est interdit (risque d'usurpation X-Forwarded-For). Utilisez un nombre de sauts (ex. '1') ou une liste IP/CIDR.",
    );
  }
  if (/^\d+$/.test(trimmed)) {
    const hops = Number(trimmed);
    if (!Number.isInteger(hops) || hops < 0 || hops > 10) {
      throw new Error('TRUST_PROXY numérique doit être compris entre 0 et 10.');
    }
    if (hops === 0) {
      return false;
    }
    return (_address: string, hop: number) => hop < hops;
  }

  const tokens = trimmed
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokens.length === 0 || !tokens.every(isValidCidrOrIp)) {
    throw new Error('TRUST_PROXY invalide : attendus false, entier 0..10, ou IP/CIDR séparés par des virgules.');
  }
  return tokens;
}

export function parseCorsOrigins(raw: string): false | '*' | string[] {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toLowerCase() === 'none' || trimmed.toLowerCase() === 'false') {
    return false;
  }
  if (trimmed === '*') {
    return '*';
  }
  const tokens = trimmed
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (tokens.length === 0) {
    return false;
  }
  const validated: string[] = [];
  for (const token of tokens) {
    let parsed: URL;
    try {
      parsed = new URL(token);
    } catch {
      throw new Error(`Origine CORS invalide : "${token}"`);
    }
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.origin !== token) {
      throw new Error(`Origine CORS invalide (schéma http/https sans chemin attendu) : "${token}"`);
    }
    validated.push(parsed.origin);
  }
  return validated;
}

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    HOST: z.string().default('0.0.0.0'),
    DATABASE_URL: z.string().min(1).default(KNOWN_DEFAULT_DATABASE_URL),
    JWT_ACCESS_SECRET: z.string().min(16).default('dev-access-secret-change-in-production-32chars'),
    JWT_REFRESH_SECRET: z.string().min(16).default('dev-refresh-secret-change-in-production-32chars'),
    JWT_ACCESS_TTL: z
      .string()
      .regex(/^([1-9]|[1-5]\d|60)m$/, 'JWT_ACCESS_TTL doit être compris entre 1m et 60m (ex. 15m).')
      .default('15m'),
    JWT_REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    JWT_REFRESH_MAX_SESSION_DAYS: z.coerce.number().int().min(1).max(365).default(90),
    TYPST_BIN: z.string().default('typst'),
    TRUST_PROXY: z.string().default('false'),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
    AUTO_SEED: z
      .enum(['true', 'false'])
      .optional()
      .default('false')
      .transform((v) => v === 'true'),
    ADMIN_INITIAL_USERNAME: z.string().default('admin'),
    ADMIN_INITIAL_PASSWORD: z.string().default(KNOWN_DEFAULT_ADMIN_PASSWORD),
    ADMIN_INITIAL_FULLNAME: z.string().default('Administrateur Principal'),
  })
  .superRefine((val, ctx) => {
    try {
      parseTrustProxy(val.TRUST_PROXY);
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['TRUST_PROXY'],
        message: err instanceof Error ? err.message : 'TRUST_PROXY invalide.',
      });
    }

    let corsParsed: false | '*' | string[] = false;
    try {
      corsParsed = parseCorsOrigins(val.CORS_ORIGIN);
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CORS_ORIGIN'],
        message: err instanceof Error ? err.message : 'CORS_ORIGIN invalide.',
      });
    }

    if (val.NODE_ENV === 'production') {
      if (
        val.JWT_ACCESS_SECRET.length < 32 ||
        KNOWN_WEAK_JWT_SECRETS.has(val.JWT_ACCESS_SECRET) ||
        val.JWT_ACCESS_SECRET.includes('change-me') ||
        val.JWT_ACCESS_SECRET.includes('dev-access-secret') ||
        new Set(val.JWT_ACCESS_SECRET).size < 10
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_ACCESS_SECRET'],
          message:
            'En production, JWT_ACCESS_SECRET doit faire au moins 32 caractères haute entropie et différer des secrets par défaut.',
        });
      }

      if (
        KNOWN_WEAK_JWT_SECRETS.has(val.JWT_REFRESH_SECRET) ||
        val.JWT_REFRESH_SECRET.includes('change-me') ||
        val.JWT_REFRESH_SECRET.includes('dev-refresh-secret')
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_REFRESH_SECRET'],
          message: 'En production, JWT_REFRESH_SECRET ne doit pas conserver une valeur par défaut.',
        });
      }

      if (val.DATABASE_URL === KNOWN_DEFAULT_DATABASE_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DATABASE_URL'],
          message: 'En production, DATABASE_URL ne peut pas utiliser la chaîne par défaut.',
        });
      }

      if (
        val.ADMIN_INITIAL_PASSWORD === KNOWN_DEFAULT_ADMIN_PASSWORD ||
        val.ADMIN_INITIAL_PASSWORD.length < 12
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ADMIN_INITIAL_PASSWORD'],
          message:
            'En production, ADMIN_INITIAL_PASSWORD doit faire au moins 12 caractères et différer du mot de passe par défaut.',
        });
      }

      if (corsParsed === '*') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CORS_ORIGIN'],
          message: "En production, CORS_ORIGIN='*' est interdit. Spécifiez des origines explicites ou 'none'.",
        });
      }
    }
  });

export type AppConfig = z.infer<typeof EnvSchema>;

export function parseEnv(source: Record<string, string | undefined> = process.env): AppConfig {
  return EnvSchema.parse(source);
}
