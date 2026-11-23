import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '@/lib/i18n';
import { queryClient } from '@/lib/query-client';
import { createAppRouter } from '@/router';
import { useSessionStore } from '@/stores/session.store';

const YEAR_ID = 'aaaa1111-1111-4111-8111-111111111111';
const SEQ1_ID = 'bbbb1111-1111-4111-8111-111111111111';
const CLASS1_ID = 'cccc1111-1111-4111-8111-111111111111';
const CS1_ID = 'dddd1111-1111-4111-8111-111111111111';
const SUBJ1_ID = 'eeee1111-1111-4111-8111-111111111111';

function setAuth(role: 'admin' | 'censor' | 'principal' | 'secretary' | 'teacher') {
  useSessionStore.setState({
    status: 'authenticated',
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      username: role,
      fullName: `Compte ${role}`,
      role,
      isActive: true,
    },
    accessToken: 'test-token',
    hasPin: true,
    needsPinSetup: false,
    pinAttempts: 0,
    isOnline: true,
  });
}

function renderReportsAt(path = '/reports') {
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

describe('/reports RBAC & Validation Lock/Unlock lifecycle', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    cleanup();
    queryClient.clear();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('redirects teacher to /forbidden and restricts secretary to Résultats & Bulletins PDF', async () => {
    setAuth('teacher');
    const teacherView = renderReportsAt('/reports');
    expect(await screen.findByText(t('errors.forbiddenTitle'))).toBeInTheDocument();
    teacherView.unmount();

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/academic-years') && !url.includes('/periods')) {
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
              mainTeacherId: null,
              mainTeacherName: null,
              syncVersion: 3,
              updatedAt: '2026-09-01T00:00:00.000Z',
            },
          ],
        });
      }
      if (url.includes('/api/reports/class-results')) {
        return jsonRes({
          academicYearId: YEAR_ID,
          academicYearLabel: '2026-2027',
          isOfficial: false,
          fromSnapshot: false,
          period: {
            id: SEQ1_ID,
            code: 'S1',
            name: 'Séquence 1',
            type: 'sequence',
            status: 'open',
            isOfficial: false,
            lockedAt: null,
          },
          classInfo: {
            id: CLASS1_ID,
            name: '3ème A',
            level: '3ème',
            series: null,
            mainTeacherId: null,
            mainTeacherName: null,
          },
          statistics: {
            classSize: 0,
            evaluatedCount: 0,
            passCount: 0,
            passRate: null,
            classAverage: null,
            minClassAverage: null,
            maxClassAverage: null,
            honorRollCount: 0,
            honorRollThreshold: 12,
            passingThreshold: 10,
          },
          students: [],
        });
      }
      if (url.includes('/api/reports/honor-roll')) {
        return jsonRes({
          academicYearId: YEAR_ID,
          academicYearLabel: '2026-2027',
          isOfficial: false,
          period: {
            id: SEQ1_ID,
            code: 'S1',
            name: 'Séquence 1',
            type: 'sequence',
            status: 'open',
            isOfficial: false,
          },
          classInfo: {
            id: CLASS1_ID,
            name: '3ème A',
            level: '3ème',
            series: null,
          },
          honorRollThreshold: 12,
          entries: [],
        });
      }
      return jsonRes({});
    });

    setAuth('secretary');
    renderReportsAt('/reports');

    expect(
      await screen.findByRole('heading', { name: t('reports.pageTitleSecretary') }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: t('reports.results.pdfClassBulletins') }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: t('reports.tabs.validation') })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: t('reports.tabs.council') })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: t('reports.tabs.stats') })).not.toBeInTheDocument();
  });

  it('allows censor to lock S1 (hiding unlock) and allows principal to unlock with mandatory reason', async () => {
    const user = userEvent.setup();
    let seqLocked = false;
    const lockReasons: string[] = [];
    const unlockReasons: string[] = [];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.includes('/api/academic-years') && !url.includes('/periods')) {
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
      if (url.includes('/periods') && !url.includes('/completeness') && !url.includes('/lock') && !url.includes('/unlock')) {
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
              status: seqLocked ? 'locked' : 'open',
              lockedAt: seqLocked ? '2026-11-22T10:00:00.000Z' : null,
              lockedBy: null,
              syncVersion: 2,
              updatedAt: '2026-11-22T10:00:00.000Z',
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
              mainTeacherId: null,
              mainTeacherName: null,
              syncVersion: 3,
              updatedAt: '2026-09-01T00:00:00.000Z',
            },
          ],
        });
      }
      if (url.includes(`/api/periods/${SEQ1_ID}/completeness`)) {
        return jsonRes({
          periodId: SEQ1_ID,
          periodCode: 'S1',
          periodName: 'Séquence 1',
          periodType: 'sequence',
          status: seqLocked ? 'locked' : 'open',
          isComplete: false,
          classes: [
            {
              classId: CLASS1_ID,
              className: '3ème A',
              level: '3ème',
              expectedStudents: 10,
              isComplete: false,
              subjects: [
                {
                  classSubjectId: CS1_ID,
                  subjectId: SUBJ1_ID,
                  subjectCode: 'MATH',
                  subjectName: 'Mathématiques',
                  subjectShortName: 'MATHS',
                  expectedStudents: 10,
                  gradedCount: 8,
                  missingCount: 2,
                  isComplete: false,
                },
              ],
            },
          ],
        });
      }
      if (url.endsWith(`/api/periods/${SEQ1_ID}/lock`) && method === 'POST') {
        const body = JSON.parse(String(init?.body)) as { reason?: string };
        lockReasons.push(body.reason ?? '');
        seqLocked = true;
        return jsonRes({
          period: {
            id: SEQ1_ID,
            academicYearId: YEAR_ID,
            parentPeriodId: null,
            type: 'sequence',
            code: 'S1',
            name: 'Séquence 1',
            orderIndex: 1,
            weight: 1,
            status: 'locked',
            lockedAt: '2026-11-22T10:00:00.000Z',
            lockedBy: '11111111-1111-4111-8111-111111111111',
            syncVersion: 4,
            updatedAt: '2026-11-22T10:00:00.000Z',
          },
          snapshots: { studentResultsCount: 10, subjectResultsCount: 10 },
        });
      }
      if (url.endsWith(`/api/periods/${SEQ1_ID}/unlock`) && method === 'POST') {
        const body = JSON.parse(String(init?.body)) as { reason: string };
        unlockReasons.push(body.reason);
        seqLocked = false;
        return jsonRes({
          period: {
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
            syncVersion: 5,
            updatedAt: '2026-11-22T10:05:00.000Z',
          },
        });
      }
      return jsonRes({});
    });

    // 1. Censeur verrouille S1 -> pas de bouton Déverrouillage exceptionnel après verrouillage
    setAuth('censor');
    const first = renderReportsAt('/reports?tab=validation');

    expect(await screen.findByText('8 / 10')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: t('reports.validation.lockBtn') }));
    expect(await screen.findByText(/2 note\(s\) restent manquantes/)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Motif de clôture/), 'Clôture trimestre E2E');
    await user.click(screen.getByRole('button', { name: t('reports.validation.lockConfirmAction') }));

    await waitFor(() => {
      expect(lockReasons).toEqual(['Clôture trimestre E2E']);
    });
    expect(
      screen.queryByRole('button', { name: t('reports.validation.unlockBtn') }),
    ).not.toBeInTheDocument();

    first.unmount();

    // 2. Proviseur voit Déverrouillage exceptionnel et doit fournir ≥ 5 caractères
    setAuth('principal');
    renderReportsAt('/reports?tab=validation');
    const unlockBtn = await screen.findByRole('button', { name: t('reports.validation.unlockBtn') });
    await user.click(unlockBtn);

    await user.type(screen.getByLabelText(t('reports.validation.unlockReasonLabel')), 'abc');
    await user.click(screen.getByRole('button', { name: t('reports.validation.unlockConfirmAction') }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/5 caractères/);

    const reasonInput = screen.getByLabelText(t('reports.validation.unlockReasonLabel'));
    await user.clear(reasonInput);
    await user.type(reasonInput, 'Correction erreur report note');
    await user.click(screen.getByRole('button', { name: t('reports.validation.unlockConfirmAction') }));

    await waitFor(() => {
      expect(unlockReasons).toEqual(['Correction erreur report note']);
      expect(screen.getByRole('button', { name: t('reports.validation.lockBtn') })).toBeInTheDocument();
    });
  });
});
