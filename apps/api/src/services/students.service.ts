import {
  type AuthUserPayload,
  type CreateEnrollmentSchema,
  type CreateStudentSchema,
  type EnrollmentStatus,
  type StudentSex,
  type UpdateEnrollmentSchema,
  type UpdateStudentSchema,
} from '@lycee/shared';
import { and, asc, eq, ilike, ne, or, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { type DbClient, nextSyncVersion } from '../db/client.js';
import {
  academicYears,
  classes,
  classSubjects,
  enrollments,
  students,
  teacherAssignments,
} from '../db/schema.js';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../lib/errors.js';

export type CreateStudentInput = z.infer<typeof CreateStudentSchema>;
export type UpdateStudentInput = z.infer<typeof UpdateStudentSchema>;
export type CreateEnrollmentInput = z.infer<typeof CreateEnrollmentSchema>;
export type UpdateEnrollmentInput = z.infer<typeof UpdateEnrollmentSchema>;

export interface StudentDto {
  id: string;
  matricule: string;
  lastName: string;
  firstName: string;
  birthDate: string;
  birthPlace: string;
  sex: StudentSex;
  syncVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface EnrollmentDto {
  id: string;
  studentId: string;
  classId: string;
  academicYearId: string;
  isRepeater: boolean;
  status: EnrollmentStatus;
  syncVersion: number;
  enrolledAt: Date;
  updatedAt: Date;
}

export interface ClassStudentDto {
  enrollmentId: string;
  studentId: string;
  classId: string;
  academicYearId: string;
  matricule: string;
  lastName: string;
  firstName: string;
  birthDate: string;
  birthPlace: string;
  sex: StudentSex;
  isRepeater: boolean;
  status: EnrollmentStatus;
  enrolledAt: Date;
  syncVersion: number;
}

function assertValidIsoDate(dateStr: string, fieldName: string): void {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3) {
    throw new BadRequestError(`Date invalide pour ${fieldName}.`);
  }
  const [year, month, day] = parts;
  if (!year || !month || !day) {
    throw new BadRequestError(`Date invalide pour ${fieldName}.`);
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new BadRequestError(`Date calendaire invalide pour ${fieldName} (${dateStr}).`);
  }
}

export async function listStudents(db: DbClient, q?: string): Promise<StudentDto[]> {
  const term = q?.trim();
  if (!term) {
    return db
      .select()
      .from(students)
      .orderBy(asc(students.lastName), asc(students.firstName), asc(students.matricule));
  }

  const pattern = `%${term}%`;
  return db
    .select()
    .from(students)
    .where(
      or(
        ilike(students.matricule, pattern),
        ilike(students.lastName, pattern),
        ilike(students.firstName, pattern),
        sql`(${students.lastName} || ' ' || ${students.firstName}) ILIKE ${pattern}`,
        sql`(${students.firstName} || ' ' || ${students.lastName}) ILIKE ${pattern}`,
      ),
    )
    .orderBy(asc(students.lastName), asc(students.firstName), asc(students.matricule));
}

export async function createStudent(db: DbClient, input: CreateStudentInput): Promise<StudentDto> {
  assertValidIsoDate(input.birthDate, 'birthDate');

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: students.id })
      .from(students)
      .where(eq(students.matricule, input.matricule))
      .limit(1);

    if (existing) {
      throw new ConflictError(`Un élève avec le matricule "${input.matricule}" existe déjà.`);
    }

    const syncVersion = await nextSyncVersion(tx);
    const now = new Date();
    const [created] = await tx
      .insert(students)
      .values({
        matricule: input.matricule,
        lastName: input.lastName,
        firstName: input.firstName,
        birthDate: input.birthDate,
        birthPlace: input.birthPlace ?? '',
        sex: input.sex,
        syncVersion,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!created) {
      throw new Error('Échec de création de l’élève.');
    }

    return created;
  });
}

export async function updateStudent(
  db: DbClient,
  id: string,
  input: UpdateStudentInput,
): Promise<StudentDto> {
  if (input.birthDate !== undefined) {
    assertValidIsoDate(input.birthDate, 'birthDate');
  }

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(students)
      .where(eq(students.id, id))
      .limit(1);

    if (!existing) {
      throw new NotFoundError('Élève introuvable.');
    }

    if (input.matricule !== undefined && input.matricule !== existing.matricule) {
      const [duplicate] = await tx
        .select({ id: students.id })
        .from(students)
        .where(and(eq(students.matricule, input.matricule), ne(students.id, id)))
        .limit(1);

      if (duplicate) {
        throw new ConflictError(`Un élève avec le matricule "${input.matricule}" existe déjà.`);
      }
    }

    const syncVersion = await nextSyncVersion(tx);
    const [updated] = await tx
      .update(students)
      .set({
        ...(input.matricule !== undefined ? { matricule: input.matricule } : {}),
        ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
        ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
        ...(input.birthDate !== undefined ? { birthDate: input.birthDate } : {}),
        ...(input.birthPlace !== undefined ? { birthPlace: input.birthPlace } : {}),
        ...(input.sex !== undefined ? { sex: input.sex } : {}),
        syncVersion,
        updatedAt: new Date(),
      })
      .where(eq(students.id, id))
      .returning();

    if (!updated) {
      throw new NotFoundError('Élève introuvable.');
    }

    return updated;
  });
}

export async function createEnrollment(
  db: DbClient,
  input: CreateEnrollmentInput,
): Promise<EnrollmentDto> {
  return db.transaction(async (tx) => {
    const [student] = await tx
      .select({ id: students.id })
      .from(students)
      .where(eq(students.id, input.studentId))
      .limit(1);

    if (!student) {
      throw new NotFoundError('Élève introuvable.');
    }

    const [year] = await tx
      .select({ id: academicYears.id })
      .from(academicYears)
      .where(eq(academicYears.id, input.academicYearId))
      .limit(1);

    if (!year) {
      throw new NotFoundError('Année scolaire introuvable.');
    }

    const [cls] = await tx
      .select()
      .from(classes)
      .where(eq(classes.id, input.classId))
      .limit(1);

    if (!cls) {
      throw new NotFoundError('Classe introuvable.');
    }

    if (cls.academicYearId !== input.academicYearId) {
      throw new BadRequestError('La classe sélectionnée n’appartient pas à cette année scolaire.');
    }

    const [existingEnrollment] = await tx
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.studentId, input.studentId),
          eq(enrollments.academicYearId, input.academicYearId),
        ),
      )
      .limit(1);

    if (existingEnrollment) {
      throw new ConflictError('Cet élève est déjà inscrit pour cette année scolaire.');
    }

    const syncVersion = await nextSyncVersion(tx);
    const now = new Date();
    const [created] = await tx
      .insert(enrollments)
      .values({
        studentId: input.studentId,
        classId: input.classId,
        academicYearId: input.academicYearId,
        isRepeater: input.isRepeater,
        status: input.status,
        syncVersion,
        enrolledAt: now,
        updatedAt: now,
      })
      .returning();

    if (!created) {
      throw new Error('Échec de création de l’inscription.');
    }

    return created;
  });
}

export async function updateEnrollment(
  db: DbClient,
  id: string,
  input: UpdateEnrollmentInput,
): Promise<EnrollmentDto> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(enrollments)
      .where(eq(enrollments.id, id))
      .limit(1);

    if (!existing) {
      throw new NotFoundError('Inscription introuvable.');
    }

    if (input.classId !== undefined && input.classId !== existing.classId) {
      const [targetClass] = await tx
        .select()
        .from(classes)
        .where(eq(classes.id, input.classId))
        .limit(1);

      if (!targetClass) {
        throw new NotFoundError('Classe introuvable.');
      }

      if (targetClass.academicYearId !== existing.academicYearId) {
        throw new BadRequestError('La nouvelle classe doit appartenir à la même année scolaire.');
      }
    }

    const syncVersion = await nextSyncVersion(tx);
    const [updated] = await tx
      .update(enrollments)
      .set({
        ...(input.classId !== undefined ? { classId: input.classId } : {}),
        ...(input.isRepeater !== undefined ? { isRepeater: input.isRepeater } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        syncVersion,
        updatedAt: new Date(),
      })
      .where(eq(enrollments.id, id))
      .returning();

    if (!updated) {
      throw new NotFoundError('Inscription introuvable.');
    }

    return updated;
  });
}

export async function listClassStudents(
  db: DbClient,
  classId: string,
  currentUser: AuthUserPayload,
  statusFilter?: EnrollmentStatus,
): Promise<ClassStudentDto[]> {
  const [cls] = await db
    .select()
    .from(classes)
    .where(eq(classes.id, classId))
    .limit(1);

  if (!cls) {
    throw new NotFoundError('Classe introuvable.');
  }

  if (currentUser.role === 'teacher') {
    const isMainTeacher = cls.mainTeacherId === currentUser.id;
    if (!isMainTeacher) {
      const [assignment] = await db
        .select({ id: teacherAssignments.id })
        .from(teacherAssignments)
        .innerJoin(classSubjects, eq(teacherAssignments.classSubjectId, classSubjects.id))
        .where(
          and(
            eq(teacherAssignments.teacherId, currentUser.id),
            eq(teacherAssignments.isActive, true),
            eq(classSubjects.classId, classId),
          ),
        )
        .limit(1);

      if (!assignment) {
        throw new ForbiddenError('Accès refusé : vous n’êtes pas affecté à cette classe.');
      }
    }
  }

  const conditions = statusFilter
    ? and(eq(enrollments.classId, classId), eq(enrollments.status, statusFilter))
    : eq(enrollments.classId, classId);

  return db
    .select({
      enrollmentId: enrollments.id,
      studentId: students.id,
      classId: enrollments.classId,
      academicYearId: enrollments.academicYearId,
      matricule: students.matricule,
      lastName: students.lastName,
      firstName: students.firstName,
      birthDate: students.birthDate,
      birthPlace: students.birthPlace,
      sex: students.sex,
      isRepeater: enrollments.isRepeater,
      status: enrollments.status,
      enrolledAt: enrollments.enrolledAt,
      syncVersion: enrollments.syncVersion,
    })
    .from(enrollments)
    .innerJoin(students, eq(enrollments.studentId, students.id))
    .where(conditions)
    .orderBy(asc(students.lastName), asc(students.firstName), asc(students.matricule));
}
