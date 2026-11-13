import { z } from 'zod';

export const ClassPeriodReportQuerySchema = z.object({
  classId: z.string().uuid(),
  periodId: z.string().uuid(),
});

export const SchoolStatsQuerySchema = z.object({
  academicYearId: z.string().uuid(),
  periodId: z.string().uuid(),
});

export const StudentBulletinQuerySchema = z.object({
  periodId: z.string().uuid(),
});
