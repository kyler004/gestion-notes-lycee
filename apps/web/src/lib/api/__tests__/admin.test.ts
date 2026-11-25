import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createStudent,
  fetchSchoolLogoBlob,
  fileToLogoPayload,
  generateStudentsCsvTemplate,
  getSchoolProfile,
  importStudentsCsv,
  listUsers,
  readCsvFileContent,
} from '../admin';
import { apiFetchBlob, registerApiAuthBridge } from '../client';
import { ApiError } from '../errors';

const YEAR_ID = 'aaaa1111-1111-4111-8111-111111111111';
const CLASS_ID = 'bbbb2222-2222-4222-8222-222222222222';
const STUDENT_ID = 'cccc3333-3333-4333-8333-333333333333';
const ENROLL_ID = 'dddd4444-4444-4444-8444-444444444444';

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
    expect(Object.prototype.toString.call(blob)).toBe('[object Blob]');
    expect(blob.type).toBe('image/png');
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

  it('validates CSV file content and handles dry-run, commit 201, 422 details, and 429 rate-limit', async () => {
    const badFile = new File(['abc'], 'eleves.pdf', { type: 'application/pdf' });
    await expect(readCsvFileContent(badFile)).rejects.toThrow('.csv');

    const emptyFile = new File([''], 'vide.csv', { type: 'text/csv' });
    await expect(readCsvFileContent(emptyFile)).rejects.toThrow('vide');

    const hugeFile = new File([new Uint8Array(513 * 1024)], 'huge.csv', { type: 'text/csv' });
    await expect(readCsvFileContent(hugeFile)).rejects.toThrow('512 Ko');

    const template = generateStudentsCsvTemplate('3ème A');
    const okFile = new File([template], 'eleves.csv', { type: 'text/csv' });
    const parsedCsv = await readCsvFileContent(okFile);
    expect(parsedCsv).toContain('MBARGA;Pauline');

    registerApiAuthBridge({
      getAccessToken: () => 'tok',
      refreshAccessToken: async () => null,
    });

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            dryRun: true,
            committed: false,
            summary: {
              totalRows: 2,
              validRows: 2,
              errorCount: 0,
              studentsToCreate: 2,
              studentsReused: 0,
              enrollmentsToCreate: 2,
            },
            errors: [],
            preview: [
              {
                line: 2,
                matricule: '26LYC101',
                lastName: 'MBARGA',
                firstName: 'Pauline',
                birthDate: '2011-03-15',
                sex: 'F',
                classId: CLASS_ID,
                className: '3ème A',
                isRepeater: false,
                action: 'create_student',
              },
            ],
            createdStudents: [],
            createdEnrollments: [],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            dryRun: false,
            committed: true,
            summary: {
              totalRows: 1,
              validRows: 1,
              errorCount: 0,
              studentsToCreate: 1,
              studentsReused: 0,
              enrollmentsToCreate: 1,
            },
            errors: [],
            preview: [],
            createdStudents: [
              {
                id: STUDENT_ID,
                matricule: '26LYC101',
                lastName: 'MBARGA',
                firstName: 'Pauline',
                birthDate: '2011-03-15',
                birthPlace: 'Yaoundé',
                sex: 'F',
                syncVersion: 1,
                createdAt: '2026-11-25T08:00:00.000Z',
                updatedAt: '2026-11-25T08:00:00.000Z',
              },
            ],
            createdEnrollments: [
              {
                id: ENROLL_ID,
                studentId: STUDENT_ID,
                classId: CLASS_ID,
                academicYearId: YEAR_ID,
                isRepeater: false,
                status: 'active',
                syncVersion: 2,
                enrolledAt: '2026-11-25T08:00:00.000Z',
                updatedAt: '2026-11-25T08:00:00.000Z',
              },
            ],
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Des erreurs ont été détectées dans le fichier CSV.',
              details: {
                summary: {
                  totalRows: 1,
                  validRows: 0,
                  errorCount: 1,
                  studentsToCreate: 0,
                  studentsReused: 0,
                  enrollmentsToCreate: 0,
                },
                errors: [
                  {
                    line: 2,
                    matricule: '26LYC101',
                    field: 'birthDate',
                    message: 'Date invalide',
                  },
                ],
              },
            },
          }),
          { status: 422 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Trop de requêtes' },
          }),
          { status: 429, headers: { 'retry-after': '45' } },
        ),
      );

    const preview = await importStudentsCsv({
      csvContent: parsedCsv,
      classId: CLASS_ID,
      academicYearId: YEAR_ID,
      dryRun: true,
    });
    expect(preview.committed).toBe(false);
    expect(preview.preview[0]?.matricule).toBe('26LYC101');

    const committed = await importStudentsCsv({
      csvContent: parsedCsv,
      classId: CLASS_ID,
      academicYearId: YEAR_ID,
      dryRun: false,
    });
    expect(committed.committed).toBe(true);
    expect(committed.createdEnrollments).toHaveLength(1);

    await expect(
      importStudentsCsv({ csvContent: parsedCsv, dryRun: false }),
    ).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
    });

    await expect(
      importStudentsCsv({ csvContent: parsedCsv, dryRun: true }),
    ).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 45,
    });
  });
});
