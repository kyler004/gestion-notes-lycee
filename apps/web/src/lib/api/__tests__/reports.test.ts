import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetchFile, registerApiAuthBridge } from '../client';
import { ApiError } from '../errors';
import {
  downloadClassBulletinsPdf,
  getPeriodCompleteness,
  getSchoolStats,
  listGradeAuditLogs,
} from '../reports';

const YEAR_ID = 'aaaa1111-1111-4111-8111-111111111111';
const PERIOD_ID = 'bbbb1111-1111-4111-8111-111111111111';
const CLASS_ID = 'cccc1111-1111-4111-8111-111111111111';
const CS_ID = 'dddd1111-1111-4111-8111-111111111111';
const SUBJ_ID = 'eeee1111-1111-4111-8111-111111111111';
const ENROLL_ID = 'ffff1111-1111-4111-8111-111111111111';
const STUDENT_ID = '11112222-1111-4111-8111-111111111111';
const USER_ID = '22223333-1111-4111-8111-111111111111';
const GRADE_ID = '33334444-1111-4111-8111-111111111111';
const LOG_ID = '44445555-1111-4111-8111-111111111111';

describe('Reports & Validation API client + apiFetchFile', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('apiFetchFile injects Bearer, refreshes on 401, and extracts Content-Disposition filename', async () => {
    let token = 'expired';
    const refreshMock = vi.fn(async () => {
      token = 'fresh';
      return token;
    });
    registerApiAuthBridge({
      getAccessToken: () => token,
      refreshAccessToken: refreshMock,
    });

    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = init?.headers as Headers;
      if (headers.get('Authorization') === 'Bearer fresh') {
        return new Response(pdfBytes, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'inline; filename="bulletins-3eme-A-S1.pdf"',
          },
        });
      }
      return new Response(
        JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Expired' } }),
        { status: 401 },
      );
    });

    const file = await apiFetchFile(`/api/reports/bulletins/class/${CLASS_ID}/pdf?periodId=${PERIOD_ID}`);
    expect(file.filename).toBe('bulletins-3eme-A-S1.pdf');
    expect(file.blob.size).toBe(4);
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('maps 429 retry-after and 503 PDF_SERVICE_BUSY errors on PDF download', async () => {
    registerApiAuthBridge({
      getAccessToken: () => 'tok',
      refreshAccessToken: async () => null,
    });

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Trop de requêtes PDF' },
          }),
          { status: 429, headers: { 'retry-after': '25' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { code: 'PDF_SERVICE_BUSY', message: 'Sémaphore PDF saturé' },
          }),
          { status: 503 },
        ),
      );

    await expect(downloadClassBulletinsPdf(CLASS_ID, PERIOD_ID)).rejects.toMatchObject({
      name: 'ApiError',
      status: 429,
      retryAfterSeconds: 25,
    } satisfies Partial<ApiError>);

    await expect(downloadClassBulletinsPdf(CLASS_ID, PERIOD_ID)).rejects.toMatchObject({
      name: 'ApiError',
      status: 503,
      code: 'PDF_SERVICE_BUSY',
    } satisfies Partial<ApiError>);
  });

  it('validates completeness, school stats, and grade audit DTO responses with Zod', async () => {
    registerApiAuthBridge({
      getAccessToken: () => 'tok',
      refreshAccessToken: async () => null,
    });

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            periodId: PERIOD_ID,
            periodCode: 'S1',
            periodName: 'Séquence 1',
            periodType: 'sequence',
            status: 'open',
            isComplete: false,
            classes: [
              {
                classId: CLASS_ID,
                className: '3ème A',
                level: '3ème',
                expectedStudents: 12,
                isComplete: false,
                subjects: [
                  {
                    classSubjectId: CS_ID,
                    subjectId: SUBJ_ID,
                    subjectCode: 'MATH',
                    subjectName: 'Mathématiques',
                    subjectShortName: 'MATHS',
                    expectedStudents: 12,
                    gradedCount: 10,
                    missingCount: 2,
                    isComplete: false,
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            academicYearId: YEAR_ID,
            academicYearLabel: '2026-2027',
            period: {
              id: PERIOD_ID,
              code: 'S1',
              name: 'Séquence 1',
              type: 'sequence',
              status: 'open',
              isOfficial: false,
            },
            totalStudents: 12,
            evaluatedStudents: 12,
            overallAverage: 13.45,
            overallPassRate: 83.33,
            classes: [],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            logs: [
              {
                id: LOG_ID,
                gradeId: GRADE_ID,
                enrollmentId: ENROLL_ID,
                classId: CLASS_ID,
                studentId: STUDENT_ID,
                studentMatricule: '26LBA001',
                studentLastName: 'BELLO',
                studentFirstName: 'Aminatou',
                classSubjectId: CS_ID,
                subjectCode: 'MATH',
                subjectName: 'Mathématiques',
                periodId: PERIOD_ID,
                periodCode: 'S1',
                periodName: 'Séquence 1',
                previousScore: 14,
                newScore: 15.5,
                previousStatus: 'present',
                newStatus: 'present',
                previousAppreciation: null,
                newAppreciation: 'Bien',
                changedBy: USER_ID,
                changedByName: 'Martin Fotsing',
                reason: 'Recomptage copie',
                clientTimestamp: '2026-11-22T09:00:00.000Z',
                serverTimestamp: '2026-11-22T09:01:00.000Z',
                operationId: null,
              },
            ],
          }),
          { status: 200 },
        ),
      );

    const completeness = await getPeriodCompleteness(PERIOD_ID);
    expect(completeness.classes[0]?.subjects[0]?.missingCount).toBe(2);

    const schoolStats = await getSchoolStats(YEAR_ID, PERIOD_ID);
    expect(schoolStats.overallAverage).toBe(13.45);

    const logs = await listGradeAuditLogs({ classId: CLASS_ID });
    expect(logs[0]?.reason).toBe('Recomptage copie');
  });
});
