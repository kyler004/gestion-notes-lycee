import type {
  AppreciationBand,
  CouncilDecisionType,
  EnrollmentStatus,
  GradeStatus,
  PeriodStatus,
  PeriodType,
  SequenceGradeDetail,
  StudentSex,
  SyncOutcome,
  UserRole,
} from '@lycee/shared';
import {
  bigint,
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgSequence,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType() {
    return 'bytea';
  },
  toDriver(value: Buffer) {
    return value;
  },
  fromDriver(value: Buffer | Uint8Array) {
    return Buffer.isBuffer(value) ? value : Buffer.from(value);
  },
});

export const syncSeq = pgSequence('sync_seq', { startWith: 1 });

export const schoolProfile = pgTable('school_profile', {
  id: integer('id').primaryKey().default(1),
  name: text('name').notNull(),
  motto: text('motto').notNull().default(''),
  country: text('country').notNull().default('République du Cameroun'),
  ministry: text('ministry').notNull().default('Ministère des Enseignements Secondaires'),
  region: text('region').notNull().default(''),
  delegation: text('delegation').notNull().default(''),
  city: text('city').notNull().default(''),
  phone: text('phone').notNull().default(''),
  email: text('email').notNull().default(''),
  logoData: bytea('logo_data'),
  logoMimeType: text('logo_mime_type'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  username: text('username').notNull().unique(),
  email: text('email').unique(),
  fullName: text('full_name').notNull(),
  role: text('role').$type<UserRole>().notNull(),
  passwordHash: text('password_hash').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    deviceLabel: text('device_label'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    replacedById: uuid('replaced_by_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('refresh_tokens_user_idx').on(t.userId), index('refresh_tokens_family_idx').on(t.familyId)],
);

export const academicYears = pgTable('academic_years', {
  id: uuid('id').defaultRandom().primaryKey(),
  label: text('label').notNull().unique(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  isActive: boolean('is_active').notNull().default(false),
  syncVersion: bigint('sync_version', { mode: 'number' }).notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const gradingRules = pgTable('grading_rules', {
  id: uuid('id').defaultRandom().primaryKey(),
  academicYearId: uuid('academic_year_id')
    .notNull()
    .unique()
    .references(() => academicYears.id, { onDelete: 'cascade' }),
  trimestersCount: integer('trimesters_count').notNull().default(3),
  sequencesPerTrimester: integer('sequences_per_trimester').notNull().default(2),
  sequenceWeights: jsonb('sequence_weights').$type<number[]>().notNull(),
  trimesterWeights: jsonb('trimester_weights').$type<number[]>().notNull(),
  passingThreshold: numeric('passing_threshold', { precision: 5, scale: 2 }).notNull().default('10.00'),
  honorRollThreshold: numeric('honor_roll_threshold', { precision: 5, scale: 2 }).notNull().default('12.00'),
  encouragementThreshold: numeric('encouragement_threshold', { precision: 5, scale: 2 }).notNull().default('13.00'),
  congratulationThreshold: numeric('congratulation_threshold', { precision: 5, scale: 2 }).notNull().default('15.00'),
  treatAbsentAsZero: boolean('treat_absent_as_zero').notNull().default(true),
  appreciationScale: jsonb('appreciation_scale').$type<AppreciationBand[]>().notNull(),
  syncVersion: bigint('sync_version', { mode: 'number' }).notNull().default(1),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const periods = pgTable(
  'periods',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYears.id, { onDelete: 'cascade' }),
    parentPeriodId: uuid('parent_period_id'),
    type: text('type').$type<PeriodType>().notNull(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    orderIndex: integer('order_index').notNull(),
    weight: numeric('weight', { precision: 5, scale: 2 }).notNull().default('1.00'),
    status: text('status').$type<PeriodStatus>().notNull().default('open'),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: uuid('locked_by').references(() => users.id),
    syncVersion: bigint('sync_version', { mode: 'number' }).notNull().default(1),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('periods_year_code_uidx').on(t.academicYearId, t.code)],
);

export const periodAuditLogs = pgTable(
  'period_audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    periodId: uuid('period_id')
      .notNull()
      .references(() => periods.id, { onDelete: 'cascade' }),
    action: text('action').$type<'locked' | 'unlocked'>().notNull(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id),
    reason: text('reason').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('period_audit_logs_period_idx').on(t.periodId)],
);

export const classes = pgTable(
  'classes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYears.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    level: text('level').notNull(),
    series: text('series'),
    mainTeacherId: uuid('main_teacher_id').references(() => users.id),
    syncVersion: bigint('sync_version', { mode: 'number' }).notNull().default(1),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('classes_year_name_uidx').on(t.academicYearId, t.name)],
);

export const students = pgTable('students', {
  id: uuid('id').defaultRandom().primaryKey(),
  matricule: text('matricule').notNull().unique(),
  lastName: text('last_name').notNull(),
  firstName: text('first_name').notNull(),
  birthDate: date('birth_date').notNull(),
  birthPlace: text('birth_place').notNull().default(''),
  sex: text('sex').$type<StudentSex>().notNull(),
  syncVersion: bigint('sync_version', { mode: 'number' }).notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const enrollments = pgTable(
  'enrollments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYears.id, { onDelete: 'cascade' }),
    isRepeater: boolean('is_repeater').notNull().default(false),
    status: text('status').$type<EnrollmentStatus>().notNull().default('active'),
    syncVersion: bigint('sync_version', { mode: 'number' }).notNull().default(1),
    enrolledAt: timestamp('enrolled_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('enrollments_student_year_uidx').on(t.studentId, t.academicYearId),
    index('enrollments_class_idx').on(t.classId),
  ],
);

export const subjectGroups = pgTable(
  'subject_groups',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYears.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    orderIndex: integer('order_index').notNull(),
    syncVersion: bigint('sync_version', { mode: 'number' }).notNull().default(1),
  },
  (t) => [uniqueIndex('subject_groups_year_name_uidx').on(t.academicYearId, t.name)],
);

export const subjects = pgTable('subjects', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  shortName: text('short_name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  syncVersion: bigint('sync_version', { mode: 'number' }).notNull().default(1),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const classSubjects = pgTable(
  'class_subjects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    subjectGroupId: uuid('subject_group_id').references(() => subjectGroups.id, { onDelete: 'set null' }),
    coefficient: numeric('coefficient', { precision: 4, scale: 2 }).notNull(),
    syncVersion: bigint('sync_version', { mode: 'number' }).notNull().default(1),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('class_subjects_class_subject_uidx').on(t.classId, t.subjectId)],
);

export const teacherAssignments = pgTable(
  'teacher_assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    classSubjectId: uuid('class_subject_id')
      .notNull()
      .references(() => classSubjects.id, { onDelete: 'cascade' }),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYears.id, { onDelete: 'cascade' }),
    isActive: boolean('is_active').notNull().default(true),
    syncVersion: bigint('sync_version', { mode: 'number' }).notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('teacher_assignments_teacher_cs_uidx').on(t.teacherId, t.classSubjectId),
    index('teacher_assignments_teacher_idx').on(t.teacherId),
  ],
);

export const grades = pgTable(
  'grades',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    enrollmentId: uuid('enrollment_id')
      .notNull()
      .references(() => enrollments.id, { onDelete: 'cascade' }),
    classSubjectId: uuid('class_subject_id')
      .notNull()
      .references(() => classSubjects.id, { onDelete: 'cascade' }),
    periodId: uuid('period_id')
      .notNull()
      .references(() => periods.id, { onDelete: 'cascade' }),
    score: numeric('score', { precision: 5, scale: 2 }),
    status: text('status').$type<GradeStatus>().notNull().default('present'),
    appreciation: text('appreciation'),
    enteredBy: uuid('entered_by')
      .notNull()
      .references(() => users.id),
    lastOperationId: uuid('last_operation_id'),
    syncVersion: bigint('sync_version', { mode: 'number' }).notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('grades_enrollment_cs_period_uidx').on(t.enrollmentId, t.classSubjectId, t.periodId),
    index('grades_period_cs_idx').on(t.periodId, t.classSubjectId),
  ],
);

export const gradeAuditLogs = pgTable(
  'grade_audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    gradeId: uuid('grade_id')
      .notNull()
      .references(() => grades.id, { onDelete: 'cascade' }),
    enrollmentId: uuid('enrollment_id')
      .notNull()
      .references(() => enrollments.id, { onDelete: 'cascade' }),
    classSubjectId: uuid('class_subject_id')
      .notNull()
      .references(() => classSubjects.id, { onDelete: 'cascade' }),
    periodId: uuid('period_id')
      .notNull()
      .references(() => periods.id, { onDelete: 'cascade' }),
    previousScore: numeric('previous_score', { precision: 5, scale: 2 }),
    newScore: numeric('new_score', { precision: 5, scale: 2 }),
    previousStatus: text('previous_status').$type<GradeStatus>(),
    newStatus: text('new_status').$type<GradeStatus>().notNull(),
    changedBy: uuid('changed_by')
      .notNull()
      .references(() => users.id),
    reason: text('reason').notNull().default(''),
    clientTimestamp: timestamp('client_timestamp', { withTimezone: true }),
    serverTimestamp: timestamp('server_timestamp', { withTimezone: true }).defaultNow().notNull(),
    operationId: uuid('operation_id'),
  },
  (t) => [index('grade_audit_logs_grade_idx').on(t.gradeId), index('grade_audit_logs_period_idx').on(t.periodId)],
);

export const syncOperations = pgTable(
  'sync_operations',
  {
    operationId: uuid('operation_id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    outcome: text('outcome').$type<SyncOutcome>().notNull(),
    errorMessage: text('error_message'),
    processedAt: timestamp('processed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('sync_operations_user_idx').on(t.userId)],
);

export const councilDecisions = pgTable(
  'council_decisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    enrollmentId: uuid('enrollment_id')
      .notNull()
      .references(() => enrollments.id, { onDelete: 'cascade' }),
    periodId: uuid('period_id')
      .notNull()
      .references(() => periods.id, { onDelete: 'cascade' }),
    generalAppreciation: text('general_appreciation').notNull().default(''),
    decision: text('decision').$type<CouncilDecisionType>().notNull().default('none'),
    absencesHours: integer('absences_hours').notNull().default(0),
    decidedBy: uuid('decided_by')
      .notNull()
      .references(() => users.id),
    syncVersion: bigint('sync_version', { mode: 'number' }).notNull().default(1),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('council_decisions_enrollment_period_uidx').on(t.enrollmentId, t.periodId)],
);

export const periodStudentResults = pgTable(
  'period_student_results',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    periodId: uuid('period_id')
      .notNull()
      .references(() => periods.id, { onDelete: 'cascade' }),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    enrollmentId: uuid('enrollment_id')
      .notNull()
      .references(() => enrollments.id, { onDelete: 'cascade' }),
    totalCoefficient: numeric('total_coefficient', { precision: 6, scale: 2 }).notNull(),
    totalPoints: numeric('total_points', { precision: 8, scale: 2 }).notNull(),
    generalAverage: numeric('general_average', { precision: 5, scale: 2 }),
    rank: integer('rank'),
    classSize: integer('class_size').notNull(),
    classAverage: numeric('class_average', { precision: 5, scale: 2 }),
    minClassAverage: numeric('min_class_average', { precision: 5, scale: 2 }),
    maxClassAverage: numeric('max_class_average', { precision: 5, scale: 2 }),
    passRate: numeric('pass_rate', { precision: 5, scale: 2 }),
    isHonorRoll: boolean('is_honor_roll').notNull().default(false),
    autoAppreciation: text('auto_appreciation').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('period_student_results_period_enrollment_uidx').on(t.periodId, t.enrollmentId),
    index('period_student_results_period_class_idx').on(t.periodId, t.classId),
  ],
);

export const periodSubjectResults = pgTable(
  'period_subject_results',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    periodId: uuid('period_id')
      .notNull()
      .references(() => periods.id, { onDelete: 'cascade' }),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    enrollmentId: uuid('enrollment_id')
      .notNull()
      .references(() => enrollments.id, { onDelete: 'cascade' }),
    classSubjectId: uuid('class_subject_id')
      .notNull()
      .references(() => classSubjects.id, { onDelete: 'cascade' }),
    sequenceScoresJson: jsonb('sequence_scores_json').$type<SequenceGradeDetail[]>().notNull().default([]),
    average: numeric('average', { precision: 5, scale: 2 }),
    weightedScore: numeric('weighted_score', { precision: 7, scale: 2 }),
    rank: integer('rank'),
    classAverage: numeric('class_average', { precision: 5, scale: 2 }),
    minScore: numeric('min_score', { precision: 5, scale: 2 }),
    maxScore: numeric('max_score', { precision: 5, scale: 2 }),
    appreciation: text('appreciation').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('period_subject_results_uidx').on(t.periodId, t.enrollmentId, t.classSubjectId),
    index('period_subject_results_period_class_idx').on(t.periodId, t.classId),
  ],
);
