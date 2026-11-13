import { randomUUID } from 'node:crypto';
import {
  ChangePasswordSchema,
  LoginSchema,
  LogoutSchema,
  RefreshTokenSchema,
  type AuthUserPayload,
  type UserRole,
} from '@lycee/shared';
import { and, desc, eq, gt, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import type { AppConfig } from '../config/env.js';
import type { DbClient } from '../db/client.js';
import { refreshTokens, users } from '../db/schema.js';
import {
  generateOpaqueToken,
  hashPassword,
  hashToken,
  needsPasswordRehash,
  verifyPassword,
} from '../lib/crypto.js';
import { NotFoundError, UnauthorizedError } from '../lib/errors.js';

const MAX_ACTIVE_SESSIONS_PER_USER = 10;
const REVOKED_TOKEN_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

let dummyHashPromise: Promise<string> | null = null;
function getDummyPasswordHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword('__lycee_dummy_timing_protection_password_2026__');
  }
  return dummyHashPromise;
}

export interface AccessTokenJwtPayload {
  sub: string;
  ver: number;
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
  const maxSessionMs =
    Math.max(config.JWT_REFRESH_TTL_DAYS, config.JWT_REFRESH_MAX_SESSION_DAYS) *
    24 *
    60 *
    60 *
    1000;

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
        tokenVersion: users.tokenVersion,
      })
      .from(users)
      .where(eq(users.username, data.username))
      .limit(1);

    const targetHash = user ? user.passwordHash : await getDummyPasswordHash();
    const passwordValid = await verifyPassword(data.password, targetHash);

    if (!user || !passwordValid || !user.isActive) {
      throw new UnauthorizedError('Identifiants invalides.');
    }

    const upgradedHash = needsPasswordRehash(user.passwordHash)
      ? await hashPassword(data.password)
      : null;

    const refreshToken = generateOpaqueToken();
    const tokenHash = hashToken(refreshToken);
    const familyId = randomUUID();
    const now = new Date();
    const nowMs = now.getTime();
    const sessionExpiresAt = new Date(nowMs + maxSessionMs);
    const expiresAt = new Date(Math.min(nowMs + refreshTtlMs, sessionExpiresAt.getTime()));
    const revokedCutoff = new Date(nowMs - REVOKED_TOKEN_RETENTION_MS);

    await db.transaction(async (tx) => {
      if (upgradedHash) {
        await tx
          .update(users)
          .set({ passwordHash: upgradedHash, updatedAt: now })
          .where(eq(users.id, user.id));
      }

      // Purger les jetons expirés ou révoqués depuis plus de 30 jours
      await tx
        .delete(refreshTokens)
        .where(
          and(
            eq(refreshTokens.userId, user.id),
            or(
              lte(refreshTokens.expiresAt, now),
              lte(refreshTokens.sessionExpiresAt, now),
              and(isNotNull(refreshTokens.revokedAt), lte(refreshTokens.revokedAt, revokedCutoff)),
            ),
          ),
        );

      // Plafonner à MAX_ACTIVE_SESSIONS_PER_USER sessions (familles) actives simultanées
      const activeFamilyRows = await tx
        .select({
          familyId: refreshTokens.familyId,
          createdAt: refreshTokens.createdAt,
        })
        .from(refreshTokens)
        .where(
          and(
            eq(refreshTokens.userId, user.id),
            isNull(refreshTokens.revokedAt),
            gt(refreshTokens.expiresAt, now),
            gt(refreshTokens.sessionExpiresAt, now),
          ),
        )
        .orderBy(desc(refreshTokens.createdAt));

      const uniqueFamiliesInOrder: string[] = [];
      for (const row of activeFamilyRows) {
        if (!uniqueFamiliesInOrder.includes(row.familyId)) {
          uniqueFamiliesInOrder.push(row.familyId);
        }
      }

      const overflowFamilies = uniqueFamiliesInOrder.slice(MAX_ACTIVE_SESSIONS_PER_USER - 1);
      for (const oldFamilyId of overflowFamilies) {
        await tx
          .update(refreshTokens)
          .set({ revokedAt: now })
          .where(and(eq(refreshTokens.familyId, oldFamilyId), isNull(refreshTokens.revokedAt)));
      }

      await tx.insert(refreshTokens).values({
        userId: user.id,
        familyId,
        tokenHash,
        deviceLabel: data.deviceLabel ?? null,
        expiresAt,
        sessionExpiresAt,
      });
    });

    const accessToken = await signAccessToken({
      sub: user.id,
      ver: user.tokenVersion,
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
    if (
      existingToken.expiresAt.getTime() <= now.getTime() ||
      existingToken.sessionExpiresAt.getTime() <= now.getTime()
    ) {
      throw new UnauthorizedError('Jeton de rafraîchissement expiré.');
    }

    const [user] = await db
      .select({
        id: users.id,
        username: users.username,
        fullName: users.fullName,
        role: users.role,
        isActive: users.isActive,
        tokenVersion: users.tokenVersion,
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
    const newExpiresAt = new Date(
      Math.min(now.getTime() + refreshTtlMs, existingToken.sessionExpiresAt.getTime()),
    );

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
        sessionExpiresAt: existingToken.sessionExpiresAt,
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
      ver: user.tokenVersion,
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
    const now = new Date();

    const [tokenRow] = await db
      .select({ familyId: refreshTokens.familyId })
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);

    if (tokenRow) {
      await db
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(and(eq(refreshTokens.familyId, tokenRow.familyId), isNull(refreshTokens.revokedAt)));
    }

    return { success: true };
  }

  async function logoutAll(userId: string): Promise<{ success: true }> {
    const now = new Date();

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          tokenVersion: sql`${users.tokenVersion} + 1`,
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
          tokenVersion: sql`${users.tokenVersion} + 1`,
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
    logoutAll,
    changePassword,
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
