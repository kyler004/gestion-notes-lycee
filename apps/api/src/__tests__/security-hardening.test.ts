import { createHmac, randomBytes, randomUUID, scrypt as scryptCb } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  CAMEROON_DEFAULT_GRADING_RULES,
  gradingCalculator,
} from '@lycee/shared';
import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { parseCorsOrigins, parseEnv, parseTrustProxy, type AppConfig } from '../config/env.js';
import { type DbClient, nextSyncVersion } from '../db/client.js';
import {
  academicYears,
  classes,
  classSubjects,
  councilDecisionAuditLogs,
  enrollments,
  gradeAuditLogs,
  grades,
  gradingRules,
  periods,
  refreshTokens,
  students,
  subjects,
  teacherAssignments,
  users,
} from '../db/schema.js';
import { createTestDb, type TestDbHandle } from '../db/test-helpers.js';
import { hashPassword, hashToken, verifyPassword } from '../lib/crypto.js';
import { JWT_AUDIENCE, JWT_ISSUER } from '../plugins/auth.js';
import { type PdfRenderer, TypstPdfRenderer } from '../services/pdf.service.js';
import { createResultsService } from '../services/results.service.js';
import { createUsersService } from '../services/users.service.js';

const TEST_JWT_SECRET = 'SuperSecureTestJwtSecretKey!2026#987654';
const SAMPLE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const SAMPLE_JPEG_BASE64 = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]).toString('base64');

function createTestConfig(overrides: Record<string, string | undefined> = {}): AppConfig {
  return parseEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://lycee:TestPassword99!@db.internal:5432/lycee_test',
    JWT_ACCESS_SECRET: TEST_JWT_SECRET,
    JWT_REFRESH_SECRET: 'AnotherStrongTestRefreshSecret!2026#5432',
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL_DAYS: '30',
    JWT_REFRESH_MAX_SESSION_DAYS: '90',
    TRUST_PROXY: 'false',
    CORS_ORIGIN: 'https://app.lycee.cm',
    AUTO_SEED: 'false',
    ADMIN_INITIAL_PASSWORD: 'StrongInitialPassword2026!',
    ...overrides,
  });
}

function signCustomJwt(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  secret: string | null,
): string {
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const body = `${encodedHeader}.${encodedPayload}`;
  if (secret === null) {
    return `${body}.`;
  }
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function legacyScryptAsync(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

function createStubPdfRenderer(): PdfRenderer {
  return {
    renderBulletin: async () => Buffer.from('%PDF-1.4\n%stub-bulletin\n', 'utf8'),
    renderClassList: async () => Buffer.from('%PDF-1.4\n%stub-class-list\n', 'utf8'),
    renderHonorRoll: async () => Buffer.from('%PDF-1.4\n%stub-honor-roll\n', 'utf8'),
  };
}

describe('Security Hardening Verification (Critical, High & Medium Remediations)', () => {
  describe('1. Config, Fail-Fast Production Checks, CORS, Helmet, TrustProxy & Rate Limits', () => {
    it('SEC-CRIT-01 / SEC-HIGH-03 / SEC-HIGH-04: rejects weak production secrets, defaults, bad TTL, TRUST_PROXY=true, CORS=*', () => {
      const strongProdEnv = {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://prod_user:ProdStrongPass!2026@pg.internal:5432/lycee_prod',
        JWT_ACCESS_SECRET: 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8!',
        JWT_REFRESH_SECRET: 'Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4J3i2!',
        ADMIN_INITIAL_PASSWORD: 'ProdAdminPassword!2026',
        CORS_ORIGIN: 'https://notes.lycee.cm, https://admin.lycee.cm',
        TRUST_PROXY: '1',
      };

      const parsedProd = parseEnv(strongProdEnv);
      expect(parsedProd.AUTO_SEED).toBe(false);

      // Reject known weak/default JWT_ACCESS_SECRET and low entropy
      expect(() =>
        parseEnv({ ...strongProdEnv, JWT_ACCESS_SECRET: 'dev-access-secret-change-in-production-32chars' }),
      ).toThrow();
      expect(() =>
        parseEnv({ ...strongProdEnv, JWT_ACCESS_SECRET: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }),
      ).toThrow();

      // Reject default refresh secret, default DATABASE_URL, default/short admin password, wildcard CORS in prod
      expect(() =>
        parseEnv({ ...strongProdEnv, JWT_REFRESH_SECRET: 'change-me-refresh-secret-min-32-chars-dev-only' }),
      ).toThrow();
      expect(() =>
        parseEnv({ ...strongProdEnv, DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/gestion_notes' }),
      ).toThrow();
      expect(() =>
        parseEnv({ ...strongProdEnv, ADMIN_INITIAL_PASSWORD: 'AdminLycee2026!' }),
      ).toThrow();
      expect(() =>
        parseEnv({ ...strongProdEnv, ADMIN_INITIAL_PASSWORD: 'Short123!' }),
      ).toThrow();
      expect(() => parseEnv({ ...strongProdEnv, CORS_ORIGIN: '*' })).toThrow();

      // Reject invalid JWT_ACCESS_TTL bounds
      expect(() => parseEnv({ ...strongProdEnv, JWT_ACCESS_TTL: '0m' })).toThrow();
      expect(() => parseEnv({ ...strongProdEnv, JWT_ACCESS_TTL: '61m' })).toThrow();
      expect(() => parseEnv({ ...strongProdEnv, JWT_ACCESS_TTL: '1d' })).toThrow();

      // TRUST_PROXY validation
      expect(() => parseTrustProxy('true')).toThrow();
      expect(() => parseTrustProxy('-1')).toThrow();
      expect(() => parseTrustProxy('11')).toThrow();
      expect(() => parseTrustProxy('invalid-token')).toThrow();
      expect(parseTrustProxy('false')).toBe(false);
      expect(parseTrustProxy('0')).toBe(false);
      const hopFn = parseTrustProxy('1');
      expect(typeof hopFn).toBe('function');
      if (typeof hopFn === 'function') {
        expect(hopFn('127.0.0.1', 0)).toBe(true);
        expect(hopFn('10.0.0.1', 1)).toBe(false);
      }
      expect(parseTrustProxy('127.0.0.1, loopback')).toEqual(['127.0.0.1', 'loopback']);

      // CORS origin validation
      expect(parseCorsOrigins('none')).toBe(false);
      expect(parseCorsOrigins('https://a.cm, https://b.cm')).toEqual(['https://a.cm', 'https://b.cm']);
      expect(() => parseCorsOrigins('https://a.cm/path')).toThrow();
      expect(() => parseCorsOrigins('ftp://a.cm')).toThrow();
    });

    it('SEC-HIGH-03 / SEC-HIGH-04 / SEC-MED-05 / SEC-MED-06: enforces Helmet CSP, strict CORS, anti-spoof TRUST_PROXY, and auth/PDF rate limits', async () => {
      const dbHandle = await createTestDb();
      const config = createTestConfig({
        TRUST_PROXY: '1',
        CORS_ORIGIN: 'https://app.lycee.cm',
      });
      const app = await buildApp({
        db: dbHandle.db,
        config,
        pdfRenderer: createStubPdfRenderer(),
        enableRateLimit: true,
        logger: false,
      });

      try {
        // Seed one teacher & one class to exercise authenticated endpoints + PDF rate limit
        const pwHash = await hashPassword('TeacherPass2026!');
        const [teacher] = await dbHandle.db
          .insert(users)
          .values({
            username: 'prof.ratelimit',
            fullName: 'Prof Rate Limit',
            role: 'teacher',
            passwordHash: pwHash,
          })
          .returning();
        const [year] = await dbHandle.db
          .insert(academicYears)
          .values({
            label: '2026-2027',
            startDate: '2026-09-01',
            endDate: '2027-06-30',
            isActive: true,
            syncVersion: await nextSyncVersion(dbHandle.db),
          })
          .returning();
        const [cls] = await dbHandle.db
          .insert(classes)
          .values({
            academicYearId: year!.id,
            name: '6ème RL',
            level: '6ème',
            mainTeacherId: teacher!.id,
            syncVersion: await nextSyncVersion(dbHandle.db),
          })
          .returning();

        const token = app.jwt.sign({ sub: teacher!.id, ver: teacher!.tokenVersion });

        // Helmet CSP headers on /health
        const healthRes = await app.inject({ method: 'GET', url: '/health' });
        expect(healthRes.statusCode).toBe(200);
        const csp = String(healthRes.headers['content-security-policy'] ?? '');
        expect(csp).toContain("default-src 'self'");
        expect(csp).toContain("object-src 'none'");
        expect(csp).toContain("frame-ancestors 'self'");
        expect(healthRes.headers['x-content-type-options']).toBe('nosniff');

        // Allowed CORS origin (credentials: false) vs untrusted origin
        const allowedCorsRes = await app.inject({
          method: 'GET',
          url: '/health',
          headers: { origin: 'https://app.lycee.cm' },
        });
        expect(allowedCorsRes.headers['access-control-allow-origin']).toBe('https://app.lycee.cm');
        expect(allowedCorsRes.headers['access-control-allow-credentials']).toBeUndefined();

        const deniedCorsRes = await app.inject({
          method: 'GET',
          url: '/health',
          headers: { origin: 'https://evil.example.org' },
        });
        expect(deniedCorsRes.headers['access-control-allow-origin']).toBeUndefined();

        // Spoofed leftmost X-Forwarded-For cannot bypass TRUST_PROXY='1' IP+username login limit (10 / 15m)
        for (let i = 0; i < 10; i++) {
          const attempt = await app.inject({
            method: 'POST',
            url: '/api/auth/login',
            remoteAddress: '127.0.0.1',
            headers: { 'x-forwarded-for': `203.0.113.${i + 1}, 198.51.100.42` },
            payload: { username: 'brute.target', password: 'x' }, // invalid password length -> fast 400 after rate-limit hook
          });
          expect(attempt.statusCode).toBe(400);
        }

        const blockedByUserIp = await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          remoteAddress: '127.0.0.1',
          headers: { 'x-forwarded-for': '203.0.113.250, 198.51.100.42' },
          payload: { username: 'brute.target', password: 'x' },
        });
        expect(blockedByUserIp.statusCode).toBe(429);

        // IP-level login rate limit (30 / min) across distinct usernames
        for (let i = 0; i < 30; i++) {
          const res = await app.inject({
            method: 'POST',
            url: '/api/auth/login',
            remoteAddress: '127.0.0.1',
            headers: { 'x-forwarded-for': '198.51.100.77' },
            payload: { username: `spray.user.${i}`, password: 'x' },
          });
          expect(res.statusCode).toBe(400);
        }
        const blockedByIp = await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          remoteAddress: '127.0.0.1',
          headers: { 'x-forwarded-for': '198.51.100.77' },
          payload: { username: 'spray.user.31', password: 'x' },
        });
        expect(blockedByIp.statusCode).toBe(429);
        expect(blockedByIp.json().error.code).toBe('RATE_LIMIT_EXCEEDED');

        // /api/auth/change-password rate limit (5 / 15m per user)
        for (let i = 0; i < 5; i++) {
          const cpRes = await app.inject({
            method: 'POST',
            url: '/api/auth/change-password',
            headers: { authorization: `Bearer ${token}` },
            payload: { currentPassword: 'x', newPassword: 'short' },
          });
          expect(cpRes.statusCode).toBe(400);
        }
        const cpBlocked = await app.inject({
          method: 'POST',
          url: '/api/auth/change-password',
          headers: { authorization: `Bearer ${token}` },
          payload: { currentPassword: 'x', newPassword: 'short' },
        });
        expect(cpBlocked.statusCode).toBe(429);

        // PDF route rate limit (15 / min per user)
        for (let i = 0; i < 15; i++) {
          const pdfRes = await app.inject({
            method: 'GET',
            url: `/api/reports/class-list/${cls!.id}/pdf`,
            headers: { authorization: `Bearer ${token}` },
          });
          expect(pdfRes.statusCode).toBe(200);
        }
        const pdfBlocked = await app.inject({
          method: 'GET',
          url: `/api/reports/class-list/${cls!.id}/pdf`,
          headers: { authorization: `Bearer ${token}` },
        });
        expect(pdfBlocked.statusCode).toBe(429);
      } finally {
        await app.close();
        await dbHandle.close();
      }
    });
  });

  describe('2. Auth, Session Lifecycle, JWT Hardening, Scrypt & RBAC Escalation', () => {
    let dbHandle: TestDbHandle;
    let app: FastifyInstance;
    let adminId: string;
    let censorId: string;
    let principalId: string;
    let teacherId: string;
    let inactiveId: string;
    let legacyUserId: string;
    let adminToken: string;
    let censorToken: string;
    let teacherToken: string;

    const commonPassword = 'ValidUserPass2026!';

    beforeAll(async () => {
      dbHandle = await createTestDb();
      app = await buildApp({
        db: dbHandle.db,
        config: createTestConfig(),
        pdfRenderer: createStubPdfRenderer(),
        enableRateLimit: false,
      });

      const pwHash = await hashPassword(commonPassword);
      expect(pwHash.startsWith('$scrypt$N=32768,r=8,p=1$')).toBe(true);

      const legacySalt = randomBytes(16).toString('hex');
      const legacyDerived = await legacyScryptAsync(commonPassword, legacySalt);
      const legacyHash = `scrypt:${legacySalt}:${legacyDerived.toString('hex')}`;

      const inserted = await dbHandle.db
        .insert(users)
        .values([
          { username: 'sec.admin', fullName: 'Admin Sec', role: 'admin', passwordHash: pwHash },
          { username: 'sec.censor', fullName: 'Censor Sec', role: 'censor', passwordHash: pwHash },
          { username: 'sec.principal', fullName: 'Principal Sec', role: 'principal', passwordHash: pwHash },
          { username: 'sec.teacher', fullName: 'Teacher Sec', role: 'teacher', passwordHash: pwHash },
          {
            username: 'sec.inactive',
            fullName: 'Inactive Sec',
            role: 'teacher',
            passwordHash: pwHash,
            isActive: false,
          },
          { username: 'sec.legacy', fullName: 'Legacy User', role: 'teacher', passwordHash: legacyHash },
        ])
        .returning();

      const byName = new Map(inserted.map((u) => [u.username, u]));
      adminId = byName.get('sec.admin')!.id;
      censorId = byName.get('sec.censor')!.id;
      principalId = byName.get('sec.principal')!.id;
      teacherId = byName.get('sec.teacher')!.id;
      inactiveId = byName.get('sec.inactive')!.id;
      legacyUserId = byName.get('sec.legacy')!.id;

      adminToken = app.jwt.sign({ sub: adminId, ver: 1 });
      censorToken = app.jwt.sign({ sub: censorId, ver: 1 });
      teacherToken = app.jwt.sign({ sub: teacherId, ver: 1 });
    });

    afterAll(async () => {
      await app.close();
      await dbHandle.close();
    });

    it('SEC-HIGH-05 / SEC-MED-02 / SEC-MED-03 / SEC-MED-04 / SEC-MED-07 / SEC-MED-08: enforces tokenVersion, JWT claims, family logout, sessionExpiresAt, deviceLabel, and scrypt', async () => {
      // Login as teacher
      const login1 = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'sec.teacher', password: commonPassword, deviceLabel: 'Chrome Linux' },
      });
      expect(login1.statusCode).toBe(200);
      const { accessToken: at1, refreshToken: rt1 } = login1.json() as {
        accessToken: string;
        refreshToken: string;
      };

      expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: `Bearer ${at1}` } })).statusCode).toBe(200);

      // Malformed/forged JWT claims -> 401 (never 500)
      const nowSec = Math.floor(Date.now() / 1000);
      const wrongIss = signCustomJwt(
        { alg: 'HS256', typ: 'JWT' },
        { sub: teacherId, ver: 1, iss: 'evil-iss', aud: JWT_AUDIENCE, iat: nowSec, exp: nowSec + 300 },
        TEST_JWT_SECRET,
      );
      const wrongAud = signCustomJwt(
        { alg: 'HS256', typ: 'JWT' },
        { sub: teacherId, ver: 1, iss: JWT_ISSUER, aud: 'wrong-aud', iat: nowSec, exp: nowSec + 300 },
        TEST_JWT_SECRET,
      );
      const missingVer = signCustomJwt(
        { alg: 'HS256', typ: 'JWT' },
        { sub: teacherId, iss: JWT_ISSUER, aud: JWT_AUDIENCE, iat: nowSec, exp: nowSec + 300 },
        TEST_JWT_SECRET,
      );
      const nonUuidSub = signCustomJwt(
        { alg: 'HS256', typ: 'JWT' },
        { sub: 'not-a-uuid', ver: 1, iss: JWT_ISSUER, aud: JWT_AUDIENCE, iat: nowSec, exp: nowSec + 300 },
        TEST_JWT_SECRET,
      );
      const noneAlg = signCustomJwt(
        { alg: 'none', typ: 'JWT' },
        { sub: teacherId, ver: 1, iss: JWT_ISSUER, aud: JWT_AUDIENCE, iat: nowSec, exp: nowSec + 300 },
        null,
      );

      for (const badToken of [wrongIss, wrongAud, missingVer, nonUuidSub, noneAlg]) {
        const res = await app.inject({
          method: 'GET',
          url: '/api/auth/me',
          headers: { authorization: `Bearer ${badToken}` },
        });
        expect(res.statusCode).toBe(401);
      }

      // Invalid deviceLabel & inactive login (SEC-MED-08 / SEC-MED-07)
      const ctrlDevice = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'sec.teacher', password: commonPassword, deviceLabel: 'iPhone\nEvil' },
      });
      expect(ctrlDevice.statusCode).toBe(400);

      const emptyDevice = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'sec.teacher', password: commonPassword, deviceLabel: '' },
      });
      expect(emptyDevice.statusCode).toBe(400);

      const inactiveLogin = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'sec.inactive', password: commonPassword },
      });
      expect(inactiveLogin.statusCode).toBe(401);
      expect(inactiveLogin.json().error.message).toBe('Identifiants invalides.');

      const inactiveUserToken = app.jwt.sign({ sub: inactiveId, ver: 1 });
      const inactiveMe = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { authorization: `Bearer ${inactiveUserToken}` },
      });
      expect(inactiveMe.statusCode).toBe(401);

      // Logout revokes full family even when rotated older sibling token is passed (SEC-MED-03)
      const rotated = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: rt1 },
      });
      expect(rotated.statusCode).toBe(200);
      const { refreshToken: rt2 } = rotated.json() as { refreshToken: string };

      const logoutOlder = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        payload: { refreshToken: rt1 },
      });
      expect(logoutOlder.statusCode).toBe(200);

      const refreshAfterFamilyLogout = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: rt2 },
      });
      expect(refreshAfterFamilyLogout.statusCode).toBe(401);

      // sessionExpiresAt hard cap enforcement (SEC-MED-04)
      const login2 = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'sec.teacher', password: commonPassword },
      });
      expect(login2.statusCode).toBe(200);
      const rtActive = (login2.json() as { refreshToken: string }).refreshToken;
      await dbHandle.db
        .update(refreshTokens)
        .set({
          sessionExpiresAt: new Date(Date.now() - 10_000),
          expiresAt: new Date(Date.now() + 86_400_000),
        })
        .where(eq(refreshTokens.tokenHash, hashToken(rtActive)));

      const cappedRefresh = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: rtActive },
      });
      expect(cappedRefresh.statusCode).toBe(401);

      // tokenVersion invalidates existing access tokens on changePassword, logout-all, resetPassword, role change, deactivation (SEC-HIGH-05)
      const updatedPass = 'NewTeacherPass2026!';
      const chPassRes = await app.inject({
        method: 'POST',
        url: '/api/auth/change-password',
        headers: { authorization: `Bearer ${at1}` },
        payload: { currentPassword: commonPassword, newPassword: updatedPass },
      });
      expect(chPassRes.statusCode).toBe(200);
      expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: `Bearer ${at1}` } })).statusCode).toBe(401);
      expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: `Bearer ${teacherToken}` } })).statusCode).toBe(401);

      // Relogin gets new tokenVersion; then /logout-all invalidates it
      const loginAfterChange = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'sec.teacher', password: updatedPass },
      });
      expect(loginAfterChange.statusCode).toBe(200);
      const at3 = (loginAfterChange.json() as { accessToken: string }).accessToken;

      const logoutAllRes = await app.inject({
        method: 'POST',
        url: '/api/auth/logout-all',
        headers: { authorization: `Bearer ${at3}` },
      });
      expect(logoutAllRes.statusCode).toBe(200);
      expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: `Bearer ${at3}` } })).statusCode).toBe(401);

      // Admin reset-password bumps tokenVersion
      const login4 = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'sec.teacher', password: updatedPass },
      });
      const at4 = (login4.json() as { accessToken: string }).accessToken;
      const resetRes = await app.inject({
        method: 'POST',
        url: `/api/users/${teacherId}/reset-password`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { newPassword: commonPassword },
      });
      expect(resetRes.statusCode).toBe(200);
      expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: `Bearer ${at4}` } })).statusCode).toBe(401);

      // Role change bumps tokenVersion
      const login5 = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'sec.teacher', password: commonPassword },
      });
      const at5 = (login5.json() as { accessToken: string }).accessToken;
      const roleChangeRes = await app.inject({
        method: 'PATCH',
        url: `/api/users/${teacherId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { role: 'secretary' },
      });
      expect(roleChangeRes.statusCode).toBe(200);
      expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: `Bearer ${at5}` } })).statusCode).toBe(401);

      // Restore teacher role for downstream clarity
      await app.inject({
        method: 'PATCH',
        url: `/api/users/${teacherId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { role: 'teacher' },
      });

      // Scrypt bounds check & transparent legacy hash upgrade (SEC-MED-07)
      expect(await verifyPassword(commonPassword, '$scrypt$N=1048576,r=8,p=1$00112233445566778899aabbccddeeff$' + '00'.repeat(64))).toBe(false);

      const legacyLogin = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'sec.legacy', password: commonPassword },
      });
      expect(legacyLogin.statusCode).toBe(200);
      const [rehashedRow] = await dbHandle.db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, legacyUserId))
        .limit(1);
      expect(rehashedRow?.passwordHash.startsWith('$scrypt$N=32768,r=8,p=1$')).toBe(true);
      expect(await verifyPassword(commonPassword, rehashedRow!.passwordHash)).toBe(true);
    });

    it('SEC-MED-01: blocks censor privilege escalation, self role/isActive tampering, and last active admin deactivation', async () => {
      // Censor cannot create principal, censor, or admin
      for (const forbiddenRole of ['principal', 'censor', 'admin'] as const) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/users',
          headers: { authorization: `Bearer ${censorToken}` },
          payload: {
            username: `esc.${forbiddenRole}`,
            fullName: `Escalation ${forbiddenRole}`,
            role: forbiddenRole,
            password: 'StrongPassword2026!',
          },
        });
        expect(res.statusCode).toBe(403);
      }

      // Censor cannot edit principal, another censor, or admin
      for (const targetId of [adminId, principalId, censorId]) {
        const res = await app.inject({
          method: 'PATCH',
          url: `/api/users/${targetId}`,
          headers: { authorization: `Bearer ${censorToken}` },
          payload: { fullName: 'Tampered Name' },
        });
        expect(res.statusCode).toBe(403);
      }

      // Censor cannot promote a teacher to principal or censor
      const promoteRes = await app.inject({
        method: 'PATCH',
        url: `/api/users/${teacherId}`,
        headers: { authorization: `Bearer ${censorToken}` },
        payload: { role: 'censor' },
      });
      expect(promoteRes.statusCode).toBe(403);

      // Self role/isActive tampering blocked (403)
      const selfDeactivate = await app.inject({
        method: 'PATCH',
        url: `/api/users/${adminId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { isActive: false },
      });
      expect(selfDeactivate.statusCode).toBe(403);

      const selfRole = await app.inject({
        method: 'PATCH',
        url: `/api/users/${adminId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { role: 'teacher' },
      });
      expect(selfRole.statusCode).toBe(403);

      // Last active admin protection at service/transaction layer (409)
      const usersService = createUsersService(dbHandle.db);
      await expect(
        usersService.updateUser(
          adminId,
          { isActive: false },
          {
            id: randomUUID(),
            username: 'delegated.admin',
            fullName: 'Delegated Admin',
            role: 'admin',
            isActive: true,
          },
        ),
      ).rejects.toMatchObject({ statusCode: 409 });

      await expect(
        usersService.updateUser(
          adminId,
          { role: 'censor' },
          {
            id: randomUUID(),
            username: 'delegated.admin',
            fullName: 'Delegated Admin',
            role: 'admin',
            isActive: true,
          },
        ),
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('3. School Logo Magic-Byte Validation & Response Headers (SEC-HIGH-09)', () => {
    it('rejects SVG/HTML polyglots, MIME mismatches, and non-canonical base64 while serving valid PNG/JPEG with sandbox CSP', async () => {
      const dbHandle = await createTestDb();
      const app = await buildApp({
        db: dbHandle.db,
        config: createTestConfig(),
        pdfRenderer: createStubPdfRenderer(),
        enableRateLimit: false,
      });

      try {
        const pwHash = await hashPassword('AdminLogoPass2026!');
        const [admin] = await dbHandle.db
          .insert(users)
          .values({
            username: 'admin.logo',
            fullName: 'Admin Logo',
            role: 'admin',
            passwordHash: pwHash,
          })
          .returning();
        const adminToken = app.jwt.sign({ sub: admin!.id, ver: 1 });

        // SVG/HTML polyglot masquerading as image/png
        const svgPolyglotRes = await app.inject({
          method: 'PUT',
          url: '/api/school/logo',
          headers: { authorization: `Bearer ${adminToken}` },
          payload: {
            mimeType: 'image/png',
            dataBase64: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64'),
          },
        });
        expect(svgPolyglotRes.statusCode).toBe(400);

        // JPEG magic bytes labeled as image/png
        const wrongMimeBytesRes = await app.inject({
          method: 'PUT',
          url: '/api/school/logo',
          headers: { authorization: `Bearer ${adminToken}` },
          payload: { mimeType: 'image/png', dataBase64: SAMPLE_JPEG_BASE64 },
        });
        expect(wrongMimeBytesRes.statusCode).toBe(400);

        // data URI MIME mismatch
        const dataUriMismatchRes = await app.inject({
          method: 'PUT',
          url: '/api/school/logo',
          headers: { authorization: `Bearer ${adminToken}` },
          payload: {
            mimeType: 'image/png',
            dataBase64: `data:image/jpeg;base64,${SAMPLE_JPEG_BASE64}`,
          },
        });
        expect(dataUriMismatchRes.statusCode).toBe(400);

        // Non-canonical base64 padding bits (last char 'B' with '==' is non-zero unused bits -> canonical re-encoding differs)
        const nonCanonicalRes = await app.inject({
          method: 'PUT',
          url: '/api/school/logo',
          headers: { authorization: `Bearer ${adminToken}` },
          payload: {
            mimeType: 'image/png',
            dataBase64: 'iVBORw0KGgoAAB==',
          },
        });
        expect(nonCanonicalRes.statusCode).toBe(400);

        // Valid JPEG upload succeeds
        const validJpegRes = await app.inject({
          method: 'PUT',
          url: '/api/school/logo',
          headers: { authorization: `Bearer ${adminToken}` },
          payload: { mimeType: 'image/jpeg', dataBase64: SAMPLE_JPEG_BASE64 },
        });
        expect(validJpegRes.statusCode).toBe(200);
        expect(validJpegRes.json().logoMimeType).toBe('image/jpeg');

        // Valid PNG upload succeeds and GET /api/school/logo enforces sandbox CSP + nosniff
        const validPngRes = await app.inject({
          method: 'PUT',
          url: '/api/school/logo',
          headers: { authorization: `Bearer ${adminToken}` },
          payload: { mimeType: 'image/png', dataBase64: SAMPLE_PNG_BASE64 },
        });
        expect(validPngRes.statusCode).toBe(200);

        const getLogoRes = await app.inject({
          method: 'GET',
          url: '/api/school/logo',
          headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(getLogoRes.statusCode).toBe(200);
        expect(getLogoRes.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
        expect(getLogoRes.headers['x-content-type-options']).toBe('nosniff');
        expect(getLogoRes.headers['content-disposition']).toBe('inline');
        expect(getLogoRes.headers['content-type']).toBe('image/png');
      } finally {
        await app.close();
        await dbHandle.close();
      }
    });
  });

  describe('4. BOLA Scoping, Typst Concurrency Semaphore, Official Caching & Batched getSchoolStats', () => {
    let dbHandle: TestDbHandle;
    let app: FastifyInstance;
    let yearId: string;
    let trimesterId: string;
    let seq1Id: string;
    let seq2Id: string;
    let classAId: string;
    let classBId: string;
    let enrA1Id: string;
    let csAMathId: string;
    let adminToken: string;
    let secretaryToken: string;
    let mainTeacherToken: string;
    let assignedTeacherToken: string;

    beforeAll(async () => {
      dbHandle = await createTestDb();
      app = await buildApp({
        db: dbHandle.db,
        config: createTestConfig(),
        pdfRenderer: createStubPdfRenderer(),
        enableRateLimit: false,
      });

      const pwHash = await hashPassword('ReportPass2026!');
      const insertedUsers = await dbHandle.db
        .insert(users)
        .values([
          { username: 'rep.admin', fullName: 'Rep Admin', role: 'admin', passwordHash: pwHash },
          { username: 'rep.sec', fullName: 'Rep Sec', role: 'secretary', passwordHash: pwHash },
          { username: 'rep.pp', fullName: 'Rep Main Teacher', role: 'teacher', passwordHash: pwHash },
          { username: 'rep.math', fullName: 'Rep Subject Teacher', role: 'teacher', passwordHash: pwHash },
        ])
        .returning();

      const uMap = new Map(insertedUsers.map((u) => [u.username, u.id]));
      const adminId = uMap.get('rep.admin')!;
      const secId = uMap.get('rep.sec')!;
      const mainId = uMap.get('rep.pp')!;
      const assignedId = uMap.get('rep.math')!;

      adminToken = app.jwt.sign({ sub: adminId, ver: 1 });
      secretaryToken = app.jwt.sign({ sub: secId, ver: 1 });
      mainTeacherToken = app.jwt.sign({ sub: mainId, ver: 1 });
      assignedTeacherToken = app.jwt.sign({ sub: assignedId, ver: 1 });

      const [year] = await dbHandle.db
        .insert(academicYears)
        .values({
          label: '2026-2027',
          startDate: '2026-09-01',
          endDate: '2027-06-30',
          isActive: true,
          syncVersion: await nextSyncVersion(dbHandle.db),
        })
        .returning();
      yearId = year!.id;

      await dbHandle.db.insert(gradingRules).values({
        academicYearId: yearId,
        trimestersCount: 3,
        sequencesPerTrimester: 2,
        sequenceWeights: [1, 1],
        trimesterWeights: [1, 1, 1],
        passingThreshold: '10.00',
        honorRollThreshold: '12.00',
        encouragementThreshold: '13.00',
        congratulationThreshold: '15.00',
        treatAbsentAsZero: true,
        appreciationScale: CAMEROON_DEFAULT_GRADING_RULES.appreciationScale,
        syncVersion: await nextSyncVersion(dbHandle.db),
      });

      const [t1] = await dbHandle.db
        .insert(periods)
        .values({
          academicYearId: yearId,
          type: 'trimester',
          code: 'T1',
          name: 'Trimestre 1',
          orderIndex: 1,
          syncVersion: await nextSyncVersion(dbHandle.db),
        })
        .returning();
      trimesterId = t1!.id;

      const [s1, s2] = await dbHandle.db
        .insert(periods)
        .values([
          {
            academicYearId: yearId,
            parentPeriodId: trimesterId,
            type: 'sequence',
            code: 'S1',
            name: 'Séquence 1',
            orderIndex: 1,
            syncVersion: await nextSyncVersion(dbHandle.db),
          },
          {
            academicYearId: yearId,
            parentPeriodId: trimesterId,
            type: 'sequence',
            code: 'S2',
            name: 'Séquence 2',
            orderIndex: 2,
            syncVersion: await nextSyncVersion(dbHandle.db),
          },
        ])
        .returning();
      seq1Id = s1!.id;
      seq2Id = s2!.id;

      const [clsA, clsB] = await dbHandle.db
        .insert(classes)
        .values([
          {
            academicYearId: yearId,
            name: '3ème A',
            level: '3ème',
            mainTeacherId: mainId,
            syncVersion: await nextSyncVersion(dbHandle.db),
          },
          {
            academicYearId: yearId,
            name: '3ème B',
            level: '3ème',
            syncVersion: await nextSyncVersion(dbHandle.db),
          },
        ])
        .returning();
      classAId = clsA!.id;
      classBId = clsB!.id;

      const [mathSub] = await dbHandle.db
        .insert(subjects)
        .values({
          code: 'MATH',
          name: 'Mathématiques',
          shortName: 'Maths',
          syncVersion: await nextSyncVersion(dbHandle.db),
        })
        .returning();

      const [csA, csB] = await dbHandle.db
        .insert(classSubjects)
        .values([
          { classId: classAId, subjectId: mathSub!.id, coefficient: '4.00', syncVersion: await nextSyncVersion(dbHandle.db) },
          { classId: classBId, subjectId: mathSub!.id, coefficient: '4.00', syncVersion: await nextSyncVersion(dbHandle.db) },
        ])
        .returning();
      csAMathId = csA!.id;

      await dbHandle.db.insert(teacherAssignments).values({
        teacherId: assignedId,
        classSubjectId: csAMathId,
        academicYearId: yearId,
        isActive: true,
        syncVersion: await nextSyncVersion(dbHandle.db),
      });

      const [st1, st2] = await dbHandle.db
        .insert(students)
        .values([
          {
            matricule: '26REP001',
            lastName: 'Ndongo',
            firstName: 'Marie',
            birthDate: '2012-03-04',
            sex: 'F',
            syncVersion: await nextSyncVersion(dbHandle.db),
          },
          {
            matricule: '26REP002',
            lastName: 'Tchinda',
            firstName: 'Paul',
            birthDate: '2012-07-19',
            sex: 'M',
            syncVersion: await nextSyncVersion(dbHandle.db),
          },
        ])
        .returning();

      const [enr1, enr2] = await dbHandle.db
        .insert(enrollments)
        .values([
          { studentId: st1!.id, classId: classAId, academicYearId: yearId, syncVersion: await nextSyncVersion(dbHandle.db) },
          { studentId: st2!.id, classId: classBId, academicYearId: yearId, syncVersion: await nextSyncVersion(dbHandle.db) },
        ])
        .returning();
      enrA1Id = enr1!.id;

      await dbHandle.db.insert(grades).values([
        {
          enrollmentId: enrA1Id,
          classSubjectId: csAMathId,
          periodId: seq1Id,
          score: '15.00',
          status: 'present',
          enteredBy: adminId,
          syncVersion: await nextSyncVersion(dbHandle.db),
        },
        {
          enrollmentId: enr2!.id,
          classSubjectId: csB!.id,
          periodId: seq1Id,
          score: '9.00',
          status: 'present',
          enteredBy: adminId,
          syncVersion: await nextSyncVersion(dbHandle.db),
        },
      ]);
    });

    afterAll(async () => {
      await app.close();
      await dbHandle.close();
    });

    it('SEC-HIGH-01 / SEC-HIGH-02: enforces least-privilege BOLA across reports & academic endpoints', async () => {
      // Subject-only teacher blocked from full class reports & student bulletins in classA
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/api/reports/class-results?classId=${classAId}&periodId=${seq1Id}`,
            headers: { authorization: `Bearer ${assignedTeacherToken}` },
          })
        ).statusCode,
      ).toBe(403);

      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/api/reports/honor-roll?classId=${classAId}&periodId=${seq1Id}`,
            headers: { authorization: `Bearer ${assignedTeacherToken}` },
          })
        ).statusCode,
      ).toBe(403);

      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/api/reports/bulletins/student/${enrA1Id}/pdf?periodId=${seq1Id}`,
            headers: { authorization: `Bearer ${assignedTeacherToken}` },
          })
        ).statusCode,
      ).toBe(403);

      // Subject-only teacher CAN access class-list PDF, subjects, and students of assigned classA, but NOT classB
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/api/reports/class-list/${classAId}/pdf`,
            headers: { authorization: `Bearer ${assignedTeacherToken}` },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/api/reports/class-list/${classBId}/pdf`,
            headers: { authorization: `Bearer ${assignedTeacherToken}` },
          })
        ).statusCode,
      ).toBe(403);

      const classesList = await app.inject({
        method: 'GET',
        url: `/api/classes?academicYearId=${yearId}`,
        headers: { authorization: `Bearer ${assignedTeacherToken}` },
      });
      expect(classesList.statusCode).toBe(200);
      expect(classesList.json().classes.map((c: { id: string }) => c.id)).toEqual([classAId]);

      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/api/classes/${classAId}/subjects`,
            headers: { authorization: `Bearer ${assignedTeacherToken}` },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/api/classes/${classBId}/subjects`,
            headers: { authorization: `Bearer ${assignedTeacherToken}` },
          })
        ).statusCode,
      ).toBe(403);

      // mainTeacher of classA CAN view full reports & student bulletin of classA
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/api/reports/class-results?classId=${classAId}&periodId=${seq1Id}`,
            headers: { authorization: `Bearer ${mainTeacherToken}` },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/api/reports/bulletins/student/${enrA1Id}/pdf?periodId=${seq1Id}`,
            headers: { authorization: `Bearer ${mainTeacherToken}` },
          })
        ).statusCode,
      ).toBe(200);

      // Admin-only/direction endpoints fail closed for teachers & secretaries
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/api/reports/school-stats?academicYearId=${yearId}&periodId=${seq1Id}`,
            headers: { authorization: `Bearer ${assignedTeacherToken}` },
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/api/reports/school-stats?academicYearId=${yearId}&periodId=${seq1Id}`,
            headers: { authorization: `Bearer ${secretaryToken}` },
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `/api/reports/bulletins/class/${classAId}/pdf?periodId=${seq1Id}`,
            headers: { authorization: `Bearer ${mainTeacherToken}` },
          })
        ).statusCode,
      ).toBe(403);
    });

    it('SEC-MED-15: enforces TypstPdfRenderer bounded semaphore (503 PDF_SERVICE_BUSY), official PDF cache, and accurate batched getSchoolStats', async () => {
      const workDir = await mkdtemp(path.join(os.tmpdir(), 'lycee-sec-typst-'));
      const countFile = path.join(workDir, 'count.txt');
      const mockTypstPath = path.join(workDir, 'mock-typst.mjs');

      await writeFile(countFile, '0', 'utf8');
      await writeFile(
        mockTypstPath,
        `#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
const outPath = process.argv[process.argv.length - 1];
const countPath = ${JSON.stringify(countFile)};
const prev = Number(readFileSync(countPath, 'utf8'));
writeFileSync(countPath, String(prev + 1));
const delayMs = Number(process.env.MOCK_TYPST_DELAY_MS ?? '0');
setTimeout(() => {
  writeFileSync(outPath, Buffer.from('%PDF-1.4\\n%mock-' + String(prev + 1) + '\\n'));
}, delayMs);
`,
        'utf8',
      );
      await chmod(mockTypstPath, 0o755);

      try {
        const resultsService = createResultsService(dbHandle.db);

        // Unlocked stats (batched live computation across classA & classB)
        const unlockedStats = await resultsService.getSchoolStats(yearId, seq1Id);
        expect(unlockedStats.period.isOfficial).toBe(false);
        expect(unlockedStats.totalStudents).toBe(2);
        expect(unlockedStats.evaluatedStudents).toBe(2);
        expect(unlockedStats.overallAverage).toBe(12); // (15 + 9) / 2
        expect(unlockedStats.overallPassRate).toBe(50);

        // Official cache behavior: official -> 1 execution across 2 calls; unofficial -> 2 executions
        const draftPayload = await resultsService.buildBulletinPayload({
          enrollmentId: enrA1Id,
          periodId: seq1Id,
        });
        const renderer = new TypstPdfRenderer(mockTypstPath, undefined, {
          maxConcurrent: 1,
          maxQueue: 1,
          maxCacheEntries: 10,
        });

        await renderer.renderBulletin(draftPayload);
        await renderer.renderBulletin({ ...draftPayload, generatedAt: new Date(Date.now() + 5000).toISOString() });
        expect(Number(await readFile(countFile, 'utf8'))).toBe(2);

        // Lock seq1 via API then test snapshot stats + cached official PDF render
        const lockRes = await app.inject({
          method: 'POST',
          url: `/api/periods/${seq1Id}/lock`,
          headers: { authorization: `Bearer ${adminToken}` },
          payload: { reason: 'Validation S1' },
        });
        expect(lockRes.statusCode).toBe(200);

        const lockedStats = await resultsService.getSchoolStats(yearId, seq1Id);
        expect(lockedStats.period.isOfficial).toBe(true);
        expect(lockedStats.overallAverage).toBe(12);
        expect(lockedStats.overallPassRate).toBe(50);

        // Also test uncached fallback path inside locked period when a new class has 0 snapshots (seq2 still open)
        const statsSeq2 = await resultsService.getSchoolStats(yearId, seq2Id);
        expect(statsSeq2.totalStudents).toBe(2);
        expect(statsSeq2.evaluatedStudents).toBe(0);

        const officialPayload = await resultsService.buildBulletinPayload({
          enrollmentId: enrA1Id,
          periodId: seq1Id,
        });
        expect(officialPayload.period.isOfficial).toBe(true);

        const pdfOfficial1 = await renderer.renderBulletin(officialPayload);
        const pdfOfficial2 = await renderer.renderBulletin({
          ...officialPayload,
          generatedAt: new Date(Date.now() + 9000).toISOString(),
        });
        expect(pdfOfficial1.equals(pdfOfficial2)).toBe(true);
        expect(Number(await readFile(countFile, 'utf8'))).toBe(3);

        // Bounded concurrency semaphore test: maxConcurrent=1, maxQueue=1 -> 3rd parallel call rejects 503 PDF_SERVICE_BUSY
        const classListPayload = await resultsService.buildClassListPayload(classAId);
        process.env.MOCK_TYPST_DELAY_MS = '150';
        const settled = await Promise.allSettled([
          renderer.renderClassList(classListPayload),
          renderer.renderClassList(classListPayload),
          renderer.renderClassList(classListPayload),
        ]);
        delete process.env.MOCK_TYPST_DELAY_MS;

        const fulfilled = settled.filter((r) => r.status === 'fulfilled');
        const rejected = settled.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
        expect(fulfilled).toHaveLength(2);
        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.reason).toMatchObject({
          statusCode: 503,
          code: 'PDF_SERVICE_BUSY',
        });
      } finally {
        delete process.env.MOCK_TYPST_DELAY_MS;
        await rm(workDir, { recursive: true, force: true });
      }
    });
  });

  describe('5. Locking Hierarchy, Audit Trails & PostgreSQL Constraints (SEC-HIGH-06/07/08, SEC-MED-09/17)', () => {
    it('enforces lock propagation on grading rules, class subjects, period metadata/children, audit reasons, and DB RESTRICT/CHECK constraints', async () => {
      const dbHandle = await createTestDb();
      const app = await buildApp({
        db: dbHandle.db,
        config: createTestConfig(),
        pdfRenderer: createStubPdfRenderer(),
        enableRateLimit: false,
      });

      try {
        const pwHash = await hashPassword('LockAuditPass2026!');
        const [admin, teacher] = await dbHandle.db
          .insert(users)
          .values([
            { username: 'lock.admin', fullName: 'Lock Admin', role: 'admin', passwordHash: pwHash },
            { username: 'lock.teacher', fullName: 'Lock Teacher', role: 'teacher', passwordHash: pwHash },
          ])
          .returning();
        const adminToken = app.jwt.sign({ sub: admin!.id, ver: 1 });
        const teacherToken = app.jwt.sign({ sub: teacher!.id, ver: 1 });

        const [year] = await dbHandle.db
          .insert(academicYears)
          .values({
            label: '2026-2027',
            startDate: '2026-09-01',
            endDate: '2027-06-30',
            isActive: true,
            syncVersion: await nextSyncVersion(dbHandle.db),
          })
          .returning();

        const [tri] = await dbHandle.db
          .insert(periods)
          .values({
            academicYearId: year!.id,
            type: 'trimester',
            code: 'T1',
            name: 'Trimestre 1',
            orderIndex: 1,
            syncVersion: await nextSyncVersion(dbHandle.db),
          })
          .returning();

        const [seq1, seq2] = await dbHandle.db
          .insert(periods)
          .values([
            {
              academicYearId: year!.id,
              parentPeriodId: tri!.id,
              type: 'sequence',
              code: 'S1',
              name: 'Séquence 1',
              orderIndex: 1,
              syncVersion: await nextSyncVersion(dbHandle.db),
            },
            {
              academicYearId: year!.id,
              parentPeriodId: tri!.id,
              type: 'sequence',
              code: 'S2',
              name: 'Séquence 2',
              orderIndex: 2,
              syncVersion: await nextSyncVersion(dbHandle.db),
            },
          ])
          .returning();

        const [cls] = await dbHandle.db
          .insert(classes)
          .values({
            academicYearId: year!.id,
            name: '4ème A',
            level: '4ème',
            syncVersion: await nextSyncVersion(dbHandle.db),
          })
          .returning();

        const [sub] = await dbHandle.db
          .insert(subjects)
          .values({
            code: 'SVT',
            name: 'Sciences de la Vie',
            shortName: 'SVT',
            syncVersion: await nextSyncVersion(dbHandle.db),
          })
          .returning();

        const [cs] = await dbHandle.db
          .insert(classSubjects)
          .values({
            classId: cls!.id,
            subjectId: sub!.id,
            coefficient: '2.00',
            syncVersion: await nextSyncVersion(dbHandle.db),
          })
          .returning();

        await dbHandle.db.insert(teacherAssignments).values({
          teacherId: teacher!.id,
          classSubjectId: cs!.id,
          academicYearId: year!.id,
          isActive: true,
          syncVersion: await nextSyncVersion(dbHandle.db),
        });

        const [student] = await dbHandle.db
          .insert(students)
          .values({
            matricule: '26LOC001',
            lastName: 'Mballa',
            firstName: 'Luc',
            birthDate: '2012-05-05',
            sex: 'M',
            syncVersion: await nextSyncVersion(dbHandle.db),
          })
          .returning();

        const [enr] = await dbHandle.db
          .insert(enrollments)
          .values({
            studentId: student!.id,
            classId: cls!.id,
            academicYearId: year!.id,
            syncVersion: await nextSyncVersion(dbHandle.db),
          })
          .returning();

        // Mandatory reason on grade score/status change & appreciation audit tracking (SEC-HIGH-08)
        const initGrade = await app.inject({
          method: 'PUT',
          url: '/api/grades/bulk',
          headers: { authorization: `Bearer ${teacherToken}` },
          payload: {
            entries: [
              {
                enrollmentId: enr!.id,
                classSubjectId: cs!.id,
                periodId: seq1!.id,
                score: 12,
                status: 'present',
                appreciation: 'Assez bien',
              },
            ],
          },
        });
        expect(initGrade.statusCode).toBe(200);

        const missingReasonEdit = await app.inject({
          method: 'PUT',
          url: '/api/grades/bulk',
          headers: { authorization: `Bearer ${teacherToken}` },
          payload: {
            entries: [
              {
                enrollmentId: enr!.id,
                classSubjectId: cs!.id,
                periodId: seq1!.id,
                score: 14,
                status: 'present',
                reason: '   ',
              },
            ],
          },
        });
        expect(missingReasonEdit.statusCode).toBe(400);

        const validEdit = await app.inject({
          method: 'PUT',
          url: '/api/grades/bulk',
          headers: { authorization: `Bearer ${teacherToken}` },
          payload: {
            entries: [
              {
                enrollmentId: enr!.id,
                classSubjectId: cs!.id,
                periodId: seq1!.id,
                score: 14,
                status: 'present',
                appreciation: 'Bien',
                reason: 'Erreur d’addition sur copie',
              },
            ],
          },
        });
        expect(validEdit.statusCode).toBe(200);

        // Same mandatory reason via sync/push when modifying existing grade
        const syncMissingReason = await app.inject({
          method: 'POST',
          url: '/api/sync/push',
          headers: { authorization: `Bearer ${teacherToken}` },
          payload: {
            operations: [
              {
                operationId: randomUUID(),
                type: 'UPSERT_GRADE',
                clientTimestamp: new Date().toISOString(),
                payload: {
                  enrollmentId: enr!.id,
                  classSubjectId: cs!.id,
                  periodId: seq1!.id,
                  score: 15,
                  status: 'present',
                },
              },
            ],
          },
        });
        expect(syncMissingReason.statusCode).toBe(200);
        expect(syncMissingReason.json().results[0].outcome).toBe('rejected_validation');

        const gradeAuditRows = await dbHandle.db.select().from(gradeAuditLogs);
        expect(gradeAuditRows).toHaveLength(2);
        const editAudit = gradeAuditRows.find((r) => r.previousAppreciation === 'Assez bien');
        expect(editAudit?.newAppreciation).toBe('Bien');
        expect(Number(editAudit?.previousScore)).toBe(12);
        expect(Number(editAudit?.newScore)).toBe(14);

        // Council decision audit logs (SEC-HIGH-08)
        const cd1 = await app.inject({
          method: 'PUT',
          url: '/api/council-decisions/bulk',
          headers: { authorization: `Bearer ${adminToken}` },
          payload: {
            decisions: [
              {
                enrollmentId: enr!.id,
                periodId: tri!.id,
                generalAppreciation: 'Sérieux',
                decision: 'encouragement',
                absencesHours: 3,
              },
            ],
          },
        });
        expect(cd1.statusCode).toBe(200);

        const cd2 = await app.inject({
          method: 'PUT',
          url: '/api/council-decisions/bulk',
          headers: { authorization: `Bearer ${adminToken}` },
          payload: {
            decisions: [
              {
                enrollmentId: enr!.id,
                periodId: tri!.id,
                generalAppreciation: 'Excellent trimestre',
                decision: 'congratulations',
                absencesHours: 1,
              },
            ],
          },
        });
        expect(cd2.statusCode).toBe(200);

        const cdLogs = await dbHandle.db
          .select()
          .from(councilDecisionAuditLogs)
          .orderBy(asc(councilDecisionAuditLogs.serverTimestamp));
        expect(cdLogs).toHaveLength(2);
        expect(cdLogs[0]?.previousDecision).toBeNull();
        expect(cdLogs[0]?.newDecision).toBe('encouragement');
        expect(cdLogs[1]?.previousDecision).toBe('encouragement');
        expect(cdLogs[1]?.newDecision).toBe('congratulations');
        expect(cdLogs[1]?.previousAppreciation).toBe('Sérieux');
        expect(cdLogs[1]?.newAppreciation).toBe('Excellent trimestre');
        expect(cdLogs[1]?.previousAbsencesHours).toBe(3);
        expect(cdLogs[1]?.newAbsencesHours).toBe(1);

        // Lock seq1 -> blocks PATCH period, PUT grading-rules, PUT class-subjects, and double-lock -> 409 (SEC-HIGH-07 / SEC-MED-09)
        expect(
          (
            await app.inject({
              method: 'POST',
              url: `/api/periods/${seq1!.id}/lock`,
              headers: { authorization: `Bearer ${adminToken}` },
              payload: { reason: 'Clôture S1' },
            })
          ).statusCode,
        ).toBe(200);

        expect(
          (
            await app.inject({
              method: 'POST',
              url: `/api/periods/${seq1!.id}/lock`,
              headers: { authorization: `Bearer ${adminToken}` },
              payload: { reason: 'Double verrouillage' },
            })
          ).statusCode,
        ).toBe(409);

        expect(
          (
            await app.inject({
              method: 'PATCH',
              url: `/api/periods/${seq1!.id}`,
              headers: { authorization: `Bearer ${adminToken}` },
              payload: { weight: 2 },
            })
          ).statusCode,
        ).toBe(409);

        expect(
          (
            await app.inject({
              method: 'PUT',
              url: `/api/academic-years/${year!.id}/grading-rules`,
              headers: { authorization: `Bearer ${adminToken}` },
              payload: CAMEROON_DEFAULT_GRADING_RULES,
            })
          ).statusCode,
        ).toBe(409);

        expect(
          (
            await app.inject({
              method: 'PUT',
              url: '/api/class-subjects',
              headers: { authorization: `Bearer ${adminToken}` },
              payload: { classId: cls!.id, subjectId: sub!.id, coefficient: 5 },
            })
          ).statusCode,
        ).toBe(409);

        // Lock trimester -> blocks child creation, child metadata edits, open child grading, council edits, and child unlock -> 409
        expect(
          (
            await app.inject({
              method: 'POST',
              url: `/api/periods/${tri!.id}/lock`,
              headers: { authorization: `Bearer ${adminToken}` },
              payload: { reason: 'Clôture T1' },
            })
          ).statusCode,
        ).toBe(200);

        expect(
          (
            await app.inject({
              method: 'POST',
              url: '/api/periods',
              headers: { authorization: `Bearer ${adminToken}` },
              payload: {
                academicYearId: year!.id,
                parentPeriodId: tri!.id,
                type: 'sequence',
                code: 'S1_EXTRA',
                name: 'Séquence extra',
                orderIndex: 9,
              },
            })
          ).statusCode,
        ).toBe(409);

        expect(
          (
            await app.inject({
              method: 'PATCH',
              url: `/api/periods/${seq2!.id}`,
              headers: { authorization: `Bearer ${adminToken}` },
              payload: { name: 'S2 Modifiée' },
            })
          ).statusCode,
        ).toBe(409);

        expect(
          (
            await app.inject({
              method: 'PUT',
              url: '/api/grades/bulk',
              headers: { authorization: `Bearer ${teacherToken}` },
              payload: {
                entries: [
                  {
                    enrollmentId: enr!.id,
                    classSubjectId: cs!.id,
                    periodId: seq2!.id,
                    score: 16,
                    status: 'present',
                  },
                ],
              },
            })
          ).statusCode,
        ).toBe(409);

        const pushToChildOfLockedTri = await app.inject({
          method: 'POST',
          url: '/api/sync/push',
          headers: { authorization: `Bearer ${teacherToken}` },
          payload: {
            operations: [
              {
                operationId: randomUUID(),
                type: 'UPSERT_GRADE',
                clientTimestamp: new Date().toISOString(),
                payload: {
                  enrollmentId: enr!.id,
                  classSubjectId: cs!.id,
                  periodId: seq2!.id,
                  score: 16,
                  status: 'present',
                },
              },
            ],
          },
        });
        expect(pushToChildOfLockedTri.statusCode).toBe(200);
        expect(pushToChildOfLockedTri.json().results[0].outcome).toBe('rejected_locked');

        expect(
          (
            await app.inject({
              method: 'PUT',
              url: '/api/council-decisions/bulk',
              headers: { authorization: `Bearer ${adminToken}` },
              payload: {
                decisions: [
                  {
                    enrollmentId: enr!.id,
                    periodId: tri!.id,
                    generalAppreciation: 'Modif bloquée',
                    decision: 'honor_roll',
                    absencesHours: 0,
                  },
                ],
              },
            })
          ).statusCode,
        ).toBe(409);

        expect(
          (
            await app.inject({
              method: 'POST',
              url: `/api/periods/${seq1!.id}/unlock`,
              headers: { authorization: `Bearer ${adminToken}` },
              payload: { reason: 'Tentative déverrouillage enfant' },
            })
          ).statusCode,
        ).toBe(409);

        // Unlock trimester then seq1 -> editing grading rules and classSubjects becomes possible again
        expect(
          (
            await app.inject({
              method: 'POST',
              url: `/api/periods/${tri!.id}/unlock`,
              headers: { authorization: `Bearer ${adminToken}` },
              payload: { reason: 'Correction notes T1' },
            })
          ).statusCode,
        ).toBe(200);
        expect(
          (
            await app.inject({
              method: 'POST',
              url: `/api/periods/${seq1!.id}/unlock`,
              headers: { authorization: `Bearer ${adminToken}` },
              payload: { reason: 'Correction note S1' },
            })
          ).statusCode,
        ).toBe(200);
        expect(
          (
            await app.inject({
              method: 'PUT',
              url: '/api/class-subjects',
              headers: { authorization: `Bearer ${adminToken}` },
              payload: { classId: cls!.id, subjectId: sub!.id, coefficient: 5 },
            })
          ).statusCode,
        ).toBe(200);

        // Direct DB constraint verification: ON DELETE RESTRICT & CHECK constraints (SEC-MED-17)
        await expect(
          dbHandle.raw.query('DELETE FROM academic_years WHERE id = $1', [year!.id]),
        ).rejects.toMatchObject({ code: '23503' });
        await expect(
          dbHandle.raw.query('DELETE FROM periods WHERE id = $1', [seq1!.id]),
        ).rejects.toMatchObject({ code: '23503' });
        await expect(
          dbHandle.raw.query('DELETE FROM users WHERE id = $1', [teacher!.id]),
        ).rejects.toMatchObject({ code: '23503' });

        await expect(
          dbHandle.raw.query(
            `INSERT INTO grades (enrollment_id, class_subject_id, period_id, score, status, entered_by)
             VALUES ($1, $2, $3, 25.00, 'present', $4)`,
            [enr!.id, cs!.id, seq2!.id, teacher!.id],
          ),
        ).rejects.toMatchObject({ code: '23514' });

        await expect(
          dbHandle.raw.query(
            `INSERT INTO grades (enrollment_id, class_subject_id, period_id, score, status, entered_by)
             VALUES ($1, $2, $3, 12.00, 'absent', $4)`,
            [enr!.id, cs!.id, seq2!.id, teacher!.id],
          ),
        ).rejects.toMatchObject({ code: '23514' });

        await expect(
          dbHandle.raw.query(
            `UPDATE periods SET parent_period_id = id WHERE id = $1`,
            [tri!.id],
          ),
        ).rejects.toMatchObject({ code: '23514' });

        await expect(
          dbHandle.raw.query(
            `INSERT INTO class_subjects (class_id, subject_id, coefficient) VALUES ($1, $2, 0)`,
            [cls!.id, sub!.id],
          ),
        ).rejects.toMatchObject({ code: '23514' });
      } finally {
        await app.close();
        await dbHandle.close();
      }
    });
  });

  describe('6. Sync Isolation, Scolarité Integrity, Precision & Student Search (SEC-HIGH-10, SEC-MED-10..14, SEC-MED-18)', () => {
    it('enforces scoped sync_operations PK, zero IDOR oracles, clientTimestamp bounds, backfill/pagination, transfer block, role validation, rounding, and ILIKE escaping', async () => {
      const dbHandle = await createTestDb();
      const app = await buildApp({
        db: dbHandle.db,
        config: createTestConfig(),
        pdfRenderer: createStubPdfRenderer(),
        enableRateLimit: false,
      });

      try {
        const pwHash = await hashPassword('SyncScolPass2026!');
        const insertedUsers = await dbHandle.db
          .insert(users)
          .values([
            { username: 'sync.admin', fullName: 'Sync Admin', role: 'admin', passwordHash: pwHash },
            { username: 'sync.sec', fullName: 'Sync Sec', role: 'secretary', passwordHash: pwHash },
            { username: 'sync.t1', fullName: 'Sync Teacher 1', role: 'teacher', passwordHash: pwHash },
            { username: 'sync.t2', fullName: 'Sync Teacher 2', role: 'teacher', passwordHash: pwHash },
          ])
          .returning();

        const uMap = new Map(insertedUsers.map((u) => [u.username, u.id]));
        const adminId = uMap.get('sync.admin')!;
        const secId = uMap.get('sync.sec')!;
        const t1Id = uMap.get('sync.t1')!;
        const t2Id = uMap.get('sync.t2')!;

        const adminToken = app.jwt.sign({ sub: adminId, ver: 1 });
        const secToken = app.jwt.sign({ sub: secId, ver: 1 });
        const t1Token = app.jwt.sign({ sub: t1Id, ver: 1 });
        const t2Token = app.jwt.sign({ sub: t2Id, ver: 1 });

        const [year] = await dbHandle.db
          .insert(academicYears)
          .values({
            label: '2026-2027',
            startDate: '2026-09-01',
            endDate: '2027-06-30',
            isActive: true,
            syncVersion: await nextSyncVersion(dbHandle.db),
          })
          .returning();

        const [seq1] = await dbHandle.db
          .insert(periods)
          .values({
            academicYearId: year!.id,
            type: 'sequence',
            code: 'S1',
            name: 'Séquence 1',
            orderIndex: 1,
            syncVersion: await nextSyncVersion(dbHandle.db),
          })
          .returning();

        const [cls1, cls2] = await dbHandle.db
          .insert(classes)
          .values([
            {
              academicYearId: year!.id,
              name: '2nde A',
              level: '2nde',
              syncVersion: await nextSyncVersion(dbHandle.db),
            },
            {
              academicYearId: year!.id,
              name: '2nde C',
              level: '2nde',
              syncVersion: await nextSyncVersion(dbHandle.db),
            },
          ])
          .returning();

        const [mathSub, histSub] = await dbHandle.db
          .insert(subjects)
          .values([
            { code: 'MATH', name: 'Mathématiques', shortName: 'Maths', isActive: true, syncVersion: await nextSyncVersion(dbHandle.db) },
            { code: 'HIST_OLD', name: 'Ancienne Histoire', shortName: 'Hist.', isActive: false, syncVersion: await nextSyncVersion(dbHandle.db) },
          ])
          .returning();

        const [cs1, cs2] = await dbHandle.db
          .insert(classSubjects)
          .values([
            { classId: cls1!.id, subjectId: mathSub!.id, coefficient: '4.00', syncVersion: await nextSyncVersion(dbHandle.db) },
            { classId: cls2!.id, subjectId: mathSub!.id, coefficient: '5.00', syncVersion: await nextSyncVersion(dbHandle.db) },
          ])
          .returning();

        await dbHandle.db.insert(teacherAssignments).values([
          { teacherId: t1Id, classSubjectId: cs1!.id, academicYearId: year!.id, isActive: true, syncVersion: await nextSyncVersion(dbHandle.db) },
          { teacherId: t2Id, classSubjectId: cs2!.id, academicYearId: year!.id, isActive: true, syncVersion: await nextSyncVersion(dbHandle.db) },
        ]);

        const [st1, st2, st3] = await dbHandle.db
          .insert(students)
          .values([
            { matricule: '26SY001', lastName: 'Atangana', firstName: 'Aline', birthDate: '2011-01-10', sex: 'F', syncVersion: await nextSyncVersion(dbHandle.db) },
            { matricule: '26SY002', lastName: 'Bello', firstName: 'Benoît', birthDate: '2011-02-11', sex: 'M', syncVersion: await nextSyncVersion(dbHandle.db) },
            { matricule: '26SY003', lastName: 'Choua', firstName: 'Cédric', birthDate: '2011-03-12', sex: 'M', syncVersion: await nextSyncVersion(dbHandle.db) },
          ])
          .returning();

        const [enr1, enr2, enr3] = await dbHandle.db
          .insert(enrollments)
          .values([
            { studentId: st1!.id, classId: cls1!.id, academicYearId: year!.id, status: 'active', syncVersion: await nextSyncVersion(dbHandle.db) },
            { studentId: st2!.id, classId: cls2!.id, academicYearId: year!.id, status: 'active', syncVersion: await nextSyncVersion(dbHandle.db) },
            { studentId: st3!.id, classId: cls1!.id, academicYearId: year!.id, status: 'active', syncVersion: await nextSyncVersion(dbHandle.db) },
          ])
          .returning();

        // Pre-existing grade in cls2 BEFORE t1 gets assigned to cls2 (for backfill test below)
        const existingCls2GradeSyncVersion = await nextSyncVersion(dbHandle.db);
        await dbHandle.db.insert(grades).values({
          enrollmentId: enr2!.id,
          classSubjectId: cs2!.id,
          periodId: seq1!.id,
          score: '13.50',
          status: 'present',
          enteredBy: t2Id,
          syncVersion: existingCls2GradeSyncVersion,
        });

        // 1. Composite PK (user_id, operation_id): shared operationId works independently for t1 and t2
        const sharedOpId = randomUUID();
        const t1Push = await app.inject({
          method: 'POST',
          url: '/api/sync/push',
          headers: { authorization: `Bearer ${t1Token}` },
          payload: {
            operations: [
              {
                operationId: sharedOpId,
                type: 'UPSERT_GRADE',
                clientTimestamp: new Date().toISOString(),
                payload: {
                  enrollmentId: enr1!.id,
                  classSubjectId: cs1!.id,
                  periodId: seq1!.id,
                  score: 16.25,
                  status: 'present',
                },
              },
            ],
          },
        });
        expect(t1Push.statusCode).toBe(200);
        expect(t1Push.json().results[0].outcome).toBe('applied');

        const t2PushSameUuid = await app.inject({
          method: 'POST',
          url: '/api/sync/push',
          headers: { authorization: `Bearer ${t2Token}` },
          payload: {
            operations: [
              {
                operationId: sharedOpId,
                type: 'UPSERT_GRADE',
                clientTimestamp: new Date().toISOString(),
                payload: {
                  enrollmentId: enr2!.id,
                  classSubjectId: cs2!.id,
                  periodId: seq1!.id,
                  score: 17,
                  status: 'present',
                  reason: 'Correction copie T2',
                },
              },
            ],
          },
        });
        expect(t2PushSameUuid.statusCode).toBe(200);
        expect(t2PushSameUuid.json().results[0].outcome).toBe('applied');

        const t2Replay = await app.inject({
          method: 'POST',
          url: '/api/sync/push',
          headers: { authorization: `Bearer ${t2Token}` },
          payload: {
            operations: [
              {
                operationId: sharedOpId,
                type: 'UPSERT_GRADE',
                clientTimestamp: new Date().toISOString(),
                payload: {
                  enrollmentId: enr2!.id,
                  classSubjectId: cs2!.id,
                  periodId: seq1!.id,
                  score: 17,
                  status: 'present',
                  reason: 'Correction copie T2',
                },
              },
            ],
          },
        });
        expect(t2Replay.json().results[0].outcome).toBe('duplicate');

        // 2. No existence oracle on unknown UUID classSubjectId + clientTimestamp bounds + dropped enrollment rejection (SEC-MED-11 / SEC-MED-14)
        const futureTs = new Date(Date.now() + 60 * 60_000).toISOString();
        const securityPushCases = await app.inject({
          method: 'POST',
          url: '/api/sync/push',
          headers: { authorization: `Bearer ${t1Token}` },
          payload: {
            operations: [
              {
                operationId: randomUUID(),
                type: 'UPSERT_GRADE',
                clientTimestamp: new Date().toISOString(),
                payload: {
                  enrollmentId: randomUUID(),
                  classSubjectId: randomUUID(),
                  periodId: randomUUID(),
                  score: 10,
                  status: 'present',
                },
              },
              {
                operationId: randomUUID(),
                type: 'UPSERT_GRADE',
                clientTimestamp: '2019-12-31T23:59:59.000Z',
                payload: {
                  enrollmentId: enr1!.id,
                  classSubjectId: cs1!.id,
                  periodId: seq1!.id,
                  score: 10,
                  status: 'present',
                },
              },
              {
                operationId: randomUUID(),
                type: 'UPSERT_GRADE',
                clientTimestamp: futureTs,
                payload: {
                  enrollmentId: enr1!.id,
                  classSubjectId: cs1!.id,
                  periodId: seq1!.id,
                  score: 10,
                  status: 'present',
                },
              },
            ],
          },
        });
        expect(securityPushCases.statusCode).toBe(200);
        expect(securityPushCases.json().results[0].outcome).toBe('rejected_forbidden');
        expect(securityPushCases.json().results[1].outcome).toBe('rejected_validation');
        expect(securityPushCases.json().results[2].outcome).toBe('rejected_validation');

        // Drop enr3 (no grades yet -> allowed) -> grading dropped enrollment rejected in bulk & sync/push
        expect(
          (
            await app.inject({
              method: 'PATCH',
              url: `/api/enrollments/${enr3!.id}`,
              headers: { authorization: `Bearer ${secToken}` },
              payload: { status: 'dropped' },
            })
          ).statusCode,
        ).toBe(200);

        expect(
          (
            await app.inject({
              method: 'PUT',
              url: '/api/grades/bulk',
              headers: { authorization: `Bearer ${t1Token}` },
              payload: {
                entries: [
                  {
                    enrollmentId: enr3!.id,
                    classSubjectId: cs1!.id,
                    periodId: seq1!.id,
                    score: 11,
                    status: 'present',
                  },
                ],
              },
            })
          ).statusCode,
        ).toBe(400);

        expect(
          (
            await app.inject({
              method: 'PUT',
              url: '/api/council-decisions/bulk',
              headers: { authorization: `Bearer ${adminToken}` },
              payload: {
                decisions: [
                  {
                    enrollmentId: enr3!.id,
                    periodId: seq1!.id,
                    generalAppreciation: 'Abandon',
                    decision: 'none',
                    absencesHours: 0,
                  },
                ],
              },
            })
          ).statusCode,
        ).toBe(400);

        const pushDropped = await app.inject({
          method: 'POST',
          url: '/api/sync/push',
          headers: { authorization: `Bearer ${t1Token}` },
          payload: {
            operations: [
              {
                operationId: randomUUID(),
                type: 'UPSERT_GRADE',
                clientTimestamp: new Date().toISOString(),
                payload: {
                  enrollmentId: enr3!.id,
                  classSubjectId: cs1!.id,
                  periodId: seq1!.id,
                  score: 11,
                  status: 'present',
                },
              },
            ],
          },
        });
        expect(pushDropped.json().results[0].outcome).toBe('rejected_validation');

        // 3. sync/pull hides lastOperationId, backfills newly assigned class/student/grade on since > 0, and paginates with limit & hasMore (SEC-HIGH-10 / SEC-MED-11 / SEC-MED-12 / SEC-MED-18)
        const t1InitialPull = await app.inject({
          method: 'GET',
          url: '/api/sync/pull?since=0',
          headers: { authorization: `Bearer ${t1Token}` },
        });
        expect(t1InitialPull.statusCode).toBe(200);
        const initialJson = t1InitialPull.json();
        expect(initialJson.classes.map((c: { id: string }) => c.id)).toEqual([cls1!.id]);
        expect(initialJson.grades).toHaveLength(1);
        expect('lastOperationId' in initialJson.grades[0]).toBe(false);
        const cursorBeforeNewAssign: number = initialJson.latestCursor;

        // Assign t1 to cs2 (in cls2, whose students & pre-existing grade have syncVersion < cursorBeforeNewAssign!)
        const assignCls2 = await app.inject({
          method: 'POST',
          url: '/api/teacher-assignments',
          headers: { authorization: `Bearer ${adminToken}` },
          payload: { teacherId: t1Id, classSubjectId: cs2!.id, academicYearId: year!.id },
        });
        expect(assignCls2.statusCode).toBe(201);

        const t1IncrementalPull = await app.inject({
          method: 'GET',
          url: `/api/sync/pull?since=${cursorBeforeNewAssign}`,
          headers: { authorization: `Bearer ${t1Token}` },
        });
        expect(t1IncrementalPull.statusCode).toBe(200);
        const backfillJson = t1IncrementalPull.json();
        expect(backfillJson.classes.map((c: { id: string }) => c.id)).toContain(cls2!.id);
        expect(backfillJson.students.map((s: { id: string }) => s.id)).toContain(st2!.id);
        expect(backfillJson.grades.some((g: { enrollmentId: string }) => g.enrollmentId === enr2!.id)).toBe(true);

        // Pagination check on sync/pull (limit=1)
        const page1 = await app.inject({
          method: 'GET',
          url: '/api/sync/pull?since=0&limit=1',
          headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(page1.statusCode).toBe(200);
        expect(page1.json().hasMore).toBe(true);
        const page1Cursor: number = page1.json().latestCursor;
        const pageFull = await app.inject({
          method: 'GET',
          url: `/api/sync/pull?since=${page1Cursor}&limit=2000`,
          headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(pageFull.statusCode).toBe(200);
        expect(pageFull.json().hasMore).toBe(false);

        // 4. Mid-year classId transfer block when grades exist (SEC-MED-12)
        const blockedTransfer = await app.inject({
          method: 'PATCH',
          url: `/api/enrollments/${enr1!.id}`,
          headers: { authorization: `Bearer ${secToken}` },
          payload: { classId: cls2!.id },
        });
        expect(blockedTransfer.statusCode).toBe(409);

        // Enrollment without grades/decisions/snapshots CAN still transfer
        const allowedTransfer = await app.inject({
          method: 'PATCH',
          url: `/api/enrollments/${enr3!.id}`,
          headers: { authorization: `Bearer ${secToken}` },
          payload: { classId: cls2!.id },
        });
        expect(allowedTransfer.statusCode).toBe(200);

        // 5. Role validation on mainTeacherId & teacherAssignments + inactive subject check (SEC-MED-13)
        expect(
          (
            await app.inject({
              method: 'POST',
              url: '/api/classes',
              headers: { authorization: `Bearer ${adminToken}` },
              payload: { academicYearId: year!.id, name: '1ère A', level: '1ère', mainTeacherId: secId },
            })
          ).statusCode,
        ).toBe(400);

        expect(
          (
            await app.inject({
              method: 'POST',
              url: '/api/teacher-assignments',
              headers: { authorization: `Bearer ${adminToken}` },
              payload: { teacherId: secId, classSubjectId: cs1!.id, academicYearId: year!.id },
            })
          ).statusCode,
        ).toBe(400);

        expect(
          (
            await app.inject({
              method: 'PUT',
              url: '/api/class-subjects',
              headers: { authorization: `Bearer ${adminToken}` },
              payload: { classId: cls1!.id, subjectId: histSub!.id, coefficient: 2 },
            })
          ).statusCode,
        ).toBe(400);

        // 6. Calculation rounding & decimal/coefficient precision
        expect(gradingCalculator.roundGrade(2.135, 2)).toBe(2.14);
        expect(gradingCalculator.roundGrade(1.005, 2)).toBe(1.01);

        expect(
          (
            await app.inject({
              method: 'PUT',
              url: '/api/grades/bulk',
              headers: { authorization: `Bearer ${t1Token}` },
              payload: {
                entries: [
                  {
                    enrollmentId: enr1!.id,
                    classSubjectId: cs1!.id,
                    periodId: seq1!.id,
                    score: 12.345,
                    status: 'present',
                    reason: 'Précision invalide',
                  },
                ],
              },
            })
          ).statusCode,
        ).toBe(400);

        expect(
          (
            await app.inject({
              method: 'PUT',
              url: '/api/class-subjects',
              headers: { authorization: `Bearer ${adminToken}` },
              payload: { classId: cls1!.id, subjectId: mathSub!.id, coefficient: 0.005 },
            })
          ).statusCode,
        ).toBe(400);

        // 7. Student ILIKE escaping & pagination (SEC-MED-18)
        const wildcardPct = await app.inject({
          method: 'GET',
          url: `/api/students?q=${encodeURIComponent('%')}`,
          headers: { authorization: `Bearer ${secToken}` },
        });
        expect(wildcardPct.statusCode).toBe(200);
        expect(wildcardPct.json().students).toHaveLength(0);

        const wildcardUnderscore = await app.inject({
          method: 'GET',
          url: '/api/students?q=_',
          headers: { authorization: `Bearer ${secToken}` },
        });
        expect(wildcardUnderscore.statusCode).toBe(200);
        expect(wildcardUnderscore.json().students).toHaveLength(0);

        const paginatedStudents = await app.inject({
          method: 'GET',
          url: '/api/students?limit=1&offset=1',
          headers: { authorization: `Bearer ${secToken}` },
        });
        expect(paginatedStudents.statusCode).toBe(200);
        expect(paginatedStudents.json().students).toHaveLength(1);
        expect(paginatedStudents.json().students[0].lastName).toBe('Bello');
      } finally {
        await app.close();
        await dbHandle.close();
      }
    });
  });
});
