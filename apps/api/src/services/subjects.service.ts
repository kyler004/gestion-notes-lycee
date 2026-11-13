import type {
  AuthUserPayload,
  CreateSubjectGroupSchema,
  CreateSubjectSchema,
  CreateTeacherAssignmentSchema,
  UpdateSubjectSchema,
  UpsertClassSubjectSchema,
  UserRole,
} from '@lycee/shared';
import { and, asc, eq, ne, type SQL } from 'drizzle-orm';
import type { z } from 'zod';
import { type DbClient, nextSyncVersion } from '../db/client.js';
import {
  academicYears,
  classes,
  classSubjects,
  periods,
  subjectGroups,
  subjects,
  teacherAssignments,
  users,
} from '../db/schema.js';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../lib/errors.js';
import type { PaginationQuery } from '../lib/sql.js';

export type CreateSubjectGroupInput = z.infer<typeof CreateSubjectGroupSchema>;
export type CreateSubjectInput = z.infer<typeof CreateSubjectSchema>;
export type UpdateSubjectInput = z.infer<typeof UpdateSubjectSchema>;
export type UpsertClassSubjectInput = z.infer<typeof UpsertClassSubjectSchema>;
export type CreateTeacherAssignmentInput = z.infer<typeof CreateTeacherAssignmentSchema>;

export interface SubjectGroupDto {
  id: string;
  academicYearId: string;
  name: string;
  orderIndex: number;
  syncVersion: number;
}

export interface SubjectDto {
  id: string;
  code: string;
  name: string;
  shortName: string;
  isActive: boolean;
  syncVersion: number;
  updatedAt: Date;
}

export interface ClassSubjectDto {
  id: string;
  classId: string;
  subjectId: string;
  subjectGroupId: string | null;
  coefficient: number;
  syncVersion: number;
  updatedAt: Date;
}

export interface ClassSubjectDetailDto extends ClassSubjectDto {
  subjectCode: string;
  subjectName: string;
  subjectShortName: string;
  subjectIsActive: boolean;
  subjectGroupName: string | null;
  subjectGroupOrder: number | null;
}

export interface TeacherAssignmentDto {
  id: string;
  teacherId: string;
  classSubjectId: string;
  academicYearId: string;
  isActive: boolean;
  syncVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeacherAssignmentDetailDto extends TeacherAssignmentDto {
  teacherName: string;
  teacherUsername: string;
  teacherRole: UserRole;
  academicYearLabel: string;
  classId: string;
  className: string;
  classLevel: string;
  classSeries: string | null;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  subjectShortName: string;
  coefficient: number;
  subjectGroupId: string | null;
  subjectGroupName: string | null;
}

export interface TeacherAssignmentFilters {
  academicYearId?: string;
  classId?: string;
  teacherId?: string;
  includeInactive?: boolean;
}

export async function listSubjectGroups(
  db: DbClient,
  academicYearId?: string,
  pagination: PaginationQuery = { limit: 100, offset: 0 },
): Promise<SubjectGroupDto[]> {
  const baseQuery = db.select().from(subjectGroups);
  if (academicYearId) {
    return baseQuery
      .where(eq(subjectGroups.academicYearId, academicYearId))
      .orderBy(asc(subjectGroups.orderIndex), asc(subjectGroups.name))
      .limit(pagination.limit)
      .offset(pagination.offset);
  }
  return baseQuery
    .orderBy(asc(subjectGroups.orderIndex), asc(subjectGroups.name))
    .limit(pagination.limit)
    .offset(pagination.offset);
}

export async function createSubjectGroup(
  db: DbClient,
  input: CreateSubjectGroupInput,
): Promise<SubjectGroupDto> {
  return db.transaction(async (tx) => {
    const [year] = await tx
      .select({ id: academicYears.id })
      .from(academicYears)
      .where(eq(academicYears.id, input.academicYearId))
      .limit(1);

    if (!year) {
      throw new NotFoundError('Année scolaire introuvable.');
    }

    const [existing] = await tx
      .select({ id: subjectGroups.id })
      .from(subjectGroups)
      .where(
        and(
          eq(subjectGroups.academicYearId, input.academicYearId),
          eq(subjectGroups.name, input.name),
        ),
      )
      .limit(1);

    if (existing) {
      throw new ConflictError(
        `Le groupe de matières "${input.name}" existe déjà pour cette année scolaire.`,
      );
    }

    const syncVersion = await nextSyncVersion(tx);
    const [created] = await tx
      .insert(subjectGroups)
      .values({
        academicYearId: input.academicYearId,
        name: input.name,
        orderIndex: input.orderIndex,
        syncVersion,
      })
      .returning();

    if (!created) {
      throw new Error('Échec de création du groupe de matières.');
    }

    return created;
  });
}

export async function listSubjects(
  db: DbClient,
  activeOnly?: boolean,
  pagination: PaginationQuery = { limit: 100, offset: 0 },
): Promise<SubjectDto[]> {
  const baseQuery = db.select().from(subjects);
  if (activeOnly === true) {
    return baseQuery
      .where(eq(subjects.isActive, true))
      .orderBy(asc(subjects.name))
      .limit(pagination.limit)
      .offset(pagination.offset);
  }
  return baseQuery
    .orderBy(asc(subjects.name))
    .limit(pagination.limit)
    .offset(pagination.offset);
}

export async function createSubject(db: DbClient, input: CreateSubjectInput): Promise<SubjectDto> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: subjects.id })
      .from(subjects)
      .where(eq(subjects.code, input.code))
      .limit(1);

    if (existing) {
      throw new ConflictError(`Une matière avec le code "${input.code}" existe déjà.`);
    }

    const syncVersion = await nextSyncVersion(tx);
    const [created] = await tx
      .insert(subjects)
      .values({
        code: input.code,
        name: input.name,
        shortName: input.shortName,
        isActive: input.isActive,
        syncVersion,
        updatedAt: new Date(),
      })
      .returning();

    if (!created) {
      throw new Error('Échec de création de la matière.');
    }

    return created;
  });
}

export async function updateSubject(
  db: DbClient,
  id: string,
  input: UpdateSubjectInput,
): Promise<SubjectDto> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(subjects)
      .where(eq(subjects.id, id))
      .limit(1);

    if (!existing) {
      throw new NotFoundError('Matière introuvable.');
    }

    if (input.code !== undefined && input.code !== existing.code) {
      const [duplicate] = await tx
        .select({ id: subjects.id })
        .from(subjects)
        .where(and(eq(subjects.code, input.code), ne(subjects.id, id)))
        .limit(1);

      if (duplicate) {
        throw new ConflictError(`Une matière avec le code "${input.code}" existe déjà.`);
      }
    }

    const syncVersion = await nextSyncVersion(tx);
    const [updated] = await tx
      .update(subjects)
      .set({
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.shortName !== undefined ? { shortName: input.shortName } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        syncVersion,
        updatedAt: new Date(),
      })
      .where(eq(subjects.id, id))
      .returning();

    if (!updated) {
      throw new NotFoundError('Matière introuvable.');
    }

    return updated;
  });
}

export async function listClassSubjects(
  db: DbClient,
  classId: string,
  currentUser: AuthUserPayload,
  pagination: PaginationQuery = { limit: 100, offset: 0 },
): Promise<ClassSubjectDetailDto[]> {
  const [cls] = await db
    .select({ id: classes.id, mainTeacherId: classes.mainTeacherId })
    .from(classes)
    .where(eq(classes.id, classId))
    .limit(1);

  if (!cls) {
    throw new NotFoundError('Classe introuvable.');
  }

  if (currentUser.role === 'teacher') {
    if (cls.mainTeacherId !== currentUser.id) {
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

  const rows = await db
    .select({
      id: classSubjects.id,
      classId: classSubjects.classId,
      subjectId: classSubjects.subjectId,
      subjectGroupId: classSubjects.subjectGroupId,
      coefficient: classSubjects.coefficient,
      syncVersion: classSubjects.syncVersion,
      updatedAt: classSubjects.updatedAt,
      subjectCode: subjects.code,
      subjectName: subjects.name,
      subjectShortName: subjects.shortName,
      subjectIsActive: subjects.isActive,
      subjectGroupName: subjectGroups.name,
      subjectGroupOrder: subjectGroups.orderIndex,
    })
    .from(classSubjects)
    .innerJoin(subjects, eq(classSubjects.subjectId, subjects.id))
    .leftJoin(subjectGroups, eq(classSubjects.subjectGroupId, subjectGroups.id))
    .where(eq(classSubjects.classId, classId))
    .orderBy(asc(subjectGroups.orderIndex), asc(subjects.name))
    .limit(pagination.limit)
    .offset(pagination.offset);

  return rows.map((row) => ({
    ...row,
    coefficient: Number(row.coefficient),
    subjectGroupName: row.subjectGroupName ?? null,
    subjectGroupOrder: row.subjectGroupOrder ?? null,
  }));
}

export async function upsertClassSubject(
  db: DbClient,
  input: UpsertClassSubjectInput,
): Promise<ClassSubjectDto> {
  return db.transaction(async (tx) => {
    const [cls] = await tx
      .select()
      .from(classes)
      .where(eq(classes.id, input.classId))
      .limit(1);

    if (!cls) {
      throw new NotFoundError('Classe introuvable.');
    }

    const [subject] = await tx
      .select({ id: subjects.id, isActive: subjects.isActive })
      .from(subjects)
      .where(eq(subjects.id, input.subjectId))
      .limit(1);

    if (!subject) {
      throw new NotFoundError('Matière introuvable.');
    }

    if (!subject.isActive) {
      throw new BadRequestError('Impossible d’associer une matière archivée (inactive) à une classe.');
    }

    if (input.subjectGroupId) {
      const [group] = await tx
        .select()
        .from(subjectGroups)
        .where(eq(subjectGroups.id, input.subjectGroupId))
        .limit(1);

      if (!group) {
        throw new NotFoundError('Groupe de matières introuvable.');
      }

      if (group.academicYearId !== cls.academicYearId) {
        throw new BadRequestError(
          'Le groupe de matières doit appartenir à la même année scolaire que la classe.',
        );
      }
    }

    // Lock periods of the academic year in deterministic UUID order before sync version acquisition (SEC-HIGH-07).
    const yearPeriods = await tx
      .select({ id: periods.id, status: periods.status })
      .from(periods)
      .where(eq(periods.academicYearId, cls.academicYearId))
      .orderBy(asc(periods.id))
      .for('share');

    if (yearPeriods.some((period) => period.status === 'locked')) {
      throw new ConflictError(
        'Impossible de modifier les matières ou coefficients de la classe : au moins une période de cette année scolaire est verrouillée.',
      );
    }

    const syncVersion = await nextSyncVersion(tx);
    const now = new Date();
    const [saved] = await tx
      .insert(classSubjects)
      .values({
        classId: input.classId,
        subjectId: input.subjectId,
        subjectGroupId: input.subjectGroupId ?? null,
        coefficient: input.coefficient.toFixed(2),
        syncVersion,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [classSubjects.classId, classSubjects.subjectId],
        set: {
          subjectGroupId: input.subjectGroupId ?? null,
          coefficient: input.coefficient.toFixed(2),
          syncVersion,
          updatedAt: now,
        },
      })
      .returning();

    if (!saved) {
      throw new Error('Échec de l’association matière-classe.');
    }

    return {
      ...saved,
      coefficient: Number(saved.coefficient),
    };
  });
}

async function queryTeacherAssignmentDetails(
  db: DbClient,
  conditions: SQL[],
  pagination: PaginationQuery,
): Promise<TeacherAssignmentDetailDto[]> {
  const rows = await db
    .select({
      id: teacherAssignments.id,
      teacherId: teacherAssignments.teacherId,
      classSubjectId: teacherAssignments.classSubjectId,
      academicYearId: teacherAssignments.academicYearId,
      isActive: teacherAssignments.isActive,
      syncVersion: teacherAssignments.syncVersion,
      createdAt: teacherAssignments.createdAt,
      updatedAt: teacherAssignments.updatedAt,
      teacherName: users.fullName,
      teacherUsername: users.username,
      teacherRole: users.role,
      academicYearLabel: academicYears.label,
      classId: classes.id,
      className: classes.name,
      classLevel: classes.level,
      classSeries: classes.series,
      subjectId: subjects.id,
      subjectCode: subjects.code,
      subjectName: subjects.name,
      subjectShortName: subjects.shortName,
      coefficient: classSubjects.coefficient,
      subjectGroupId: subjectGroups.id,
      subjectGroupName: subjectGroups.name,
    })
    .from(teacherAssignments)
    .innerJoin(users, eq(teacherAssignments.teacherId, users.id))
    .innerJoin(academicYears, eq(teacherAssignments.academicYearId, academicYears.id))
    .innerJoin(classSubjects, eq(teacherAssignments.classSubjectId, classSubjects.id))
    .innerJoin(classes, eq(classSubjects.classId, classes.id))
    .innerJoin(subjects, eq(classSubjects.subjectId, subjects.id))
    .leftJoin(subjectGroups, eq(classSubjects.subjectGroupId, subjectGroups.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(classes.level), asc(classes.name), asc(subjects.name), asc(users.fullName))
    .limit(pagination.limit)
    .offset(pagination.offset);

  return rows.map((row) => ({
    ...row,
    coefficient: Number(row.coefficient),
    subjectGroupId: row.subjectGroupId ?? null,
    subjectGroupName: row.subjectGroupName ?? null,
  }));
}

export async function listTeacherAssignments(
  db: DbClient,
  filters: TeacherAssignmentFilters,
  pagination: PaginationQuery = { limit: 100, offset: 0 },
): Promise<TeacherAssignmentDetailDto[]> {
  const conditions: SQL[] = [];
  if (filters.academicYearId) {
    conditions.push(eq(teacherAssignments.academicYearId, filters.academicYearId));
  }
  if (filters.classId) {
    conditions.push(eq(classSubjects.classId, filters.classId));
  }
  if (filters.teacherId) {
    conditions.push(eq(teacherAssignments.teacherId, filters.teacherId));
  }
  if (!filters.includeInactive) {
    conditions.push(eq(teacherAssignments.isActive, true));
  }

  return queryTeacherAssignmentDetails(db, conditions, pagination);
}

export async function createOrReactivateTeacherAssignment(
  db: DbClient,
  input: CreateTeacherAssignmentInput,
): Promise<{ assignment: TeacherAssignmentDto; created: boolean }> {
  return db.transaction(async (tx) => {
    const [teacher] = await tx
      .select({
        id: users.id,
        role: users.role,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, input.teacherId))
      .limit(1);

    if (!teacher) {
      throw new NotFoundError('Enseignant introuvable.');
    }
    if (teacher.role !== 'teacher') {
      throw new BadRequestError(
        'Seul un utilisateur disposant du rôle enseignant peut être affecté à une matière.',
      );
    }
    if (!teacher.isActive) {
      throw new BadRequestError('Impossible d’affecter un utilisateur inactif.');
    }

    const [year] = await tx
      .select({ id: academicYears.id })
      .from(academicYears)
      .where(eq(academicYears.id, input.academicYearId))
      .limit(1);

    if (!year) {
      throw new NotFoundError('Année scolaire introuvable.');
    }

    const [csRow] = await tx
      .select({
        id: classSubjects.id,
        classAcademicYearId: classes.academicYearId,
      })
      .from(classSubjects)
      .innerJoin(classes, eq(classSubjects.classId, classes.id))
      .where(eq(classSubjects.id, input.classSubjectId))
      .limit(1);

    if (!csRow) {
      throw new NotFoundError('Matière de classe introuvable.');
    }

    if (csRow.classAcademicYearId !== input.academicYearId) {
      throw new BadRequestError('La matière de classe n’appartient pas à cette année scolaire.');
    }

    const [existing] = await tx
      .select({ id: teacherAssignments.id })
      .from(teacherAssignments)
      .where(
        and(
          eq(teacherAssignments.teacherId, input.teacherId),
          eq(teacherAssignments.classSubjectId, input.classSubjectId),
        ),
      )
      .limit(1);

    const syncVersion = await nextSyncVersion(tx);
    const now = new Date();
    const [saved] = await tx
      .insert(teacherAssignments)
      .values({
        teacherId: input.teacherId,
        classSubjectId: input.classSubjectId,
        academicYearId: input.academicYearId,
        isActive: true,
        syncVersion,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [teacherAssignments.teacherId, teacherAssignments.classSubjectId],
        set: {
          academicYearId: input.academicYearId,
          isActive: true,
          syncVersion,
          updatedAt: now,
        },
      })
      .returning();

    if (!saved) {
      throw new Error('Échec de l’affectation de l’enseignant.');
    }

    return {
      assignment: saved,
      created: !existing,
    };
  });
}

export async function deactivateTeacherAssignment(
  db: DbClient,
  id: string,
): Promise<TeacherAssignmentDto> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(teacherAssignments)
      .where(eq(teacherAssignments.id, id))
      .limit(1);

    if (!existing) {
      throw new NotFoundError('Affectation introuvable.');
    }

    const syncVersion = await nextSyncVersion(tx);
    const [updated] = await tx
      .update(teacherAssignments)
      .set({
        isActive: false,
        syncVersion,
        updatedAt: new Date(),
      })
      .where(eq(teacherAssignments.id, id))
      .returning();

    if (!updated) {
      throw new NotFoundError('Affectation introuvable.');
    }

    return updated;
  });
}

export async function listMyTeacherAssignments(
  db: DbClient,
  teacherId: string,
  academicYearId?: string,
  pagination: PaginationQuery = { limit: 100, offset: 0 },
): Promise<TeacherAssignmentDetailDto[]> {
  const conditions: SQL[] = [
    eq(teacherAssignments.teacherId, teacherId),
    eq(teacherAssignments.isActive, true),
  ];
  if (academicYearId) {
    conditions.push(eq(teacherAssignments.academicYearId, academicYearId));
  }

  return queryTeacherAssignmentDetails(db, conditions, pagination);
}
