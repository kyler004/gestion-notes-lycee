import { z } from 'zod';

export const UpdateSchoolProfileSchema = z.object({
  name: z.string().trim().min(2).max(160),
  motto: z.string().trim().max(200).optional().default(''),
  country: z.string().trim().min(2).max(120).optional().default('République du Cameroun'),
  ministry: z
    .string()
    .trim()
    .max(160)
    .optional()
    .default('Ministère des Enseignements Secondaires'),
  region: z.string().trim().max(120).optional().default(''),
  delegation: z.string().trim().max(160).optional().default(''),
  city: z.string().trim().max(120).optional().default(''),
  phone: z.string().trim().max(40).optional().default(''),
  email: z.string().trim().email().or(z.literal('')).optional().default(''),
});

export const UploadSchoolLogoSchema = z.object({
  mimeType: z.enum(['image/png', 'image/jpeg']),
  dataBase64: z.string().min(16).max(800_000),
});
