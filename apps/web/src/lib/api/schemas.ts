import { USER_ROLES } from '@lycee/shared';
import { z } from 'zod';

export const AuthUserSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  fullName: z.string(),
  role: z.enum(USER_ROLES),
  isActive: z.boolean(),
});

export const AuthSessionResponseSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  user: AuthUserSchema,
});

export const SuccessResponseSchema = z.object({
  success: z.literal(true),
});

export const BackendErrorPayloadSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export type AuthSessionResponse = z.infer<typeof AuthSessionResponseSchema>;
