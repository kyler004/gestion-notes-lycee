import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { BulletinReportPayload, ClassListReportPayload, HonorRollReportPayload } from '@lycee/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { parseEnv, type AppConfig } from '../config/env.js';
import { seedIfEmpty } from '../db/seed.js';
import { createTestDb, type TestDbHandle } from '../db/test-helpers.js';
import { type PdfRenderer, TypstPdfRenderer } from '../services/pdf.service.js';

const ONE_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function isTypstAvailable(bin: string): boolean {
  try {
    execFileSync(bin, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return existsSync(bin);
  }
}

function createFallbackMockPdfRenderer(): PdfRenderer {
  const buildFakePdf = (tag: string, payload: unknown): Buffer => {
    const marker = `%PDF-1.7\n% ${tag} ${JSON.stringify(payload).slice(0, 120)}\n%%EOF\n`;
    return Buffer.from(marker, 'utf8');
  };
  return {
    async renderBulletin(payload: BulletinReportPayload): Promise<Buffer> {
      return buildFakePdf('bulletin', { period: payload.period.code, count: payload.students.length });
    },
    async renderClassList(payload: ClassListReportPayload): Promise<Buffer> {
      return buildFakePdf('class-list', { className: payload.classInfo.name, count: payload.students.length });
    },
    async renderHonorRoll(payload: HonorRollReportPayload): Promise<Buffer> {
      return buildFakePdf('honor-roll', { period: payload.period.code, count: payload.entries.length });
    },
  };
}

describe('E2E Backend MVP Workflow', () => {
  let dbHandle: TestDbHandle;
  let config: AppConfig;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let usingRealTypst = false;

  beforeAll(async () => {
    dbHandle = await createTestDb();
    config = parseEnv({
      NODE_ENV: 'test',
      JWT_ACCESS_SECRET: 'e2e-test-access-secret-at-least-32-chars',
      JWT_REFRESH_SECRET: 'e2e-test-refresh-secret-at-least-32-chars',
      TYPST_BIN: process.env.TYPST_BIN ?? 'typst',
      ADMIN_INITIAL_USERNAME: 'admin',
      ADMIN_INITIAL_PASSWORD: 'AdminPassword123!',
      ADMIN_INITIAL_FULLNAME: 'Administrateur E2E',
    });

    await seedIfEmpty(dbHandle.db, config);

    usingRealTypst = isTypstAvailable(config.TYPST_BIN);
    const pdfRenderer = usingRealTypst
      ? new TypstPdfRenderer(config.TYPST_BIN)
      : createFallbackMockPdfRenderer();

    app = await buildApp({
      db: dbHandle.db,
      config,
      pdfRenderer,
      enableRateLimit: false,
      logger: false,
    });
  });

  afterAll(async () => {
    await app.close();
    await dbHandle.close();
  });

  it('executes full school grading workflow from seed and offline sync to locking and PDF generation', async () => {
    // 1. Healthcheck
    const healthRes = await app.inject({ method: 'GET', url: '/health' });
    expect(healthRes.statusCode).toBe(200);
    expect(healthRes.json().status).toBe('ok');

    // 2. Admin login & School profile + logo upload
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'AdminPassword123!' },
    });
    expect(adminLogin.statusCode).toBe(200);
    const adminToken = adminLogin.json().accessToken as string;
    const adminAuth = { authorization: `Bearer ${adminToken}` };

    const updateSchool = await app.inject({
      method: 'PUT',
      url: '/api/school',
      headers: adminAuth,
      payload: {
        name: 'Lycée Bilingue de Yaoundé',
        motto: 'Discipline - Travail - Excellence',
        region: 'Centre',
        delegation: 'Mfoundi',
        city: 'Yaoundé',
        phone: '+237 600 00 00 00',
        email: 'contact@lby.cm',
      },
    });
    expect(updateSchool.statusCode).toBe(200);

    const uploadLogo = await app.inject({
      method: 'PUT',
      url: '/api/school/logo',
      headers: adminAuth,
      payload: { mimeType: 'image/png', dataBase64: ONE_PIXEL_PNG_BASE64 },
    });
    expect(uploadLogo.statusCode).toBe(200);
    expect(uploadLogo.json().hasLogo).toBe(true);

    const getLogo = await app.inject({
      method: 'GET',
      url: '/api/school/logo',
      headers: adminAuth,
    });
    expect(getLogo.statusCode).toBe(200);
    expect(getLogo.headers['content-type']).toContain('image/png');

    // 3. Fetch seeded active academic year & periods
    const yearsRes = await app.inject({ method: 'GET', url: '/api/academic-years', headers: adminAuth });
    expect(yearsRes.statusCode).toBe(200);
    const yearId = yearsRes.json().academicYears[0].id as string;

    const periodsRes = await app.inject({
      method: 'GET',
      url: `/api/academic-years/${yearId}/periods`,
      headers: adminAuth,
    });
    expect(periodsRes.statusCode).toBe(200);
    const periodList = periodsRes.json().periods as Array<{ id: string; code: string }>;
    const t1 = periodList.find((p) => p.code === 'T1')!;
    const s1 = periodList.find((p) => p.code === 'S1')!;
    const s2 = periodList.find((p) => p.code === 'S2')!;
    const s3 = periodList.find((p) => p.code === 'S3')!;
    expect(t1 && s1 && s2 && s3).toBeTruthy();

    // 4. Create censor, teachers, secretary
    const createUser = async (username: string, fullName: string, role: string) => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/users',
        headers: adminAuth,
        payload: { username, fullName, role, password: 'UserPass123!' },
      });
      expect(res.statusCode).toBe(201);
      return res.json().id as string;
    };

    await createUser('censeur1', 'Mme Censeur', 'censor');
    const teacher1Id = await createUser('prof_math', 'M. Kamga Math', 'teacher');
    const teacher2Id = await createUser('prof_phys', 'Mme Ngo Phys', 'teacher');
    await createUser('sec1', 'M. Secrétaire', 'secretary');

    // 5. Create class, subject group, subjects, classSubjects, assignments, students & enrollments
    const classRes = await app.inject({
      method: 'POST',
      url: '/api/classes',
      headers: adminAuth,
      payload: {
        academicYearId: yearId,
        name: 'Tle C1',
        level: 'Terminale',
        series: 'C',
        mainTeacherId: teacher1Id,
      },
    });
    expect(classRes.statusCode).toBe(201);
    const classId = classRes.json().id as string;

    const grpRes = await app.inject({
      method: 'POST',
      url: '/api/subject-groups',
      headers: adminAuth,
      payload: { academicYearId: yearId, name: '1er Groupe (Scientifique)', orderIndex: 1 },
    });
    expect(grpRes.statusCode).toBe(201);
    const groupId = grpRes.json().id as string;

    const mathSubRes = await app.inject({
      method: 'POST',
      url: '/api/subjects',
      headers: adminAuth,
      payload: { code: 'MATH', name: 'Mathématiques', shortName: 'Math' },
    });
    const physSubRes = await app.inject({
      method: 'POST',
      url: '/api/subjects',
      headers: adminAuth,
      payload: { code: 'PHYS', name: 'Physique', shortName: 'Phys' },
    });
    const mathSubId = mathSubRes.json().id as string;
    const physSubId = physSubRes.json().id as string;

    const csMathRes = await app.inject({
      method: 'PUT',
      url: '/api/class-subjects',
      headers: adminAuth,
      payload: { classId, subjectId: mathSubId, subjectGroupId: groupId, coefficient: 6 },
    });
    const csPhysRes = await app.inject({
      method: 'PUT',
      url: '/api/class-subjects',
      headers: adminAuth,
      payload: { classId, subjectId: physSubId, subjectGroupId: groupId, coefficient: 4 },
    });
    const csMathId = csMathRes.json().id as string;
    const csPhysId = csPhysRes.json().id as string;

    await app.inject({
      method: 'POST',
      url: '/api/teacher-assignments',
      headers: adminAuth,
      payload: { teacherId: teacher1Id, classSubjectId: csMathId, academicYearId: yearId },
    });
    await app.inject({
      method: 'POST',
      url: '/api/teacher-assignments',
      headers: adminAuth,
      payload: { teacherId: teacher2Id, classSubjectId: csPhysId, academicYearId: yearId },
    });

    const enrollStudent = async (matricule: string, lastName: string, firstName: string, sex: 'M' | 'F') => {
      const stRes = await app.inject({
        method: 'POST',
        url: '/api/students',
        headers: adminAuth,
        payload: {
          matricule,
          lastName,
          firstName,
          birthDate: '2008-05-14',
          birthPlace: 'Yaoundé',
          sex,
        },
      });
      expect(stRes.statusCode).toBe(201);
      const enrRes = await app.inject({
        method: 'POST',
        url: '/api/enrollments',
        headers: adminAuth,
        payload: { studentId: stRes.json().id, classId, academicYearId: yearId, isRepeater: false },
      });
      expect(enrRes.statusCode).toBe(201);
      return enrRes.json().id as string;
    };

    const enrAlice = await enrollStudent('26TC001', 'Mbarga', 'Alice', 'F');
    const enrBob = await enrollStudent('26TC002', 'Tchatchouang', 'Bob', 'M');
    const enrChloe = await enrollStudent('26TC003', 'Fokou', 'Chloé', 'F');

    // 6. Teacher 1 login, sync pull, and offline outbox push (including idempotency replay)
    const t1Login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'prof_math', password: 'UserPass123!' },
    });
    const t1Auth = { authorization: `Bearer ${t1Login.json().accessToken as string}` };

    const t1Pull = await app.inject({
      method: 'GET',
      url: '/api/sync/pull?since=0',
      headers: t1Auth,
    });
    expect(t1Pull.statusCode).toBe(200);
    expect(t1Pull.json().teacherAssignments).toHaveLength(1);
    expect(t1Pull.json().students).toHaveLength(3);

    const nowMs = Date.now();
    const op1Ts = new Date(nowMs - 3600_000).toISOString();

    const op1 = randomUUID();
    const t1Push = await app.inject({
      method: 'POST',
      url: '/api/sync/push',
      headers: t1Auth,
      payload: {
        operations: [
          {
            operationId: op1,
            type: 'UPSERT_GRADE',
            clientTimestamp: op1Ts,
            payload: { enrollmentId: enrAlice, classSubjectId: csMathId, periodId: s1.id, score: 15, status: 'present' },
          },
          {
            operationId: randomUUID(),
            type: 'UPSERT_GRADE',
            clientTimestamp: new Date(nowMs - 3500_000).toISOString(),
            payload: { enrollmentId: enrBob, classSubjectId: csMathId, periodId: s1.id, score: 15, status: 'present' },
          },
          {
            operationId: randomUUID(),
            type: 'UPSERT_GRADE',
            clientTimestamp: new Date(nowMs - 3400_000).toISOString(),
            payload: { enrollmentId: enrChloe, classSubjectId: csMathId, periodId: s1.id, score: 9, status: 'present' },
          },
          {
            operationId: randomUUID(),
            type: 'UPSERT_GRADE',
            clientTimestamp: new Date(nowMs - 1800_000).toISOString(),
            payload: { enrollmentId: enrAlice, classSubjectId: csMathId, periodId: s2.id, score: 15, status: 'present' },
          },
          {
            operationId: randomUUID(),
            type: 'UPSERT_GRADE',
            clientTimestamp: new Date(nowMs - 1700_000).toISOString(),
            payload: { enrollmentId: enrBob, classSubjectId: csMathId, periodId: s2.id, score: 15, status: 'present' },
          },
          {
            operationId: randomUUID(),
            type: 'UPSERT_GRADE',
            clientTimestamp: new Date(nowMs - 1600_000).toISOString(),
            payload: { enrollmentId: enrChloe, classSubjectId: csMathId, periodId: s2.id, score: 9, status: 'present' },
          },
        ],
      },
    });
    expect(t1Push.statusCode).toBe(200);
    expect(t1Push.json().results.every((r: { outcome: string }) => r.outcome === 'applied')).toBe(true);

    // Replay op1 -> duplicate
    const t1Replay = await app.inject({
      method: 'POST',
      url: '/api/sync/push',
      headers: t1Auth,
      payload: {
        operations: [
          {
            operationId: op1,
            type: 'UPSERT_GRADE',
            clientTimestamp: op1Ts,
            payload: { enrollmentId: enrAlice, classSubjectId: csMathId, periodId: s1.id, score: 15, status: 'present' },
          },
        ],
      },
    });
    expect(t1Replay.statusCode).toBe(200);
    expect(t1Replay.json().results[0].outcome).toBe('duplicate');

    // Teacher 2 enters Physics grades
    const t2Login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'prof_phys', password: 'UserPass123!' },
    });
    const t2Auth = { authorization: `Bearer ${t2Login.json().accessToken as string}` };

    const t2Grades = await app.inject({
      method: 'PUT',
      url: '/api/grades/bulk',
      headers: t2Auth,
      payload: {
        entries: [
          { enrollmentId: enrAlice, classSubjectId: csPhysId, periodId: s1.id, score: 14, status: 'present' },
          { enrollmentId: enrBob, classSubjectId: csPhysId, periodId: s1.id, score: 14, status: 'present' },
          { enrollmentId: enrChloe, classSubjectId: csPhysId, periodId: s1.id, score: 8, status: 'present' },
          { enrollmentId: enrAlice, classSubjectId: csPhysId, periodId: s2.id, score: 14, status: 'present' },
          { enrollmentId: enrBob, classSubjectId: csPhysId, periodId: s2.id, score: 14, status: 'present' },
          { enrollmentId: enrChloe, classSubjectId: csPhysId, periodId: s2.id, score: null, status: 'excused' },
        ],
      },
    });
    expect(t2Grades.statusCode).toBe(200);

    // 7. Censor validates completeness, locks S1 & S2, sets council decisions, locks T1
    const censorLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'censeur1', password: 'UserPass123!' },
    });
    const censorAuth = { authorization: `Bearer ${censorLogin.json().accessToken as string}` };

    const compRes = await app.inject({
      method: 'GET',
      url: `/api/periods/${s1.id}/completeness`,
      headers: censorAuth,
    });
    expect(compRes.statusCode).toBe(200);
    expect(compRes.json().isComplete).toBe(true);

    expect((await app.inject({ method: 'POST', url: `/api/periods/${s1.id}/lock`, headers: censorAuth, payload: {} })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: `/api/periods/${s2.id}/lock`, headers: censorAuth, payload: {} })).statusCode).toBe(200);

    const councilRes = await app.inject({
      method: 'PUT',
      url: '/api/council-decisions/bulk',
      headers: censorAuth,
      payload: {
        decisions: [
          { enrollmentId: enrAlice, periodId: t1.id, generalAppreciation: 'Excellent trimestre', decision: 'encouragement', absencesHours: 0 },
          { enrollmentId: enrBob, periodId: t1.id, generalAppreciation: 'Très sérieux', decision: 'encouragement', absencesHours: 2 },
          { enrollmentId: enrChloe, periodId: t1.id, generalAppreciation: 'Doit redoubler d’efforts', decision: 'warning', absencesHours: 4 },
        ],
      },
    });
    expect(councilRes.statusCode).toBe(200);

    const lockT1 = await app.inject({
      method: 'POST',
      url: `/api/periods/${t1.id}/lock`,
      headers: censorAuth,
      payload: { reason: 'Validation conseil T1' },
    });
    expect(lockT1.statusCode).toBe(200);
    expect(lockT1.json().period.status).toBe('locked');

    // 8. Offline push batch against locked S1 + open S3
    const mixedPush = await app.inject({
      method: 'POST',
      url: '/api/sync/push',
      headers: t1Auth,
      payload: {
        operations: [
          {
            operationId: randomUUID(),
            type: 'UPSERT_GRADE',
            clientTimestamp: new Date(Date.now() - 60_000).toISOString(),
            payload: { enrollmentId: enrAlice, classSubjectId: csMathId, periodId: s1.id, score: 19, status: 'present' },
          },
          {
            operationId: randomUUID(),
            type: 'UPSERT_GRADE',
            clientTimestamp: new Date(Date.now() - 30_000).toISOString(),
            payload: { enrollmentId: enrAlice, classSubjectId: csMathId, periodId: s3.id, score: 16, status: 'present' },
          },
        ],
      },
    });
    expect(mixedPush.statusCode).toBe(200);
    expect(mixedPush.json().results[0].outcome).toBe('rejected_locked');
    expect(mixedPush.json().results[1].outcome).toBe('applied');

    // 9. Exceptional unlock RBAC & hierarchy invariant check (Q1, SEC-HIGH-07)
    const censorUnlock = await app.inject({
      method: 'POST',
      url: `/api/periods/${s1.id}/unlock`,
      headers: censorAuth,
      payload: { reason: 'Tentative par censeur' },
    });
    expect(censorUnlock.statusCode).toBe(403);

    const adminBadUnlock = await app.inject({
      method: 'POST',
      url: `/api/periods/${s1.id}/unlock`,
      headers: adminAuth,
      payload: { reason: 'Non' },
    });
    expect(adminBadUnlock.statusCode).toBe(400);

    // Cannot unlock child S1 while parent trimester T1 is still locked (409 Conflict)
    const blockedChildUnlock = await app.inject({
      method: 'POST',
      url: `/api/periods/${s1.id}/unlock`,
      headers: adminAuth,
      payload: { reason: 'Correction erreur de report validée en conseil' },
    });
    expect(blockedChildUnlock.statusCode).toBe(409);

    // Unlock parent trimester T1 first, then unlock S1, then re-lock S1 & T1
    const unlockT1 = await app.inject({
      method: 'POST',
      url: `/api/periods/${t1.id}/unlock`,
      headers: adminAuth,
      payload: { reason: 'Réouverture trimestre T1 pour correction S1' },
    });
    expect(unlockT1.statusCode).toBe(200);
    expect(unlockT1.json().period.status).toBe('open');

    const adminUnlock = await app.inject({
      method: 'POST',
      url: `/api/periods/${s1.id}/unlock`,
      headers: adminAuth,
      payload: { reason: 'Correction erreur de report validée en conseil' },
    });
    expect(adminUnlock.statusCode).toBe(200);
    expect(adminUnlock.json().period.status).toBe('open');
    if (process.env.REQUIRE_REAL_TYPST === '1') {
      expect(usingRealTypst).toBe(true);
    }

    // Re-lock S1 and T1
    expect((await app.inject({ method: 'POST', url: `/api/periods/${s1.id}/lock`, headers: adminAuth, payload: {} })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: `/api/periods/${t1.id}/lock`, headers: adminAuth, payload: { reason: 'Revalidation T1' } })).statusCode).toBe(200);

    // 10. Official Trimester Results, Tie Ranking (1, 1, 3), Sequence Details (Q2), Honor Roll & School Stats
    const secLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'sec1', password: 'UserPass123!' },
    });
    const secAuth = { authorization: `Bearer ${secLogin.json().accessToken as string}` };

    const t1ResultsRes = await app.inject({
      method: 'GET',
      url: `/api/reports/class-results?classId=${classId}&periodId=${t1.id}`,
      headers: secAuth,
    });
    expect(t1ResultsRes.statusCode).toBe(200);
    const t1Report = t1ResultsRes.json();
    expect(t1Report.isOfficial).toBe(true);
    expect(t1Report.fromSnapshot).toBe(true);

    const alice = t1Report.students.find((s: { enrollmentId: string }) => s.enrollmentId === enrAlice);
    const bob = t1Report.students.find((s: { enrollmentId: string }) => s.enrollmentId === enrBob);
    const chloe = t1Report.students.find((s: { enrollmentId: string }) => s.enrollmentId === enrChloe);

    // Alice & Bob: (15*6 + 14*4)/10 = 14.60 -> rank 1 ex aequo; Chloe: (9*6 + 8*4)/10 = 8.60 -> rank 3
    expect(alice.generalAverage).toBe(14.6);
    expect(bob.generalAverage).toBe(14.6);
    expect(alice.rank).toBe(1);
    expect(bob.rank).toBe(1);
    expect(chloe.generalAverage).toBe(8.6);
    expect(chloe.rank).toBe(3);

    // Q2: constituent sequenceScores present on trimester report
    const chloePhys = chloe.subjects.find((s: { subjectCode: string }) => s.subjectCode === 'PHYS');
    expect(chloePhys.sequenceScores).toHaveLength(2);
    expect(chloePhys.sequenceScores[0].code).toBe('S1');
    expect(chloePhys.sequenceScores[0].score).toBe(8);
    expect(chloePhys.sequenceScores[1].code).toBe('S2');
    expect(chloePhys.sequenceScores[1].status).toBe('excused');
    expect(chloePhys.average).toBe(8);

    const honorRollRes = await app.inject({
      method: 'GET',
      url: `/api/reports/honor-roll?classId=${classId}&periodId=${t1.id}`,
      headers: secAuth,
    });
    expect(honorRollRes.statusCode).toBe(200);
    expect(honorRollRes.json().entries).toHaveLength(2);

    const statsRes = await app.inject({
      method: 'GET',
      url: `/api/reports/school-stats?academicYearId=${yearId}&periodId=${t1.id}`,
      headers: censorAuth,
    });
    expect(statsRes.statusCode).toBe(200);
    expect(statsRes.json().totalStudents).toBe(3);
    expect(statsRes.json().classes[0].passRate).toBe(66.67);

    // 11. PDF endpoints + ETag + 304 + real Typst compilation if installed
    const studentPdfRes = await app.inject({
      method: 'GET',
      url: `/api/reports/bulletins/student/${enrAlice}/pdf?periodId=${t1.id}`,
      headers: secAuth,
    });
    expect(studentPdfRes.statusCode).toBe(200);
    expect(studentPdfRes.headers['content-type']).toBe('application/pdf');
    expect(studentPdfRes.rawPayload.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    const etag = studentPdfRes.headers.etag as string;
    expect(etag).toBeTruthy();

    const cachedRes = await app.inject({
      method: 'GET',
      url: `/api/reports/bulletins/student/${enrAlice}/pdf?periodId=${t1.id}`,
      headers: { ...secAuth, 'if-none-match': etag },
    });
    expect(cachedRes.statusCode).toBe(304);

    for (const url of [
      `/api/reports/bulletins/class/${classId}/pdf?periodId=${t1.id}`,
      `/api/reports/bulletins/class/${classId}/pdf?periodId=${s3.id}`,
      `/api/reports/honor-roll/${classId}/pdf?periodId=${t1.id}`,
      `/api/reports/class-list/${classId}/pdf`,
    ]) {
      const pdfRes = await app.inject({ method: 'GET', url, headers: secAuth });
      expect(pdfRes.statusCode).toBe(200);
      expect(pdfRes.headers['content-type']).toBe('application/pdf');
      expect(pdfRes.rawPayload.subarray(0, 5).toString('utf8')).toBe('%PDF-');
      if (usingRealTypst) {
        expect(pdfRes.rawPayload.length).toBeGreaterThan(1000);
      }
    }
  });
});
