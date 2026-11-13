import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { CAMEROON_DEFAULT_GRADING_RULES } from '@lycee/shared';
import { parseEnv, type AppConfig } from '../config/env.js';
import { hashPassword } from '../lib/crypto.js';
import { DEFAULT_SCHOOL_PROFILE } from '../services/school.service.js';
import { createPgDb, nextSyncVersion, type DbClient } from './client.js';
import { academicYears, gradingRules, periods, schoolProfile, users } from './schema.js';

const TRIMESTER_LABELS = ['1er Trimestre', '2e Trimestre', '3e Trimestre'] as const;

export async function seedIfEmpty(db: DbClient, config: AppConfig): Promise<void> {
  await db.transaction(async (tx) => {
    const txDb = tx as unknown as DbClient;

    await tx
      .insert(schoolProfile)
      .values({
        ...DEFAULT_SCHOOL_PROFILE,
      })
      .onConflictDoNothing({ target: schoolProfile.id });

    const [existingUser] = await tx.select({ id: users.id }).from(users).limit(1);
    if (!existingUser) {
      const passwordHash = await hashPassword(config.ADMIN_INITIAL_PASSWORD);
      await tx.insert(users).values({
        username: config.ADMIN_INITIAL_USERNAME,
        fullName: config.ADMIN_INITIAL_FULLNAME,
        role: 'admin',
        passwordHash,
        isActive: true,
      });
    }

    const [existingYear] = await tx.select({ id: academicYears.id }).from(academicYears).limit(1);
    if (!existingYear) {
      const yearSyncVersion = await nextSyncVersion(txDb);
      const [createdYear] = await tx
        .insert(academicYears)
        .values({
          label: '2026-2027',
          startDate: '2026-09-01',
          endDate: '2027-07-31',
          isActive: true,
          syncVersion: yearSyncVersion,
        })
        .returning({ id: academicYears.id });

      if (!createdYear) {
        throw new Error('Échec de la création de l’année scolaire initiale.');
      }

      const rulesSyncVersion = await nextSyncVersion(txDb);
      await tx.insert(gradingRules).values({
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
        syncVersion: rulesSyncVersion,
      });

      let sequenceCounter = 1;
      for (let t = 0; t < CAMEROON_DEFAULT_GRADING_RULES.trimestersCount; t++) {
        const trimesterWeight = CAMEROON_DEFAULT_GRADING_RULES.trimesterWeights[t] ?? 1;
        const trimesterSyncVersion = await nextSyncVersion(txDb);

        const [trimester] = await tx
          .insert(periods)
          .values({
            academicYearId: createdYear.id,
            parentPeriodId: null,
            type: 'trimester',
            code: `T${t + 1}`,
            name: TRIMESTER_LABELS[t] ?? `Trimestre ${t + 1}`,
            orderIndex: t + 1,
            weight: trimesterWeight.toFixed(2),
            status: 'open',
            syncVersion: trimesterSyncVersion,
          })
          .returning({ id: periods.id });

        if (!trimester) {
          throw new Error(`Échec de la création du trimestre T${t + 1}.`);
        }

        for (let s = 0; s < CAMEROON_DEFAULT_GRADING_RULES.sequencesPerTrimester; s++) {
          const sequenceWeight = CAMEROON_DEFAULT_GRADING_RULES.sequenceWeights[s] ?? 1;
          const sequenceSyncVersion = await nextSyncVersion(txDb);

          await tx.insert(periods).values({
            academicYearId: createdYear.id,
            parentPeriodId: trimester.id,
            type: 'sequence',
            code: `S${sequenceCounter}`,
            name: `Séquence ${sequenceCounter}`,
            orderIndex: sequenceCounter,
            weight: sequenceWeight.toFixed(2),
            status: 'open',
            syncVersion: sequenceSyncVersion,
          });

          sequenceCounter += 1;
        }
      }
    }
  });
}

const __filename = fileURLToPath(import.meta.url);
const isDirectExecution =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectExecution) {
  const config = parseEnv(process.env);
  const connection = createPgDb(config.DATABASE_URL);
  seedIfEmpty(connection.db, config)
    .then(() => {
      console.log('Seed initial appliqué avec succès.');
    })
    .catch((err) => {
      console.error('Échec du seed :', err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await connection.close();
    });
}
