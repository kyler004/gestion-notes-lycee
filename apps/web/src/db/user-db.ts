import type {
  AppreciationBand,
  EnrollmentStatus,
  GradeStatus,
  PeriodStatus,
  PeriodType,
  StudentSex,
  SyncOutcome,
} from '@lycee/shared';
import Dexie, { type EntityTable } from 'dexie';
import { getUserDatabaseName } from './index';

export interface SyncMetaRecord {
  key: string;
  value: string | number | null;
}

export interface LocalAcademicYear {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  syncVersion: number;
}

export interface LocalGradingRules {
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
  updatedAt: string;
}

export interface LocalPeriod {
  id: string;
  academicYearId: string;
  parentPeriodId: string | null;
  type: PeriodType;
  code: string;
  name: string;
  orderIndex: number;
  weight: number;
  status: PeriodStatus;
  lockedAt: string | null;
  lockedBy: string | null;
  syncVersion: number;
  updatedAt: string;
}

export interface LocalSubjectGroup {
  id: string;
  academicYearId: string;
  name: string;
  orderIndex: number;
  syncVersion: number;
}

export interface LocalSubject {
  id: string;
  code: string;
  name: string;
  shortName: string;
  isActive: boolean;
  syncVersion: number;
  updatedAt: string;
}

export interface LocalClass {
  id: string;
  academicYearId: string;
  name: string;
  level: string;
  series: string | null;
  mainTeacherId: string | null;
  syncVersion: number;
  updatedAt: string;
}

export interface LocalClassSubject {
  id: string;
  classId: string;
  subjectId: string;
  subjectGroupId: string | null;
  coefficient: number;
  syncVersion: number;
  updatedAt: string;
}

export interface LocalTeacherAssignment {
  id: string;
  teacherId: string;
  classSubjectId: string;
  academicYearId: string;
  isActive: boolean;
  syncVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface LocalStudent {
  id: string;
  matricule: string;
  lastName: string;
  firstName: string;
  birthDate: string;
  birthPlace: string;
  sex: StudentSex;
  syncVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface LocalEnrollment {
  id: string;
  studentId: string;
  classId: string;
  academicYearId: string;
  isRepeater: boolean;
  status: EnrollmentStatus;
  syncVersion: number;
  enrolledAt: string;
  updatedAt: string;
}

export interface LocalServerGrade {
  /** Clé composite `${enrollmentId}:${classSubjectId}:${periodId}` */
  targetKey: string;
  id: string;
  enrollmentId: string;
  classSubjectId: string;
  periodId: string;
  score: number | null;
  status: GradeStatus;
  appreciation: string | null;
  enteredBy: string;
  syncVersion: number;
  createdAt: string;
  updatedAt: string;
}

export type OutboxStatus = 'pending' | 'syncing' | 'failed';

export interface OutboxGradePayload {
  enrollmentId: string;
  classSubjectId: string;
  periodId: string;
  score: number | null;
  status: GradeStatus;
  appreciation?: string | null;
  reason?: string;
}

export interface LocalOutboxOperation {
  /** Clé composite `${enrollmentId}:${classSubjectId}:${periodId}` (une opération active par cellule) */
  targetKey: string;
  operationId: string;
  type: 'UPSERT_GRADE';
  enrollmentId: string;
  classSubjectId: string;
  periodId: string;
  payload: OutboxGradePayload;
  status: OutboxStatus;
  outcome?: SyncOutcome;
  errorMessage?: string;
  attempts: number;
  clientTimestamp: string;
  createdAt: string;
  updatedAt: string;
}

export function makeGradeTargetKey(
  enrollmentId: string,
  classSubjectId: string,
  periodId: string,
): string {
  return `${enrollmentId}:${classSubjectId}:${periodId}`;
}

/**
 * Base IndexedDB cloisonnée par utilisateur (`lycee-data-${userId}`).
 * Modèle Snapshot Serveur (`grades`) + File Outbox (`outbox`).
 */
export class LyceeUserDb extends Dexie {
  syncMeta!: EntityTable<SyncMetaRecord, 'key'>;
  academicYears!: EntityTable<LocalAcademicYear, 'id'>;
  gradingRules!: EntityTable<LocalGradingRules, 'id'>;
  periods!: EntityTable<LocalPeriod, 'id'>;
  subjectGroups!: EntityTable<LocalSubjectGroup, 'id'>;
  subjects!: EntityTable<LocalSubject, 'id'>;
  classes!: EntityTable<LocalClass, 'id'>;
  classSubjects!: EntityTable<LocalClassSubject, 'id'>;
  teacherAssignments!: EntityTable<LocalTeacherAssignment, 'id'>;
  students!: EntityTable<LocalStudent, 'id'>;
  enrollments!: EntityTable<LocalEnrollment, 'id'>;
  grades!: EntityTable<LocalServerGrade, 'targetKey'>;
  outbox!: EntityTable<LocalOutboxOperation, 'targetKey'>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      syncMeta: 'key',
      academicYears: 'id',
      gradingRules: 'id, academicYearId',
      periods: 'id, academicYearId, type, parentPeriodId, orderIndex',
      subjectGroups: 'id, academicYearId, orderIndex',
      subjects: 'id, code',
      classes: 'id, academicYearId',
      classSubjects: 'id, classId, subjectId',
      teacherAssignments: 'id, teacherId, classSubjectId, academicYearId, isActive',
      students: 'id, matricule, lastName',
      enrollments: 'id, classId, studentId, academicYearId, [classId+status]',
      grades: 'targetKey, id, classSubjectId, periodId, enrollmentId',
      outbox: 'targetKey, operationId, status, createdAt, classSubjectId, periodId',
    });
  }
}

const userDbCache = new Map<string, LyceeUserDb>();

export function getUserDb(userId: string): LyceeUserDb {
  let instance = userDbCache.get(userId);
  if (!instance) {
    instance = new LyceeUserDb(getUserDatabaseName(userId));
    userDbCache.set(userId, instance);
  }
  return instance;
}

export function closeUserDb(userId: string): void {
  const instance = userDbCache.get(userId);
  if (instance) {
    instance.close();
    userDbCache.delete(userId);
  }
}

export function closeAllUserDbs(): void {
  for (const [id, instance] of userDbCache.entries()) {
    instance.close();
    userDbCache.delete(id);
  }
}
