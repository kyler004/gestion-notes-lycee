import { randomUUID } from 'node:crypto';
import {
  ChangePasswordSchema,
  LoginSchema,
  LogoutSchema,
  RefreshTokenSchema,
  type AuthUserPayload,
  type UserRole,
} from '@lycee/shared';
import { and, eq, isNull } from 'drizzle-orm';
import type { AppConfig } from '../config/env.js';
import type { DbClient } from '../db/client.js';
import { refreshTokens, users } from '../db/schema.js';
import { generateOpaqueToken, hashPassword, hashToken, verifyPassword } from '../lib/crypto.js';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../lib/errors.js';

export interface AccessTokenJwtPayload {
  sub: string;
  username: string;
  fullName: string;
  role: UserRole;
}

export type SignAccessTokenFn = (payload: AccessTokenJwtPayload) => string | Promise<string>;

export interface AuthSessionResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUserPayload;
}

function toAuthUserPayload(user: {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
}): AuthUserPayload {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    isActive: user.isActive,
  };
}

export function createAuthService(db: DbClient, config: AppConfig) {
  const refreshTtlMs = config.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000;

  async function login(input: unknown, signAccessToken: SignAccessTokenFn): Promise<AuthSessionResult> {
    const data = LoginSchema.parse(input);

    const [user] = await db
      .select({
        id: users.id,
        username: users.username,
        fullName: users.fullName,
        role: users.role,
        passwordHash: users.passwordHash,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.username, data.username))
      .limit(1);

    if (!user) {
      throw new UnauthorizedError('Identifiants invalides.');
    }

    const passwordValid = await verifyPassword(data.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedError('Identifiants invalides.');
    }

    if (!user.isActive) {
      throw new ForbiddenError('Compte utilisateur désactivé.');
    }

    const refreshToken = generateOpaqueToken();
    const tokenHash = hashToken(refreshToken);
    const familyId = randomUUID();
    const expiresAt = new Date(Date.now() + refreshTtlMs);

    await db.insert(refreshTokens).values({
      userId: user.id,
      familyId,
      tokenHash,
      deviceLabel: data.deviceLabel ?? null,
      expiresAt,
    });

    const accessToken = await signAccessToken({
      sub: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
    });

    return {
      accessToken,
      refreshToken,
      user: toAuthUserPayload(user),
    };
  }

  async function refresh(input: unknown, signAccessToken: SignAccessTokenFn): Promise<AuthSessionResult> {
    const data = RefreshTokenSchema.parse(input);
    const tokenHash = hashToken(data.refreshToken);

    const [existingToken] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);

    if (!existingToken) {
      throw new UnauthorizedError('Jeton de rafraîchissement invalide.');
    }

    if (existingToken.revokedAt !== null) {
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.familyId, existingToken.familyId), isNull(refreshTokens.revokedAt)));
      throw new UnauthorizedError('Réutilisation de jeton détectée. Session révoquée.');
    }

    const now = new Date();
    if (existingToken.expiresAt.getTime() <= now.getTime()) {
      throw new UnauthorizedError('Jeton de rafraîchissement expiré.');
    }

    const [user] = await db
      .select({
        id: users.id,
        username: users.username,
        fullName: users.fullName,
        role: users.role,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, existingToken.userId))
      .limit(1);

    if (!user || !user.isActive) {
      throw new UnauthorizedError('Compte utilisateur inactif ou introuvable.');
    }

    const newRefreshToken = generateOpaqueToken();
    const newTokenHash = hashToken(newRefreshToken);
    const newTokenId = randomUUID();
    const newExpiresAt = new Date(now.getTime() + refreshTtlMs);

    const rotated = await db.transaction(async (tx) => {
      const [revokedOld] = await tx
        .update(refreshTokens)
        .set({
          revokedAt: now,
          replacedById: newTokenId,
        })
        .where(and(eq(refreshTokens.id, existingToken.id), isNull(refreshTokens.revokedAt)))
        .returning({ id: refreshTokens.id });

      if (!revokedOld) {
        return false;
      }

      await tx.insert(refreshTokens).values({
        id: newTokenId,
        userId: user.id,
        familyId: existingToken.familyId,
        tokenHash: newTokenHash,
        deviceLabel: existingToken.deviceLabel,
        expiresAt: newExpiresAt,
      });

      return true;
    });

    if (!rotated) {
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.familyId, existingToken.familyId), isNull(refreshTokens.revokedAt)));
      throw new UnauthorizedError('Réutilisation de jeton détectée. Session révoquée.');
    }

    const accessToken = await signAccessToken({
      sub: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: toAuthUserPayload(user),
    };
  }

  async function logout(input: unknown): Promise<{ success: true }> {
    const data = LogoutSchema.parse(input);
    const tokenHash = hashToken(data.refreshToken);

    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)));

    return { success: true };
  }

  async function changePassword(userId: string, input: unknown): Promise<{ success: true }> {
    const data = ChangePasswordSchema.parse(input);

    const [user] = await db
      .select({
        id: users.id,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new NotFoundError('Utilisateur introuvable.');
    }

    const passwordValid = await verifyPassword(data.currentPassword, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedError('Mot de passe actuel incorrect.');
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
        .where(eq(users.id, userId));

      await tx
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
    });

    return { success: true };
  }

  return {
    login,
    refresh,
    logout,
    changePassword,
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
