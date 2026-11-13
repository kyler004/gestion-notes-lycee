import { z } from 'zod';
import { USER_ROLES } from '../types/domain.js';

export const LoginSchema = z.object({
  username: z.string().trim().min(2).max(64),
  password: z.string().min(6).max(128),
  deviceLabel: z.string().trim().max(120).optional(),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(16).max(512),
});

export const LogoutSchema = z.object({
  refreshToken: z.string().min(16).max(512),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(6).max(128),
  newPassword: z.string().min(8).max(128),
});

export const CreateUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Identifiant invalide (caractères alphanumériques, ., _, - uniquement)'),
  email: z.string().trim().email().nullable().optional(),
  fullName: z.string().trim().min(2).max(120),
  role: z.enum(USER_ROLES),
  password: z.string().min(8).max(128),
  isActive: z.boolean().optional().default(true),
});

export const UpdateUserSchema = z.object({
  email: z.string().trim().email().nullable().optional(),
  fullName: z.string().trim().min(2).max(120).optional(),
  role: z.enum(USER_ROLES).optional(),
  isActive: z.boolean().optional(),
});

export const ResetPasswordSchema = z.object({
  newPassword: z.string().min(8).max(128),
});
