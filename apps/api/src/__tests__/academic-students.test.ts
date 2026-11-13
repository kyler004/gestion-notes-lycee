import type { UserRole } from '@lycee/shared';
import { CAMEROON_DEFAULT_GRADING_RULES } from '@lycee/shared';
import { eq } from 'drizzle-orm';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DbClient } from '../db/client.js';
import { periods, users } from '../db/schema.js';
import { createTestDb, type TestDbHandle } from '../db/test-helpers.js';
import { registerErrorHandler } from '../lib/errors.js';
import { authPlugin } from '../plugins/auth.js';
import { registerAcademicRoutes } from '../routes/academic.routes.js';
import { registerStudentsRoutes } from '../routes/students.routes.js';
import { registerSubjectsRoutes } from '../routes/subjects.routes.js';

interface TestUser {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  token: string;
}

async function createTestApp(db: DbClient): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);
  await app.register(authPlugin, {
    jwtAccessSecret: 'test-jwt-secret-key-at-least-32-chars-long',
    jwtAccessTtl: '1h',
    db,
  });
  await registerAcademicRoutes(app, { db });
  await registerStudentsRoutes(app, { db });
  await registerSubjectsRoutes(app, { db });
  await app.ready();
  return app;
}

async function seedUser(
  app: FastifyInstance,
  db: DbClient,
  opts: { username: string; fullName: string; role: UserRole; isActive?: boolean },
): Promise<TestUser> {
  const [inserted] = await db
    .insert(users)
    .values({
      username: opts.username,
      fullName: opts.fullName,
      role: opts.role,
      passwordHash: 'scrypt:salt:hash',
      isActive: opts.isActive ?? true,
    })
    .returning();

  if (!inserted) {
    throw new Error('Failed to seed test user');
  }

  const token = app.jwt.sign({
    sub: inserted.id,
    username: inserted.username,
    fullName: inserted.fullName,
    role: inserted.role,
  });

  return {
    id: inserted.id,
    username: inserted.username,
    fullName: inserted.fullName,
    role: inserted.role,
    token,
  };
}

describe('Academic Structure, Students/Enrollments, Subjects & Teacher Assignments', () => {
  let dbHandle: TestDbHandle;
  let app: FastifyInstance;
  let admin: TestUser;
  let censor: TestUser;
  let secretary: TestUser;
  let principal: TestUser;
  let teacherA: TestUser;
  let teacherB: TestUser;
  let mainTeacher: TestUser;

  beforeAll(async () => {
    dbHandle = await createTestDb();
    app = await createTestApp(dbHandle.db);

    admin = await seedUser(app, dbHandle.db, {
      username: 'admin1',
      fullName: 'Admin Lycée',
      role: 'admin',
    });
    censor = await seedUser(app, dbHandle.db, {
      username: 'censor1',
      fullName: 'Censeur Un',
      role: 'censor',
    });
    secretary = await seedUser(app, dbHandle.db, {
      username: 'sec1',
      fullName: 'Secrétaire Un',
      role: 'secretary',
    });
    principal = await seedUser(app, dbHandle.db, {
      username: 'proviseur1',
      fullName: 'Proviseur Un',
      role: 'principal',
    });
    teacherA = await seedUser(app, dbHandle.db, {
      username: 'prof.math',
      fullName: 'M. Mbarga Math',
      role: 'teacher',
    });
    teacherB = await seedUser(app, dbHandle.db, {
      username: 'prof.phys',
      fullName: 'Mme Ngo Physique',
      role: 'teacher',
    });
    mainTeacher = await seedUser(app, dbHandle.db, {
      username: 'prof.principal',
      fullName: 'M. Fouda Principal',
      role: 'teacher',
    });
  });

  afterAll(async () => {
    await app.close();
    await dbHandle.close();
  });

  it('creates an academic year with Cameroon defaults (grading_rules, 3 trimesters, 6 sequences) and handles activation & period guards', async () => {
    // Teacher cannot create academic year
    const forbiddenRes = await app.inject({
      method: 'POST',
      url: '/api/academic-years',
      headers: { authorization: `Bearer ${teacherA.token}` },
      payload: {
        label: '2025-2026',
        startDate: '2025-09-01',
        endDate: '2026-06-30',
        isActive: true,
        initializeCameroonDefaults: true,
      },
    });
    expect(forbiddenRes.statusCode).toBe(403);

    // Admin creates 2025-2026 with Cameroon defaults
    const createRes1 = await app.inject({
      method: 'POST',
      url: '/api/academic-years',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {
        label: '2025-2026',
        startDate: '2025-09-01',
        endDate: '2026-06-30',
        isActive: true,
        initializeCameroonDefaults: true,
      },
    });
    expect(createRes1.statusCode).toBe(201);
    const body1 = createRes1.json();
    expect(body1.academicYear.label).toBe('2025-2026');
    expect(body1.academicYear.isActive).toBe(true);
    expect(body1.academicYear.syncVersion).toBeGreaterThan(0);

    // Grading rules check
    expect(body1.gradingRules).not.toBeNull();
    expect(body1.gradingRules.trimestersCount).toBe(CAMEROON_DEFAULT_GRADING_RULES.trimestersCount);
    expect(body1.gradingRules.sequencesPerTrimester).toBe(
      CAMEROON_DEFAULT_GRADING_RULES.sequencesPerTrimester,
    );
    expect(body1.gradingRules.passingThreshold).toBe(10);
    expect(body1.gradingRules.honorRollThreshold).toBe(12);
    expect(body1.gradingRules.appreciationScale).toHaveLength(
      CAMEROON_DEFAULT_GRADING_RULES.appreciationScale.length,
    );

    // Periods check: 3 trimesters + 6 sequences
    expect(body1.periods).toHaveLength(9);
    const trimesters = body1.periods.filter((p: { type: string }) => p.type === 'trimester');
    const sequences = body1.periods.filter((p: { type: string }) => p.type === 'sequence');
    expect(trimesters.map((t: { code: string }) => t.code)).toEqual(['T1', 'T2', 'T3']);
    expect(trimesters.map((t: { orderIndex: number }) => t.orderIndex)).toEqual([1, 2, 3]);
    expect(sequences.map((s: { code: string }) => s.code)).toEqual([
      'S1',
      'S2',
      'S3',
      'S4',
      'S5',
      'S6',
    ]);
    expect(sequences.map((s: { orderIndex: number }) => s.orderIndex)).toEqual([1, 2, 3, 4, 5, 6]);

    // Verify parentPeriodId links S1/S2 -> T1, S3/S4 -> T2, S5/S6 -> T3
    expect(sequences[0].parentPeriodId).toBe(trimesters[0].id);
    expect(sequences[1].parentPeriodId).toBe(trimesters[0].id);
    expect(sequences[2].parentPeriodId).toBe(trimesters[1].id);
    expect(sequences[3].parentPeriodId).toBe(trimesters[1].id);
    expect(sequences[4].parentPeriodId).toBe(trimesters[2].id);
    expect(sequences[5].parentPeriodId).toBe(trimesters[2].id);

    // GET grading rules & PUT update
    const getRulesRes = await app.inject({
      method: 'GET',
      url: `/api/academic-years/${body1.academicYear.id}/grading-rules`,
      headers: { authorization: `Bearer ${teacherA.token}` },
    });
    expect(getRulesRes.statusCode).toBe(200);
    expect(getRulesRes.json().passingThreshold).toBe(10);

    const putRulesRes = await app.inject({
      method: 'PUT',
      url: `/api/academic-years/${body1.academicYear.id}/grading-rules`,
      headers: { authorization: `Bearer ${censor.token}` },
      payload: {
        ...CAMEROON_DEFAULT_GRADING_RULES,
        honorRollThreshold: 12.5,
      },
    });
    expect(putRulesRes.statusCode).toBe(200);
    expect(putRulesRes.json().honorRollThreshold).toBe(12.5);
    expect(putRulesRes.json().syncVersion).toBeGreaterThan(body1.gradingRules.syncVersion);

    // Creating second active year deactivates first and bumps syncVersion
    const createRes2 = await app.inject({
      method: 'POST',
      url: '/api/academic-years',
      headers: { authorization: `Bearer ${censor.token}` },
      payload: {
        label: '2026-2027',
        startDate: '2026-09-01',
        endDate: '2027-06-30',
        isActive: true,
        initializeCameroonDefaults: false,
      },
    });
    expect(createRes2.statusCode).toBe(201);
    const year2 = createRes2.json().academicYear;
    expect(year2.isActive).toBe(true);

    const listYearsRes = await app.inject({
      method: 'GET',
      url: '/api/academic-years',
      headers: { authorization: `Bearer ${teacherA.token}` },
    });
    expect(listYearsRes.statusCode).toBe(200);
    const yearsList = listYearsRes.json().academicYears;
    const foundYear1 = yearsList.find((y: { id: string }) => y.id === body1.academicYear.id);
    const foundYear2 = yearsList.find((y: { id: string }) => y.id === year2.id);
    expect(foundYear1.isActive).toBe(false);
    expect(foundYear1.syncVersion).toBeGreaterThan(body1.academicYear.syncVersion);
    expect(foundYear2.isActive).toBe(true);

    // Re-activate year1 via PATCH /api/academic-years/:id/activate
    const activateRes = await app.inject({
      method: 'PATCH',
      url: `/api/academic-years/${body1.academicYear.id}/activate`,
      headers: { authorization: `Bearer ${admin.token}` },
    });
    expect(activateRes.statusCode).toBe(200);
    expect(activateRes.json().isActive).toBe(true);
    expect(activateRes.json().syncVersion).toBeGreaterThan(foundYear1.syncVersion);

    // Generic PATCH /api/periods/:id allows name/weight edit, forbids unlocking locked period
    const s1 = sequences[0];
    const patchPeriodRes = await app.inject({
      method: 'PATCH',
      url: `/api/periods/${s1.id}`,
      headers: { authorization: `Bearer ${censor.token}` },
      payload: { name: 'Première Séquence Modifiée', weight: 1.5 },
    });
    expect(patchPeriodRes.statusCode).toBe(200);
    expect(patchPeriodRes.json().name).toBe('Première Séquence Modifiée');
    expect(patchPeriodRes.json().weight).toBe(1.5);

    // Simulate locked period in DB directly, then verify generic PATCH cannot unlock it
    await dbHandle.db
      .update(periods)
      .set({ status: 'locked', lockedAt: new Date(), lockedBy: admin.id })
      .where(eq(periods.id, s1.id));

    const unlockAttemptRes = await app.inject({
      method: 'PATCH',
      url: `/api/periods/${s1.id}`,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { status: 'open' },
    });
    expect(unlockAttemptRes.statusCode).toBe(400);

    // Verify GET periods works
    const getPeriodsRes = await app.inject({
      method: 'GET',
      url: `/api/academic-years/${body1.academicYear.id}/periods`,
      headers: { authorization: `Bearer ${teacherA.token}` },
    });
    expect(getPeriodsRes.statusCode).toBe(200);
    expect(getPeriodsRes.json().periods).toHaveLength(9);
  });

  it('enforces unique matricule (409), enrolls students, scopes class student access for teachers, and manages soft-deleted teacher assignments', async () => {
    // 1. Setup an academic year
    const yearRes = await app.inject({
      method: 'POST',
      url: '/api/academic-years',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {
        label: '2027-2028',
        startDate: '2027-09-01',
        endDate: '2028-06-30',
        isActive: false,
        initializeCameroonDefaults: true,
      },
    });
    expect(yearRes.statusCode).toBe(201);
    const yearId = yearRes.json().academicYear.id as string;

    // 2. Create two classes (one with mainTeacher)
    const class1Res = await app.inject({
      method: 'POST',
      url: '/api/classes',
      headers: { authorization: `Bearer ${censor.token}` },
      payload: {
        academicYearId: yearId,
        name: '3ème A',
        level: '3ème',
        series: null,
        mainTeacherId: mainTeacher.id,
      },
    });
    expect(class1Res.statusCode).toBe(201);
    const class1 = class1Res.json();
    expect(class1.mainTeacherName).toBe(mainTeacher.fullName);

    const class2Res = await app.inject({
      method: 'POST',
      url: '/api/classes',
      headers: { authorization: `Bearer ${censor.token}` },
      payload: {
        academicYearId: yearId,
        name: 'Tle C1',
        level: 'Terminale',
        series: 'C',
      },
    });
    expect(class2Res.statusCode).toBe(201);
    const class2 = class2Res.json();

    // 3. Create subject group & subjects & coefficients (class_subjects)
    const groupRes = await app.inject({
      method: 'POST',
      url: '/api/subject-groups',
      headers: { authorization: `Bearer ${censor.token}` },
      payload: {
        academicYearId: yearId,
        name: 'Sciences',
        orderIndex: 1,
      },
    });
    expect(groupRes.statusCode).toBe(201);
    const group1 = groupRes.json();

    const mathRes = await app.inject({
      method: 'POST',
      url: '/api/subjects',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {
        code: 'MATH',
        name: 'Mathématiques',
        shortName: 'Maths',
      },
    });
    expect(mathRes.statusCode).toBe(201);
    const math = mathRes.json();

    const physRes = await app.inject({
      method: 'POST',
      url: '/api/subjects',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {
        code: 'PHYS',
        name: 'Physique-Chimie',
        shortName: 'Phys.',
      },
    });
    expect(physRes.statusCode).toBe(201);
    const phys = physRes.json();

    const cs1Res = await app.inject({
      method: 'PUT',
      url: '/api/class-subjects',
      headers: { authorization: `Bearer ${censor.token}` },
      payload: {
        classId: class1.id,
        subjectId: math.id,
        subjectGroupId: group1.id,
        coefficient: 4,
      },
    });
    expect(cs1Res.statusCode).toBe(200);
    const cs1 = cs1Res.json();
    expect(cs1.coefficient).toBe(4);

    // Upsert same (classId, subjectId) updates coefficient & bumps syncVersion, keeps same id
    const cs1UpdateRes = await app.inject({
      method: 'PUT',
      url: '/api/class-subjects',
      headers: { authorization: `Bearer ${censor.token}` },
      payload: {
        classId: class1.id,
        subjectId: math.id,
        subjectGroupId: group1.id,
        coefficient: 5,
      },
    });
    expect(cs1UpdateRes.statusCode).toBe(200);
    expect(cs1UpdateRes.json().id).toBe(cs1.id);
    expect(cs1UpdateRes.json().coefficient).toBe(5);
    expect(cs1UpdateRes.json().syncVersion).toBeGreaterThan(cs1.syncVersion);

    const cs2Res = await app.inject({
      method: 'PUT',
      url: '/api/class-subjects',
      headers: { authorization: `Bearer ${censor.token}` },
      payload: {
        classId: class2.id,
        subjectId: phys.id,
        subjectGroupId: group1.id,
        coefficient: 6,
      },
    });
    expect(cs2Res.statusCode).toBe(200);
    const cs2 = cs2Res.json();

    const listClassSubjectsRes = await app.inject({
      method: 'GET',
      url: `/api/classes/${class1.id}/subjects`,
      headers: { authorization: `Bearer ${teacherA.token}` },
    });
    expect(listClassSubjectsRes.statusCode).toBe(200);
    expect(listClassSubjectsRes.json().classSubjects).toHaveLength(1);
    expect(listClassSubjectsRes.json().classSubjects[0].subjectCode).toBe('MATH');
    expect(listClassSubjectsRes.json().classSubjects[0].subjectGroupName).toBe('Sciences');

    // 4. Create student + test duplicate matricule -> 409 Conflict
    const studentRes = await app.inject({
      method: 'POST',
      url: '/api/students',
      headers: { authorization: `Bearer ${secretary.token}` },
      payload: {
        matricule: '27LYC001',
        lastName: 'Kamga',
        firstName: 'Jean',
        birthDate: '2012-04-15',
        birthPlace: 'Yaoundé',
        sex: 'M',
      },
    });
    expect(studentRes.statusCode).toBe(201);
    const student = studentRes.json();

    const dupStudentRes = await app.inject({
      method: 'POST',
      url: '/api/students',
      headers: { authorization: `Bearer ${secretary.token}` },
      payload: {
        matricule: '27LYC001',
        lastName: 'Tchatchoua',
        firstName: 'Marie',
        birthDate: '2012-08-20',
        sex: 'F',
      },
    });
    expect(dupStudentRes.statusCode).toBe(409);

    // Search students by query
    const searchStudentRes = await app.inject({
      method: 'GET',
      url: '/api/students?q=Kamga',
      headers: { authorization: `Bearer ${principal.token}` },
    });
    expect(searchStudentRes.statusCode).toBe(200);
    expect(searchStudentRes.json().students).toHaveLength(1);
    expect(searchStudentRes.json().students[0].matricule).toBe('27LYC001');

    // 5. Enroll student in class1, reject duplicate enrollment in same year (409)
    const enrollRes = await app.inject({
      method: 'POST',
      url: '/api/enrollments',
      headers: { authorization: `Bearer ${secretary.token}` },
      payload: {
        studentId: student.id,
        classId: class1.id,
        academicYearId: yearId,
        isRepeater: false,
      },
    });
    expect(enrollRes.statusCode).toBe(201);
    const enrollment = enrollRes.json();

    const dupEnrollRes = await app.inject({
      method: 'POST',
      url: '/api/enrollments',
      headers: { authorization: `Bearer ${secretary.token}` },
      payload: {
        studentId: student.id,
        classId: class2.id,
        academicYearId: yearId,
      },
    });
    expect(dupEnrollRes.statusCode).toBe(409);

    // 6. Assign teacherA -> class1/MATH (cs1), teacherB -> class2/PHYS (cs2)
    const assignARes = await app.inject({
      method: 'POST',
      url: '/api/teacher-assignments',
      headers: { authorization: `Bearer ${censor.token}` },
      payload: {
        teacherId: teacherA.id,
        classSubjectId: cs1.id,
        academicYearId: yearId,
      },
    });
    expect(assignARes.statusCode).toBe(201);
    const assignmentA = assignARes.json();
    expect(assignmentA.isActive).toBe(true);

    const assignBRes = await app.inject({
      method: 'POST',
      url: '/api/teacher-assignments',
      headers: { authorization: `Bearer ${censor.token}` },
      payload: {
        teacherId: teacherB.id,
        classSubjectId: cs2.id,
        academicYearId: yearId,
      },
    });
    expect(assignBRes.statusCode).toBe(201);

    // 7. Teacher access check on GET /api/classes/:classId/students
    // teacherA is assigned to class1 -> 200
    const teacherAClass1Res = await app.inject({
      method: 'GET',
      url: `/api/classes/${class1.id}/students`,
      headers: { authorization: `Bearer ${teacherA.token}` },
    });
    expect(teacherAClass1Res.statusCode).toBe(200);
    expect(teacherAClass1Res.json().students).toHaveLength(1);
    expect(teacherAClass1Res.json().students[0].matricule).toBe('27LYC001');

    // teacherA is NOT assigned to class2 -> 403
    const teacherAClass2Res = await app.inject({
      method: 'GET',
      url: `/api/classes/${class2.id}/students`,
      headers: { authorization: `Bearer ${teacherA.token}` },
    });
    expect(teacherAClass2Res.statusCode).toBe(403);

    // teacherB is NOT assigned to class1 -> 403
    const teacherBClass1Res = await app.inject({
      method: 'GET',
      url: `/api/classes/${class1.id}/students`,
      headers: { authorization: `Bearer ${teacherB.token}` },
    });
    expect(teacherBClass1Res.statusCode).toBe(403);

    // mainTeacher IS mainTeacherId of class1 -> 200 even without subject assignment
    const mainTeacherClass1Res = await app.inject({
      method: 'GET',
      url: `/api/classes/${class1.id}/students`,
      headers: { authorization: `Bearer ${mainTeacher.token}` },
    });
    expect(mainTeacherClass1Res.statusCode).toBe(200);
    expect(mainTeacherClass1Res.json().students).toHaveLength(1);

    // 8. Check /api/teachers/me/assignments before soft-delete
    const myAssignBefore = await app.inject({
      method: 'GET',
      url: '/api/teachers/me/assignments',
      headers: { authorization: `Bearer ${teacherA.token}` },
    });
    expect(myAssignBefore.statusCode).toBe(200);
    expect(myAssignBefore.json().assignments).toHaveLength(1);
    expect(myAssignBefore.json().assignments[0].className).toBe('3ème A');
    expect(myAssignBefore.json().assignments[0].subjectCode).toBe('MATH');

    // 9. Soft-delete assignmentA -> bumps syncVersion, sets isActive: false, removes from /api/teachers/me/assignments & revokes class1 access
    const deleteAssignRes = await app.inject({
      method: 'DELETE',
      url: `/api/teacher-assignments/${assignmentA.id}`,
      headers: { authorization: `Bearer ${censor.token}` },
    });
    expect(deleteAssignRes.statusCode).toBe(200);
    const deactivated = deleteAssignRes.json();
    expect(deactivated.isActive).toBe(false);
    expect(deactivated.syncVersion).toBeGreaterThan(assignmentA.syncVersion);

    const myAssignAfter = await app.inject({
      method: 'GET',
      url: '/api/teachers/me/assignments',
      headers: { authorization: `Bearer ${teacherA.token}` },
    });
    expect(myAssignAfter.statusCode).toBe(200);
    expect(myAssignAfter.json().assignments).toHaveLength(0);

    const teacherAClass1AfterDelete = await app.inject({
      method: 'GET',
      url: `/api/classes/${class1.id}/students`,
      headers: { authorization: `Bearer ${teacherA.token}` },
    });
    expect(teacherAClass1AfterDelete.statusCode).toBe(403);

    // 10. Re-assigning teacherA reactivates the existing assignment row (isActive = true) and bumps syncVersion
    const reassignRes = await app.inject({
      method: 'POST',
      url: '/api/teacher-assignments',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {
        teacherId: teacherA.id,
        classSubjectId: cs1.id,
        academicYearId: yearId,
      },
    });
    expect(reassignRes.statusCode).toBe(200);
    expect(reassignRes.json().id).toBe(assignmentA.id);
    expect(reassignRes.json().isActive).toBe(true);
    expect(reassignRes.json().syncVersion).toBeGreaterThan(deactivated.syncVersion);

    // 11. Changing enrollment class via PATCH /api/enrollments/:id
    const transferRes = await app.inject({
      method: 'PATCH',
      url: `/api/enrollments/${enrollment.id}`,
      headers: { authorization: `Bearer ${secretary.token}` },
      payload: {
        classId: class2.id,
        isRepeater: true,
      },
    });
    expect(transferRes.statusCode).toBe(200);
    expect(transferRes.json().classId).toBe(class2.id);
    expect(transferRes.json().isRepeater).toBe(true);
    expect(transferRes.json().syncVersion).toBeGreaterThan(enrollment.syncVersion);
  });

  it('covers remaining endpoints: custom period, class list/patch, student patch, enrollment year validation, subjects & teacher-assignments filters', async () => {
    // Unauthenticated check
    const unauthRes = await app.inject({
      method: 'GET',
      url: '/api/academic-years',
    });
    expect(unauthRes.statusCode).toBe(401);

    // Setup two academic years
    const y1Res = await app.inject({
      method: 'POST',
      url: '/api/academic-years',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {
        label: '2028-2029',
        startDate: '2028-09-01',
        endDate: '2029-06-30',
        initializeCameroonDefaults: false,
      },
    });
    expect(y1Res.statusCode).toBe(201);
    const y1Id = y1Res.json().academicYear.id as string;

    const y2Res = await app.inject({
      method: 'POST',
      url: '/api/academic-years',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {
        label: '2029-2030',
        startDate: '2029-09-01',
        endDate: '2030-06-30',
        initializeCameroonDefaults: false,
      },
    });
    expect(y2Res.statusCode).toBe(201);
    const y2Id = y2Res.json().academicYear.id as string;

    // POST /api/periods (trimester then sequence)
    const triRes = await app.inject({
      method: 'POST',
      url: '/api/periods',
      headers: { authorization: `Bearer ${censor.token}` },
      payload: {
        academicYearId: y1Id,
        type: 'trimester',
        code: 'T1',
        name: '1er Trimestre',
        orderIndex: 1,
      },
    });
    expect(triRes.statusCode).toBe(201);
    const tri = triRes.json();

    const seqRes = await app.inject({
      method: 'POST',
      url: '/api/periods',
      headers: { authorization: `Bearer ${censor.token}` },
      payload: {
        academicYearId: y1Id,
        parentPeriodId: tri.id,
        type: 'sequence',
        code: 'S1',
        name: '1ère Séquence',
        orderIndex: 1,
        weight: 2,
      },
    });
    expect(seqRes.statusCode).toBe(201);
    expect(seqRes.json().weight).toBe(2);
    expect(seqRes.json().parentPeriodId).toBe(tri.id);

    // Create classes in y1 and y2, list & patch
    const c1Res = await app.inject({
      method: 'POST',
      url: '/api/classes',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { academicYearId: y1Id, name: '6ème 1', level: '6ème' },
    });
    const c1 = c1Res.json();

    const c2Res = await app.inject({
      method: 'POST',
      url: '/api/classes',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { academicYearId: y2Id, name: '5ème 1', level: '5ème' },
    });
    const c2 = c2Res.json();

    const listClassesY1 = await app.inject({
      method: 'GET',
      url: `/api/classes?academicYearId=${y1Id}`,
      headers: { authorization: `Bearer ${teacherA.token}` },
    });
    expect(listClassesY1.statusCode).toBe(200);
    expect(listClassesY1.json().classes).toHaveLength(1);
    expect(listClassesY1.json().classes[0].id).toBe(c1.id);

    const patchClassRes = await app.inject({
      method: 'PATCH',
      url: `/api/classes/${c1.id}`,
      headers: { authorization: `Bearer ${censor.token}` },
      payload: { name: '6ème A', mainTeacherId: teacherA.id },
    });
    expect(patchClassRes.statusCode).toBe(200);
    expect(patchClassRes.json().name).toBe('6ème A');
    expect(patchClassRes.json().mainTeacherName).toBe(teacherA.fullName);
    expect(patchClassRes.json().syncVersion).toBeGreaterThan(c1.syncVersion);

    // Student create, patch & cross-year enrollment checks
    const stRes = await app.inject({
      method: 'POST',
      url: '/api/students',
      headers: { authorization: `Bearer ${secretary.token}` },
      payload: {
        matricule: '28LYC900',
        lastName: 'Biya',
        firstName: 'Pauline',
        birthDate: '2015-01-10',
        sex: 'F',
      },
    });
    expect(stRes.statusCode).toBe(201);
    const st = stRes.json();

    const patchStRes = await app.inject({
      method: 'PATCH',
      url: `/api/students/${st.id}`,
      headers: { authorization: `Bearer ${secretary.token}` },
      payload: { birthPlace: 'Douala' },
    });
    expect(patchStRes.statusCode).toBe(200);
    expect(patchStRes.json().birthPlace).toBe('Douala');
    expect(patchStRes.json().syncVersion).toBeGreaterThan(st.syncVersion);

    // Mismatched class year during POST /api/enrollments -> 400
    const badEnrollRes = await app.inject({
      method: 'POST',
      url: '/api/enrollments',
      headers: { authorization: `Bearer ${secretary.token}` },
      payload: {
        studentId: st.id,
        classId: c2.id,
        academicYearId: y1Id,
      },
    });
    expect(badEnrollRes.statusCode).toBe(400);

    // Valid enrollment in y1, then cross-year PATCH -> 400
    const validEnrollRes = await app.inject({
      method: 'POST',
      url: '/api/enrollments',
      headers: { authorization: `Bearer ${secretary.token}` },
      payload: {
        studentId: st.id,
        classId: c1.id,
        academicYearId: y1Id,
      },
    });
    expect(validEnrollRes.statusCode).toBe(201);
    const enr = validEnrollRes.json();

    const badTransferRes = await app.inject({
      method: 'PATCH',
      url: `/api/enrollments/${enr.id}`,
      headers: { authorization: `Bearer ${secretary.token}` },
      payload: { classId: c2.id },
    });
    expect(badTransferRes.statusCode).toBe(400);

    // Subject groups & subjects GET/PATCH + teacher assignments filtering & RBAC
    const sgRes = await app.inject({
      method: 'POST',
      url: '/api/subject-groups',
      headers: { authorization: `Bearer ${censor.token}` },
      payload: { academicYearId: y1Id, name: 'Littéraire', orderIndex: 1 },
    });
    expect(sgRes.statusCode).toBe(201);

    const listSgRes = await app.inject({
      method: 'GET',
      url: `/api/subject-groups?academicYearId=${y1Id}`,
      headers: { authorization: `Bearer ${teacherA.token}` },
    });
    expect(listSgRes.statusCode).toBe(200);
    expect(listSgRes.json().subjectGroups).toHaveLength(1);

    const subRes = await app.inject({
      method: 'POST',
      url: '/api/subjects',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { code: 'FR', name: 'Français', shortName: 'Fr.' },
    });
    expect(subRes.statusCode).toBe(201);
    const sub = subRes.json();

    const patchSubRes = await app.inject({
      method: 'PATCH',
      url: `/api/subjects/${sub.id}`,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { name: 'Langue Française' },
    });
    expect(patchSubRes.statusCode).toBe(200);
    expect(patchSubRes.json().name).toBe('Langue Française');

    const listSubRes = await app.inject({
      method: 'GET',
      url: '/api/subjects?activeOnly=true',
      headers: { authorization: `Bearer ${teacherA.token}` },
    });
    expect(listSubRes.statusCode).toBe(200);
    expect(listSubRes.json().subjects.some((s: { code: string }) => s.code === 'FR')).toBe(true);

    const csRes = await app.inject({
      method: 'PUT',
      url: '/api/class-subjects',
      headers: { authorization: `Bearer ${censor.token}` },
      payload: {
        classId: c1.id,
        subjectId: sub.id,
        subjectGroupId: sgRes.json().id,
        coefficient: 3,
      },
    });
    expect(csRes.statusCode).toBe(200);

    await app.inject({
      method: 'POST',
      url: '/api/teacher-assignments',
      headers: { authorization: `Bearer ${censor.token}` },
      payload: {
        teacherId: teacherB.id,
        classSubjectId: csRes.json().id,
        academicYearId: y1Id,
      },
    });

    // Principal can read /api/teacher-assignments, teacher cannot
    const taForbidden = await app.inject({
      method: 'GET',
      url: `/api/teacher-assignments?academicYearId=${y1Id}`,
      headers: { authorization: `Bearer ${teacherB.token}` },
    });
    expect(taForbidden.statusCode).toBe(403);

    const taAllowed = await app.inject({
      method: 'GET',
      url: `/api/teacher-assignments?academicYearId=${y1Id}&classId=${c1.id}&teacherId=${teacherB.id}`,
      headers: { authorization: `Bearer ${principal.token}` },
    });
    expect(taAllowed.statusCode).toBe(200);
    expect(taAllowed.json().assignments).toHaveLength(1);
    expect(taAllowed.json().assignments[0].subjectCode).toBe('FR');
  });
});
