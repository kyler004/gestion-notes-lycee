import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createStudent,
  fetchSchoolLogoBlob,
  fileToLogoPayload,
  getSchoolProfile,
  listUsers,
} from '../admin';
import { apiFetchBlob, registerApiAuthBridge } from '../client';
import { ApiError } from '../errors';

describe('Admin API client & binary blob fetcher', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('apiFetchBlob injects Bearer token and retries once after 401 refresh', async () => {
    let token = 'old-token';
    const refreshMock = vi.fn(async () => {
      token = 'new-token';
      return token;
    });

    registerApiAuthBridge({
      getAccessToken: () => token,
      refreshAccessToken: refreshMock,
    });

    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    globalThis.fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const headers = init?.headers as Headers;
      if (headers.get('Authorization') === 'Bearer new-token') {
        return new Response(pngBytes, {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        });
      }
      return new Response(
        JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Token expiré' } }),
        { status: 401 },
      );
    });

    const blob = await apiFetchBlob('/api/school/logo');
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBe(pngBytes.length);
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('fetchSchoolLogoBlob returns null on 404 and rethrows server errors', async () => {
    registerApiAuthBridge({
      getAccessToken: () => 'tok',
      refreshAccessToken: async () => null,
    });

    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Aucun logo' } }), {
        status: 404,
      }),
    );
    await expect(fetchSchoolLogoBlob()).resolves.toBeNull();

    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Erreur' } }), {
        status: 500,
      }),
    );
    await expect(fetchSchoolLogoBlob()).rejects.toBeInstanceOf(ApiError);
  });

  it('validates file type & max size in fileToLogoPayload and extracts base64', async () => {
    const svgFile = new File(['<svg/>'], 'bad.svg', { type: 'image/svg+xml' });
    await expect(fileToLogoPayload(svgFile)).rejects.toThrow('PNG ou JPEG');

    const bigFile = new File([new Uint8Array(513 * 1024)], 'big.png', { type: 'image/png' });
    await expect(fileToLogoPayload(bigFile)).rejects.toThrow('512 Ko');

    const validPng = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'logo.png', {
      type: 'image/png',
    });
    const payload = await fileToLogoPayload(validPng);
    expect(payload.mimeType).toBe('image/png');
    expect(payload.dataBase64.length).toBeGreaterThan(4);
    expect(payload.dataBase64.startsWith('data:')).toBe(false);
  });

  it('validates Zod payloads and preserves backend ApiError 409 conflict', async () => {
    registerApiAuthBridge({
      getAccessToken: () => 'tok',
      refreshAccessToken: async () => null,
    });

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 1,
            name: 'Lycée Test',
            motto: 'Travail',
            country: 'République du Cameroun',
            ministry: 'MINESEC',
            region: 'Centre',
            delegation: 'Mfoundi',
            city: 'Yaoundé',
            phone: '',
            email: '',
            hasLogo: false,
            logoMimeType: null,
            updatedAt: '2026-11-22T00:00:00.000Z',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: '11111111-1111-4111-8111-111111111111',
              username: 'admin',
              email: null,
              fullName: 'Admin',
              role: 'admin',
              isActive: true,
              createdAt: '2026-11-22T00:00:00.000Z',
              updatedAt: '2026-11-22T00:00:00.000Z',
            },
          ]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: 'CONFLICT',
              message: 'Un élève avec le matricule "26-001" existe déjà.',
            },
          }),
          { status: 409 },
        ),
      );

    const school = await getSchoolProfile();
    expect(school.name).toBe('Lycée Test');

    const users = await listUsers();
    expect(users).toHaveLength(1);

    await expect(
      createStudent({
        matricule: '26-001',
        lastName: 'BELLO',
        firstName: 'Aminatou',
        birthDate: '2010-01-01',
        birthPlace: 'Yaoundé',
        sex: 'F',
      }),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
      message: 'Un élève avec le matricule "26-001" existe déjà.',
    });
  });
});
