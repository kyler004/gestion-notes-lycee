import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetchFile, registerApiAuthBridge } from '../client';
import { ApiError } from '../errors';
import {
  downloadAnnualClassBulletinsPdf,
  downloadAnnualHonorRollPdf,
  downloadAnnualStudentBulletinPdf,
  downloadClassBulletinsPdf,
  getAnnualClassResults,
  getAnnualHonorRoll,
  getAnnualSchoolStats,
  getPeriodCompleteness,
  getSchoolStats,
  listCouncilDecisionAuditLogs,
  listGradeAuditLogs,
  listPeriodAuditLogs,
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
const TRIM_ID = '55556666-1111-4111-8111-111111111111';
const DECISION_ID = '66667777-1111-4111-8111-111111111111';

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
                previousScore: 15.5,
                newScore: 16.5,
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

  it('validates annual reports, annual PDF downloads, and period/council audit endpoints', async () => {
    registerApiAuthBridge({
      getAccessToken: () => 'tok',
      refreshAccessToken: async () => null,
    });

    const pdfResp = (filename: string) =>
      new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${filename}"`,
        },
      });

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            academicYearId: YEAR_ID,
            academicYearLabel: '2026-2027',
            period: {
              id: YEAR_ID,
              code: 'ANNUEL',
              name: 'Bilan Annuel',
              type: 'annual',
              status: 'locked',
              isOfficial: true,
            },
            totalStudents: 25,
            evaluatedStudents: 25,
            overallAverage: 14.1,
            overallPassRate: 92,
            classes: [],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            academicYearId: YEAR_ID,
            academicYearLabel: '2026-2027',
            isOfficial: true,
            fromSnapshot: false,
            period: {
              id: YEAR_ID,
              code: 'ANNUEL',
              name: 'Bilan Annuel',
              type: 'annual',
              status: 'locked',
              isOfficial: true,
              lockedAt: '2027-06-25T10:00:00.000Z',
            },
            classInfo: {
              id: CLASS_ID,
              name: '3ème A',
              level: '3ème',
              series: null,
              mainTeacherId: USER_ID,
              mainTeacherName: 'Prof Maths',
            },
            statistics: {
              classSize: 1,
              evaluatedCount: 1,
              passCount: 1,
              passRate: 100,
              classAverage: 15.2,
              minClassAverage: 15.2,
              maxClassAverage: 15.2,
              honorRollCount: 1,
              honorRollThreshold: 12,
              passingThreshold: 10,
            },
            students: [
              {
                enrollmentId: ENROLL_ID,
                studentId: STUDENT_ID,
                matricule: '26LBA001',
                lastName: 'BELLO',
                firstName: 'Aminatou',
                birthDate: '2011-04-12',
                birthPlace: 'Yaoundé',
                sex: 'F',
                isRepeater: false,
                trimesterSummaries: [
                  {
                    periodId: TRIM_ID,
                    code: 'T1',
                    name: 'Trimestre 1',
                    orderIndex: 1,
                    generalAverage: 15.2,
                    rank: 1,
                  },
                ],
                subjects: [
                  {
                    classSubjectId: CS_ID,
                    subjectCode: 'MATH',
                    subjectName: 'Mathématiques',
                    subjectShortName: 'MATHS',
                    subjectGroupName: 'Sciences',
                    subjectGroupOrder: 1,
                    coefficient: 4,
                    teacherName: 'Prof Maths',
                    sequenceScores: [],
                    trimesterScores: [
                      {
                        periodId: TRIM_ID,
                        code: 'T1',
                        name: 'Trimestre 1',
                        orderIndex: 1,
                        weight: 1,
                        average: 15.2,
                      },
                    ],
                    average: 15.2,
                    weightedScore: 60.8,
                    rank: 1,
                    classAverage: 15.2,
                    minScore: 15.2,
                    maxScore: 15.2,
                    appreciation: 'Bien',
                  },
                ],
                totalCoefficient: 4,
                totalPoints: 60.8,
                generalAverage: 15.2,
                rank: 1,
                classSize: 1,
                classAverage: 15.2,
                minClassAverage: 15.2,
                maxClassAverage: 15.2,
                passRate: 100,
                isHonorRoll: true,
                autoAppreciation: 'Bien',
                councilDecision: 'pass',
                councilAppreciation: 'Admise en classe supérieure',
                absencesHours: 3,
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
            isOfficial: true,
            period: {
              id: YEAR_ID,
              code: 'ANNUEL',
              name: 'Bilan Annuel',
              type: 'annual',
              status: 'locked',
              isOfficial: true,
            },
            classInfo: {
              id: CLASS_ID,
              name: '3ème A',
              level: '3ème',
              series: null,
            },
            honorRollThreshold: 12,
            entries: [],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(pdfResp('bulletin-annuel-26LBA001-2026-2027.pdf'))
      .mockResolvedValueOnce(pdfResp('bulletins-annuels-3eme-A-2026-2027.pdf'))
      .mockResolvedValueOnce(pdfResp('tableau-honneur-annuel-3eme-A-2026-2027.pdf'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            logs: [
              {
                id: LOG_ID,
                academicYearId: YEAR_ID,
                academicYearLabel: '2026-2027',
                periodId: PERIOD_ID,
                periodCode: 'S1',
                periodName: 'Séquence 1',
                periodType: 'sequence',
                action: 'locked',
                actorId: USER_ID,
                actorName: 'Proviseur Principal',
                actorUsername: 'principal',
                reason: 'Clôture conseil',
                createdAt: '2026-11-24T10:00:00.000Z',
              },
            ],
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
                councilDecisionId: DECISION_ID,
                academicYearId: YEAR_ID,
                classId: CLASS_ID,
                className: '3ème A',
                enrollmentId: ENROLL_ID,
                studentId: STUDENT_ID,
                studentMatricule: '26LBA001',
                studentLastName: 'BELLO',
                studentFirstName: 'Aminatou',
                periodId: PERIOD_ID,
                periodCode: 'S1',
                periodName: 'Séquence 1',
                periodType: 'sequence',
                previousDecision: 'none',
                newDecision: 'congratulations',
                previousAppreciation: '',
                newAppreciation: 'Félicitations du conseil',
                previousAbsencesHours: 0,
                newAbsencesHours: 1,
                changedBy: USER_ID,
                changedByName: 'Censeur Lycée',
                reason: 'Conseil T1',
                serverTimestamp: '2026-11-24T11:00:00.000Z',
              },
            ],
          }),
          { status: 200 },
        ),
      );

    const annualStats = await getAnnualSchoolStats(YEAR_ID);
    expect(annualStats.period.type).toBe('annual');
    expect(annualStats.period.isOfficial).toBe(true);

    const annualResults = await getAnnualClassResults(CLASS_ID);
    expect(annualResults.students[0]?.trimesterSummaries?.[0]?.code).toBe('T1');
    expect(annualResults.students[0]?.subjects[0]?.trimesterScores?.[0]?.average).toBe(15.2);

    const annualHonor = await getAnnualHonorRoll(CLASS_ID);
    expect(annualHonor.period.code).toBe('ANNUEL');

    const studentPdf = await downloadAnnualStudentBulletinPdf(ENROLL_ID);
    expect(studentPdf.filename).toBe('bulletin-annuel-26LBA001-2026-2027.pdf');

    const classPdf = await downloadAnnualClassBulletinsPdf(CLASS_ID);
    expect(classPdf.filename).toBe('bulletins-annuels-3eme-A-2026-2027.pdf');

    const honorPdf = await downloadAnnualHonorRollPdf(CLASS_ID);
    expect(honorPdf.filename).toBe('tableau-honneur-annuel-3eme-A-2026-2027.pdf');

    const periodLogs = await listPeriodAuditLogs({ academicYearId: YEAR_ID, action: 'locked' });
    expect(periodLogs[0]?.action).toBe('locked');

    const councilLogs = await listCouncilDecisionAuditLogs({ classId: CLASS_ID });
    expect(councilLogs[0]?.newDecision).toBe('congratulations');
  });
});
