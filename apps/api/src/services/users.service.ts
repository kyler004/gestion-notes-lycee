import {
  CreateUserSchema,
  ResetPasswordSchema,
  USER_ROLES,
  UpdateUserSchema,
  type UserRole,
} from '@lycee/shared';
import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import { z } from 'zod';
import type { DbClient } from '../db/client.js';
import { refreshTokens, users } from '../db/schema.js';
import { hashPassword } from '../lib/crypto.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../lib/errors.js';

export interface UserDto {
  id: string;
  username: string;
  email: string | null;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const UserIdSchema = z.string().uuid();
const ListUsersQuerySchema = z.object({
  role: z.enum(USER_ROLES).optional(),
});

const userPublicColumns = {
  id: users.id,
  username: users.username,
  email: users.email,
  fullName: users.fullName,
  role: users.role,
  isActive: users.isActive,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};

function toUserDto(row: {
  id: string;
  username: string;
  email: string | null;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): UserDto {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    fullName: row.fullName,
    role: row.role,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const record = err as { code?: unknown; cause?: { code?: unknown } };
  return record.code === '23505' || record.cause?.code === '23505';
}

export function createUsersService(db: DbClient) {
  async function listUsers(query?: unknown): Promise<UserDto[]> {
    const parsed = ListUsersQuerySchema.parse(query ?? {});

    const baseQuery = db
      .select(userPublicColumns)
      .from(users);

    const rows = parsed.role
      ? await baseQuery.where(eq(users.role, parsed.role)).orderBy(asc(users.fullName), asc(users.username))
      : await baseQuery.orderBy(asc(users.fullName), asc(users.username));

    return rows.map(toUserDto);
  }

  async function createUser(input: unknown, actorRole: UserRole): Promise<UserDto> {
    if (actorRole !== 'admin' && actorRole !== 'censor') {
      throw new ForbiddenError('Action non autorisée pour ce rôle.');
    }

    const data = CreateUserSchema.parse(input);

    if (data.role === 'admin' && actorRole !== 'admin') {
      throw new ForbiddenError('Seul un administrateur peut créer un compte administrateur.');
    }

    const normalizedEmail = data.email ?? null;

    const [existingByUsername] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, data.username))
      .limit(1);

    if (existingByUsername) {
      throw new ConflictError('Ce nom d’utilisateur est déjà utilisé.');
    }

    if (normalizedEmail !== null) {
      const [existingByEmail] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      if (existingByEmail) {
        throw new ConflictError('Cette adresse e-mail est déjà utilisée.');
      }
    }

    const passwordHash = await hashPassword(data.password);

    try {
      const [created] = await db
        .insert(users)
        .values({
          username: data.username,
          email: normalizedEmail,
          fullName: data.fullName,
          role: data.role,
          passwordHash,
          isActive: data.isActive,
        })
        .returning(userPublicColumns);

      if (!created) {
        throw new Error('Échec de la création de l’utilisateur.');
      }

      return toUserDto(created);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError('Un utilisateur avec cet identifiant ou e-mail existe déjà.');
      }
      throw err;
    }
  }

  async function updateUser(userId: string, input: unknown, actorRole: UserRole): Promise<UserDto> {
    if (actorRole !== 'admin' && actorRole !== 'censor') {
      throw new ForbiddenError('Action non autorisée pour ce rôle.');
    }

    const id = UserIdSchema.parse(userId);
    const data = UpdateUserSchema.parse(input);

    const [existing] = await db
      .select(userPublicColumns)
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!existing) {
      throw new NotFoundError('Utilisateur introuvable.');
    }

    if (existing.role === 'admin' && actorRole !== 'admin') {
      throw new ForbiddenError('Seul un administrateur peut modifier un compte administrateur.');
    }

    if (data.role === 'admin' && actorRole !== 'admin') {
      throw new ForbiddenError('Seul un administrateur peut attribuer le rôle administrateur.');
    }

    if (data.email !== undefined && data.email !== null && data.email !== existing.email) {
      const [duplicateEmail] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, data.email), ne(users.id, id)))
        .limit(1);

      if (duplicateEmail) {
        throw new ConflictError('Cette adresse e-mail est déjà utilisée.');
      }
    }

    const now = new Date();
    const updateValues: Partial<{
      email: string | null;
      fullName: string;
      role: UserRole;
      isActive: boolean;
      updatedAt: Date;
    }> = {
      updatedAt: now,
    };

    if (data.email !== undefined) {
      updateValues.email = data.email;
    }
    if (data.fullName !== undefined) {
      updateValues.fullName = data.fullName;
    }
    if (data.role !== undefined) {
      updateValues.role = data.role;
    }
    if (data.isActive !== undefined) {
      updateValues.isActive = data.isActive;
    }

    try {
      const updated = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(users)
          .set(updateValues)
          .where(eq(users.id, id))
          .returning(userPublicColumns);

        if (!row) {
          throw new NotFoundError('Utilisateur introuvable.');
        }

        if (data.isActive === false) {
          await tx
            .update(refreshTokens)
            .set({ revokedAt: now })
            .where(and(eq(refreshTokens.userId, id), isNull(refreshTokens.revokedAt)));
        }

        return row;
      });

      return toUserDto(updated);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError('Cette adresse e-mail est déjà utilisée.');
      }
      throw err;
    }
  }

  async function resetPassword(userId: string, input: unknown, actorRole: UserRole): Promise<{ success: true }> {
    if (actorRole !== 'admin') {
      throw new ForbiddenError('Seul un administrateur peut réinitialiser un mot de passe.');
    }

    const id = UserIdSchema.parse(userId);
    const data = ResetPasswordSchema.parse(input);

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!existing) {
      throw new NotFoundError('Utilisateur introuvable.');
    }

    const newPasswordHash = await hashPassword(data.newPassword);
    const now = new Date();

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          passwordHash: newPasswordHash,
          updatedAt: now,
        })
        .where(eq(users.id, id));

      await tx
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(and(eq(refreshTokens.userId, id), isNull(refreshTokens.revokedAt)));
    });

    return { success: true };
  }

  return {
    listUsers,
    createUser,
    updateUser,
    resetPassword,
  };
}

export type UsersService = ReturnType<typeof createUsersService>;
