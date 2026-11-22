import {
  AppreciationBandSchema,
  type CreateAcademicYearSchema,
  type CreateClassSchema,
  type CreateEnrollmentSchema,
  type CreatePeriodSchema,
  type CreateStudentSchema,
  type CreateSubjectGroupSchema,
  type CreateSubjectSchema,
  type CreateTeacherAssignmentSchema,
  type CreateUserSchema,
  ENROLLMENT_STATUSES,
  type EnrollmentStatus,
  type GradingRulesSchema,
  PERIOD_STATUSES,
  PERIOD_TYPES,
  type ResetPasswordSchema,
  STUDENT_SEXES,
  USER_ROLES,
  type UpdateClassSchema,
  type UpdateEnrollmentSchema,
  type UpdatePeriodSchema,
  type UpdateSchoolProfileSchema,
  type UpdateStudentSchema,
  type UpdateSubjectSchema,
  type UpdateUserSchema,
  type UpsertClassSubjectSchema,
  type UploadSchoolLogoSchema,
  type UserRole,
} from '@lycee/shared';
import { z } from 'zod';
import { apiFetchBlob, apiRequest } from './client';
import { isApiError } from './errors';
import { SuccessResponseSchema } from './schemas';

export const MAX_SCHOOL_LOGO_BYTES = 512 * 1024;

export const SchoolProfileDtoSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  motto: z.string(),
  country: z.string(),
  ministry: z.string(),
  region: z.string(),
  delegation: z.string(),
  city: z.string(),
  phone: z.string(),
  email: z.string(),
  hasLogo: z.boolean(),
  logoMimeType: z.string().nullable(),
  updatedAt: z.string(),
});
export type SchoolProfileDto = z.infer<typeof SchoolProfileDtoSchema>;

export const AcademicYearDtoSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  isActive: z.boolean(),
  syncVersion: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AcademicYearDto = z.infer<typeof AcademicYearDtoSchema>;

export const GradingRulesDtoSchema = z.object({
  id: z.string().uuid(),
  academicYearId: z.string().uuid(),
  trimestersCount: z.number().int(),
  sequencesPerTrimester: z.number().int(),
  sequenceWeights: z.array(z.number()),
  trimesterWeights: z.array(z.number()),
  passingThreshold: z.number(),
  honorRollThreshold: z.number(),
  encouragementThreshold: z.number(),
  congratulationThreshold: z.number(),
  treatAbsentAsZero: z.boolean(),
  appreciationScale: z.array(AppreciationBandSchema),
  syncVersion: z.number().int(),
  updatedAt: z.string(),
});
export type GradingRulesDto = z.infer<typeof GradingRulesDtoSchema>;

export const PeriodDtoSchema = z.object({
  id: z.string().uuid(),
  academicYearId: z.string().uuid(),
  parentPeriodId: z.string().uuid().nullable(),
  type: z.enum(PERIOD_TYPES),
  code: z.string(),
  name: z.string(),
  orderIndex: z.number().int(),
  weight: z.number(),
  status: z.enum(PERIOD_STATUSES),
  lockedAt: z.string().nullable(),
  lockedBy: z.string().nullable(),
  syncVersion: z.number().int(),
  updatedAt: z.string(),
});
export type PeriodDto = z.infer<typeof PeriodDtoSchema>;

export const CreateAcademicYearResponseSchema = z.object({
  academicYear: AcademicYearDtoSchema,
  gradingRules: GradingRulesDtoSchema.nullable(),
  periods: z.array(PeriodDtoSchema),
});

export const ClassDtoSchema = z.object({
  id: z.string().uuid(),
  academicYearId: z.string().uuid(),
  name: z.string(),
  level: z.string(),
  series: z.string().nullable(),
  mainTeacherId: z.string().uuid().nullable(),
  mainTeacherName: z.string().nullable(),
  syncVersion: z.number().int(),
  updatedAt: z.string(),
});
export type ClassDto = z.infer<typeof ClassDtoSchema>;

export const SubjectGroupDtoSchema = z.object({
  id: z.string().uuid(),
  academicYearId: z.string().uuid(),
  name: z.string(),
  orderIndex: z.number().int(),
  syncVersion: z.number().int(),
});
export type SubjectGroupDto = z.infer<typeof SubjectGroupDtoSchema>;

export const SubjectDtoSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  shortName: z.string(),
  isActive: z.boolean(),
  syncVersion: z.number().int(),
  updatedAt: z.string(),
});
export type SubjectDto = z.infer<typeof SubjectDtoSchema>;

export const ClassSubjectDtoSchema = z.object({
  id: z.string().uuid(),
  classId: z.string().uuid(),
  subjectId: z.string().uuid(),
  subjectGroupId: z.string().uuid().nullable(),
  coefficient: z.number(),
  syncVersion: z.number().int(),
  updatedAt: z.string(),
});
export type ClassSubjectDto = z.infer<typeof ClassSubjectDtoSchema>;

export const ClassSubjectDetailDtoSchema = ClassSubjectDtoSchema.extend({
  subjectCode: z.string(),
  subjectName: z.string(),
  subjectShortName: z.string(),
  subjectIsActive: z.boolean(),
  subjectGroupName: z.string().nullable(),
  subjectGroupOrder: z.number().int().nullable(),
});
export type ClassSubjectDetailDto = z.infer<typeof ClassSubjectDetailDtoSchema>;

export const TeacherAssignmentDtoSchema = z.object({
  id: z.string().uuid(),
  teacherId: z.string().uuid(),
  classSubjectId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  isActive: z.boolean(),
  syncVersion: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TeacherAssignmentDto = z.infer<typeof TeacherAssignmentDtoSchema>;

export const TeacherAssignmentDetailDtoSchema = TeacherAssignmentDtoSchema.extend({
  teacherName: z.string(),
  teacherUsername: z.string(),
  teacherRole: z.enum(USER_ROLES),
  academicYearLabel: z.string(),
  classId: z.string().uuid(),
  className: z.string(),
  classLevel: z.string(),
  classSeries: z.string().nullable(),
  subjectId: z.string().uuid(),
  subjectCode: z.string(),
  subjectName: z.string(),
  subjectShortName: z.string(),
  coefficient: z.number(),
  subjectGroupId: z.string().uuid().nullable(),
  subjectGroupName: z.string().nullable(),
});
export type TeacherAssignmentDetailDto = z.infer<typeof TeacherAssignmentDetailDtoSchema>;

export const StudentDtoSchema = z.object({
  id: z.string().uuid(),
  matricule: z.string(),
  lastName: z.string(),
  firstName: z.string(),
  birthDate: z.string(),
  birthPlace: z.string(),
  sex: z.enum(STUDENT_SEXES),
  syncVersion: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type StudentDto = z.infer<typeof StudentDtoSchema>;

export const EnrollmentDtoSchema = z.object({
  id: z.string().uuid(),
  studentId: z.string().uuid(),
  classId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  isRepeater: z.boolean(),
  status: z.enum(ENROLLMENT_STATUSES),
  syncVersion: z.number().int(),
  enrolledAt: z.string(),
  updatedAt: z.string(),
});
export type EnrollmentDto = z.infer<typeof EnrollmentDtoSchema>;

export const ClassStudentDtoSchema = z.object({
  enrollmentId: z.string().uuid(),
  studentId: z.string().uuid(),
  classId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  matricule: z.string(),
  lastName: z.string(),
  firstName: z.string(),
  birthDate: z.string(),
  birthPlace: z.string(),
  sex: z.enum(STUDENT_SEXES),
  isRepeater: z.boolean(),
  status: z.enum(ENROLLMENT_STATUSES),
  enrolledAt: z.string(),
  syncVersion: z.number().int(),
});
export type ClassStudentDto = z.infer<typeof ClassStudentDtoSchema>;

export const AdminUserDtoSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  email: z.string().nullable(),
  fullName: z.string(),
  role: z.enum(USER_ROLES),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdminUserDto = z.infer<typeof AdminUserDtoSchema>;

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      qs.set(key, String(value));
    }
  }
  const encoded = qs.toString();
  return encoded ? `?${encoded}` : '';
}

export async function fileToLogoPayload(
  file: File,
): Promise<z.infer<typeof UploadSchoolLogoSchema>> {
  if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
    throw new Error('Format non pris en charge. Utilisez un fichier PNG ou JPEG.');
  }
  if (file.size === 0 || file.size > MAX_SCHOOL_LOGO_BYTES) {
    throw new Error('La taille du logo ne doit pas dépasser 512 Ko.');
  }

  const dataUri = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Impossible de lire le fichier image.'));
      }
    };
    reader.onerror = () => reject(new Error('Échec de lecture du fichier image.'));
    reader.readAsDataURL(file);
  });

  const commaIndex = dataUri.indexOf(',');
  const base64 = commaIndex >= 0 ? dataUri.slice(commaIndex + 1) : dataUri;
  return {
    mimeType: file.type,
    dataBase64: base64,
  };
}

// ── Établissement ──

export async function getSchoolProfile(): Promise<SchoolProfileDto> {
  return apiRequest('/api/school', { schema: SchoolProfileDtoSchema });
}

export async function updateSchoolProfile(
  input: z.infer<typeof UpdateSchoolProfileSchema>,
): Promise<SchoolProfileDto> {
  return apiRequest('/api/school', {
    method: 'PUT',
    body: input,
    schema: SchoolProfileDtoSchema,
  });
}

export async function uploadSchoolLogo(
  input: z.infer<typeof UploadSchoolLogoSchema>,
): Promise<SchoolProfileDto> {
  return apiRequest('/api/school/logo', {
    method: 'PUT',
    body: input,
    schema: SchoolProfileDtoSchema,
  });
}

export async function fetchSchoolLogoBlob(): Promise<Blob | null> {
  try {
    return await apiFetchBlob('/api/school/logo');
  } catch (err) {
    if (isApiError(err) && err.status === 404) {
      return null;
    }
    throw err;
  }
}

// ── Années scolaires, barème, périodes, classes ──

export async function listAcademicYears(): Promise<AcademicYearDto[]> {
  const res = await apiRequest('/api/academic-years?limit=200', {
    schema: z.object({ academicYears: z.array(AcademicYearDtoSchema) }),
  });
  return res.academicYears;
}

export async function createAcademicYear(
  input: z.infer<typeof CreateAcademicYearSchema>,
): Promise<z.infer<typeof CreateAcademicYearResponseSchema>> {
  return apiRequest('/api/academic-years', {
    method: 'POST',
    body: input,
    schema: CreateAcademicYearResponseSchema,
  });
}

export async function activateAcademicYear(yearId: string): Promise<AcademicYearDto> {
  return apiRequest(`/api/academic-years/${yearId}/activate`, {
    method: 'PATCH',
    schema: AcademicYearDtoSchema,
  });
}

export async function getGradingRules(yearId: string): Promise<GradingRulesDto | null> {
  try {
    return await apiRequest(`/api/academic-years/${yearId}/grading-rules`, {
      schema: GradingRulesDtoSchema,
    });
  } catch (err) {
    if (isApiError(err) && err.status === 404) {
      return null;
    }
    throw err;
  }
}

export async function upsertGradingRules(
  yearId: string,
  input: z.infer<typeof GradingRulesSchema>,
): Promise<GradingRulesDto> {
  return apiRequest(`/api/academic-years/${yearId}/grading-rules`, {
    method: 'PUT',
    body: input,
    schema: GradingRulesDtoSchema,
  });
}

export async function listPeriods(yearId: string): Promise<PeriodDto[]> {
  const res = await apiRequest(`/api/academic-years/${yearId}/periods?limit=200`, {
    schema: z.object({ periods: z.array(PeriodDtoSchema) }),
  });
  return res.periods;
}

export async function createPeriod(
  input: z.infer<typeof CreatePeriodSchema>,
): Promise<PeriodDto> {
  return apiRequest('/api/periods', {
    method: 'POST',
    body: input,
    schema: PeriodDtoSchema,
  });
}

export async function updatePeriod(
  periodId: string,
  input: z.infer<typeof UpdatePeriodSchema>,
): Promise<PeriodDto> {
  return apiRequest(`/api/periods/${periodId}`, {
    method: 'PATCH',
    body: input,
    schema: PeriodDtoSchema,
  });
}

export async function listClasses(academicYearId?: string): Promise<ClassDto[]> {
  const qs = buildQuery({ academicYearId, limit: 200 });
  const res = await apiRequest(`/api/classes${qs}`, {
    schema: z.object({ classes: z.array(ClassDtoSchema) }),
  });
  return res.classes;
}

export async function createClass(
  input: z.infer<typeof CreateClassSchema>,
): Promise<ClassDto> {
  return apiRequest('/api/classes', {
    method: 'POST',
    body: input,
    schema: ClassDtoSchema,
  });
}

export async function updateClass(
  classId: string,
  input: z.infer<typeof UpdateClassSchema>,
): Promise<ClassDto> {
  return apiRequest(`/api/classes/${classId}`, {
    method: 'PATCH',
    body: input,
    schema: ClassDtoSchema,
  });
}

// ── Matières, groupes, coefficients & affectations ──

export async function listSubjectGroups(academicYearId?: string): Promise<SubjectGroupDto[]> {
  const qs = buildQuery({ academicYearId, limit: 200 });
  const res = await apiRequest(`/api/subject-groups${qs}`, {
    schema: z.object({ subjectGroups: z.array(SubjectGroupDtoSchema) }),
  });
  return res.subjectGroups;
}

export async function createSubjectGroup(
  input: z.infer<typeof CreateSubjectGroupSchema>,
): Promise<SubjectGroupDto> {
  return apiRequest('/api/subject-groups', {
    method: 'POST',
    body: input,
    schema: SubjectGroupDtoSchema,
  });
}

export async function listSubjects(activeOnly?: boolean): Promise<SubjectDto[]> {
  const qs = buildQuery({ activeOnly, limit: 200 });
  const res = await apiRequest(`/api/subjects${qs}`, {
    schema: z.object({ subjects: z.array(SubjectDtoSchema) }),
  });
  return res.subjects;
}

export async function createSubject(
  input: z.infer<typeof CreateSubjectSchema>,
): Promise<SubjectDto> {
  return apiRequest('/api/subjects', {
    method: 'POST',
    body: input,
    schema: SubjectDtoSchema,
  });
}

export async function updateSubject(
  subjectId: string,
  input: z.infer<typeof UpdateSubjectSchema>,
): Promise<SubjectDto> {
  return apiRequest(`/api/subjects/${subjectId}`, {
    method: 'PATCH',
    body: input,
    schema: SubjectDtoSchema,
  });
}

export async function listClassSubjects(classId: string): Promise<ClassSubjectDetailDto[]> {
  const res = await apiRequest(`/api/classes/${classId}/subjects?limit=200`, {
    schema: z.object({
      classId: z.string().uuid(),
      classSubjects: z.array(ClassSubjectDetailDtoSchema),
    }),
  });
  return res.classSubjects;
}

export async function upsertClassSubject(
  input: z.infer<typeof UpsertClassSubjectSchema>,
): Promise<ClassSubjectDto> {
  return apiRequest('/api/class-subjects', {
    method: 'PUT',
    body: input,
    schema: ClassSubjectDtoSchema,
  });
}

export async function listTeacherAssignments(filters?: {
  academicYearId?: string;
  classId?: string;
  teacherId?: string;
  includeInactive?: boolean;
}): Promise<TeacherAssignmentDetailDto[]> {
  const qs = buildQuery({
    academicYearId: filters?.academicYearId,
    classId: filters?.classId,
    teacherId: filters?.teacherId,
    includeInactive: filters?.includeInactive,
    limit: 200,
  });
  const res = await apiRequest(`/api/teacher-assignments${qs}`, {
    schema: z.object({ assignments: z.array(TeacherAssignmentDetailDtoSchema) }),
  });
  return res.assignments;
}

export async function createTeacherAssignment(
  input: z.infer<typeof CreateTeacherAssignmentSchema>,
): Promise<TeacherAssignmentDto> {
  return apiRequest('/api/teacher-assignments', {
    method: 'POST',
    body: input,
    schema: TeacherAssignmentDtoSchema,
  });
}

export async function deactivateTeacherAssignment(
  assignmentId: string,
): Promise<TeacherAssignmentDto> {
  return apiRequest(`/api/teacher-assignments/${assignmentId}`, {
    method: 'DELETE',
    schema: TeacherAssignmentDtoSchema,
  });
}

// ── Élèves & Inscriptions ──

export async function listStudents(q?: string, limit = 200, offset = 0): Promise<StudentDto[]> {
  const qs = buildQuery({ q: q?.trim() || undefined, limit, offset });
  const res = await apiRequest(`/api/students${qs}`, {
    schema: z.object({ students: z.array(StudentDtoSchema) }),
  });
  return res.students;
}

export async function createStudent(
  input: z.infer<typeof CreateStudentSchema>,
): Promise<StudentDto> {
  return apiRequest('/api/students', {
    method: 'POST',
    body: input,
    schema: StudentDtoSchema,
  });
}

export async function updateStudent(
  studentId: string,
  input: z.infer<typeof UpdateStudentSchema>,
): Promise<StudentDto> {
  return apiRequest(`/api/students/${studentId}`, {
    method: 'PATCH',
    body: input,
    schema: StudentDtoSchema,
  });
}

export async function listClassStudents(
  classId: string,
  status?: EnrollmentStatus,
): Promise<ClassStudentDto[]> {
  const qs = buildQuery({ status, limit: 200 });
  const res = await apiRequest(`/api/classes/${classId}/students${qs}`, {
    schema: z.object({
      classId: z.string().uuid(),
      students: z.array(ClassStudentDtoSchema),
    }),
  });
  return res.students;
}

export async function createEnrollment(
  input: z.infer<typeof CreateEnrollmentSchema>,
): Promise<EnrollmentDto> {
  return apiRequest('/api/enrollments', {
    method: 'POST',
    body: input,
    schema: EnrollmentDtoSchema,
  });
}

export async function updateEnrollment(
  enrollmentId: string,
  input: z.infer<typeof UpdateEnrollmentSchema>,
): Promise<EnrollmentDto> {
  return apiRequest(`/api/enrollments/${enrollmentId}`, {
    method: 'PATCH',
    body: input,
    schema: EnrollmentDtoSchema,
  });
}

// ── Utilisateurs ──

export async function listUsers(role?: UserRole): Promise<AdminUserDto[]> {
  const qs = buildQuery({ role, limit: 200 });
  return apiRequest(`/api/users${qs}`, {
    schema: z.array(AdminUserDtoSchema),
  });
}

export async function createUser(
  input: z.infer<typeof CreateUserSchema>,
): Promise<AdminUserDto> {
  return apiRequest('/api/users', {
    method: 'POST',
    body: input,
    schema: AdminUserDtoSchema,
  });
}

export async function updateUser(
  userId: string,
  input: z.infer<typeof UpdateUserSchema>,
): Promise<AdminUserDto> {
  return apiRequest(`/api/users/${userId}`, {
    method: 'PATCH',
    body: input,
    schema: AdminUserDtoSchema,
  });
}

export async function resetUserPassword(
  userId: string,
  input: z.infer<typeof ResetPasswordSchema>,
): Promise<{ success: true }> {
  return apiRequest(`/api/users/${userId}/reset-password`, {
    method: 'POST',
    body: input,
    schema: SuccessResponseSchema,
  });
}
