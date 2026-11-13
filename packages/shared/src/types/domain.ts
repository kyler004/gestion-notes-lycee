export const USER_ROLES = [
  'admin',
  'censor',
  'principal',
  'teacher',
  'secretary',
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PERIOD_TYPES = ['trimester', 'sequence'] as const;
export type PeriodType = (typeof PERIOD_TYPES)[number];

export const PERIOD_STATUSES = ['open', 'locked'] as const;
export type PeriodStatus = (typeof PERIOD_STATUSES)[number];

export const GRADE_STATUSES = ['present', 'absent', 'excused'] as const;
export type GradeStatus = (typeof GRADE_STATUSES)[number];

export const ENROLLMENT_STATUSES = ['active', 'transferred', 'dropped'] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const STUDENT_SEXES = ['M', 'F'] as const;
export type StudentSex = (typeof STUDENT_SEXES)[number];

export const COUNCIL_DECISIONS = [
  'none',
  'honor_roll',
  'encouragement',
  'congratulations',
  'warning',
  'blame',
  'pass',
  'repeat',
  'expelled',
] as const;
export type CouncilDecisionType = (typeof COUNCIL_DECISIONS)[number];

export const SYNC_OUTCOMES = [
  'applied',
  'duplicate',
  'rejected_locked',
  'rejected_forbidden',
  'rejected_validation',
] as const;
export type SyncOutcome = (typeof SYNC_OUTCOMES)[number];

export interface AuthUserPayload {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
}

export interface SchoolProfileDto {
  id: number;
  name: string;
  motto: string;
  country: string;
  ministry: string;
  region: string;
  delegation: string;
  city: string;
  phone: string;
  email: string;
  hasLogo: boolean;
  logoMimeType: string | null;
  updatedAt: string;
}

export interface SequenceGradeDetail {
  periodId: string;
  code: string;
  name: string;
  orderIndex: number;
  weight: number;
  score: number | null;
  status: GradeStatus | null;
}

export interface BulletinSubjectRow {
  classSubjectId: string;
  subjectCode: string;
  subjectName: string;
  subjectShortName: string;
  subjectGroupName: string | null;
  subjectGroupOrder: number;
  coefficient: number;
  teacherName: string | null;
  sequenceScores: SequenceGradeDetail[];
  average: number | null;
  weightedScore: number | null;
  rank: number | null;
  classAverage: number | null;
  minScore: number | null;
  maxScore: number | null;
  appreciation: string;
}

export interface BulletinStudentData {
  enrollmentId: string;
  studentId: string;
  matricule: string;
  lastName: string;
  firstName: string;
  birthDate: string;
  birthPlace: string;
  sex: StudentSex;
  isRepeater: boolean;
  subjects: BulletinSubjectRow[];
  totalCoefficient: number;
  totalPoints: number;
  generalAverage: number | null;
  rank: number | null;
  classSize: number;
  classAverage: number | null;
  minClassAverage: number | null;
  maxClassAverage: number | null;
  passRate: number | null;
  isHonorRoll: boolean;
  autoAppreciation: string;
  councilDecision: CouncilDecisionType;
  councilAppreciation: string;
  absencesHours: number;
}

export interface BulletinReportPayload {
  school: Omit<SchoolProfileDto, 'id' | 'updatedAt'> & {
    logoBase64DataUri: string | null;
  };
  academicYearLabel: string;
  period: {
    id: string;
    code: string;
    name: string;
    type: PeriodType | 'annual';
    isOfficial: boolean;
    lockedAt: string | null;
  };
  classInfo: {
    id: string;
    name: string;
    level: string;
    series: string | null;
    mainTeacherName: string | null;
  };
  generatedAt: string;
  students: BulletinStudentData[];
}

export interface ClassListReportPayload {
  school: Omit<SchoolProfileDto, 'id' | 'updatedAt'> & {
    logoBase64DataUri: string | null;
  };
  academicYearLabel: string;
  classInfo: {
    id: string;
    name: string;
    level: string;
    series: string | null;
    mainTeacherName: string | null;
  };
  generatedAt: string;
  students: Array<{
    order: number;
    matricule: string;
    lastName: string;
    firstName: string;
    birthDate: string;
    sex: StudentSex;
    isRepeater: boolean;
    status: EnrollmentStatus;
  }>;
}

export interface HonorRollReportPayload {
  school: Omit<SchoolProfileDto, 'id' | 'updatedAt'> & {
    logoBase64DataUri: string | null;
  };
  academicYearLabel: string;
  period: {
    id: string;
    code: string;
    name: string;
    isOfficial: boolean;
  };
  classInfo: {
    id: string;
    name: string;
    level: string;
  };
  honorRollThreshold: number;
  generatedAt: string;
  entries: Array<{
    rank: number;
    matricule: string;
    fullName: string;
    generalAverage: number;
    appreciation: string;
    councilDecision: CouncilDecisionType;
  }>;
}
