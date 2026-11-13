import {
  CAMEROON_DEFAULT_GRADING_RULES,
  type AppreciationBand,
  type CreateAcademicYearSchema,
  type CreateClassSchema,
  type CreatePeriodSchema,
  type GradingRulesSchema,
  type PeriodStatus,
  type PeriodType,
  type UpdateClassSchema,
  type UpdatePeriodSchema,
} from '@lycee/shared';
import { and, asc, desc, eq, ne } from 'drizzle-orm';
import type { z } from 'zod';
import { type DbClient, nextSyncVersion } from '../db/client.js';
import { academicYears, classes, gradingRules, periods, users } from '../db/schema.js';
import { BadRequestError, ConflictError, NotFoundError } from '../lib/errors.js';

export type CreateAcademicYearInput = z.infer<typeof CreateAcademicYearSchema>;
export type GradingRulesInput = z.infer<typeof GradingRulesSchema>;
export type CreatePeriodInput = z.infer<typeof CreatePeriodSchema>;
export type UpdatePeriodInput = z.infer<typeof UpdatePeriodSchema>;
export type CreateClassInput = z.infer<typeof CreateClassSchema>;
export type UpdateClassInput = z.infer<typeof UpdateClassSchema>;

export interface AcademicYearDto {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  syncVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface GradingRulesDto {
  id: string;
  academicYearId: string;
  trimestersCount: number;
  sequencesPerTrimester: number;
  sequenceWeights: number[];
  trimesterWeights: number[];
  passingThreshold: number;
  honorRollThreshold: number;
  encouragementThreshold: number;
  congratulationThreshold: number;
  treatAbsentAsZero: boolean;
  appreciationScale: AppreciationBand[];
  syncVersion: number;
  updatedAt: Date;
}

export interface PeriodDto {
  id: string;
  academicYearId: string;
  parentPeriodId: string | null;
  type: PeriodType;
  code: string;
  name: string;
  orderIndex: number;
  weight: number;
  status: PeriodStatus;
  lockedAt: Date | null;
  lockedBy: string | null;
  syncVersion: number;
  updatedAt: Date;
}

export interface ClassDto {
  id: string;
  academicYearId: string;
  name: string;
  level: string;
  series: string | null;
  mainTeacherId: string | null;
  mainTeacherName: string | null;
  syncVersion: number;
  updatedAt: Date;
}

export interface CreateAcademicYearResult {
  academicYear: AcademicYearDto;
  gradingRules: GradingRulesDto | null;
  periods: PeriodDto[];
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

function formatGradingRules(row: typeof gradingRules.$inferSelect): GradingRulesDto {
  return {
    id: row.id,
    academicYearId: row.academicYearId,
    trimestersCount: row.trimestersCount,
    sequencesPerTrimester: row.sequencesPerTrimester,
    sequenceWeights: row.sequenceWeights,
    trimesterWeights: row.trimesterWeights,
    passingThreshold: Number(row.passingThreshold),
    honorRollThreshold: Number(row.honorRollThreshold),
    encouragementThreshold: Number(row.encouragementThreshold),
    congratulationThreshold: Number(row.congratulationThreshold),
    treatAbsentAsZero: row.treatAbsentAsZero,
    appreciationScale: row.appreciationScale,
    syncVersion: row.syncVersion,
    updatedAt: row.updatedAt,
  };
}

function formatPeriod(row: typeof periods.$inferSelect): PeriodDto {
  return {
    id: row.id,
    academicYearId: row.academicYearId,
    parentPeriodId: row.parentPeriodId,
    type: row.type,
    code: row.code,
    name: row.name,
    orderIndex: row.orderIndex,
    weight: Number(row.weight),
    status: row.status,
    lockedAt: row.lockedAt,
    lockedBy: row.lockedBy,
    syncVersion: row.syncVersion,
    updatedAt: row.updatedAt,
  };
}

export async function listAcademicYears(db: DbClient): Promise<AcademicYearDto[]> {
  return db
    .select()
    .from(academicYears)
    .orderBy(desc(academicYears.startDate), desc(academicYears.createdAt));
}

export async function createAcademicYear(
  db: DbClient,
  input: CreateAcademicYearInput,
): Promise<CreateAcademicYearResult> {
  assertValidIsoDate(input.startDate, 'startDate');
  assertValidIsoDate(input.endDate, 'endDate');
  if (input.endDate <= input.startDate) {
    throw new BadRequestError('La date de fin doit être postérieure à la date de début.');
  }

  return db.transaction(async (tx) => {
    const [existingLabel] = await tx
      .select({ id: academicYears.id })
      .from(academicYears)
      .where(eq(academicYears.label, input.label))
      .limit(1);

    if (existingLabel) {
      throw new ConflictError(`Une année scolaire avec le libellé "${input.label}" existe déjà.`);
    }

    const now = new Date();
    if (input.isActive) {
      const currentlyActive = await tx
        .select({ id: academicYears.id })
        .from(academicYears)
        .where(eq(academicYears.isActive, true));

      for (const prev of currentlyActive) {
        const prevSync = await nextSyncVersion(tx);
        await tx
          .update(academicYears)
          .set({ isActive: false, syncVersion: prevSync, updatedAt: now })
          .where(eq(academicYears.id, prev.id));
      }
    }

    const yearSync = await nextSyncVersion(tx);
    const [createdYear] = await tx
      .insert(academicYears)
      .values({
        label: input.label,
        startDate: input.startDate,
        endDate: input.endDate,
        isActive: input.isActive,
        syncVersion: yearSync,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!createdYear) {
      throw new Error('Échec de création de l’année scolaire.');
    }

    if (!input.initializeCameroonDefaults) {
      return {
        academicYear: createdYear,
        gradingRules: null,
        periods: [],
      };
    }

    const rulesSync = await nextSyncVersion(tx);
    const [createdRules] = await tx
      .insert(gradingRules)
      .values({
        academicYearId: createdYear.id,
        trimestersCount: CAMEROON_DEFAULT_GRADING_RULES.trimestersCount,
        sequencesPerTrimester: CAMEROON_DEFAULT_GRADING_RULES.sequencesPerTrimester,
        sequenceWeights: CAMEROON_DEFAULT_GRADING_RULES.sequenceWeights,
        trimesterWeights: CAMEROON_DEFAULT_GRADING_RULES.trimesterWeights,
        passingThreshold: CAMEROON_DEFAULT_GRADING_RULES.passingThreshold.toFixed(2),
        honorRollThreshold: CAMEROON_DEFAULT_GRADING_RULES.honorRollThreshold.toFixed(2),
        encouragementThreshold: CAMEROON_DEFAULT_GRADING_RULES.encouragementThreshold.toFixed(2),
        congratulationThreshold: CAMEROON_DEFAULT_GRADING_RULES.congratulationThreshold.toFixed(2),
        treatAbsentAsZero: CAMEROON_DEFAULT_GRADING_RULES.treatAbsentAsZero,
        appreciationScale: CAMEROON_DEFAULT_GRADING_RULES.appreciationScale,
        syncVersion: rulesSync,
        updatedAt: now,
      })
      .returning();

    if (!createdRules) {
      throw new Error('Échec de création des règles de notation par défaut.');
    }

    const trimesterDefs = [
      { code: 'T1', name: '1er Trimestre', orderIndex: 1 },
      { code: 'T2', name: '2ème Trimestre', orderIndex: 2 },
      { code: 'T3', name: '3ème Trimestre', orderIndex: 3 },
    ] as const;

    const createdTrimesters: Array<typeof periods.$inferSelect> = [];
    for (const tri of trimesterDefs) {
      const pSync = await nextSyncVersion(tx);
      const [insertedTri] = await tx
        .insert(periods)
        .values({
          academicYearId: createdYear.id,
          parentPeriodId: null,
          type: 'trimester',
          code: tri.code,
          name: tri.name,
          orderIndex: tri.orderIndex,
          weight: '1.00',
          status: 'open',
          syncVersion: pSync,
          updatedAt: now,
        })
        .returning();
      if (!insertedTri) {
        throw new Error(`Échec de création du trimestre ${tri.code}.`);
      }
      createdTrimesters.push(insertedTri);
    }

    const sequenceDefs = [
      { code: 'S1', name: '1ère Séquence', orderIndex: 1, trimesterIdx: 0 },
      { code: 'S2', name: '2ème Séquence', orderIndex: 2, trimesterIdx: 0 },
      { code: 'S3', name: '3ème Séquence', orderIndex: 3, trimesterIdx: 1 },
      { code: 'S4', name: '4ème Séquence', orderIndex: 4, trimesterIdx: 1 },
      { code: 'S5', name: '5ème Séquence', orderIndex: 5, trimesterIdx: 2 },
      { code: 'S6', name: '6ème Séquence', orderIndex: 6, trimesterIdx: 2 },
    ] as const;

    const createdSequences: Array<typeof periods.$inferSelect> = [];
    for (const seq of sequenceDefs) {
      const parentTrimester = createdTrimesters[seq.trimesterIdx];
      if (!parentTrimester) {
        throw new Error(`Trimestre parent manquant pour ${seq.code}.`);
      }
      const pSync = await nextSyncVersion(tx);
      const [insertedSeq] = await tx
        .insert(periods)
        .values({
          academicYearId: createdYear.id,
          parentPeriodId: parentTrimester.id,
          type: 'sequence',
          code: seq.code,
          name: seq.name,
          orderIndex: seq.orderIndex,
          weight: '1.00',
          status: 'open',
          syncVersion: pSync,
          updatedAt: now,
        })
        .returning();
      if (!insertedSeq) {
        throw new Error(`Échec de création de la séquence ${seq.code}.`);
      }
      createdSequences.push(insertedSeq);
    }

    return {
      academicYear: createdYear,
      gradingRules: formatGradingRules(createdRules),
      periods: [...createdTrimesters, ...createdSequences].map(formatPeriod),
    };
  });
}

export async function activateAcademicYear(db: DbClient, id: string): Promise<AcademicYearDto> {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select()
      .from(academicYears)
      .where(eq(academicYears.id, id))
      .limit(1);

    if (!target) {
      throw new NotFoundError('Année scolaire introuvable.');
    }

    const now = new Date();
    const otherActive = await tx
      .select({ id: academicYears.id })
      .from(academicYears)
      .where(and(eq(academicYears.isActive, true), ne(academicYears.id, id)));

    for (const prev of otherActive) {
      const prevSync = await nextSyncVersion(tx);
      await tx
        .update(academicYears)
        .set({ isActive: false, syncVersion: prevSync, updatedAt: now })
        .where(eq(academicYears.id, prev.id));
    }

    const targetSync = await nextSyncVersion(tx);
    const [activated] = await tx
      .update(academicYears)
      .set({ isActive: true, syncVersion: targetSync, updatedAt: now })
      .where(eq(academicYears.id, id))
      .returning();

    if (!activated) {
      throw new NotFoundError('Année scolaire introuvable.');
    }

    return activated;
  });
}

export async function getGradingRules(db: DbClient, yearId: string): Promise<GradingRulesDto> {
  const [year] = await db
    .select({ id: academicYears.id })
    .from(academicYears)
    .where(eq(academicYears.id, yearId))
    .limit(1);

  if (!year) {
    throw new NotFoundError('Année scolaire introuvable.');
  }

  const [rules] = await db
    .select()
    .from(gradingRules)
    .where(eq(gradingRules.academicYearId, yearId))
    .limit(1);

  if (!rules) {
    throw new NotFoundError('Règles de notation introuvables pour cette année scolaire.');
  }

  return formatGradingRules(rules);
}

export async function upsertGradingRules(
  db: DbClient,
  yearId: string,
  input: GradingRulesInput,
): Promise<GradingRulesDto> {
  for (const band of input.appreciationScale) {
    if (band.min > band.max) {
      throw new BadRequestError(
        `Plage d’appréciation invalide pour "${band.label}" : min (${band.min}) > max (${band.max}).`,
      );
    }
  }

  return db.transaction(async (tx) => {
    const [year] = await tx
      .select({ id: academicYears.id })
      .from(academicYears)
      .where(eq(academicYears.id, yearId))
      .limit(1);

    if (!year) {
      throw new NotFoundError('Année scolaire introuvable.');
    }

    const syncVersion = await nextSyncVersion(tx);
    const now = new Date();
    const values = {
      academicYearId: yearId,
      trimestersCount: input.trimestersCount,
      sequencesPerTrimester: input.sequencesPerTrimester,
      sequenceWeights: input.sequenceWeights,
      trimesterWeights: input.trimesterWeights,
      passingThreshold: input.passingThreshold.toFixed(2),
      honorRollThreshold: input.honorRollThreshold.toFixed(2),
      encouragementThreshold: input.encouragementThreshold.toFixed(2),
      congratulationThreshold: input.congratulationThreshold.toFixed(2),
      treatAbsentAsZero: input.treatAbsentAsZero,
      appreciationScale: input.appreciationScale,
      syncVersion,
      updatedAt: now,
    };

    const [saved] = await tx
      .insert(gradingRules)
      .values(values)
      .onConflictDoUpdate({
        target: gradingRules.academicYearId,
        set: {
          trimestersCount: values.trimestersCount,
          sequencesPerTrimester: values.sequencesPerTrimester,
          sequenceWeights: values.sequenceWeights,
          trimesterWeights: values.trimesterWeights,
          passingThreshold: values.passingThreshold,
          honorRollThreshold: values.honorRollThreshold,
          encouragementThreshold: values.encouragementThreshold,
          congratulationThreshold: values.congratulationThreshold,
          treatAbsentAsZero: values.treatAbsentAsZero,
          appreciationScale: values.appreciationScale,
          syncVersion: values.syncVersion,
          updatedAt: values.updatedAt,
        },
      })
      .returning();

    if (!saved) {
      throw new Error('Échec de mise à jour des règles de notation.');
    }

    return formatGradingRules(saved);
  });
}

export async function listPeriods(db: DbClient, yearId: string): Promise<PeriodDto[]> {
  const [year] = await db
    .select({ id: academicYears.id })
    .from(academicYears)
    .where(eq(academicYears.id, yearId))
    .limit(1);

  if (!year) {
    throw new NotFoundError('Année scolaire introuvable.');
  }

  const rows = await db
    .select()
    .from(periods)
    .where(eq(periods.academicYearId, yearId))
    .orderBy(desc(periods.type), asc(periods.orderIndex));

  return rows.map(formatPeriod);
}

export async function createPeriod(db: DbClient, input: CreatePeriodInput): Promise<PeriodDto> {
  return db.transaction(async (tx) => {
    const [year] = await tx
      .select({ id: academicYears.id })
      .from(academicYears)
      .where(eq(academicYears.id, input.academicYearId))
      .limit(1);

    if (!year) {
      throw new NotFoundError('Année scolaire introuvable.');
    }

    if (input.parentPeriodId) {
      if (input.type === 'trimester') {
        throw new BadRequestError('Un trimestre ne peut pas être rattaché à une période parente.');
      }
      const [parent] = await tx
        .select()
        .from(periods)
        .where(eq(periods.id, input.parentPeriodId))
        .limit(1);
      if (!parent) {
        throw new NotFoundError('Période parente introuvable.');
      }
      if (parent.academicYearId !== input.academicYearId) {
        throw new BadRequestError('La période parente doit appartenir à la même année scolaire.');
      }
      if (parent.type !== 'trimester') {
        throw new BadRequestError('La période parente d’une séquence doit être un trimestre.');
      }
    }

    const [existingCode] = await tx
      .select({ id: periods.id })
      .from(periods)
      .where(and(eq(periods.academicYearId, input.academicYearId), eq(periods.code, input.code)))
      .limit(1);

    if (existingCode) {
      throw new ConflictError(`Une période avec le code "${input.code}" existe déjà pour cette année scolaire.`);
    }

    const syncVersion = await nextSyncVersion(tx);
    const now = new Date();
    const [created] = await tx
      .insert(periods)
      .values({
        academicYearId: input.academicYearId,
        parentPeriodId: input.parentPeriodId ?? null,
        type: input.type,
        code: input.code,
        name: input.name,
        orderIndex: input.orderIndex,
        weight: input.weight.toFixed(2),
        status: 'open',
        syncVersion,
        updatedAt: now,
      })
      .returning();

    if (!created) {
      throw new Error('Échec de création de la période.');
    }

    return formatPeriod(created);
  });
}

export async function updatePeriod(
  db: DbClient,
  id: string,
  input: UpdatePeriodInput,
): Promise<PeriodDto> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(periods)
      .where(eq(periods.id, id))
      .limit(1);

    if (!existing) {
      throw new NotFoundError('Période introuvable.');
    }

    if (input.status !== undefined && input.status !== existing.status) {
      throw new BadRequestError(
        'Le verrouillage et le déverrouillage d’une période doivent être effectués via le module de validation.',
      );
    }

    const syncVersion = await nextSyncVersion(tx);
    const [updated] = await tx
      .update(periods)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.weight !== undefined ? { weight: input.weight.toFixed(2) } : {}),
        syncVersion,
        updatedAt: new Date(),
      })
      .where(eq(periods.id, id))
      .returning();

    if (!updated) {
      throw new NotFoundError('Période introuvable.');
    }

    return formatPeriod(updated);
  });
}

export async function listClasses(db: DbClient, academicYearId?: string): Promise<ClassDto[]> {
  const baseQuery = db
    .select({
      id: classes.id,
      academicYearId: classes.academicYearId,
      name: classes.name,
      level: classes.level,
      series: classes.series,
      mainTeacherId: classes.mainTeacherId,
      mainTeacherName: users.fullName,
      syncVersion: classes.syncVersion,
      updatedAt: classes.updatedAt,
    })
    .from(classes)
    .leftJoin(users, eq(classes.mainTeacherId, users.id));

  const rows = academicYearId
    ? await baseQuery
        .where(eq(classes.academicYearId, academicYearId))
        .orderBy(asc(classes.level), asc(classes.name))
    : await baseQuery.orderBy(asc(classes.level), asc(classes.name));

  return rows.map((row) => ({
    ...row,
    mainTeacherName: row.mainTeacherName ?? null,
  }));
}

async function assertValidMainTeacher(tx: DbClient, teacherId: string): Promise<string> {
  const [teacher] = await tx
    .select({
      id: users.id,
      fullName: users.fullName,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.id, teacherId))
    .limit(1);

  if (!teacher) {
    throw new NotFoundError('Professeur principal introuvable.');
  }
  if (!teacher.isActive) {
    throw new BadRequestError('Le compte utilisateur du professeur principal est inactif.');
  }
  return teacher.fullName;
}

export async function createClass(db: DbClient, input: CreateClassInput): Promise<ClassDto> {
  return db.transaction(async (tx) => {
    const [year] = await tx
      .select({ id: academicYears.id })
      .from(academicYears)
      .where(eq(academicYears.id, input.academicYearId))
      .limit(1);

    if (!year) {
      throw new NotFoundError('Année scolaire introuvable.');
    }

    let mainTeacherName: string | null = null;
    if (input.mainTeacherId) {
      mainTeacherName = await assertValidMainTeacher(tx, input.mainTeacherId);
    }

    const [existingClass] = await tx
      .select({ id: classes.id })
      .from(classes)
      .where(and(eq(classes.academicYearId, input.academicYearId), eq(classes.name, input.name)))
      .limit(1);

    if (existingClass) {
      throw new ConflictError(`La classe "${input.name}" existe déjà pour cette année scolaire.`);
    }

    const syncVersion = await nextSyncVersion(tx);
    const [created] = await tx
      .insert(classes)
      .values({
        academicYearId: input.academicYearId,
        name: input.name,
        level: input.level,
        series: input.series ?? null,
        mainTeacherId: input.mainTeacherId ?? null,
        syncVersion,
        updatedAt: new Date(),
      })
      .returning();

    if (!created) {
      throw new Error('Échec de création de la classe.');
    }

    return {
      ...created,
      mainTeacherName,
    };
  });
}

export async function updateClass(
  db: DbClient,
  id: string,
  input: UpdateClassInput,
): Promise<ClassDto> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(classes)
      .where(eq(classes.id, id))
      .limit(1);

    if (!existing) {
      throw new NotFoundError('Classe introuvable.');
    }

    if (input.name !== undefined && input.name !== existing.name) {
      const [duplicate] = await tx
        .select({ id: classes.id })
        .from(classes)
        .where(
          and(
            eq(classes.academicYearId, existing.academicYearId),
            eq(classes.name, input.name),
            ne(classes.id, id),
          ),
        )
        .limit(1);

      if (duplicate) {
        throw new ConflictError(`La classe "${input.name}" existe déjà pour cette année scolaire.`);
      }
    }

    if (input.mainTeacherId !== undefined && input.mainTeacherId !== null) {
      await assertValidMainTeacher(tx, input.mainTeacherId);
    }

    const syncVersion = await nextSyncVersion(tx);
    const [updated] = await tx
      .update(classes)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.level !== undefined ? { level: input.level } : {}),
        ...(input.series !== undefined ? { series: input.series } : {}),
        ...(input.mainTeacherId !== undefined ? { mainTeacherId: input.mainTeacherId } : {}),
        syncVersion,
        updatedAt: new Date(),
      })
      .where(eq(classes.id, id))
      .returning();

    if (!updated) {
      throw new NotFoundError('Classe introuvable.');
    }

    let mainTeacherName: string | null = null;
    if (updated.mainTeacherId) {
      const [teacher] = await tx
        .select({ fullName: users.fullName })
        .from(users)
        .where(eq(users.id, updated.mainTeacherId))
        .limit(1);
      mainTeacherName = teacher?.fullName ?? null;
    }

    return {
      ...updated,
      mainTeacherName,
    };
  });
}
