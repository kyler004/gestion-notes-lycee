import { z } from 'zod';
import { USER_ROLES } from '../types/domain.js';

const REFRESH_TOKEN_REGEX = /^[A-Za-z0-9_-]{32,128}$/;

const StrongPasswordSchema = z
  .string()
  .min(10, 'Le mot de passe doit contenir au moins 10 caractères.')
  .max(128)
  .refine(
    (val) => /[A-Za-z]/.test(val) && /\d/.test(val),
    'Le mot de passe doit contenir au moins une lettre et un chiffre.',
  );

export const LoginSchema = z.object({
  username: z.string().trim().min(2).max(64),
  password: z.string().min(6).max(128),
  deviceLabel: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[^\p{C}]+$/u, 'Libellé appareil invalide (caractères de contrôle interdits).')
    .optional(),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z
    .string()
    .regex(REFRESH_TOKEN_REGEX, 'Format de jeton de rafraîchissement invalide.'),
});

export const LogoutSchema = z.object({
  refreshToken: z
    .string()
    .regex(REFRESH_TOKEN_REGEX, 'Format de jeton de rafraîchissement invalide.'),
});

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(6).max(128),
    newPassword: StrongPasswordSchema,
  })
  .superRefine((val, ctx) => {
    if (val.newPassword === val.currentPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['newPassword'],
        message: 'Le nouveau mot de passe doit être différent du mot de passe actuel.',
      });
    }
  });

export const CreateUserSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3)
      .max(64)
      .regex(/^[a-zA-Z0-9._-]+$/, 'Identifiant invalide (caractères alphanumériques, ., _, - uniquement)'),
    email: z.string().trim().email().nullable().optional(),
    fullName: z.string().trim().min(2).max(120),
    role: z.enum(USER_ROLES),
    password: StrongPasswordSchema,
    isActive: z.boolean().optional().default(true),
  })
  .superRefine((val, ctx) => {
    if (val.password.trim().toLowerCase() === val.username.trim().toLowerCase()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['password'],
        message: 'Le mot de passe ne peut pas être identique au nom d’utilisateur.',
      });
    }
  });

export const UpdateUserSchema = z.object({
  email: z.string().trim().email().nullable().optional(),
  fullName: z.string().trim().min(2).max(120).optional(),
  role: z.enum(USER_ROLES).optional(),
  isActive: z.boolean().optional(),
});

export const ResetPasswordSchema = z.object({
  newPassword: StrongPasswordSchema,
});
