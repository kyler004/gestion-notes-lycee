import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type {
  BulletinReportPayload,
  ClassListReportPayload,
  GradingCalculatorContract,
  HonorRollReportPayload,
  UserRole,
} from '@lycee/shared';
import { and, eq } from 'drizzle-orm';
import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DbClient } from '../db/client.js';
import {
  academicYears,
  classes,
  classSubjects,
  councilDecisions,
  enrollments,
  grades,
  gradingRules,
  periods,
  periodStudentResults,
  periodSubjectResults,
  schoolProfile,
  students,
  subjectGroups,
  subjects,
  teacherAssignments,
  users,
} from '../db/schema.js';
import { createTestDb, type TestDbHandle } from '../db/test-helpers.js';
import { hashPassword } from '../lib/crypto.js';
import { registerErrorHandler } from '../lib/errors.js';
import { fallbackGradingCalculator } from '../lib/grading-fallback.js';
import { authPlugin } from '../plugins/auth.js';
import { registerReportsRoutes } from '../routes/reports.routes.js';
import { type PdfRenderer, TypstPdfRenderer } from '../services/pdf.service.js';
import { createResultsService } from '../services/results.service.js';

const execFileAsync = promisify(execFile);

// Minimal 1x1 transparent PNG
const SAMPLE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const SAMPLE_PNG_BUFFER = Buffer.from(SAMPLE_PNG_BASE64, 'base64');

interface SeededFixture {
  yearId: string;
  otherYearId: string;
  trimester1Id: string;
  seq1Id: string;
  seq2Id: string;
  lockedSeqId: string;
  otherYearPeriodId: string;
  classAId: string;
  classBId: string;
  subjectMathCsId: string;
  subjectFrCsId: string;
  student1EnrollmentId: string;
  student2EnrollmentId: string;
  student3EnrollmentId: string;
  student4DroppedEnrollmentId: string;
  usersByRole: {
    adminId: string;
    censorId: string;
    principalId: string;
    secretaryId: string;
    assignedTeacherId: string;
    mainTeacherId: string;
    unassignedTeacherId: string;
  };
}

async function seedTestData(db: DbClient): Promise<SeededFixture> {
  const pwHash = await hashPassword('TestPassword123!');

  const insertedUsers = await db
    .insert(users)
    .values([
      { username: 'admin', fullName: 'Admin Lycée', role: 'admin', passwordHash: pwHash },
      { username: 'censor', fullName: 'Censeur Un', role: 'censor', passwordHash: pwHash },
      { username: 'principal', fullName: 'Proviseur Chef', role: 'principal', passwordHash: pwHash },
      { username: 'secretary', fullName: 'Secrétaire Un', role: 'secretary', passwordHash: pwHash },
      {
        username: 'prof.math',
        fullName: 'M. Mbarga Math',
        role: 'teacher',
        passwordHash: pwHash,
      },
      {
        username: 'prof.pp',
        fullName: 'Mme Ngo Principal',
        role: 'teacher',
        passwordHash: pwHash,
      },
      {
        username: 'prof.autre',
        fullName: 'M. Autre Classe',
        role: 'teacher',
        passwordHash: pwHash,
      },
    ])
    .returning();

  const byUsername = new Map(insertedUsers.map((u) => [u.username, u.id]));
  const adminId = byUsername.get('admin')!;
  const censorId = byUsername.get('censor')!;
  const principalId = byUsername.get('principal')!;
  const secretaryId = byUsername.get('secretary')!;
  const assignedTeacherId = byUsername.get('prof.math')!;
  const mainTeacherId = byUsername.get('prof.pp')!;
  const unassignedTeacherId = byUsername.get('prof.autre')!;

  const [year, otherYear] = await db
    .insert(academicYears)
    .values([
      {
        label: '2025-2026',
        startDate: '2025-09-01',
        endDate: '2026-06-30',
        isActive: true,
      },
      {
        label: '2024-2025',
        startDate: '2024-09-01',
        endDate: '2025-06-30',
        isActive: false,
      },
    ])
    .returning();

  const yearId = year!.id;
  const otherYearId = otherYear!.id;

  await db.insert(gradingRules).values({
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
    appreciationScale: [
      { min: 0, max: 5.99, label: 'Très insuffisant' },
      { min: 6, max: 9.99, label: 'Insuffisant' },
      { min: 10, max: 11.99, label: 'Passable' },
      { min: 12, max: 13.99, label: 'Assez bien' },
      { min: 14, max: 15.99, label: 'Bien' },
      { min: 16, max: 20, label: 'Très bien' },
    ],
  });

  const [trimester1] = await db
    .insert(periods)
    .values({
      academicYearId: yearId,
      type: 'trimester',
      code: 'T1',
      name: 'Premier Trimestre',
      orderIndex: 1,
      weight: '1.00',
      status: 'open',
    })
    .returning();

  const [seq1, seq2, lockedSeq, otherYearPeriod] = await db
    .insert(periods)
    .values([
      {
        academicYearId: yearId,
        parentPeriodId: trimester1!.id,
        type: 'sequence',
        code: 'SEQ1',
        name: 'Séquence 1',
        orderIndex: 1,
        weight: '1.00',
        status: 'open',
      },
      {
        academicYearId: yearId,
        parentPeriodId: trimester1!.id,
        type: 'sequence',
        code: 'SEQ2',
        name: 'Séquence 2',
        orderIndex: 2,
        weight: '1.00',
        status: 'open',
      },
      {
        academicYearId: yearId,
        type: 'sequence',
        code: 'SEQ3',
        name: 'Séquence 3 (Verrouillée)',
        orderIndex: 3,
        weight: '1.00',
        status: 'locked',
        lockedAt: new Date('2026-01-15T10:00:00Z'),
        lockedBy: censorId,
      },
      {
        academicYearId: otherYearId,
        type: 'sequence',
        code: 'SEQ1',
        name: 'Séquence 1 2024',
        orderIndex: 1,
        weight: '1.00',
        status: 'open',
      },
    ])
    .returning();

  const [classA, classB] = await db
    .insert(classes)
    .values([
      {
        academicYearId: yearId,
        name: '3ème A',
        level: '3ème',
        series: null,
        mainTeacherId,
      },
      {
        academicYearId: yearId,
        name: 'Tle C1',
        level: 'Terminale',
        series: 'C',
        mainTeacherId: unassignedTeacherId,
      },
    ])
    .returning();

  const [grpSci, grpLit] = await db
    .insert(subjectGroups)
    .values([
      { academicYearId: yearId, name: 'Groupe 1 : Sciences', orderIndex: 1 },
      { academicYearId: yearId, name: 'Groupe 2 : Lettres', orderIndex: 2 },
    ])
    .returning();

  const [subMath, subFr] = await db
    .insert(subjects)
    .values([
      { code: 'MATH', name: 'Mathématiques', shortName: 'Maths' },
      { code: 'FR', name: 'Français', shortName: 'Fr' },
    ])
    .returning();

  const [csMath, csFr] = await db
    .insert(classSubjects)
    .values([
      {
        classId: classA!.id,
        subjectId: subMath!.id,
        subjectGroupId: grpSci!.id,
        coefficient: '4.00',
      },
      {
        classId: classA!.id,
        subjectId: subFr!.id,
        subjectGroupId: grpLit!.id,
        coefficient: '2.00',
      },
    ])
    .returning();

  await db.insert(teacherAssignments).values({
    teacherId: assignedTeacherId,
    classSubjectId: csMath!.id,
    academicYearId: yearId,
    isActive: true,
  });

  const [st1, st2, st3, st4] = await db
    .insert(students)
    .values([
      {
        matricule: '25L001',
        lastName: 'ABENA',
        firstName: 'Jean',
        birthDate: '2010-03-15',
        birthPlace: 'Yaoundé',
        sex: 'M',
      },
      {
        matricule: '25L002',
        lastName: 'BELLA',
        firstName: 'Marie',
        birthDate: '2010-07-22',
        birthPlace: 'Douala',
        sex: 'F',
      },
      {
        matricule: '25L003',
        lastName: 'CHOUA',
        firstName: 'Paul',
        birthDate: '2009-11-04',
        birthPlace: 'Bafoussam',
        sex: 'M',
      },
      {
        matricule: '25L004',
        lastName: 'ZANG',
        firstName: 'Lucie',
        birthDate: '2010-01-10',
        birthPlace: 'Garoua',
        sex: 'F',
      },
    ])
    .returning();

  const [enr1, enr2, enr3, enr4] = await db
    .insert(enrollments)
    .values([
      {
        studentId: st1!.id,
        classId: classA!.id,
        academicYearId: yearId,
        isRepeater: false,
        status: 'active',
      },
      {
        studentId: st2!.id,
        classId: classA!.id,
        academicYearId: yearId,
        isRepeater: false,
        status: 'active',
      },
      {
        studentId: st3!.id,
        classId: classA!.id,
        academicYearId: yearId,
        isRepeater: true,
        status: 'active',
      },
      {
        studentId: st4!.id,
        classId: classA!.id,
        academicYearId: yearId,
        isRepeater: false,
        status: 'dropped',
      },
    ])
    .returning();

  // Grades for SEQ1 & SEQ2 (under Trimester 1)
  // Student 1 (ABENA): Math (coef 4) => Seq1: 16, Seq2: 14 => Trim avg 15; Fr (coef 2) => Seq1: 12, Seq2: 14 => Trim avg 13
  //   General avg = (15*4 + 13*2)/6 = 86/6 = 14.33 (Honor Roll!)
  // Student 2 (BELLA): Math => Seq1: 14, Seq2: 14 => Trim avg 14; Fr => Seq1: 10, Seq2: 10 => Trim avg 10
  //   General avg = (14*4 + 10*2)/6 = 76/6 = 12.67 (Honor Roll!)
  // Student 3 (CHOUA): Math => Seq1: 8, Seq2: absent (0) => Trim avg 4; Fr => Seq1: 9, Seq2: excused (ignored) => Trim avg 9
  //   General avg = (4*4 + 9*2)/6 = 34/6 = 5.67 (Not Honor Roll, failing)
  await db.insert(grades).values([
    {
      enrollmentId: enr1!.id,
      classSubjectId: csMath!.id,
      periodId: seq1!.id,
      score: '16.00',
      status: 'present',
      enteredBy: assignedTeacherId,
    },
    {
      enrollmentId: enr1!.id,
      classSubjectId: csMath!.id,
      periodId: seq2!.id,
      score: '14.00',
      status: 'present',
      enteredBy: assignedTeacherId,
    },
    {
      enrollmentId: enr1!.id,
      classSubjectId: csFr!.id,
      periodId: seq1!.id,
      score: '12.00',
      status: 'present',
      enteredBy: mainTeacherId,
    },
    {
      enrollmentId: enr1!.id,
      classSubjectId: csFr!.id,
      periodId: seq2!.id,
      score: '14.00',
      status: 'present',
      enteredBy: mainTeacherId,
    },
    {
      enrollmentId: enr2!.id,
      classSubjectId: csMath!.id,
      periodId: seq1!.id,
      score: '14.00',
      status: 'present',
      enteredBy: assignedTeacherId,
    },
    {
      enrollmentId: enr2!.id,
      classSubjectId: csMath!.id,
      periodId: seq2!.id,
      score: '14.00',
      status: 'present',
      enteredBy: assignedTeacherId,
    },
    {
      enrollmentId: enr2!.id,
      classSubjectId: csFr!.id,
      periodId: seq1!.id,
      score: '10.00',
      status: 'present',
      enteredBy: mainTeacherId,
    },
    {
      enrollmentId: enr2!.id,
      classSubjectId: csFr!.id,
      periodId: seq2!.id,
      score: '10.00',
      status: 'present',
      enteredBy: mainTeacherId,
    },
    {
      enrollmentId: enr3!.id,
      classSubjectId: csMath!.id,
      periodId: seq1!.id,
      score: '8.00',
      status: 'present',
      enteredBy: assignedTeacherId,
    },
    {
      enrollmentId: enr3!.id,
      classSubjectId: csMath!.id,
      periodId: seq2!.id,
      score: null,
      status: 'absent',
      enteredBy: assignedTeacherId,
    },
    {
      enrollmentId: enr3!.id,
      classSubjectId: csFr!.id,
      periodId: seq1!.id,
      score: '9.00',
      status: 'present',
      enteredBy: mainTeacherId,
    },
    {
      enrollmentId: enr3!.id,
      classSubjectId: csFr!.id,
      periodId: seq2!.id,
      score: null,
      status: 'excused',
      enteredBy: mainTeacherId,
    },
  ]);

  await db.insert(councilDecisions).values([
    {
      enrollmentId: enr1!.id,
      periodId: trimester1!.id,
      generalAppreciation: 'Très bon trimestre, continuez ainsi.',
      decision: 'encouragement',
      absencesHours: 2,
      decidedBy: censorId,
    },
    {
      enrollmentId: enr3!.id,
      periodId: trimester1!.id,
      generalAppreciation: 'Doit redoubler d’efforts.',
      decision: 'warning',
      absencesHours: 14,
      decidedBy: censorId,
    },
  ]);

  // Seed snapshot for lockedSeqId (distinct values so tests verify snapshot reading!)
  await db.insert(periodStudentResults).values([
    {
      periodId: lockedSeq!.id,
      classId: classA!.id,
      enrollmentId: enr1!.id,
      totalCoefficient: '6.00',
      totalPoints: '108.00',
      generalAverage: '18.00',
      rank: 1,
      classSize: 3,
      classAverage: '14.50',
      minClassAverage: '11.00',
      maxClassAverage: '18.00',
      passRate: '100.00',
      isHonorRoll: true,
      autoAppreciation: 'Très bien',
    },
    {
      periodId: lockedSeq!.id,
      classId: classA!.id,
      enrollmentId: enr2!.id,
      totalCoefficient: '6.00',
      totalPoints: '87.00',
      generalAverage: '14.50',
      rank: 2,
      classSize: 3,
      classAverage: '14.50',
      minClassAverage: '11.00',
      maxClassAverage: '18.00',
      passRate: '100.00',
      isHonorRoll: true,
      autoAppreciation: 'Bien',
    },
    {
      periodId: lockedSeq!.id,
      classId: classA!.id,
      enrollmentId: enr3!.id,
      totalCoefficient: '6.00',
      totalPoints: '66.00',
      generalAverage: '11.00',
      rank: 3,
      classSize: 3,
      classAverage: '14.50',
      minClassAverage: '11.00',
      maxClassAverage: '18.00',
      passRate: '100.00',
      isHonorRoll: false,
      autoAppreciation: 'Passable',
    },
  ]);

  await db.insert(periodSubjectResults).values([
    {
      periodId: lockedSeq!.id,
      classId: classA!.id,
      enrollmentId: enr1!.id,
      classSubjectId: csMath!.id,
      sequenceScoresJson: [],
      average: '18.00',
      weightedScore: '72.00',
      rank: 1,
      classAverage: '14.50',
      minScore: '11.00',
      maxScore: '18.00',
      appreciation: 'Très bien',
    },
    {
      periodId: lockedSeq!.id,
      classId: classA!.id,
      enrollmentId: enr1!.id,
      classSubjectId: csFr!.id,
      sequenceScoresJson: [],
      average: '18.00',
      weightedScore: '36.00',
      rank: 1,
      classAverage: '14.50',
      minScore: '11.00',
      maxScore: '18.00',
      appreciation: 'Très bien',
    },
  ]);

  await db.insert(councilDecisions).values({
    enrollmentId: enr1!.id,
    periodId: lockedSeq!.id,
    generalAppreciation: 'Félicitations officielles du conseil.',
    decision: 'congratulations',
    absencesHours: 0,
    decidedBy: censorId,
  });

  return {
    yearId,
    otherYearId,
    trimester1Id: trimester1!.id,
    seq1Id: seq1!.id,
    seq2Id: seq2!.id,
    lockedSeqId: lockedSeq!.id,
    otherYearPeriodId: otherYearPeriod!.id,
    classAId: classA!.id,
    classBId: classB!.id,
    subjectMathCsId: csMath!.id,
    subjectFrCsId: csFr!.id,
    student1EnrollmentId: enr1!.id,
    student2EnrollmentId: enr2!.id,
    student3EnrollmentId: enr3!.id,
    student4DroppedEnrollmentId: enr4!.id,
    usersByRole: {
      adminId,
      censorId,
      principalId,
      secretaryId,
      assignedTeacherId,
      mainTeacherId,
      unassignedTeacherId,
    },
  };
}

describe('Agent E — Results Service, Reports Routes & Typst PDF Generation', () => {
  let dbHandle: TestDbHandle;
  let fixture: SeededFixture;

  beforeAll(async () => {
    dbHandle = await createTestDb();
    fixture = await seedTestData(dbHandle.db);
  });

  afterAll(async () => {
    await dbHandle.close();
  });

  describe('results.service.ts', () => {
    it('computes dynamic trimester results with constituent sequenceScores (Q2) and merges council decisions', async () => {
      const resultsService = createResultsService(dbHandle.db);
      const report = await resultsService.getClassResults(fixture.classAId, fixture.trimester1Id);

      expect(report.isOfficial).toBe(false);
      expect(report.fromSnapshot).toBe(false);
      expect(report.period.type).toBe('trimester');
      expect(report.classInfo.mainTeacherName).toBe('Mme Ngo Principal');
      expect(report.statistics.classSize).toBe(3); // excludes dropped student4
      expect(report.statistics.evaluatedCount).toBe(3);
      expect(report.statistics.passCount).toBe(2);
      expect(report.statistics.passRate).toBe(66.67);

      const abena = report.students.find((s) => s.enrollmentId === fixture.student1EnrollmentId)!;
      expect(abena.generalAverage).toBe(14.33);
      expect(abena.rank).toBe(1);
      expect(abena.isHonorRoll).toBe(true);
      expect(abena.councilDecision).toBe('encouragement');
      expect(abena.councilAppreciation).toBe('Très bon trimestre, continuez ainsi.');
      expect(abena.absencesHours).toBe(2);

      // Q2: verify sequenceScores contain SEQ1 and SEQ2 + trimester average
      const math = abena.subjects.find((s) => s.subjectCode === 'MATH')!;
      expect(math.teacherName).toBe('M. Mbarga Math');
      expect(math.average).toBe(15);
      expect(math.weightedScore).toBe(60);
      expect(math.rank).toBe(1);
      expect(math.sequenceScores).toHaveLength(2);
      expect(math.sequenceScores[0]).toMatchObject({
        periodId: fixture.seq1Id,
        code: 'SEQ1',
        score: 16,
        status: 'present',
      });
      expect(math.sequenceScores[1]).toMatchObject({
        periodId: fixture.seq2Id,
        code: 'SEQ2',
        score: 14,
        status: 'present',
      });

      const choua = report.students.find((s) => s.enrollmentId === fixture.student3EnrollmentId)!;
      expect(choua.generalAverage).toBe(5.67);
      expect(choua.rank).toBe(3);
      expect(choua.isHonorRoll).toBe(false);
      expect(choua.councilDecision).toBe('warning');
      expect(choua.absencesHours).toBe(14);
      const chouaMath = choua.subjects.find((s) => s.subjectCode === 'MATH')!;
      expect(chouaMath.sequenceScores[1]).toMatchObject({
        code: 'SEQ2',
        score: null,
        status: 'absent',
      });
      expect(chouaMath.average).toBe(4); // (8 + 0) / 2
    });

    it('builds individual and full-class BulletinReportPayload with trimester sequenceScores and fallback school defaults', async () => {
      const resultsService = createResultsService(dbHandle.db);

      const singlePayload = await resultsService.buildBulletinPayload({
        enrollmentId: fixture.student2EnrollmentId,
        periodId: fixture.trimester1Id,
      });
      expect(singlePayload.school.name).toBe('Lycée');
      expect(singlePayload.school.hasLogo).toBe(false);
      expect(singlePayload.school.logoBase64DataUri).toBeNull();
      expect(singlePayload.students).toHaveLength(1);
      expect(singlePayload.students[0]?.matricule).toBe('25L002');
      expect(singlePayload.students[0]?.subjects[0]?.sequenceScores).toHaveLength(2);

      const classPayload = await resultsService.buildBulletinPayload({
        classId: fixture.classAId,
        periodId: fixture.trimester1Id,
      });
      expect(classPayload.students).toHaveLength(3);
      expect(classPayload.students.map((s) => s.lastName)).toEqual(['ABENA', 'BELLA', 'CHOUA']);
    });

    it('reads directly from snapshot tables when period is locked and merges council decisions', async () => {
      const resultsService = createResultsService(dbHandle.db);
      const report = await resultsService.getClassResults(fixture.classAId, fixture.lockedSeqId);

      expect(report.isOfficial).toBe(true);
      expect(report.fromSnapshot).toBe(true);
      expect(report.statistics.classAverage).toBe(14.5);
      expect(report.statistics.passRate).toBe(100);

      const abena = report.students.find((s) => s.enrollmentId === fixture.student1EnrollmentId)!;
      expect(abena.generalAverage).toBe(18);
      expect(abena.rank).toBe(1);
      expect(abena.councilDecision).toBe('congratulations');
      expect(abena.councilAppreciation).toBe('Félicitations officielles du conseil.');
    });

    it('returns honor roll students sorted by rank ascending using grading_rules threshold', async () => {
      const resultsService = createResultsService(dbHandle.db);
      const honorRoll = await resultsService.getHonorRoll(fixture.classAId, fixture.trimester1Id);

      expect(honorRoll.honorRollThreshold).toBe(12);
      expect(honorRoll.entries).toHaveLength(2);
      expect(honorRoll.entries.map((e) => ({ rank: e.rank, matricule: e.matricule }))).toEqual([
        { rank: 1, matricule: '25L001' },
        { rank: 2, matricule: '25L002' },
      ]);
      expect(honorRoll.entries[0]?.generalAverage).toBe(14.33);
    });

    it('computes aggregated school stats across all classes in the academic year', async () => {
      const resultsService = createResultsService(dbHandle.db);
      const stats = await resultsService.getSchoolStats(fixture.yearId, fixture.trimester1Id);

      expect(stats.totalStudents).toBe(3); // classA has 3 active, classB has 0
      expect(stats.evaluatedStudents).toBe(3);
      expect(stats.overallPassRate).toBe(66.67);
      expect(stats.classes).toHaveLength(2);

      const classAStats = stats.classes.find((c) => c.classId === fixture.classAId)!;
      expect(classAStats).toMatchObject({
        classId: fixture.classAId,
        className: '3ème A',
        level: '3ème',
        average: 10.89,
        passRate: 66.67,
        minAverage: 5.67,
        maxAverage: 14.33,
      });

      const classBStats = stats.classes.find((c) => c.classId === fixture.classBId)!;
      expect(classBStats).toMatchObject({
        classId: fixture.classBId,
        className: 'Tle C1',
        average: null,
        passRate: null,
      });
    });

    it('includes school_profile with base64 logo data URI when seeded and builds class list with all statuses', async () => {
      await dbHandle.db
        .insert(schoolProfile)
        .values({
          id: 1,
          name: 'Lycée Bilingue de Yaoundé',
          motto: 'Travail - Discipline - Succès',
          region: 'Centre',
          delegation: 'Mfoundi',
          city: 'Yaoundé',
          phone: '+237 222 00 00 00',
          email: 'contact@lycee-yaounde.cm',
          logoData: SAMPLE_PNG_BUFFER,
          logoMimeType: 'image/png',
        })
        .onConflictDoNothing();

      const resultsService = createResultsService(dbHandle.db);
      const classList = await resultsService.buildClassListPayload(fixture.classAId);

      expect(classList.school.name).toBe('Lycée Bilingue de Yaoundé');
      expect(classList.school.hasLogo).toBe(true);
      expect(classList.school.logoBase64DataUri).toBe(`data:image/png;base64,${SAMPLE_PNG_BASE64}`);
      expect(classList.students).toHaveLength(4); // includes dropped student4
      expect(classList.students.map((s) => s.status)).toEqual([
        'active',
        'active',
        'active',
        'dropped',
      ]);
    });

    it('rejects mismatched class and period academicYearId', async () => {
      const resultsService = createResultsService(dbHandle.db);
      await expect(
        resultsService.getClassResults(fixture.classAId, fixture.otherYearPeriodId),
      ).rejects.toThrow(/même année scolaire/);
    });

    it('delegates to injected GradingCalculatorContract and respects updated honorRollThreshold', async () => {
      const customSpy = vi.fn(fallbackGradingCalculator.computeClassResults);
      const customCalculator: GradingCalculatorContract = {
        roundGrade: fallbackGradingCalculator.roundGrade,
        resolveAppreciation: fallbackGradingCalculator.resolveAppreciation,
        computeClassResults: customSpy,
      };

      const customService = createResultsService(dbHandle.db, customCalculator);
      await customService.getClassResults(fixture.classAId, fixture.trimester1Id);
      expect(customSpy).toHaveBeenCalledTimes(1);
      const firstCallArg = customSpy.mock.calls[0]?.[0];
      expect(firstCallArg?.targetPeriodId).toBe(fixture.trimester1Id);
      expect(firstCallArg?.periods.length).toBeGreaterThanOrEqual(3);
      expect(firstCallArg?.grades.length).toBe(12);

      // Update honorRollThreshold to 14.00 temporarily and verify BELLA (12.67) is excluded
      await dbHandle.db
        .update(gradingRules)
        .set({ honorRollThreshold: '14.00' })
        .where(eq(gradingRules.academicYearId, fixture.yearId));

      try {
        const defaultService = createResultsService(dbHandle.db);
        const honor = await defaultService.getHonorRoll(fixture.classAId, fixture.trimester1Id);
        expect(honor.honorRollThreshold).toBe(14);
        expect(honor.entries).toHaveLength(1);
        expect(honor.entries[0]?.matricule).toBe('25L001');
      } finally {
        await dbHandle.db
          .update(gradingRules)
          .set({ honorRollThreshold: '12.00' })
          .where(eq(gradingRules.academicYearId, fixture.yearId));
      }
    });
  });

  describe('reports.routes.ts (RBAC, ETag/304, PDF headers)', () => {
    const renderBulletinMock = vi.fn(async (payload: BulletinReportPayload) =>
      Buffer.from(`%PDF-1.4\n%bulletin:${payload.students.length}`),
    );
    const renderClassListMock = vi.fn(async (payload: ClassListReportPayload) =>
      Buffer.from(`%PDF-1.4\n%class-list:${payload.students.length}`),
    );
    const renderHonorRollMock = vi.fn(async (payload: HonorRollReportPayload) =>
      Buffer.from(`%PDF-1.4\n%honor-roll:${payload.entries.length}`),
    );

    const mockPdfRenderer: PdfRenderer = {
      renderBulletin: renderBulletinMock,
      renderClassList: renderClassListMock,
      renderHonorRoll: renderHonorRollMock,
    };

    let app: ReturnType<typeof Fastify>;

    function signFor(id: string, _username: string, _role: UserRole): string {
      return app.jwt.sign({ sub: id, ver: 1 });
    }

    beforeAll(async () => {
      app = Fastify();
      registerErrorHandler(app);
      await app.register(authPlugin, {
        jwtAccessSecret: 'test-secret-for-reports-routes-min-32-chars',
        jwtAccessTtl: '15m',
        db: dbHandle.db,
      });
      await registerReportsRoutes(app, {
        db: dbHandle.db,
        pdfRenderer: mockPdfRenderer,
      });
      await app.ready();
    });

    afterAll(async () => {
      await app.close();
    });

    it('enforces RBAC on JSON and PDF report endpoints', async () => {
      const adminToken = signFor(fixture.usersByRole.adminId, 'admin', 'admin');
      const secretaryToken = signFor(fixture.usersByRole.secretaryId, 'secretary', 'secretary');
      const assignedToken = signFor(fixture.usersByRole.assignedTeacherId, 'prof.math', 'teacher');
      const mainToken = signFor(fixture.usersByRole.mainTeacherId, 'prof.pp', 'teacher');
      const unassignedToken = signFor(
        fixture.usersByRole.unassignedTeacherId,
        'prof.autre',
        'teacher',
      );

      // Unauthenticated -> 401
      const unauth = await app.inject({
        method: 'GET',
        url: `/api/reports/class-results?classId=${fixture.classAId}&periodId=${fixture.trimester1Id}`,
      });
      expect(unauth.statusCode).toBe(401);

      // school-stats: admin 200, secretary 403, teacher 403
      const statsAdmin = await app.inject({
        method: 'GET',
        url: `/api/reports/school-stats?academicYearId=${fixture.yearId}&periodId=${fixture.trimester1Id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(statsAdmin.statusCode).toBe(200);

      const statsSec = await app.inject({
        method: 'GET',
        url: `/api/reports/school-stats?academicYearId=${fixture.yearId}&periodId=${fixture.trimester1Id}`,
        headers: { authorization: `Bearer ${secretaryToken}` },
      });
      expect(statsSec.statusCode).toBe(403);

      // class-results & honor-roll: main teacher -> 200; subject-only & unassigned teacher -> 403 (SEC-HIGH-01)
      const assignedRes = await app.inject({
        method: 'GET',
        url: `/api/reports/class-results?classId=${fixture.classAId}&periodId=${fixture.trimester1Id}`,
        headers: { authorization: `Bearer ${assignedToken}` },
      });
      expect(assignedRes.statusCode).toBe(403);

      const mainClassRes = await app.inject({
        method: 'GET',
        url: `/api/reports/class-results?classId=${fixture.classAId}&periodId=${fixture.trimester1Id}`,
        headers: { authorization: `Bearer ${mainToken}` },
      });
      expect(mainClassRes.statusCode).toBe(200);

      const assignedHonorRes = await app.inject({
        method: 'GET',
        url: `/api/reports/honor-roll?classId=${fixture.classAId}&periodId=${fixture.trimester1Id}`,
        headers: { authorization: `Bearer ${assignedToken}` },
      });
      expect(assignedHonorRes.statusCode).toBe(403);

      const mainHonorRes = await app.inject({
        method: 'GET',
        url: `/api/reports/honor-roll?classId=${fixture.classAId}&periodId=${fixture.trimester1Id}`,
        headers: { authorization: `Bearer ${mainToken}` },
      });
      expect(mainHonorRes.statusCode).toBe(200);

      const unassignedRes = await app.inject({
        method: 'GET',
        url: `/api/reports/class-results?classId=${fixture.classAId}&periodId=${fixture.trimester1Id}`,
        headers: { authorization: `Bearer ${unassignedToken}` },
      });
      expect(unassignedRes.statusCode).toBe(403);

      // class bulletins PDF & honor-roll PDF: secretary -> 200, teacher -> 403
      const teacherClassPdf = await app.inject({
        method: 'GET',
        url: `/api/reports/bulletins/class/${fixture.classAId}/pdf?periodId=${fixture.trimester1Id}`,
        headers: { authorization: `Bearer ${assignedToken}` },
      });
      expect(teacherClassPdf.statusCode).toBe(403);

      const teacherHonorPdf = await app.inject({
        method: 'GET',
        url: `/api/reports/honor-roll/${fixture.classAId}/pdf?periodId=${fixture.trimester1Id}`,
        headers: { authorization: `Bearer ${mainToken}` },
      });
      expect(teacherHonorPdf.statusCode).toBe(403);

      // student bulletin PDF: mainTeacher -> 200, subject-only & unassigned teacher -> 403 (SEC-HIGH-01)
      const assignedStudentPdf = await app.inject({
        method: 'GET',
        url: `/api/reports/bulletins/student/${fixture.student1EnrollmentId}/pdf?periodId=${fixture.trimester1Id}`,
        headers: { authorization: `Bearer ${assignedToken}` },
      });
      expect(assignedStudentPdf.statusCode).toBe(403);

      const mainStudentPdf = await app.inject({
        method: 'GET',
        url: `/api/reports/bulletins/student/${fixture.student1EnrollmentId}/pdf?periodId=${fixture.trimester1Id}`,
        headers: { authorization: `Bearer ${mainToken}` },
      });
      expect(mainStudentPdf.statusCode).toBe(200);

      const unassignedStudentPdf = await app.inject({
        method: 'GET',
        url: `/api/reports/bulletins/student/${fixture.student1EnrollmentId}/pdf?periodId=${fixture.trimester1Id}`,
        headers: { authorization: `Bearer ${unassignedToken}` },
      });
      expect(unassignedStudentPdf.statusCode).toBe(403);

      // class-list PDF: unassigned teacher -> 403, assigned teacher -> 200
      const unassignedListPdf = await app.inject({
        method: 'GET',
        url: `/api/reports/class-list/${fixture.classAId}/pdf`,
        headers: { authorization: `Bearer ${unassignedToken}` },
      });
      expect(unassignedListPdf.statusCode).toBe(403);

      const assignedListPdf = await app.inject({
        method: 'GET',
        url: `/api/reports/class-list/${fixture.classAId}/pdf`,
        headers: { authorization: `Bearer ${assignedToken}` },
      });
      expect(assignedListPdf.statusCode).toBe(200);
    });

    it('returns Content-Type: application/pdf, Cache-Control, deterministic ETag, and 304 on If-None-Match', async () => {
      renderBulletinMock.mockClear();
      renderClassListMock.mockClear();
      renderHonorRollMock.mockClear();

      const secretaryToken = signFor(fixture.usersByRole.secretaryId, 'secretary', 'secretary');

      const res1 = await app.inject({
        method: 'GET',
        url: `/api/reports/bulletins/class/${fixture.classAId}/pdf?periodId=${fixture.trimester1Id}`,
        headers: { authorization: `Bearer ${secretaryToken}` },
      });

      expect(res1.statusCode).toBe(200);
      expect(res1.headers['content-type']).toContain('application/pdf');
      expect(res1.headers['cache-control']).toBe('private, max-age=300');
      expect(res1.headers.etag).toMatch(/^"[a-f0-9]{64}"$/);
      expect(res1.rawPayload.toString('utf8')).toContain('%PDF-1.4');
      expect(renderBulletinMock).toHaveBeenCalledTimes(1);

      // Repeat with If-None-Match -> 304 without calling pdfRenderer again
      const res2 = await app.inject({
        method: 'GET',
        url: `/api/reports/bulletins/class/${fixture.classAId}/pdf?periodId=${fixture.trimester1Id}`,
        headers: {
          authorization: `Bearer ${secretaryToken}`,
          'if-none-match': res1.headers.etag as string,
        },
      });
      expect(res2.statusCode).toBe(304);
      expect(res2.headers.etag).toBe(res1.headers.etag);
      expect(renderBulletinMock).toHaveBeenCalledTimes(1);

      // Also check honor-roll PDF & class-list PDF headers and 304
      const honor1 = await app.inject({
        method: 'GET',
        url: `/api/reports/honor-roll/${fixture.classAId}/pdf?periodId=${fixture.trimester1Id}`,
        headers: { authorization: `Bearer ${secretaryToken}` },
      });
      expect(honor1.statusCode).toBe(200);
      expect(honor1.headers['content-type']).toContain('application/pdf');
      expect(honor1.headers['cache-control']).toBe('private, max-age=300');

      const honor2 = await app.inject({
        method: 'GET',
        url: `/api/reports/honor-roll/${fixture.classAId}/pdf?periodId=${fixture.trimester1Id}`,
        headers: {
          authorization: `Bearer ${secretaryToken}`,
          'if-none-match': honor1.headers.etag as string,
        },
      });
      expect(honor2.statusCode).toBe(304);
      expect(renderHonorRollMock).toHaveBeenCalledTimes(1);

      // Modify council decision -> ETag must change and return 200 even with old If-None-Match
      await dbHandle.db
        .update(councilDecisions)
        .set({ generalAppreciation: 'Félicitations renouvelées !' })
        .where(
          and(
            eq(councilDecisions.enrollmentId, fixture.student1EnrollmentId),
            eq(councilDecisions.periodId, fixture.trimester1Id),
          ),
        );

      const res3 = await app.inject({
        method: 'GET',
        url: `/api/reports/bulletins/class/${fixture.classAId}/pdf?periodId=${fixture.trimester1Id}`,
        headers: {
          authorization: `Bearer ${secretaryToken}`,
          'if-none-match': res1.headers.etag as string,
        },
      });
      expect(res3.statusCode).toBe(200);
      expect(res3.headers.etag).not.toBe(res1.headers.etag);
      expect(renderBulletinMock).toHaveBeenCalledTimes(2);
    });

    it('returns 400 validation error for invalid UUID params or query', async () => {
      const adminToken = signFor(fixture.usersByRole.adminId, 'admin', 'admin');
      const invalidRes = await app.inject({
        method: 'GET',
        url: '/api/reports/bulletins/class/not-a-uuid/pdf?periodId=also-invalid',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(invalidRes.statusCode).toBe(400);
    });
  });

  describe('TypstPdfRenderer', () => {
    it('writes data.json, extracts logo file, copies template, passes --root tempDir, and always cleans up tempDir', async () => {
      const workDir = await mkdtemp(path.join(os.tmpdir(), 'lycee-mock-typst-'));
      const capturePath = path.join(workDir, 'captured.json');
      const mockTypstPath = path.join(workDir, 'mock-typst.mjs');

      const mockScript = `#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const rootIdx = args.indexOf('--root');
const rootDir = rootIdx >= 0 ? args[rootIdx + 1] : process.cwd();
const templatePath = args[args.length - 2];
const outPath = args[args.length - 1];

const dataRaw = readFileSync(path.join(rootDir, 'data.json'), 'utf8');
const data = JSON.parse(dataRaw);
const hasLogo = data.logoFile ? existsSync(path.join(rootDir, data.logoFile)) : false;
const hasTemplate = existsSync(templatePath);

writeFileSync(${JSON.stringify(capturePath)}, JSON.stringify({
  args,
  rootDir,
  templateName: path.basename(templatePath),
  logoFile: data.logoFile,
  hasLogo,
  hasTemplate,
  logoBase64DataUriInJson: data.school?.logoBase64DataUri ?? null,
}));

if (process.env.FORCE_FAIL === '1') {
  console.error('Simulated typst error');
  process.exit(1);
}

writeFileSync(outPath, Buffer.from('%PDF-1.4\\n%mock-typst\\n'));
`;

      await writeFile(mockTypstPath, mockScript, 'utf8');
      await chmod(mockTypstPath, 0o755);

      try {
        const resultsService = createResultsService(dbHandle.db);
        const bulletinPayload = await resultsService.buildBulletinPayload({
          classId: fixture.classAId,
          periodId: fixture.trimester1Id,
        });

        const renderer = new TypstPdfRenderer(mockTypstPath);
        const pdf = await renderer.renderBulletin(bulletinPayload);

        expect(pdf.subarray(0, 8).toString('utf8')).toBe('%PDF-1.4');

        const captured = JSON.parse(await readFile(capturePath, 'utf8')) as {
          rootDir: string;
          templateName: string;
          logoFile: string | null;
          hasLogo: boolean;
          hasTemplate: boolean;
          logoBase64DataUriInJson: string | null;
        };

        expect(captured.templateName).toBe('bulletin.typ');
        expect(captured.logoFile).toBe('logo.png');
        expect(captured.hasLogo).toBe(true);
        expect(captured.hasTemplate).toBe(true);
        expect(captured.logoBase64DataUriInJson).toBeNull();
        // Verify temp dir was deleted after completion
        expect(existsSync(captured.rootDir)).toBe(false);

        // Verify temp dir is also deleted on error
        process.env.FORCE_FAIL = '1';
        try {
          await expect(renderer.renderBulletin(bulletinPayload)).rejects.toThrow(
            /Échec de la génération PDF/,
          );
          const failedCapture = JSON.parse(await readFile(capturePath, 'utf8')) as {
            rootDir: string;
          };
          expect(existsSync(failedCapture.rootDir)).toBe(false);
        } finally {
          delete process.env.FORCE_FAIL;
        }
      } finally {
        await rm(workDir, { recursive: true, force: true });
      }
    });

    it('compiles all three real .typ templates if typst binary is installed on PATH', async () => {
      let typstAvailable = false;
      try {
        await execFileAsync('typst', ['--version'], { timeout: 3000 });
        typstAvailable = true;
      } catch {
        typstAvailable = false;
      }

      if (!typstAvailable) {
        // Environment does not have typst installed; skip real binary check cleanly.
        return;
      }

      const resultsService = createResultsService(dbHandle.db);
      const renderer = new TypstPdfRenderer('typst');

      const [trimesterBulletin, seqBulletin, classList, honorRoll] = await Promise.all([
        resultsService.buildBulletinPayload({
          classId: fixture.classAId,
          periodId: fixture.trimester1Id,
        }),
        resultsService.buildBulletinPayload({
          enrollmentId: fixture.student1EnrollmentId,
          periodId: fixture.lockedSeqId,
        }),
        resultsService.buildClassListPayload(fixture.classAId),
        resultsService.buildHonorRollPayload(fixture.classAId, fixture.trimester1Id),
      ]);

      const [pdf1, pdf2, pdf3, pdf4] = await Promise.all([
        renderer.renderBulletin(trimesterBulletin),
        renderer.renderBulletin(seqBulletin),
        renderer.renderClassList(classList),
        renderer.renderHonorRoll(honorRoll),
      ]);

      for (const buf of [pdf1, pdf2, pdf3, pdf4]) {
        expect(buf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
        expect(buf.length).toBeGreaterThan(1000);
      }
    });
  });
});
