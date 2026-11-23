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
});
