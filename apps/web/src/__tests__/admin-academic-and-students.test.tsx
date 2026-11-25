import { CAMEROON_DEFAULT_GRADING_RULES } from '@lycee/shared';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '@/lib/i18n';
import { queryClient } from '@/lib/query-client';
import { createAppRouter } from '@/router';
import { useSessionStore } from '@/stores/session.store';

const YEAR_ID = 'aaaa1111-1111-4111-8111-111111111111';
const TRIM_ID = 'bbbb1111-1111-4111-8111-111111111111';
const SEQ1_ID = 'cccc1111-1111-4111-8111-111111111111';
const CLASS1_ID = 'dddd1111-1111-4111-8111-111111111111';
const CLASS2_ID = 'dddd2222-2222-4222-8222-222222222222';
const STUDENT1_ID = 'eeee1111-1111-4111-8111-111111111111';
const STUDENT2_ID = 'eeee2222-2222-4222-8222-222222222222';
const ENROLL1_ID = 'ffff1111-1111-4111-8111-111111111111';
const ENROLL2_ID = 'ffff2222-2222-4222-8222-222222222222';

function renderAdmin(path: string) {
  useSessionStore.setState({
    status: 'authenticated',
    user: {
      id: '11111111-1111-4111-8111-111111111111',
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

describe('/admin Academic Rules, Period Locks & Student Enrollments', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('disables grading rules editing when a period is locked and saves updates when open', async () => {
    const user = userEvent.setup();
    let seqLocked = true;
    const savePayloads: Array<{ passingThreshold: number }> = [];

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
              id: TRIM_ID,
              academicYearId: YEAR_ID,
              parentPeriodId: null,
              type: 'trimester',
              code: 'T1',
              name: 'Trimestre 1',
              orderIndex: 1,
              weight: 1,
              status: 'open',
              lockedAt: null,
              lockedBy: null,
              syncVersion: 2,
              updatedAt: '2026-09-01T00:00:00.000Z',
            },
            {
              id: SEQ1_ID,
              academicYearId: YEAR_ID,
              parentPeriodId: TRIM_ID,
              type: 'sequence',
              code: 'S1',
              name: 'Séquence 1',
              orderIndex: 1,
              weight: 1,
              status: seqLocked ? 'locked' : 'open',
              lockedAt: seqLocked ? '2026-10-01T00:00:00.000Z' : null,
              lockedBy: null,
              syncVersion: 3,
              updatedAt: '2026-10-01T00:00:00.000Z',
            },
          ],
        });
      }
      if (url.includes('/grading-rules') && method === 'GET') {
        return jsonRes({
          id: '77777777-7777-4777-8777-777777777777',
          academicYearId: YEAR_ID,
          ...CAMEROON_DEFAULT_GRADING_RULES,
          syncVersion: 4,
          updatedAt: '2026-09-01T00:00:00.000Z',
        });
      }
      if (url.includes('/grading-rules') && method === 'PUT') {
        const body = JSON.parse(String(init?.body)) as { passingThreshold: number };
        savePayloads.push(body);
        return jsonRes({
          id: '77777777-7777-4777-8777-777777777777',
          academicYearId: YEAR_ID,
          ...body,
          syncVersion: 5,
          updatedAt: '2026-11-22T00:00:00.000Z',
        });
      }
      return jsonRes({});
    });

    const firstRender = renderAdmin('/admin?tab=academic');
    expect(await screen.findByText(t('admin.academic.rulesLockedBanner'))).toBeInTheDocument();
    expect(screen.getByLabelText(t('admin.academic.passingThresholdLabel'))).toBeDisabled();
    expect(screen.getByRole('button', { name: t('admin.common.save') })).toBeDisabled();

    firstRender.unmount();
    queryClient.clear();

    // Maintenant avec périodes ouvertes
    seqLocked = false;
    renderAdmin('/admin?tab=academic');
    const passingInput = await screen.findByLabelText(t('admin.academic.passingThresholdLabel'));
    await waitFor(() => {
      expect(passingInput).toBeEnabled();
    });

    await user.clear(passingInput);
    await user.type(passingInput, '10.5');
    await user.click(screen.getByRole('button', { name: t('admin.common.save') }));

    await waitFor(() => {
      expect(savePayloads).toHaveLength(1);
      expect(savePayloads[0]?.passingThreshold).toBe(10.5);
    });
  });

  it('creates and enrolls a student in one step and shows 409 error cleanly on blocked transfer', async () => {
    const user = userEvent.setup();
    const roster = [
      {
        enrollmentId: ENROLL1_ID,
        studentId: STUDENT1_ID,
        classId: CLASS1_ID,
        academicYearId: YEAR_ID,
        matricule: '26LYC001',
        lastName: 'BELLO',
        firstName: 'Aminatou',
        birthDate: '2010-04-12',
        birthPlace: 'Yaoundé',
        sex: 'F',
        isRepeater: false,
        status: 'active',
        enrolledAt: '2026-09-01T00:00:00.000Z',
        syncVersion: 10,
      },
    ];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.includes('/api/academic-years')) {
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
      if (url.includes('/api/classes?') || url.endsWith('/api/classes')) {
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
              syncVersion: 2,
              updatedAt: '2026-09-01T00:00:00.000Z',
            },
            {
              id: CLASS2_ID,
              academicYearId: YEAR_ID,
              name: '3ème B',
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
      if (url.includes(`/api/classes/${CLASS1_ID}/students`)) {
        return jsonRes({ classId: CLASS1_ID, students: roster });
      }
      if (url.includes('/api/students') && method === 'GET') {
        return jsonRes({
          students: roster.map((r) => ({
            id: r.studentId,
            matricule: r.matricule,
            lastName: r.lastName,
            firstName: r.firstName,
            birthDate: r.birthDate,
            birthPlace: r.birthPlace,
            sex: r.sex,
            syncVersion: 10,
            createdAt: '2026-09-01T00:00:00.000Z',
            updatedAt: '2026-09-01T00:00:00.000Z',
          })),
        });
      }
      if (url.endsWith('/api/students') && method === 'POST') {
        const body = JSON.parse(String(init?.body)) as {
          matricule: string;
          lastName: string;
          firstName: string;
          birthDate: string;
          birthPlace: string;
          sex: 'M' | 'F';
        };
        return jsonRes(
          {
            id: STUDENT2_ID,
            ...body,
            syncVersion: 11,
            createdAt: '2026-11-22T00:00:00.000Z',
            updatedAt: '2026-11-22T00:00:00.000Z',
          },
          201,
        );
      }
      if (url.endsWith('/api/enrollments') && method === 'POST') {
        roster.push({
          enrollmentId: ENROLL2_ID,
          studentId: STUDENT2_ID,
          classId: CLASS1_ID,
          academicYearId: YEAR_ID,
          matricule: '26LYC002',
          lastName: 'KAMGA',
          firstName: 'Jean',
          birthDate: '2010-05-14',
          birthPlace: 'Douala',
          sex: 'M',
          isRepeater: false,
          status: 'active',
          enrolledAt: '2026-11-22T00:00:00.000Z',
          syncVersion: 12,
        });
        return jsonRes(
          {
            id: ENROLL2_ID,
            studentId: STUDENT2_ID,
            classId: CLASS1_ID,
            academicYearId: YEAR_ID,
            isRepeater: false,
            status: 'active',
            syncVersion: 12,
            enrolledAt: '2026-11-22T00:00:00.000Z',
            updatedAt: '2026-11-22T00:00:00.000Z',
          },
          201,
        );
      }
      if (url.includes(`/api/enrollments/${ENROLL1_ID}`) && method === 'PATCH') {
        return jsonRes(
          {
            error: {
              code: 'CONFLICT',
              message:
                'Impossible de changer la classe de cet élève car des notes ou décisions existent déjà.',
            },
          },
          409,
        );
      }
      return jsonRes({});
    });

    renderAdmin('/admin?tab=students');

    expect((await screen.findAllByText('BELLO Aminatou')).length).toBeGreaterThanOrEqual(1);

    // 1. Création + inscription immédiate
    await user.click(screen.getByRole('button', { name: t('admin.students.newStudentBtn') }));
    await user.type(screen.getByLabelText(t('admin.students.matriculeLabel')), '26LYC002');
    await user.type(screen.getByLabelText(t('admin.students.lastNameLabel')), 'KAMGA');
    await user.type(screen.getByLabelText(t('admin.students.firstNameLabel')), 'Jean');
    await user.click(screen.getByRole('button', { name: t('admin.common.save') }));

    await waitFor(() => {
      expect(screen.getAllByText('KAMGA Jean').length).toBeGreaterThanOrEqual(1);
    });

    // 2. Tentative de changement de classe sur BELLO -> affiche erreur 409 dans le dialogue
    const enrollButtons = screen.getAllByRole('button', { name: 'Inscription' });
    await user.click(enrollButtons[0]!);

    await user.click(screen.getByRole('button', { name: /Classe d’affectation/ }));
    await user.click(screen.getByRole('menuitem', { name: '3ème B' }));
    await user.click(screen.getByRole('button', { name: t('admin.common.save') }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Impossible de changer la classe de cet élève/i,
    );
  });

  it('validates non-overlapping appreciation bands and completes dry-run -> commit CSV import', async () => {
    const user = userEvent.setup();
    const roster = [
      {
        enrollmentId: ENROLL1_ID,
        studentId: STUDENT1_ID,
        classId: CLASS1_ID,
        academicYearId: YEAR_ID,
        matricule: '26LYC001',
        lastName: 'BELLO',
        firstName: 'Aminatou',
        birthDate: '2010-04-12',
        birthPlace: 'Yaoundé',
        sex: 'F',
        isRepeater: false,
        status: 'active',
        enrolledAt: '2026-09-01T00:00:00.000Z',
        syncVersion: 10,
      },
    ];
    let dryRunCalls = 0;
    let commitCalls = 0;

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
        return jsonRes({ periods: [] });
      }
      if (url.includes('/grading-rules') && method === 'GET') {
        return jsonRes({
          id: '77777777-7777-4777-8777-777777777777',
          academicYearId: YEAR_ID,
          ...CAMEROON_DEFAULT_GRADING_RULES,
          syncVersion: 2,
          updatedAt: '2026-09-01T00:00:00.000Z',
        });
      }
      if (url.includes('/api/classes?') || url.endsWith('/api/classes')) {
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
              syncVersion: 2,
              updatedAt: '2026-09-01T00:00:00.000Z',
            },
          ],
        });
      }
      if (url.includes(`/api/classes/${CLASS1_ID}/students`)) {
        return jsonRes({ classId: CLASS1_ID, students: roster });
      }
      if (url.includes('/api/students/import-csv') && method === 'POST') {
        const body = JSON.parse(String(init?.body)) as { csvContent: string; dryRun: boolean };
        if (body.dryRun) {
          dryRunCalls += 1;
          if (body.csvContent.includes('INVALID_DATE')) {
            return jsonRes({
              dryRun: true,
              committed: false,
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
                  matricule: '26CSV001',
                  field: 'birthDate',
                  message: 'Format de date invalide.',
                },
              ],
              preview: [],
              createdStudents: [],
              createdEnrollments: [],
            });
          }
          return jsonRes({
            dryRun: true,
            committed: false,
            summary: {
              totalRows: 1,
              validRows: 1,
              errorCount: 0,
              studentsToCreate: 1,
              studentsReused: 0,
              enrollmentsToCreate: 1,
            },
            errors: [],
            preview: [
              {
                line: 2,
                matricule: '26CSV001',
                lastName: 'ATANGANA',
                firstName: 'Luc',
                birthDate: '2011-02-14',
                sex: 'M',
                classId: CLASS1_ID,
                className: '3ème A',
                isRepeater: false,
                action: 'create_student',
              },
            ],
            createdStudents: [],
            createdEnrollments: [],
          });
        }
        commitCalls += 1;
        roster.push({
          enrollmentId: ENROLL2_ID,
          studentId: STUDENT2_ID,
          classId: CLASS1_ID,
          academicYearId: YEAR_ID,
          matricule: '26CSV001',
          lastName: 'ATANGANA',
          firstName: 'Luc',
          birthDate: '2011-02-14',
          birthPlace: 'Yaoundé',
          sex: 'M',
          isRepeater: false,
          status: 'active',
          enrolledAt: '2026-11-25T00:00:00.000Z',
          syncVersion: 15,
        });
        return jsonRes(
          {
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
            createdStudents: [],
            createdEnrollments: [],
          },
          201,
        );
      }
      if (url.includes('/api/students') && method === 'GET') {
        return jsonRes({ students: [] });
      }
      return jsonRes({});
    });

    // 1. Test live non-overlapping appreciation scale check in /admin?tab=academic
    const first = renderAdmin('/admin?tab=academic');
    const removeLastBandBtn = await screen.findByRole('button', { name: 'Supprimer tranche 8' });
    await user.click(removeLastBandBtn);
    await user.click(screen.getByRole('button', { name: t('admin.academic.addBandBtn') }));
    // Should auto-suggest 18..20 without overlap!
    expect(screen.getByLabelText(`${t('admin.academic.bandMinLabel')} #8`)).toHaveValue(18);
    expect(screen.getByLabelText(`${t('admin.academic.bandMaxLabel')} #8`)).toHaveValue(20);
    expect(screen.queryByText(/Chevauchement/)).not.toBeInTheDocument();

    // Adding another band when [0..20] is full triggers live overlap feedback
    await user.click(screen.getByRole('button', { name: t('admin.academic.addBandBtn') }));
    expect(await screen.findByText(/Chevauchement/)).toBeInTheDocument();

    first.unmount();
    queryClient.clear();

    // 2. Test CSV student import dry-run -> error -> fix -> commit in /admin?tab=students
    renderAdmin('/admin?tab=students');
    expect((await screen.findAllByText('BELLO Aminatou')).length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByRole('button', { name: t('admin.students.importCsvBtn') }));
    const csvTextarea = await screen.findByLabelText(t('admin.students.csv.contentLabel'));
    await user.type(
      csvTextarea,
      'matricule;nom;prenom;date_naissance;sexe\n26CSV001;ATANGANA;Luc;INVALID_DATE;M',
    );
    await user.click(screen.getByRole('button', { name: t('admin.students.csv.analyzeBtn') }));

    expect(await screen.findByText(/Format de date invalide/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: t('admin.students.csv.commitBtn', { count: 0 }) }),
    ).toBeDisabled();

    await user.click(screen.getByRole('button', { name: t('admin.students.csv.resetPreviewBtn') }));
    const refreshedTextarea = await screen.findByLabelText(t('admin.students.csv.contentLabel'));
    await user.clear(refreshedTextarea);
    await user.type(
      refreshedTextarea,
      'matricule;nom;prenom;date_naissance;sexe\n26CSV001;ATANGANA;Luc;14/02/2011;M',
    );
    await user.click(screen.getByRole('button', { name: t('admin.students.csv.analyzeBtn') }));

    expect(await screen.findByText('ATANGANA Luc')).toBeInTheDocument();
    const commitBtn = screen.getByRole('button', {
      name: t('admin.students.csv.commitBtn', { count: 1 }),
    });
    expect(commitBtn).toBeEnabled();
    await user.click(commitBtn);

    await waitFor(() => {
      expect(dryRunCalls).toBe(2);
      expect(commitCalls).toBe(1);
      expect(screen.getAllByText('ATANGANA Luc').length).toBeGreaterThanOrEqual(1);
    });
  });
});
