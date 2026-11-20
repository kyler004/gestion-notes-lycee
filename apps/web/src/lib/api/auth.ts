import type { AuthUserPayload } from '@lycee/shared';
import { apiRequest } from './client';
import {
  AuthSessionResponseSchema,
  AuthUserSchema,
  SuccessResponseSchema,
  type AuthSessionResponse,
} from './schemas';

export interface LoginInput {
  username: string;
  password: string;
  deviceLabel?: string;
}

export async function loginRequest(input: LoginInput): Promise<AuthSessionResponse> {
  return apiRequest('/api/auth/login', {
    method: 'POST',
    body: input,
    auth: false,
    schema: AuthSessionResponseSchema,
  });
}

export async function refreshRequest(refreshToken: string): Promise<AuthSessionResponse> {
  return apiRequest('/api/auth/refresh', {
    method: 'POST',
    body: { refreshToken },
    auth: false,
    schema: AuthSessionResponseSchema,
  });
}

export async function logoutRequest(refreshToken: string): Promise<{ success: true }> {
  return apiRequest('/api/auth/logout', {
    method: 'POST',
    body: { refreshToken },
    auth: false,
    schema: SuccessResponseSchema,
  });
}

export async function logoutAllRequest(): Promise<{ success: true }> {
  return apiRequest('/api/auth/logout-all', {
    method: 'POST',
    schema: SuccessResponseSchema,
  });
}

export async function meRequest(): Promise<AuthUserPayload> {
  return apiRequest('/api/auth/me', {
    method: 'GET',
    schema: AuthUserSchema,
  });
}
