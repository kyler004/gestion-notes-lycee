import { CAMEROON_DEFAULT_GRADING_RULES, type SchoolProfileDto } from '@lycee/shared';
import { eq } from 'drizzle-orm';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { parseEnv, type AppConfig } from '../config/env.js';
import type { DbClient } from '../db/client.js';
import {
  academicYears,
  gradingRules,
  periods,
  refreshTokens,
  schoolProfile,
  users,
} from '../db/schema.js';
import { seedIfEmpty } from '../db/seed.js';
import { createTestDb, type TestDbHandle } from '../db/test-helpers.js';
import { hashPassword, hashToken } from '../lib/crypto.js';
import { registerErrorHandler } from '../lib/errors.js';
import { authPlugin } from '../plugins/auth.js';
import { registerAuthRoutes } from '../routes/auth.routes.js';
import { registerSchoolRoutes } from '../routes/school.routes.js';
import { registerUsersRoutes } from '../routes/users.routes.js';

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function makeTestConfig(): AppConfig {
  return parseEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/test',
    JWT_ACCESS_SECRET: 'test-access-secret-must-be-at-least-32-chars',
    JWT_REFRESH_SECRET: 'test-refresh-secret-must-be-at-least-32-chars',
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL_DAYS: '30',
    ADMIN_INITIAL_USERNAME: 'admin',
    ADMIN_INITIAL_PASSWORD: 'AdminPassword2026!',
    ADMIN_INITIAL_FULLNAME: 'Administrateur Test',
  });
}

async function buildTestContext(opts: { seed?: boolean } = {}): Promise<{
  app: FastifyInstance;
  db: DbClient;
  dbHandle: TestDbHandle;
  config: AppConfig;
}> {
  const config = makeTestConfig();
  const dbHandle = await createTestDb();
  const { db } = dbHandle;

  if (opts.seed !== false) {
    await seedIfEmpty(db, config);
  }

  const app = Fastify({ logger: false });
  registerErrorHandler(app);
  await app.register(authPlugin, {
    jwtAccessSecret: config.JWT_ACCESS_SECRET,
    jwtAccessTtl: config.JWT_ACCESS_TTL,
    db,
  });
  await registerAuthRoutes(app, { db, config });
  await registerUsersRoutes(app, { db });
  await registerSchoolRoutes(app, { db });
  await app.ready();

  return { app, db, dbHandle, config };
}

async function loginAs(app: FastifyInstance, username: string, password: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password, deviceLabel: 'vitest-client' },
  });
  return {
    statusCode: res.statusCode,
    body: res.json<{
      accessToken: string;
      refreshToken: string;
      user: {
        id: string;
        username: string;
        fullName: string;
        role: string;
        isActive: boolean;
      };
    }>(),
  };
}

describe('Auth, Users, School & Seed module', () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const fn = cleanups.pop();
      if (fn) await fn();
    }
  });

  describe('seedIfEmpty', () => {
    it('seeds school profile, initial admin, academic year 2026-2027, Cameroon rules and 3 trimesters + 6 sequences idempotently', async () => {
      const config = makeTestConfig();
      const dbHandle = await createTestDb();
      cleanups.push(() => dbHandle.close());
      const { db } = dbHandle;

      await seedIfEmpty(db, config);

      const profiles = await db.select().from(schoolProfile);
      expect(profiles).toHaveLength(1);
      expect(profiles[0]?.id).toBe(1);
      expect(profiles[0]?.country).toBe('République du Cameroun');

      const allUsers = await db.select().from(users);
      expect(allUsers).toHaveLength(1);
      expect(allUsers[0]?.username).toBe(config.ADMIN_INITIAL_USERNAME);
      expect(allUsers[0]?.fullName).toBe(config.ADMIN_INITIAL_FULLNAME);
      expect(allUsers[0]?.role).toBe('admin');
      expect(allUsers[0]?.isActive).toBe(true);

      const years = await db.select().from(academicYears);
      expect(years).toHaveLength(1);
      expect(years[0]?.label).toBe('2026-2027');
      expect(years[0]?.isActive).toBe(true);

      const rules = await db.select().from(gradingRules);
      expect(rules).toHaveLength(1);
      expect(rules[0]?.trimestersCount).toBe(CAMEROON_DEFAULT_GRADING_RULES.trimestersCount);
      expect(rules[0]?.sequencesPerTrimester).toBe(CAMEROON_DEFAULT_GRADING_RULES.sequencesPerTrimester);
      expect(rules[0]?.sequenceWeights).toEqual(CAMEROON_DEFAULT_GRADING_RULES.sequenceWeights);
      expect(rules[0]?.trimesterWeights).toEqual(CAMEROON_DEFAULT_GRADING_RULES.trimesterWeights);
      expect(Number(rules[0]?.passingThreshold)).toBe(CAMEROON_DEFAULT_GRADING_RULES.passingThreshold);
      expect(Number(rules[0]?.honorRollThreshold)).toBe(CAMEROON_DEFAULT_GRADING_RULES.honorRollThreshold);
      expect(rules[0]?.appreciationScale).toEqual(CAMEROON_DEFAULT_GRADING_RULES.appreciationScale);

      const allPeriods = await db.select().from(periods);
      const trimesters = allPeriods.filter((p) => p.type === 'trimester');
      const sequences = allPeriods.filter((p) => p.type === 'sequence');
      expect(trimesters).toHaveLength(3);
      expect(sequences).toHaveLength(6);

      const t1 = trimesters.find((t) => t.code === 'T1');
      const t2 = trimesters.find((t) => t.code === 'T2');
      const t3 = trimesters.find((t) => t.code === 'T3');
      expect(t1).toBeDefined();
      expect(t2).toBeDefined();
      expect(t3).toBeDefined();
      expect(sequences.filter((s) => s.parentPeriodId === t1?.id).map((s) => s.code).sort()).toEqual(['S1', 'S2']);
      expect(sequences.filter((s) => s.parentPeriodId === t2?.id).map((s) => s.code).sort()).toEqual(['S3', 'S4']);
      expect(sequences.filter((s) => s.parentPeriodId === t3?.id).map((s) => s.code).sort()).toEqual(['S5', 'S6']);

      // Update school profile, then re-run seedIfEmpty to verify idempotence
      await db
        .update(schoolProfile)
        .set({ name: 'Lycée Bilingue de Yaoundé' })
        .where(eq(schoolProfile.id, 1));

      await seedIfEmpty(db, config);

      expect(await db.select().from(users)).toHaveLength(1);
      expect(await db.select().from(academicYears)).toHaveLength(1);
      expect(await db.select().from(periods)).toHaveLength(9);
      const [updatedProfile] = await db.select().from(schoolProfile);
      expect(updatedProfile?.name).toBe('Lycée Bilingue de Yaoundé');
    });
  });

  describe('Auth endpoints (/api/auth/*)', () => {
    it('logs in, fetches /api/auth/me, rejects invalid credentials and inactive accounts', async () => {
      const { app, db, dbHandle, config } = await buildTestContext();
      cleanups.push(async () => {
        await app.close();
        await dbHandle.close();
      });

      const okLogin = await loginAs(app, config.ADMIN_INITIAL_USERNAME, config.ADMIN_INITIAL_PASSWORD);
      expect(okLogin.statusCode).toBe(200);
      expect(okLogin.body.accessToken).toBeTypeOf('string');
      expect(okLogin.body.refreshToken).toBeTypeOf('string');
      expect(okLogin.body.user.username).toBe(config.ADMIN_INITIAL_USERNAME);
      expect(okLogin.body.user.role).toBe('admin');
      expect('passwordHash' in okLogin.body.user).toBe(false);

      const meUnauth = await app.inject({ method: 'GET', url: '/api/auth/me' });
      expect(meUnauth.statusCode).toBe(401);

      const meAuth = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { authorization: `Bearer ${okLogin.body.accessToken}` },
      });
      expect(meAuth.statusCode).toBe(200);
      expect(meAuth.json()).toEqual(okLogin.body.user);

      const badPass = await loginAs(app, config.ADMIN_INITIAL_USERNAME, 'WrongPassword123!');
      expect(badPass.statusCode).toBe(401);

      const unknownUser = await loginAs(app, 'nobody', config.ADMIN_INITIAL_PASSWORD);
      expect(unknownUser.statusCode).toBe(401);

      const inactiveHash = await hashPassword('TeacherPass2026!');
      await db.insert(users).values({
        username: 'inactive.prof',
        fullName: 'Prof Inactif',
        role: 'teacher',
        passwordHash: inactiveHash,
        isActive: false,
      });

      const inactiveLogin = await loginAs(app, 'inactive.prof', 'TeacherPass2026!');
      expect(inactiveLogin.statusCode).toBe(401);
    });

    it('rotates refresh tokens atomically and revokes entire family on reuse detection', async () => {
      const { app, db, dbHandle, config } = await buildTestContext();
      cleanups.push(async () => {
        await app.close();
        await dbHandle.close();
      });

      const loginRes = await loginAs(app, config.ADMIN_INITIAL_USERNAME, config.ADMIN_INITIAL_PASSWORD);
      const rt1 = loginRes.body.refreshToken;

      const refresh1 = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: rt1 },
      });
      expect(refresh1.statusCode).toBe(200);
      const body1 = refresh1.json<{ accessToken: string; refreshToken: string; user: unknown }>();
      const rt2 = body1.refreshToken;
      expect(rt2).toBeTypeOf('string');
      expect(rt2).not.toBe(rt1);

      // Verify old token points to new token in the same family
      const [rt1Row] = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, hashToken(rt1)));
      const [rt2Row] = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, hashToken(rt2)));
      expect(rt1Row?.revokedAt).not.toBeNull();
      expect(rt1Row?.replacedById).toBe(rt2Row?.id);
      expect(rt1Row?.familyId).toBe(rt2Row?.familyId);

      // Reuse of rt1 -> must detect reuse, return 401, and revoke entire family (including rt2)
      const reuseRes = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: rt1 },
      });
      expect(reuseRes.statusCode).toBe(401);

      const refreshWithRt2 = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: rt2 },
      });
      expect(refreshWithRt2.statusCode).toBe(401);

      const [rt2AfterReuse] = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, hashToken(rt2)));
      expect(rt2AfterReuse?.revokedAt).not.toBeNull();
    });

    it('rejects expired refresh token and revokes token on logout', async () => {
      const { app, db, dbHandle, config } = await buildTestContext();
      cleanups.push(async () => {
        await app.close();
        await dbHandle.close();
      });

      const s1 = await loginAs(app, config.ADMIN_INITIAL_USERNAME, config.ADMIN_INITIAL_PASSWORD);
      const logoutRes = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        payload: { refreshToken: s1.body.refreshToken },
      });
      expect(logoutRes.statusCode).toBe(200);

      const afterLogoutRefresh = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: s1.body.refreshToken },
      });
      expect(afterLogoutRefresh.statusCode).toBe(401);

      // Test expired token
      const s2 = await loginAs(app, config.ADMIN_INITIAL_USERNAME, config.ADMIN_INITIAL_PASSWORD);
      await db
        .update(refreshTokens)
        .set({ expiresAt: new Date(Date.now() - 60_000) })
        .where(eq(refreshTokens.tokenHash, hashToken(s2.body.refreshToken)));

      const expiredRefresh = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: s2.body.refreshToken },
      });
      expect(expiredRefresh.statusCode).toBe(401);
    });

    it('changes password, validates currentPassword, and revokes active refresh tokens', async () => {
      const { app, dbHandle, config } = await buildTestContext();
      cleanups.push(async () => {
        await app.close();
        await dbHandle.close();
      });

      const session = await loginAs(app, config.ADMIN_INITIAL_USERNAME, config.ADMIN_INITIAL_PASSWORD);

      const wrongCurrent = await app.inject({
        method: 'POST',
        url: '/api/auth/change-password',
        headers: { authorization: `Bearer ${session.body.accessToken}` },
        payload: {
          currentPassword: 'NotThePassword!',
          newPassword: 'NewAdminPassword2026!',
        },
      });
      expect(wrongCurrent.statusCode).toBe(401);

      const changeOk = await app.inject({
        method: 'POST',
        url: '/api/auth/change-password',
        headers: { authorization: `Bearer ${session.body.accessToken}` },
        payload: {
          currentPassword: config.ADMIN_INITIAL_PASSWORD,
          newPassword: 'NewAdminPassword2026!',
        },
      });
      expect(changeOk.statusCode).toBe(200);

      // Refresh token from before password change must be revoked
      const refreshAfterChange = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: session.body.refreshToken },
      });
      expect(refreshAfterChange.statusCode).toBe(401);

      const oldPassLogin = await loginAs(app, config.ADMIN_INITIAL_USERNAME, config.ADMIN_INITIAL_PASSWORD);
      expect(oldPassLogin.statusCode).toBe(401);

      const newPassLogin = await loginAs(app, config.ADMIN_INITIAL_USERNAME, 'NewAdminPassword2026!');
      expect(newPassLogin.statusCode).toBe(200);
    });
  });

  describe('Users & RBAC endpoints (/api/users/*)', () => {
    it('enforces CRUD, RBAC rules, uniqueness checks, deactivation token revocation and password reset', async () => {
      const { app, dbHandle, config } = await buildTestContext();
      cleanups.push(async () => {
        await app.close();
        await dbHandle.close();
      });

      const adminLogin = await loginAs(app, config.ADMIN_INITIAL_USERNAME, config.ADMIN_INITIAL_PASSWORD);
      const adminToken = adminLogin.body.accessToken;

      // Admin creates censor, teacher, secretary, and a second admin
      const createCensor = await app.inject({
        method: 'POST',
        url: '/api/users',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          username: 'censor1',
          email: 'censor@lycee.cm',
          fullName: 'Censeur Principal',
          role: 'censor',
          password: 'CensorPassword2026!',
        },
      });
      expect(createCensor.statusCode).toBe(201);
      const censorDto = createCensor.json<Record<string, unknown>>();
      expect('passwordHash' in censorDto).toBe(false);
      expect(censorDto.role).toBe('censor');

      const createTeacher = await app.inject({
        method: 'POST',
        url: '/api/users',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          username: 'prof.maths',
          email: 'maths@lycee.cm',
          fullName: 'Professeur Maths',
          role: 'teacher',
          password: 'TeacherPassword2026!',
        },
      });
      expect(createTeacher.statusCode).toBe(201);
      const teacherDto = createTeacher.json<{ id: string; username: string }>();

      const createSecretary = await app.inject({
        method: 'POST',
        url: '/api/users',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          username: 'sec1',
          fullName: 'Secrétaire Scolarité',
          role: 'secretary',
          password: 'SecretaryPassword2026!',
        },
      });
      expect(createSecretary.statusCode).toBe(201);

      const createAdmin2 = await app.inject({
        method: 'POST',
        url: '/api/users',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          username: 'admin2',
          fullName: 'Second Admin',
          role: 'admin',
          password: 'Admin2Password2026!',
        },
      });
      expect(createAdmin2.statusCode).toBe(201);
      const admin2Dto = createAdmin2.json<{ id: string }>();

      // Duplicate username or email -> 409 Conflict
      const dupUsername = await app.inject({
        method: 'POST',
        url: '/api/users',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          username: 'prof.maths',
          fullName: 'Duplicate',
          role: 'teacher',
          password: 'TeacherPassword2026!',
        },
      });
      expect(dupUsername.statusCode).toBe(409);

      const dupEmail = await app.inject({
        method: 'POST',
        url: '/api/users',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          username: 'prof.physique',
          email: 'maths@lycee.cm',
          fullName: 'Duplicate Email',
          role: 'teacher',
          password: 'TeacherPassword2026!',
        },
      });
      expect(dupEmail.statusCode).toBe(409);

      // Login as censor, teacher, secretary
      const censorLogin = await loginAs(app, 'censor1', 'CensorPassword2026!');
      const censorToken = censorLogin.body.accessToken;

      const teacherLogin = await loginAs(app, 'prof.maths', 'TeacherPassword2026!');
      const teacherToken = teacherLogin.body.accessToken;
      const teacherRefresh = teacherLogin.body.refreshToken;

      const secretaryLogin = await loginAs(app, 'sec1', 'SecretaryPassword2026!');
      const secretaryToken = secretaryLogin.body.accessToken;

      // Censor CANNOT create an admin -> 403
      const censorCreateAdmin = await app.inject({
        method: 'POST',
        url: '/api/users',
        headers: { authorization: `Bearer ${censorToken}` },
        payload: {
          username: 'rogue.admin',
          fullName: 'Rogue Admin',
          role: 'admin',
          password: 'RoguePassword2026!',
        },
      });
      expect(censorCreateAdmin.statusCode).toBe(403);

      // Censor CAN create a teacher
      const censorCreateTeacher = await app.inject({
        method: 'POST',
        url: '/api/users',
        headers: { authorization: `Bearer ${censorToken}` },
        payload: {
          username: 'prof.francais',
          fullName: 'Professeur Français',
          role: 'teacher',
          password: 'TeacherPassword2026!',
        },
      });
      expect(censorCreateTeacher.statusCode).toBe(201);

      // Censor CANNOT modify an admin or promote a teacher to admin -> 403
      const censorModifyAdmin = await app.inject({
        method: 'PATCH',
        url: `/api/users/${admin2Dto.id}`,
        headers: { authorization: `Bearer ${censorToken}` },
        payload: { fullName: 'Hacked Admin' },
      });
      expect(censorModifyAdmin.statusCode).toBe(403);

      const censorPromoteToAdmin = await app.inject({
        method: 'PATCH',
        url: `/api/users/${teacherDto.id}`,
        headers: { authorization: `Bearer ${censorToken}` },
        payload: { role: 'admin' },
      });
      expect(censorPromoteToAdmin.statusCode).toBe(403);

      // Censor CAN modify a teacher
      const censorModifyTeacher = await app.inject({
        method: 'PATCH',
        url: `/api/users/${teacherDto.id}`,
        headers: { authorization: `Bearer ${censorToken}` },
        payload: { fullName: 'Professeur Mathématiques' },
      });
      expect(censorModifyTeacher.statusCode).toBe(200);
      expect(censorModifyTeacher.json<{ fullName: string }>().fullName).toBe('Professeur Mathématiques');

      // Teacher is FORBIDDEN on /api/users
      const teacherList = await app.inject({
        method: 'GET',
        url: '/api/users',
        headers: { authorization: `Bearer ${teacherToken}` },
      });
      expect(teacherList.statusCode).toBe(403);

      const teacherCreate = await app.inject({
        method: 'POST',
        url: '/api/users',
        headers: { authorization: `Bearer ${teacherToken}` },
        payload: {
          username: 'x.user',
          fullName: 'X User',
          role: 'teacher',
          password: 'Password2026!',
        },
      });
      expect(teacherCreate.statusCode).toBe(403);

      // Secretary & Admin CAN list users and filter by ?role=teacher, without passwordHash
      const secretaryList = await app.inject({
        method: 'GET',
        url: '/api/users?role=teacher',
        headers: { authorization: `Bearer ${secretaryToken}` },
      });
      expect(secretaryList.statusCode).toBe(200);
      const teachersList = secretaryList.json<Array<Record<string, unknown>>>();
      expect(teachersList).toHaveLength(2);
      for (const u of teachersList) {
        expect(u.role).toBe('teacher');
        expect('passwordHash' in u).toBe(false);
      }

      // Admin reset password revokes active tokens and allows login with new password
      const censorResetAttempt = await app.inject({
        method: 'POST',
        url: `/api/users/${teacherDto.id}/reset-password`,
        headers: { authorization: `Bearer ${censorToken}` },
        payload: { newPassword: 'ResetByCensor2026!' },
      });
      expect(censorResetAttempt.statusCode).toBe(403);

      const adminReset = await app.inject({
        method: 'POST',
        url: `/api/users/${teacherDto.id}/reset-password`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { newPassword: 'ResetPassword2026!' },
      });
      expect(adminReset.statusCode).toBe(200);

      const refreshRevokedByReset = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: teacherRefresh },
      });
      expect(refreshRevokedByReset.statusCode).toBe(401);

      const teacherRelogin = await loginAs(app, 'prof.maths', 'ResetPassword2026!');
      expect(teacherRelogin.statusCode).toBe(200);

      // Admin deactivates teacher -> revokes all refreshTokens and blocks /api/auth/me
      const deactivateTeacher = await app.inject({
        method: 'PATCH',
        url: `/api/users/${teacherDto.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { isActive: false },
      });
      expect(deactivateTeacher.statusCode).toBe(200);

      const deactivatedRefresh = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: teacherRelogin.body.refreshToken },
      });
      expect(deactivatedRefresh.statusCode).toBe(401);

      const deactivatedMe = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { authorization: `Bearer ${teacherRelogin.body.accessToken}` },
      });
      expect(deactivatedMe.statusCode).toBe(401);
    });
  });

  describe('School profile & logo endpoints (/api/school*)', () => {
    it('returns default DTO when school_profile row id=1 does not exist yet', async () => {
      const { app, db, dbHandle } = await buildTestContext({ seed: false });
      cleanups.push(async () => {
        await app.close();
        await dbHandle.close();
      });

      const passwordHash = await hashPassword('TeacherPass2026!');
      await db.insert(users).values({
        username: 'prof1',
        fullName: 'Professeur Un',
        role: 'teacher',
        passwordHash,
        isActive: true,
      });

      const unauth = await app.inject({ method: 'GET', url: '/api/school' });
      expect(unauth.statusCode).toBe(401);

      const login = await loginAs(app, 'prof1', 'TeacherPass2026!');
      const schoolRes = await app.inject({
        method: 'GET',
        url: '/api/school',
        headers: { authorization: `Bearer ${login.body.accessToken}` },
      });
      expect(schoolRes.statusCode).toBe(200);
      const profile = schoolRes.json<SchoolProfileDto>();
      expect(profile.id).toBe(1);
      expect(profile.hasLogo).toBe(false);
      expect(profile.logoMimeType).toBeNull();
      expect(profile.name.length).toBeGreaterThan(0);

      const missingLogo = await app.inject({
        method: 'GET',
        url: '/api/school/logo',
        headers: { authorization: `Bearer ${login.body.accessToken}` },
      });
      expect(missingLogo.statusCode).toBe(404);
    });

    it('allows admin to update school profile and upload/download PNG logo while rejecting oversized logos and non-admins', async () => {
      const { app, dbHandle, config } = await buildTestContext();
      cleanups.push(async () => {
        await app.close();
        await dbHandle.close();
      });

      const adminLogin = await loginAs(app, config.ADMIN_INITIAL_USERNAME, config.ADMIN_INITIAL_PASSWORD);
      const adminToken = adminLogin.body.accessToken;

      const createTeacher = await app.inject({
        method: 'POST',
        url: '/api/users',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          username: 'prof.svt',
          fullName: 'Prof SVT',
          role: 'teacher',
          password: 'TeacherPassword2026!',
        },
      });
      expect(createTeacher.statusCode).toBe(201);
      const teacherLogin = await loginAs(app, 'prof.svt', 'TeacherPassword2026!');
      const teacherToken = teacherLogin.body.accessToken;

      // Teacher cannot PUT /api/school or PUT /api/school/logo
      const teacherPutSchool = await app.inject({
        method: 'PUT',
        url: '/api/school',
        headers: { authorization: `Bearer ${teacherToken}` },
        payload: { name: 'Lycée Modifié' },
      });
      expect(teacherPutSchool.statusCode).toBe(403);

      const teacherPutLogo = await app.inject({
        method: 'PUT',
        url: '/api/school/logo',
        headers: { authorization: `Bearer ${teacherToken}` },
        payload: { mimeType: 'image/png', dataBase64: TINY_PNG_BASE64 },
      });
      expect(teacherPutLogo.statusCode).toBe(403);

      // Admin updates school profile
      const updateSchool = await app.inject({
        method: 'PUT',
        url: '/api/school',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: 'Lycée Général Leclerc',
          motto: 'Paix - Travail - Patrie',
          region: 'Centre',
          delegation: 'Mfoundi',
          city: 'Yaoundé',
          phone: '+237 222 22 22 22',
          email: 'contact@leclerc.cm',
        },
      });
      expect(updateSchool.statusCode).toBe(200);
      const updatedDto = updateSchool.json<SchoolProfileDto>();
      expect(updatedDto.name).toBe('Lycée Général Leclerc');
      expect(updatedDto.city).toBe('Yaoundé');
      expect(updatedDto.hasLogo).toBe(false);

      // Oversized logo (> 512 * 1024 bytes) must be rejected with 400
      const oversizedBase64 = Buffer.alloc(512 * 1024 + 1, 0xaa).toString('base64');
      const oversizedRes = await app.inject({
        method: 'PUT',
        url: '/api/school/logo',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          mimeType: 'image/png',
          dataBase64: oversizedBase64,
        },
      });
      expect(oversizedRes.statusCode).toBe(400);

      // Valid PNG logo upload
      const uploadLogo = await app.inject({
        method: 'PUT',
        url: '/api/school/logo',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          mimeType: 'image/png',
          dataBase64: TINY_PNG_BASE64,
        },
      });
      expect(uploadLogo.statusCode).toBe(200);
      const afterUpload = uploadLogo.json<SchoolProfileDto>();
      expect(afterUpload.hasLogo).toBe(true);
      expect(afterUpload.logoMimeType).toBe('image/png');

      // Updating school profile afterward preserves the uploaded logo
      const updateSchoolAgain = await app.inject({
        method: 'PUT',
        url: '/api/school',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: 'Lycée Général Leclerc de Yaoundé',
        },
      });
      expect(updateSchoolAgain.statusCode).toBe(200);
      expect(updateSchoolAgain.json<SchoolProfileDto>().hasLogo).toBe(true);

      // Authenticated user downloads raw PNG bytes with Content-Type: image/png
      const downloadLogo = await app.inject({
        method: 'GET',
        url: '/api/school/logo',
        headers: { authorization: `Bearer ${teacherToken}` },
      });
      expect(downloadLogo.statusCode).toBe(200);
      expect(downloadLogo.headers['content-type']).toBe('image/png');
      expect(downloadLogo.rawPayload.equals(Buffer.from(TINY_PNG_BASE64, 'base64'))).toBe(true);
    });
  });
});
