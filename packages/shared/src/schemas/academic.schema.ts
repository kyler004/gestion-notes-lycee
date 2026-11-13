import { z } from 'zod';
import { ENROLLMENT_STATUSES, PERIOD_STATUSES, PERIOD_TYPES, STUDENT_SEXES } from '../types/domain.js';

export const AppreciationBandSchema = z.object({
  min: z.number().finite().min(0).max(20),
  max: z.number().finite().min(0).max(20),
  label: z.string().trim().min(1).max(64),
});

export const GradingRulesSchema = z.object({
  trimestersCount: z.number().int().min(1).max(4).default(3),
  sequencesPerTrimester: z.number().int().min(1).max(4).default(2),
  sequenceWeights: z.array(z.number().finite().positive().max(100)).min(1).max(4),
  trimesterWeights: z.array(z.number().finite().positive().max(100)).min(1).max(4),
  passingThreshold: z.number().finite().min(0).max(20).default(10),
  honorRollThreshold: z.number().finite().min(0).max(20).default(12),
  encouragementThreshold: z.number().finite().min(0).max(20).default(13),
  congratulationThreshold: z.number().finite().min(0).max(20).default(15),
  treatAbsentAsZero: z.boolean().default(true),
  appreciationScale: z.array(AppreciationBandSchema).min(1),
});

export const CreateAcademicYearSchema = z.object({
  label: z.string().trim().min(4).max(32),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isActive: z.boolean().optional().default(false),
  initializeCameroonDefaults: z.boolean().optional().default(true),
});

export const UpdatePeriodSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  weight: z.number().finite().min(0.01).max(100).optional(),
  status: z.enum(PERIOD_STATUSES).optional(),
});

export const CreatePeriodSchema = z.object({
  academicYearId: z.string().uuid(),
  parentPeriodId: z.string().uuid().nullable().optional(),
  type: z.enum(PERIOD_TYPES),
  code: z.string().trim().min(1).max(16),
  name: z.string().trim().min(2).max(80),
  orderIndex: z.number().int().min(1).max(20),
  weight: z.number().finite().min(0.01).max(100).optional().default(1),
});

export const CreateClassSchema = z.object({
  academicYearId: z.string().uuid(),
  name: z.string().trim().min(1).max(64),
  level: z.string().trim().min(1).max(32),
  series: z.string().trim().max(32).nullable().optional(),
  mainTeacherId: z.string().uuid().nullable().optional(),
});

export const UpdateClassSchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  level: z.string().trim().min(1).max(32).optional(),
  series: z.string().trim().max(32).nullable().optional(),
  mainTeacherId: z.string().uuid().nullable().optional(),
});

export const CreateStudentSchema = z.object({
  matricule: z.string().trim().min(2).max(40),
  lastName: z.string().trim().min(1).max(80),
  firstName: z.string().trim().min(1).max(80),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  birthPlace: z.string().trim().max(120).optional().default(''),
  sex: z.enum(STUDENT_SEXES),
});

export const UpdateStudentSchema = CreateStudentSchema.partial();

export const CreateEnrollmentSchema = z.object({
  studentId: z.string().uuid(),
  classId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  isRepeater: z.boolean().optional().default(false),
  status: z.enum(ENROLLMENT_STATUSES).optional().default('active'),
});

export const UpdateEnrollmentSchema = z.object({
  classId: z.string().uuid().optional(),
  isRepeater: z.boolean().optional(),
  status: z.enum(ENROLLMENT_STATUSES).optional(),
});

export const CreateSubjectGroupSchema = z.object({
  academicYearId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  orderIndex: z.number().int().min(1).max(20),
});

export const CreateSubjectSchema = z.object({
  code: z.string().trim().min(1).max(24),
  name: z.string().trim().min(2).max(120),
  shortName: z.string().trim().min(1).max(24),
  isActive: z.boolean().optional().default(true),
});

export const UpdateSubjectSchema = CreateSubjectSchema.partial();

export const UpsertClassSubjectSchema = z.object({
  classId: z.string().uuid(),
  subjectId: z.string().uuid(),
  subjectGroupId: z.string().uuid().nullable().optional(),
  coefficient: z.number().finite().min(0.01).max(20),
});

export const CreateTeacherAssignmentSchema = z.object({
  teacherId: z.string().uuid(),
  classSubjectId: z.string().uuid(),
  academicYearId: z.string().uuid(),
});
