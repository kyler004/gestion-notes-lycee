import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '@/lib/i18n';
import { createAppRouter } from '@/router';
import { useSessionStore } from '@/stores/session.store';

const YEAR_ID = 'aaaa1111-1111-4111-8111-111111111111';
const CLASS_ID = 'bbbb2222-2222-4222-8222-222222222222';
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const CENSOR_ID = '22222222-2222-4222-8222-222222222222';
const TEACHER_ID = '33333333-3333-4333-8333-333333333333';
const SECRETARY_ID = '44444444-4444-4444-8444-444444444444';

function renderAdminAt(path = '/admin') {
  const router = createAppRouter();
  router.update({
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return {
    router,
    ...render(<RouterProvider router={router} />),
  };
}

function setAuthRole(role: 'admin' | 'censor' | 'secretary' | 'teacher', id: string) {
  useSessionStore.setState({
    status: 'authenticated',
    user: {
      id,
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

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('/admin RBAC & School Settings (Milestone 3)', () => {
  const originalFetch = globalThis.fetch;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:mock-logo-url');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
    vi.restoreAllMocks();
  });

  it('redirects teacher to /forbidden and scopes secretary exclusively to Élèves & Inscriptions', async () => {
    setAuthRole('teacher', TEACHER_ID);
    renderAdminAt('/admin');
    expect(await screen.findByText(t('errors.forbiddenTitle'))).toBeInTheDocument();

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
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
              id: CLASS_ID,
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
      if (url.includes(`/api/classes/${CLASS_ID}/students`)) {
        return jsonRes({ classId: CLASS_ID, students: [] });
      }
      if (url.includes('/api/students')) {
        return jsonRes({ students: [] });
      }
      return jsonRes({ error: { code: 'NOT_FOUND', message: 'Not mocked' } }, 404);
    });

    setAuthRole('secretary', SECRETARY_ID);
    renderAdminAt('/admin');

    expect(
      await screen.findByRole('heading', { name: t('admin.pageTitleSecretary') }),
    ).toBeInTheDocument();
    expect(await screen.findByText(t('admin.students.rosterTitle'))).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: t('admin.tabs.school') })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: t('admin.tabs.users') })).not.toBeInTheDocument();
  });

  it('enforces censor read-only on Établissement and restricts user management actions', async () => {
    const user = userEvent.setup();

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/academic-years')) {
        return jsonRes({ academicYears: [] });
      }
      if (url.endsWith('/api/school')) {
        return jsonRes({
          id: 1,
          name: 'Lycée Général',
          motto: 'Discipline',
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
        });
      }
      if (url.includes('/api/users')) {
        return jsonRes([
          {
            id: ADMIN_ID,
            username: 'admin',
            email: null,
            fullName: 'Super Admin',
            role: 'admin',
            isActive: true,
            createdAt: '2026-11-22T00:00:00.000Z',
            updatedAt: '2026-11-22T00:00:00.000Z',
          },
          {
            id: TEACHER_ID,
            username: 'prof1',
            email: null,
            fullName: 'Professeur Un',
            role: 'teacher',
            isActive: true,
            createdAt: '2026-11-22T00:00:00.000Z',
            updatedAt: '2026-11-22T00:00:00.000Z',
          },
        ]);
      }
      return jsonRes({});
    });

    setAuthRole('censor', CENSOR_ID);
    renderAdminAt('/admin');

    expect(await screen.findByText(t('admin.common.readOnlyNotice'))).toBeInTheDocument();
    expect(screen.getByDisplayValue('Lycée Général')).toBeDisabled();
    expect(screen.queryByRole('button', { name: t('admin.common.save') })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: t('admin.school.logoUploadButton') }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: t('admin.tabs.users') }));
    expect(await screen.findByText(t('admin.users.censorNotice'))).toBeInTheDocument();
    expect(await screen.findByText('Super Admin')).toBeInTheDocument();

    // Un seul bouton Modifier (pour prof1, pas pour admin), et zéro bouton Réinitialiser mot de passe
    expect(screen.getAllByRole('button', { name: t('admin.common.edit') })).toHaveLength(1);
    expect(
      screen.queryByRole('button', { name: t('admin.users.resetPasswordBtn') }),
    ).not.toBeInTheDocument();
  });

  it('allows admin to update school profile and upload a valid PNG logo', async () => {
    const user = userEvent.setup();
    let schoolState = {
      id: 1,
      name: 'Lycée Initial',
      motto: 'Effort',
      country: 'République du Cameroun',
      ministry: 'MINESEC',
      region: 'Centre',
      delegation: 'Mfoundi',
      city: 'Yaoundé',
      phone: '',
      email: '',
      hasLogo: false,
      logoMimeType: null as string | null,
      updatedAt: '2026-11-22T00:00:00.000Z',
    };

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.includes('/api/academic-years')) {
        return jsonRes({ academicYears: [] });
      }
      if (url.endsWith('/api/school') && method === 'GET') {
        return jsonRes(schoolState);
      }
      if (url.endsWith('/api/school') && method === 'PUT') {
        const body = JSON.parse(String(init?.body)) as typeof schoolState;
        schoolState = { ...schoolState, ...body, updatedAt: '2026-11-22T01:00:00.000Z' };
        return jsonRes(schoolState);
      }
      if (url.endsWith('/api/school/logo') && method === 'PUT') {
        schoolState = {
          ...schoolState,
          hasLogo: true,
          logoMimeType: 'image/png',
          updatedAt: '2026-11-22T02:00:00.000Z',
        };
        return jsonRes(schoolState);
      }
      if (url.endsWith('/api/school/logo') && method === 'GET') {
        return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        });
      }
      return jsonRes({});
    });

    setAuthRole('admin', ADMIN_ID);
    renderAdminAt('/admin');

    const nameInput = await screen.findByLabelText(t('admin.school.nameLabel'));
    await user.clear(nameInput);
    await user.type(nameInput, 'Lycée Bilingue de Test');
    await user.click(screen.getByRole('button', { name: t('admin.common.save') }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('Lycée Bilingue de Test')).toBeInTheDocument();
    });

    const pngFile = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'blason.png', {
      type: 'image/png',
    });
    const fileInput = screen.getByTestId('school-logo-input') as HTMLInputElement;
    await user.upload(fileInput, pngFile);

    await waitFor(() => {
      expect(screen.getByAltText(t('admin.school.logoTitle'))).toHaveAttribute(
        'src',
        'blob:mock-logo-url',
      );
    });
  });
});
