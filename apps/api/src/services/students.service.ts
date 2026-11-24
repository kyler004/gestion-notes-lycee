import {
  type AuthUserPayload,
  CreateStudentSchema,
  type CreateEnrollmentSchema,
  type EnrollmentStatus,
  type ImportStudentsCsvSchema,
  type StudentSex,
  type UpdateEnrollmentSchema,
  type UpdateStudentSchema,
} from '@lycee/shared';
import { and, asc, eq, ilike, inArray, ne, or, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { acquireSyncWriteLock, type DbClient, nextSyncVersion } from '../db/client.js';
import {
  academicYears,
  classes,
  classSubjects,
  councilDecisions,
  enrollments,
  grades,
  periodStudentResults,
  periodSubjectResults,
  students,
  teacherAssignments,
} from '../db/schema.js';
import {
  type CsvRowValidationError,
  type NormalizedCsvStudentRow,
  parseStudentsCsv,
  validateParsedCsvRow,
} from '../lib/csv.js';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../lib/errors.js';
import { escapeLike, type PaginationQuery } from '../lib/sql.js';

export type CreateStudentInput = z.infer<typeof CreateStudentSchema>;
export type UpdateStudentInput = z.infer<typeof UpdateStudentSchema>;
export type CreateEnrollmentInput = z.infer<typeof CreateEnrollmentSchema>;
export type UpdateEnrollmentInput = z.infer<typeof UpdateEnrollmentSchema>;
export type ImportStudentsCsvInput = z.infer<typeof ImportStudentsCsvSchema>;

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

export async function listStudents(
  db: DbClient,
  q?: string,
  pagination: PaginationQuery = { limit: 100, offset: 0 },
): Promise<StudentDto[]> {
  const term = q?.trim();
  if (!term) {
    return db
      .select()
      .from(students)
      .orderBy(asc(students.lastName), asc(students.firstName), asc(students.matricule))
      .limit(pagination.limit)
      .offset(pagination.offset);
  }

  const pattern = `%${escapeLike(term)}%`;
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
    .orderBy(asc(students.lastName), asc(students.firstName), asc(students.matricule))
    .limit(pagination.limit)
    .offset(pagination.offset);
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
  if (input.status !== 'active') {
    throw new BadRequestError('Une nouvelle inscription doit avoir le statut actif (active).');
  }

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

      // Block direct class reassignment once academic records exist for this enrollment (SEC-MED-12).
      const [[hasGrade], [hasDecision], [hasStudentSnap], [hasSubjectSnap]] = await Promise.all([
        tx
          .select({ id: grades.id })
          .from(grades)
          .where(eq(grades.enrollmentId, id))
          .limit(1),
        tx
          .select({ id: councilDecisions.id })
          .from(councilDecisions)
          .where(eq(councilDecisions.enrollmentId, id))
          .limit(1),
        tx
          .select({ id: periodStudentResults.id })
          .from(periodStudentResults)
          .where(eq(periodStudentResults.enrollmentId, id))
          .limit(1),
        tx
          .select({ id: periodSubjectResults.id })
          .from(periodSubjectResults)
          .where(eq(periodSubjectResults.enrollmentId, id))
          .limit(1),
      ]);

      if (hasGrade || hasDecision || hasStudentSnap || hasSubjectSnap) {
        throw new ConflictError(
          'Impossible de transférer cette inscription vers une autre classe : des notes, décisions du conseil ou résultats officiels existent déjà.',
        );
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
  pagination: PaginationQuery = { limit: 100, offset: 0 },
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
  } else if (
    currentUser.role !== 'admin' &&
    currentUser.role !== 'censor' &&
    currentUser.role !== 'principal' &&
    currentUser.role !== 'secretary'
  ) {
    throw new ForbiddenError('Accès refusé.');
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
    .orderBy(asc(students.lastName), asc(students.firstName), asc(students.matricule))
    .limit(pagination.limit)
    .offset(pagination.offset);
}

export interface CsvImportPreviewEntry {
  line: number;
  matricule: string;
  lastName: string;
  firstName: string;
  birthDate: string;
  sex: StudentSex;
  classId: string | null;
  className: string | null;
  isRepeater: boolean;
  action: 'create_student' | 'reuse_student';
}

export interface CsvImportSummary {
  totalRows: number;
  validRows: number;
  errorCount: number;
  studentsToCreate: number;
  studentsReused: number;
  enrollmentsToCreate: number;
}

export interface ImportStudentsCsvResult {
  dryRun: boolean;
  committed: boolean;
  summary: CsvImportSummary;
  errors: CsvRowValidationError[];
  preview: CsvImportPreviewEntry[];
  createdStudents: StudentDto[];
  createdEnrollments: EnrollmentDto[];
}

function isPgUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const record = err as { code?: unknown; cause?: { code?: unknown } };
  return record.code === '23505' || record.cause?.code === '23505';
}

export async function importStudentsCsv(
  db: DbClient,
  input: ImportStudentsCsvInput,
): Promise<ImportStudentsCsvResult> {
  const parsedRows = parseStudentsCsv(input.csvContent, input.delimiter);

  const runEvaluation = async (executor: DbClient) => {
    let resolvedYearId: string | null = null;
    let fixedClass: typeof classes.$inferSelect | null = null;
    const classesByNormalizedName = new Map<string, Array<typeof classes.$inferSelect>>();

    if (input.classId) {
      const [cls] = await executor
        .select()
        .from(classes)
        .where(eq(classes.id, input.classId))
        .limit(1);

      if (!cls) {
        throw new NotFoundError('Classe introuvable.');
      }

      if (input.academicYearId && cls.academicYearId !== input.academicYearId) {
        throw new BadRequestError(
          'La classe sélectionnée n’appartient pas à cette année scolaire.',
        );
      }

      fixedClass = cls;
      resolvedYearId = cls.academicYearId;
    } else if (input.academicYearId) {
      const [year] = await executor
        .select({ id: academicYears.id })
        .from(academicYears)
        .where(eq(academicYears.id, input.academicYearId))
        .limit(1);

      if (!year) {
        throw new NotFoundError('Année scolaire introuvable.');
      }

      resolvedYearId = year.id;
      const yearClasses = await executor
        .select()
        .from(classes)
        .where(eq(classes.academicYearId, year.id));

      for (const cls of yearClasses) {
        const key = cls.name.trim().toLowerCase();
        const list = classesByNormalizedName.get(key) ?? [];
        list.push(cls);
        classesByNormalizedName.set(key, list);
      }
    }

    const errors: CsvRowValidationError[] = [];
    const seenMatricules = new Map<string, number>();
    const structurallyValidRows: Array<{
      row: NormalizedCsvStudentRow;
      targetClassId: string | null;
      targetClassName: string | null;
    }> = [];

    for (const rawRow of parsedRows) {
      const validated = validateParsedCsvRow(rawRow);
      if (!validated.ok) {
        errors.push(validated.error);
        continue;
      }

      const row = validated.data;
      const firstLineSeen = seenMatricules.get(row.matricule);
      if (firstLineSeen !== undefined) {
        errors.push({
          line: row.line,
          matricule: row.matricule,
          field: 'matricule',
          message: `Matricule "${row.matricule}" dupliqué dans le fichier CSV (déjà présent à la ligne ${firstLineSeen}).`,
        });
        continue;
      }
      seenMatricules.set(row.matricule, row.line);

      let targetClassId: string | null = null;
      let targetClassName: string | null = null;

      if (fixedClass) {
        if (
          row.className &&
          row.className.trim().toLowerCase() !== fixedClass.name.trim().toLowerCase()
        ) {
          errors.push({
            line: row.line,
            matricule: row.matricule,
            field: 'className',
            message: `La colonne classe "${row.className}" ne correspond pas à la classe cible "${fixedClass.name}".`,
          });
          continue;
        }
        targetClassId = fixedClass.id;
        targetClassName = fixedClass.name;
      } else if (resolvedYearId) {
        if (row.className) {
          const matches = classesByNormalizedName.get(row.className.trim().toLowerCase()) ?? [];
          if (matches.length === 0) {
            errors.push({
              line: row.line,
              matricule: row.matricule,
              field: 'className',
              message: `Classe "${row.className}" introuvable pour cette année scolaire.`,
            });
            continue;
          }
          if (matches.length > 1) {
            errors.push({
              line: row.line,
              matricule: row.matricule,
              field: 'className',
              message: `Nom de classe ambigu "${row.className}" pour cette année scolaire.`,
            });
            continue;
          }
          targetClassId = matches[0]!.id;
          targetClassName = matches[0]!.name;
        }
      } else if (row.className) {
        errors.push({
          line: row.line,
          matricule: row.matricule,
          field: 'className',
          message: `Précisez classId ou academicYearId pour inscrire l’élève dans la classe "${row.className}".`,
        });
        continue;
      }

      structurallyValidRows.push({
        row,
        targetClassId,
        targetClassName,
      });
    }

    const candidateMatricules = structurallyValidRows.map((item) => item.row.matricule);
    const existingStudentsList =
      candidateMatricules.length > 0
        ? await executor
            .select()
            .from(students)
            .where(inArray(students.matricule, candidateMatricules))
        : [];

    const existingStudentByMatricule = new Map(
      existingStudentsList.map((student) => [student.matricule, student]),
    );

    const existingStudentIds = existingStudentsList.map((s) => s.id);
    const enrolledInYearSet = new Set<string>();
    if (resolvedYearId && existingStudentIds.length > 0) {
      const existingEnrollmentsList = await executor
        .select({ studentId: enrollments.studentId })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.academicYearId, resolvedYearId),
            inArray(enrollments.studentId, existingStudentIds),
          ),
        );
      for (const enr of existingEnrollmentsList) {
        enrolledInYearSet.add(enr.studentId);
      }
    }

    interface PlannedImportAction {
      row: NormalizedCsvStudentRow;
      action: 'create_student' | 'reuse_student';
      existingStudent: StudentDto | null;
      targetClassId: string | null;
      targetClassName: string | null;
    }

    const plannedActions: PlannedImportAction[] = [];

    for (const candidate of structurallyValidRows) {
      const existingStudent = existingStudentByMatricule.get(candidate.row.matricule) ?? null;

      if (existingStudent) {
        if (!input.reuseExistingStudents) {
          errors.push({
            line: candidate.row.line,
            matricule: candidate.row.matricule,
            field: 'matricule',
            message: `Un élève avec le matricule "${candidate.row.matricule}" existe déjà en base.`,
          });
          continue;
        }

        if (!candidate.targetClassId || !resolvedYearId) {
          errors.push({
            line: candidate.row.line,
            matricule: candidate.row.matricule,
            field: 'matricule',
            message: `L’élève "${candidate.row.matricule}" existe déjà ; sélectionnez une classe cible pour le réinscrire.`,
          });
          continue;
        }

        if (enrolledInYearSet.has(existingStudent.id)) {
          errors.push({
            line: candidate.row.line,
            matricule: candidate.row.matricule,
            field: 'matricule',
            message: `L’élève "${candidate.row.matricule}" est déjà inscrit pour cette année scolaire.`,
          });
          continue;
        }

        plannedActions.push({
          row: candidate.row,
          action: 'reuse_student',
          existingStudent,
          targetClassId: candidate.targetClassId,
          targetClassName: candidate.targetClassName,
        });
      } else {
        plannedActions.push({
          row: candidate.row,
          action: 'create_student',
          existingStudent: null,
          targetClassId: candidate.targetClassId,
          targetClassName: candidate.targetClassName,
        });
      }
    }

    errors.sort((a, b) => a.line - b.line);

    const summary: CsvImportSummary = {
      totalRows: parsedRows.length,
      validRows: plannedActions.length,
      errorCount: errors.length,
      studentsToCreate: plannedActions.filter((a) => a.action === 'create_student').length,
      studentsReused: plannedActions.filter((a) => a.action === 'reuse_student').length,
      enrollmentsToCreate: plannedActions.filter(
        (a) => a.targetClassId !== null && resolvedYearId !== null,
      ).length,
    };

    const preview: CsvImportPreviewEntry[] = plannedActions.map((a) => ({
      line: a.row.line,
      matricule: a.row.matricule,
      lastName: a.row.lastName,
      firstName: a.row.firstName,
      birthDate: a.row.birthDate,
      sex: a.row.sex,
      classId: a.targetClassId,
      className: a.targetClassName,
      isRepeater: a.row.isRepeater,
      action: a.action,
    }));

    return {
      resolvedYearId,
      plannedActions,
      summary,
      errors,
      preview,
    };
  };

  if (input.dryRun) {
    const evaluated = await runEvaluation(db);
    return {
      dryRun: true,
      committed: false,
      summary: evaluated.summary,
      errors: evaluated.errors,
      preview: evaluated.preview,
      createdStudents: [],
      createdEnrollments: [],
    };
  }

  try {
    return await db.transaction(async (tx) => {
      const txDb = tx as unknown as DbClient;
      await acquireSyncWriteLock(txDb);

      const evaluated = await runEvaluation(txDb);
      if (evaluated.errors.length > 0) {
        throw new ValidationError(
          'Des erreurs ont été détectées dans le fichier CSV : aucune donnée n’a été importée.',
          {
            summary: evaluated.summary,
            errors: evaluated.errors,
          },
        );
      }

      const now = new Date();
      const createdStudents: StudentDto[] = [];
      const createdEnrollments: EnrollmentDto[] = [];

      for (const item of evaluated.plannedActions) {
        let studentId: string;
        if (item.action === 'create_student') {
          const syncVersion = await nextSyncVersion(txDb);
          const [createdStudent] = await tx
            .insert(students)
            .values({
              matricule: item.row.matricule,
              lastName: item.row.lastName,
              firstName: item.row.firstName,
              birthDate: item.row.birthDate,
              birthPlace: item.row.birthPlace,
              sex: item.row.sex,
              syncVersion,
              createdAt: now,
              updatedAt: now,
            })
            .returning();

          if (!createdStudent) {
            throw new Error('Échec d’insertion d’un élève lors de l’import CSV.');
          }
          createdStudents.push(createdStudent);
          studentId = createdStudent.id;
        } else {
          studentId = item.existingStudent!.id;
        }

        if (item.targetClassId && evaluated.resolvedYearId) {
          const enrollmentSyncVersion = await nextSyncVersion(txDb);
          const [createdEnrollment] = await tx
            .insert(enrollments)
            .values({
              studentId,
              classId: item.targetClassId,
              academicYearId: evaluated.resolvedYearId,
              isRepeater: item.row.isRepeater,
              status: 'active',
              syncVersion: enrollmentSyncVersion,
              enrolledAt: now,
              updatedAt: now,
            })
            .returning();

          if (!createdEnrollment) {
            throw new Error('Échec d’insertion d’une inscription lors de l’import CSV.');
          }
          createdEnrollments.push(createdEnrollment);
        }
      }

      return {
        dryRun: false,
        committed: true,
        summary: evaluated.summary,
        errors: [],
        preview: [],
        createdStudents,
        createdEnrollments,
      };
    });
  } catch (err) {
    if (isPgUniqueViolation(err)) {
      throw new ConflictError(
        'Conflit d’unicité lors de l’import CSV (matricule ou inscription déjà existante).',
      );
    }
    throw err;
  }
}

