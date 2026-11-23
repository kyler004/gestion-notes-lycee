import type { EnrollmentStatus, UserRole } from '@lycee/shared';

export const adminKeys = {
  all: ['admin'] as const,
  school: () => [...adminKeys.all, 'school'] as const,
  schoolLogo: (version?: string) => [...adminKeys.all, 'school-logo', version ?? 'current'] as const,
  academicYears: () => [...adminKeys.all, 'academic-years'] as const,
  gradingRules: (yearId: string) => [...adminKeys.all, 'grading-rules', yearId] as const,
  periods: (yearId: string) => [...adminKeys.all, 'periods', yearId] as const,
  classes: (yearId?: string) => [...adminKeys.all, 'classes', yearId ?? 'all'] as const,
  subjectGroups: (yearId?: string) =>
    [...adminKeys.all, 'subject-groups', yearId ?? 'all'] as const,
  subjects: (activeOnly?: boolean) =>
    [...adminKeys.all, 'subjects', activeOnly ? 'active' : 'all'] as const,
  classSubjects: (classId: string) => [...adminKeys.all, 'class-subjects', classId] as const,
  teacherAssignments: (filters?: {
    academicYearId?: string;
    classId?: string;
    teacherId?: string;
    includeInactive?: boolean;
  }) => [...adminKeys.all, 'teacher-assignments', filters ?? {}] as const,
  students: (q: string) => [...adminKeys.all, 'students', q] as const,
  classStudents: (classId: string, status?: EnrollmentStatus) =>
    [...adminKeys.all, 'class-students', classId, status ?? 'all'] as const,
  users: (role?: UserRole) => [...adminKeys.all, 'users', role ?? 'all'] as const,
};

export const reportKeys = {
  all: ['reports'] as const,
  schoolStats: (academicYearId: string, periodId: string) =>
    [...reportKeys.all, 'school-stats', academicYearId, periodId] as const,
  completeness: (periodId: string) => [...reportKeys.all, 'completeness', periodId] as const,
  councilDecisions: (filters: { classId?: string; periodId?: string }) =>
    [...reportKeys.all, 'council-decisions', filters] as const,
  classResults: (classId: string, periodId: string) =>
    [...reportKeys.all, 'class-results', classId, periodId] as const,
  honorRoll: (classId: string, periodId: string) =>
    [...reportKeys.all, 'honor-roll', classId, periodId] as const,
  gradeAudit: (filters: {
    classId?: string;
    periodId?: string;
    enrollmentId?: string;
    classSubjectId?: string;
  }) => [...reportKeys.all, 'grade-audit', filters] as const,
};

