import { CAMEROON_DEFAULT_GRADING_RULES } from '@lycee/shared';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '@/lib/i18n';
import { queryClient } from '@/lib/query-client';
import { createAppRouter } from '@/router';
import { useSessionStore } from '@/stores/session.store';

const YEAR_ID = 'aaaa1111-1111-4111-8111-111111111111';
const SEQ1_ID = 'bbbb1111-1111-4111-8111-111111111111';
const CLASS1_ID = 'cccc1111-1111-4111-8111-111111111111';
const CS1_ID = 'dddd1111-1111-4111-8111-111111111111';
const ENROLL1_ID = 'eeee1111-1111-4111-8111-111111111111';
const ENROLL2_ID = 'eeee2222-2222-4222-8222-222222222222';
const STUDENT1_ID = 'ffff1111-1111-4111-8111-111111111111';
const STUDENT2_ID = 'ffff2222-2222-4222-8222-222222222222';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const GRADE_ID = '22222222-2222-4222-8222-222222222222';
const LOG_ID = '33333333-3333-4333-8333-333333333333';

function renderReports(path: string) {
  useSessionStore.setState({
    status: 'authenticated',
    user: {
      id: USER_ID,
      username: 'admin',
      fullName: 'Administrateur Principal',
      role: 'admin',
      isActive: true,
    },
    accessToken: 'admin-tok',
    hasPin: true,
    needsPinSetup: false,
    pinAttempts: 0,
    isOnline: true,
  });

  const router = createAppRouter();
  router.update({
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return render(<RouterProvider router={router} />);
}

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('/reports Stats, Council Decisions, Results, Audit & PDF downloads', () => {
  const originalFetch = globalThis.fetch;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:mock-pdf');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
    vi.restoreAllMocks();
  });

  it('displays school stats, navigates to class results, saves council decisions, exports PDFs, and renders audit logs', async () => {
    const user = userEvent.setup();
    const savedBulkDecisions: Array<Array<{ enrollmentId: string; decision: string }>> = [];
    let failPdfBusyOnce = true;

    const classResultsPayload = {
      academicYearId: YEAR_ID,
      academicYearLabel: '2026-2027',
      isOfficial: true,
      fromSnapshot: true,
      period: {
        id: SEQ1_ID,
        code: 'S1',
        name: 'Séquence 1',
        type: 'sequence',
        status: 'locked',
        isOfficial: true,
        lockedAt: '2026-11-22T09:00:00.000Z',
      },
      classInfo: {
        id: CLASS1_ID,
        name: '3ème A',
        level: '3ème',
        series: null,
        mainTeacherId: USER_ID,
        mainTeacherName: 'Prof Maths',
      },
      statistics: {
        classSize: 2,
        evaluatedCount: 2,
        passCount: 2,
        passRate: 100,
        classAverage: 13.75,
        minClassAverage: 11,
        maxClassAverage: 16.5,
        honorRollCount: 1,
        honorRollThreshold: 12,
        passingThreshold: 10,
      },
      students: [
        {
          enrollmentId: ENROLL2_ID,
          studentId: STUDENT2_ID,
          matricule: '26LBA002',
          lastName: 'ABDOU',
          firstName: 'Jean',
          birthDate: '2011-01-05',
          birthPlace: 'Douala',
          sex: 'M',
          isRepeater: false,
          subjects: [],
          totalCoefficient: 4,
          totalPoints: 44,
          generalAverage: 11,
          rank: 2,
          classSize: 2,
          classAverage: 13.75,
          minClassAverage: 11,
          maxClassAverage: 16.5,
          passRate: 100,
          isHonorRoll: false,
          autoAppreciation: 'Passable',
          councilDecision: 'none',
          councilAppreciation: '',
          absencesHours: 2,
        },
        {
          enrollmentId: ENROLL1_ID,
          studentId: STUDENT1_ID,
          matricule: '26LBA001',
          lastName: 'BELLO',
          firstName: 'Aminatou',
          birthDate: '2011-04-12',
          birthPlace: 'Yaoundé',
          sex: 'F',
          isRepeater: false,
          subjects: [
            {
              classSubjectId: CS1_ID,
              subjectCode: 'MATH',
              subjectName: 'Mathématiques',
              subjectShortName: 'MATHS',
              subjectGroupName: 'Sciences',
              subjectGroupOrder: 1,
              coefficient: 4,
              teacherName: 'Prof Maths',
              sequenceScores: [
                {
                  periodId: SEQ1_ID,
                  code: 'S1',
                  name: 'Séquence 1',
                  orderIndex: 1,
                  weight: 1,
                  score: 16.5,
                  status: 'present',
                },
              ],
              average: 16.5,
              weightedScore: 66,
              rank: 1,
              classAverage: 13.75,
              minScore: 11,
              maxScore: 16.5,
              appreciation: 'Très bien',
            },
          ],
          totalCoefficient: 4,
          totalPoints: 66,
          generalAverage: 16.5,
          rank: 1,
          classSize: 2,
          classAverage: 13.75,
          minClassAverage: 11,
          maxClassAverage: 16.5,
          passRate: 100,
          isHonorRoll: true,
          autoAppreciation: 'Très bien',
          councilDecision: 'none',
          councilAppreciation: '',
          absencesHours: 0,
        },
      ],
    };

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.includes('/api/academic-years') && !url.includes('/periods') && !url.includes('/grading-rules')) {
        return jsonRes({
          academicYears: [
            {
              id: YEAR_ID,
              label: '2026-2027',
              startDate: '2026-09-01',
              endDate: '2027-06-30',
              isActive: true,
              syncVersion: 1,
              createdAt: '2026-09-01T00:00:00.000Z',
              updatedAt: '2026-09-01T00:00:00.000Z',
            },
          ],
        });
      }
      if (url.includes('/periods')) {
        return jsonRes({
          periods: [
            {
              id: SEQ1_ID,
              academicYearId: YEAR_ID,
              parentPeriodId: null,
              type: 'sequence',
              code: 'S1',
              name: 'Séquence 1',
              orderIndex: 1,
              weight: 1,
              status: 'open',
              lockedAt: null,
              lockedBy: null,
              syncVersion: 2,
              updatedAt: '2026-09-01T00:00:00.000Z',
            },
          ],
        });
      }
      if (url.includes('/api/classes')) {
        return jsonRes({
          classes: [
            {
              id: CLASS1_ID,
              academicYearId: YEAR_ID,
              name: '3ème A',
              level: '3ème',
              series: null,
              mainTeacherId: USER_ID,
              mainTeacherName: 'Prof Maths',
              syncVersion: 3,
              updatedAt: '2026-09-01T00:00:00.000Z',
            },
          ],
        });
      }
      if (url.includes('/grading-rules')) {
        return jsonRes({
          id: '77777777-7777-4777-8777-777777777777',
          academicYearId: YEAR_ID,
          ...CAMEROON_DEFAULT_GRADING_RULES,
          syncVersion: 4,
          updatedAt: '2026-09-01T00:00:00.000Z',
        });
      }
      if (url.includes('/api/reports/school-stats')) {
        return jsonRes({
          academicYearId: YEAR_ID,
          academicYearLabel: '2026-2027',
          period: {
            id: SEQ1_ID,
            code: 'S1',
            name: 'Séquence 1',
            type: 'sequence',
            status: 'open',
            isOfficial: false,
          },
          totalStudents: 2,
          evaluatedStudents: 2,
          overallAverage: 13.75,
          overallPassRate: 100,
          classes: [
            {
              classId: CLASS1_ID,
              className: '3ème A',
              level: '3ème',
              series: null,
              totalStudents: 2,
              evaluatedStudents: 2,
              passCount: 2,
              average: 13.75,
              passRate: 100,
              minAverage: 11,
              maxAverage: 16.5,
            },
          ],
        });
      }
      if (url.includes('/api/reports/class-results')) {
        return jsonRes(classResultsPayload);
      }
      if (url.includes('/api/reports/honor-roll')) {
        return jsonRes({
          academicYearId: YEAR_ID,
          academicYearLabel: '2026-2027',
          isOfficial: true,
          period: {
            id: SEQ1_ID,
            code: 'S1',
            name: 'Séquence 1',
            type: 'sequence',
            status: 'locked',
            isOfficial: true,
          },
          classInfo: { id: CLASS1_ID, name: '3ème A', level: '3ème', series: null },
          honorRollThreshold: 12,
          entries: [
            {
              enrollmentId: ENROLL1_ID,
              studentId: STUDENT1_ID,
              rank: 1,
              matricule: '26LBA001',
              lastName: 'BELLO',
              firstName: 'Aminatou',
              fullName: 'BELLO Aminatou',
              generalAverage: 16.5,
              appreciation: 'Très bien',
              autoAppreciation: 'Très bien',
              councilDecision: 'congratulations',
            },
          ],
        });
      }
      if (url.includes('/api/council-decisions') && method === 'GET') {
        return jsonRes({ decisions: [] });
      }
      if (url.endsWith('/api/council-decisions/bulk') && method === 'PUT') {
        const body = JSON.parse(String(init?.body)) as {
          decisions: Array<{ enrollmentId: string; decision: string }>;
        };
        savedBulkDecisions.push(body.decisions);
        return jsonRes({ decisions: [], count: body.decisions.length });
      }
      if (url.includes('/api/grades/audit')) {
        return jsonRes({
          logs: [
            {
              id: LOG_ID,
              gradeId: GRADE_ID,
              enrollmentId: ENROLL1_ID,
              classId: CLASS1_ID,
              studentId: STUDENT1_ID,
              studentMatricule: '26LBA001',
              studentLastName: 'BELLO',
              studentFirstName: 'Aminatou',
              classSubjectId: CS1_ID,
              subjectCode: 'MATH',
              subjectName: 'Mathématiques',
              periodId: SEQ1_ID,
              periodCode: 'S1',
              periodName: 'Séquence 1',
              previousScore: 15.5,
              newScore: 16.5,
              previousStatus: 'present',
              newStatus: 'present',
              previousAppreciation: null,
              newAppreciation: 'Très bien',
              changedBy: USER_ID,
              changedByName: 'Prof Maths',
              reason: 'Recomptage copie',
              clientTimestamp: null,
              serverTimestamp: '2026-11-22T09:30:00.000Z',
              operationId: null,
            },
          ],
        });
      }
      if (url.includes('/pdf')) {
        if (failPdfBusyOnce) {
          failPdfBusyOnce = false;
          return jsonRes(
            { error: { code: 'PDF_SERVICE_BUSY', message: 'Busy' } },
            503,
          );
        }
        return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'inline; filename="bulletins-3eme-A-S1.pdf"',
          },
        });
      }
      return jsonRes({});
    });

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    renderReports('/reports');

    // 1. Synthèse établissement
    expect(await screen.findByText('13,75 / 20')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: t('reports.stats.viewClassBtn') }));

    // 2. Onglet Résultats & PDF -> tri par rang par défaut (#1 BELLO avant #2 ABDOU) + bascule A-Z
    expect(await screen.findByText('BELLO Aminatou')).toBeInTheDocument();
    const rankingRowsDefault = screen.getAllByRole('row');
    expect(rankingRowsDefault[1]).toHaveTextContent('BELLO Aminatou');
    expect(rankingRowsDefault[2]).toHaveTextContent('ABDOU Jean');

    await user.click(screen.getByRole('button', { name: t('reports.results.sortByName') }));
    const rankingRowsAlpha = screen.getAllByRole('row');
    expect(rankingRowsAlpha[1]).toHaveTextContent('ABDOU Jean');
    expect(rankingRowsAlpha[2]).toHaveTextContent('BELLO Aminatou');

    await user.click(screen.getByRole('button', { name: t('reports.results.sortByRank') }));
    const rankingRowsBack = screen.getAllByRole('row');
    expect(rankingRowsBack[1]).toHaveTextContent('BELLO Aminatou');

    await user.click(screen.getAllByRole('button', { name: 'Détail notes' })[0]!);
    expect(await screen.findByText(/Détail du bulletin — BELLO Aminatou/)).toBeInTheDocument();
    const closeBtns = screen.getAllByRole('button', { name: t('admin.common.close') });
    await user.click(closeBtns[closeBtns.length - 1]!);

    await user.click(screen.getByRole('button', { name: /Tableau d’honneur \(1\)/ }));
    expect(await screen.findByText('#1')).toBeInTheDocument();

    // 1er clic PDF -> 503 PDF_SERVICE_BUSY toast, 2ème clic -> succès téléchargement
    const classPdfBtn = screen.getByRole('button', { name: t('reports.results.pdfClassBulletins') });
    await user.click(classPdfBtn);
    await waitFor(() => {
      expect(clickSpy).toHaveBeenCalledTimes(0);
    });
    await user.click(classPdfBtn);
    await waitFor(() => {
      expect(clickSpy).toHaveBeenCalledTimes(1);
    });

    // 3. Onglet Conseil de classe -> Pré-remplir + Enregistrer
    await user.click(screen.getByRole('tab', { name: t('reports.tabs.council') }));
    await user.click(await screen.findByRole('button', { name: t('reports.council.autoSuggestBtn') }));
    await user.click(screen.getByRole('button', { name: t('reports.council.saveAllBtn') }));

    await waitFor(() => {
      expect(savedBulkDecisions).toHaveLength(1);
      expect(savedBulkDecisions[0]).toHaveLength(2);
      expect(savedBulkDecisions[0]).toEqual(
        expect.arrayContaining([
          { enrollmentId: ENROLL1_ID, decision: 'congratulations', periodId: SEQ1_ID, absencesHours: 0, generalAppreciation: '' },
          { enrollmentId: ENROLL2_ID, decision: 'pass', periodId: SEQ1_ID, absencesHours: 2, generalAppreciation: '' },
        ]),
      );
    });

    // 4. Onglet Audit des notes
    await user.click(screen.getByRole('tab', { name: t('reports.tabs.audit') }));
    expect(await screen.findByText('15,50 → 16,50')).toBeInTheDocument();
    expect(screen.getByText('Recomptage copie')).toBeInTheDocument();
  });

  it('supports Bilan annuel on stats & results tabs, annual PDFs, and period/council audit sub-views', async () => {
    const user = userEvent.setup();
    const TRIM1_ID = 'bbbb2222-2222-4222-8222-222222222222';
    const TRIM2_ID = 'bbbb3333-3333-4333-8333-333333333333';
    const DECISION_ID = '44444444-4444-4444-8444-444444444444';
    const requestedUrls: string[] = [];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);

      if (url.includes('/api/academic-years') && !url.includes('/periods') && !url.includes('/grading-rules')) {
        return jsonRes({
          academicYears: [
            {
              id: YEAR_ID,
              label: '2026-2027',
              startDate: '2026-09-01',
              endDate: '2027-06-30',
              isActive: true,
              syncVersion: 1,
              createdAt: '2026-09-01T00:00:00.000Z',
              updatedAt: '2026-09-01T00:00:00.000Z',
            },
          ],
        });
      }
      if (url.includes('/periods/audit')) {
        return jsonRes({
          logs: [
            {
              id: LOG_ID,
              academicYearId: YEAR_ID,
              academicYearLabel: '2026-2027',
              periodId: TRIM1_ID,
              periodCode: 'T1',
              periodName: 'Trimestre 1',
              periodType: 'trimester',
              action: 'locked',
              actorId: USER_ID,
              actorName: 'Proviseur Principal',
              actorUsername: 'principal',
              reason: 'Clôture officielle T1',
              createdAt: '2026-12-15T10:00:00.000Z',
            },
          ],
        });
      }
      if (url.includes('/completeness')) {
        return jsonRes({
          periodId: SEQ1_ID,
          periodCode: 'S1',
          periodName: 'Séquence 1',
          periodType: 'sequence',
          status: 'locked',
          isComplete: true,
          classes: [],
        });
      }
      if (url.includes('/periods')) {
        return jsonRes({
          periods: [
            {
              id: SEQ1_ID,
              academicYearId: YEAR_ID,
              parentPeriodId: TRIM1_ID,
              type: 'sequence',
              code: 'S1',
              name: 'Séquence 1',
              orderIndex: 1,
              weight: 1,
              status: 'locked',
              lockedAt: '2026-10-30T10:00:00.000Z',
              lockedBy: USER_ID,
              syncVersion: 2,
              updatedAt: '2026-10-30T10:00:00.000Z',
            },
            {
              id: TRIM1_ID,
              academicYearId: YEAR_ID,
              parentPeriodId: null,
              type: 'trimester',
              code: 'T1',
              name: 'Trimestre 1',
              orderIndex: 1,
              weight: 1,
              status: 'locked',
              lockedAt: '2026-12-15T10:00:00.000Z',
              lockedBy: USER_ID,
              syncVersion: 3,
              updatedAt: '2026-12-15T10:00:00.000Z',
            },
            {
              id: TRIM2_ID,
              academicYearId: YEAR_ID,
              parentPeriodId: null,
              type: 'trimester',
              code: 'T2',
              name: 'Trimestre 2',
              orderIndex: 2,
              weight: 1,
              status: 'locked',
              lockedAt: '2027-03-20T10:00:00.000Z',
              lockedBy: USER_ID,
              syncVersion: 4,
              updatedAt: '2027-03-20T10:00:00.000Z',
            },
          ],
        });
      }
      if (url.includes('/api/classes')) {
        return jsonRes({
          classes: [
            {
              id: CLASS1_ID,
              academicYearId: YEAR_ID,
              name: '3ème A',
              level: '3ème',
              series: null,
              mainTeacherId: USER_ID,
              mainTeacherName: 'Prof Maths',
              syncVersion: 3,
              updatedAt: '2026-09-01T00:00:00.000Z',
            },
          ],
        });
      }
      if (url.includes('/api/reports/school-stats')) {
        return jsonRes({
          academicYearId: YEAR_ID,
          academicYearLabel: '2026-2027',
          period: {
            id: SEQ1_ID,
            code: 'S1',
            name: 'Séquence 1',
            type: 'sequence',
            status: 'locked',
            isOfficial: true,
          },
          totalStudents: 1,
          evaluatedStudents: 1,
          overallAverage: 14.0,
          overallPassRate: 100,
          classes: [],
        });
      }
      if (url.includes('/api/reports/annual/school-stats')) {
        return jsonRes({
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
          totalStudents: 1,
          evaluatedStudents: 1,
          overallAverage: 15.75,
          overallPassRate: 100,
          classes: [
            {
              classId: CLASS1_ID,
              className: '3ème A',
              level: '3ème',
              series: null,
              totalStudents: 1,
              evaluatedStudents: 1,
              passCount: 1,
              average: 15.75,
              passRate: 100,
              minAverage: 15.75,
              maxAverage: 15.75,
            },
          ],
        });
      }
      if (url.includes('/api/reports/annual/class-results')) {
        return jsonRes({
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
            lockedAt: '2027-03-20T10:00:00.000Z',
          },
          classInfo: {
            id: CLASS1_ID,
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
            classAverage: 15.75,
            minClassAverage: 15.75,
            maxClassAverage: 15.75,
            honorRollCount: 1,
            honorRollThreshold: 12,
            passingThreshold: 10,
          },
          students: [
            {
              enrollmentId: ENROLL1_ID,
              studentId: STUDENT1_ID,
              matricule: '26LBA001',
              lastName: 'BELLO',
              firstName: 'Aminatou',
              birthDate: '2011-04-12',
              birthPlace: 'Yaoundé',
              sex: 'F',
              isRepeater: false,
              trimesterSummaries: [
                {
                  periodId: TRIM1_ID,
                  code: 'T1',
                  name: 'Trimestre 1',
                  orderIndex: 1,
                  generalAverage: 15.0,
                  rank: 1,
                },
                {
                  periodId: TRIM2_ID,
                  code: 'T2',
                  name: 'Trimestre 2',
                  orderIndex: 2,
                  generalAverage: 16.5,
                  rank: 1,
                },
              ],
              subjects: [
                {
                  classSubjectId: CS1_ID,
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
                      periodId: TRIM1_ID,
                      code: 'T1',
                      name: 'Trimestre 1',
                      orderIndex: 1,
                      weight: 1,
                      average: 15.0,
                    },
                    {
                      periodId: TRIM2_ID,
                      code: 'T2',
                      name: 'Trimestre 2',
                      orderIndex: 2,
                      weight: 1,
                      average: 16.5,
                    },
                  ],
                  average: 15.75,
                  weightedScore: 63,
                  rank: 1,
                  classAverage: 15.75,
                  minScore: 15.75,
                  maxScore: 15.75,
                  appreciation: 'Bien',
                },
              ],
              totalCoefficient: 4,
              totalPoints: 63,
              generalAverage: 15.75,
              rank: 1,
              classSize: 1,
              classAverage: 15.75,
              minClassAverage: 15.75,
              maxClassAverage: 15.75,
              passRate: 100,
              isHonorRoll: true,
              autoAppreciation: 'Bien',
              councilDecision: 'pass',
              councilAppreciation: 'Admise en classe supérieure',
              absencesHours: 4,
            },
          ],
        });
      }
      if (url.includes('/api/reports/annual/honor-roll')) {
        return jsonRes({
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
          classInfo: { id: CLASS1_ID, name: '3ème A', level: '3ème', series: null },
          honorRollThreshold: 12,
          entries: [],
        });
      }
      if (url.includes('/api/reports/annual/') && url.includes('/pdf')) {
        return new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'inline; filename="annuel.pdf"',
          },
        });
      }
      if (url.includes('/api/council-decisions/audit')) {
        return jsonRes({
          logs: [
            {
              id: LOG_ID,
              councilDecisionId: DECISION_ID,
              academicYearId: YEAR_ID,
              classId: CLASS1_ID,
              className: '3ème A',
              enrollmentId: ENROLL1_ID,
              studentId: STUDENT1_ID,
              studentMatricule: '26LBA001',
              studentLastName: 'BELLO',
              studentFirstName: 'Aminatou',
              periodId: TRIM2_ID,
              periodCode: 'T2',
              periodName: 'Trimestre 2',
              periodType: 'trimester',
              previousDecision: 'none',
              newDecision: 'pass',
              previousAppreciation: '',
              newAppreciation: 'Très sérieux',
              previousAbsencesHours: 2,
              newAbsencesHours: 4,
              changedBy: USER_ID,
              changedByName: 'Censeur Lycée',
              reason: 'Conseil annuel',
              serverTimestamp: '2027-03-20T12:00:00.000Z',
            },
          ],
        });
      }
      if (url.includes('/api/grades/audit')) {
        return jsonRes({ logs: [] });
      }
      return jsonRes({});
    });

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    renderReports('/reports');

    // 1. Sélection de Bilan annuel (T1-T3) dans ReportContextBar
    expect(await screen.findByText('14,00 / 20')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Période évaluée/ }));
    await user.click(screen.getByRole('menuitem', { name: /Bilan annuel \(T1–T3\)/ }));

    expect(await screen.findByText('15,75 / 20')).toBeInTheDocument();

    // 2. Passage à Résultats & Bulletins PDF en mode annuel -> colonnes T1/T2 + modale détail + PDF annuel
    await user.click(screen.getByRole('button', { name: t('reports.stats.viewClassBtn') }));
    expect(await screen.findByText('15,00')).toBeInTheDocument();
    expect(screen.getByText('16,50')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: t('reports.results.detailBtn') }));
    expect(await screen.findByText(t('reports.results.trimesterSummariesTitle'))).toBeInTheDocument();
    expect(screen.getByText('Absences cumulées : 4 h')).toBeInTheDocument();
    const closeBtns = screen.getAllByRole('button', { name: t('admin.common.close') });
    await user.click(closeBtns[closeBtns.length - 1]!);

    await user.click(
      screen.getByRole('button', { name: t('reports.results.pdfAnnualClassBulletins') }),
    );
    await waitFor(() => {
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(
        requestedUrls.some((u) => u.includes(`/api/reports/annual/bulletins/class/${CLASS1_ID}/pdf`)),
      ).toBe(true);
    });

    // 3. Validation -> Historique des verrouillages -> bascule sur audit périodes -> puis audit conseil
    await user.click(screen.getByRole('tab', { name: t('reports.tabs.validation') }));
    await user.click(
      await screen.findByRole('button', { name: t('reports.validation.viewAuditHistoryBtn') }),
    );

    expect(await screen.findByText('Clôture officielle T1')).toBeInTheDocument();
    expect(screen.getByText('@principal')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: t('reports.audit.subtabCouncil') }));
    expect(await screen.findByText('Censeur Lycée')).toBeInTheDocument();
    expect(screen.getByText(/→ Admis\(e\)/)).toBeInTheDocument();
    expect(screen.getByText('2 h → 4 h')).toBeInTheDocument();
  });
});
