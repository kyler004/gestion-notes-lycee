import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeAllUserDbs, getUserDb, makeGradeTargetKey } from '@/db/user-db';
import { t } from '@/lib/i18n';
import { createAppRouter } from '@/router';
import { useSessionStore } from '@/stores/session.store';

const TEACHER_ID = '11111111-1111-4111-8111-111111111111';
const YEAR_ID = '10000000-0000-4000-8000-000000000001';
const TRIMESTER_OPEN_ID = '20000000-0000-4000-8000-000000000001';
const TRIMESTER_LOCKED_ID = '20000000-0000-4000-8000-000000000002';
const SEQ1_ID = '20000000-0000-4000-8000-000000000011';
const SEQ2_LOCKED_PARENT_ID = '20000000-0000-4000-8000-000000000012';
const CLASS_ID = '30000000-0000-4000-8000-000000000001';
const SUBJECT_ID = '40000000-0000-4000-8000-000000000001';
const CS_ID = '50000000-0000-4000-8000-000000000001';
const STU_BELLO = '70000000-0000-4000-8000-000000000001';
const STU_KAMGA = '70000000-0000-4000-8000-000000000002';
const STU_ZANGA = '70000000-0000-4000-8000-000000000003';
const ENR_BELLO = '80000000-0000-4000-8000-000000000001';
const ENR_KAMGA = '80000000-0000-4000-8000-000000000002';
const ENR_ZANGA = '80000000-0000-4000-8000-000000000003';

async function seedTeacherLocalDb() {
  const db = getUserDb(TEACHER_ID);
  const now = '2026-11-21T08:00:00.000Z';

  await db.academicYears.put({
    id: YEAR_ID,
    label: '2026-2027',
    startDate: '2026-09-01',
    endDate: '2027-07-31',
    isActive: true,
    syncVersion: 1,
  });

  await db.periods.bulkPut([
    {
      id: TRIMESTER_OPEN_ID,
      academicYearId: YEAR_ID,
      parentPeriodId: null,
      type: 'trimester',
      code: 'T1',
      name: '1er Trimestre',
      orderIndex: 1,
      weight: 1,
      status: 'open',
      lockedAt: null,
      lockedBy: null,
      syncVersion: 1,
      updatedAt: now,
    },
    {
      id: TRIMESTER_LOCKED_ID,
      academicYearId: YEAR_ID,
      parentPeriodId: null,
      type: 'trimester',
      code: 'T2',
      name: '2e Trimestre',
      orderIndex: 2,
      weight: 1,
      status: 'locked',
      lockedAt: now,
      lockedBy: TEACHER_ID,
      syncVersion: 2,
      updatedAt: now,
    },
    {
      id: SEQ1_ID,
      academicYearId: YEAR_ID,
      parentPeriodId: TRIMESTER_OPEN_ID,
      type: 'sequence',
      code: 'S1',
      name: 'Séquence 1',
      orderIndex: 1,
      weight: 1,
      status: 'open',
      lockedAt: null,
      lockedBy: null,
      syncVersion: 1,
      updatedAt: now,
    },
    {
      id: SEQ2_LOCKED_PARENT_ID,
      academicYearId: YEAR_ID,
      parentPeriodId: TRIMESTER_LOCKED_ID,
      type: 'sequence',
      code: 'S3',
      name: 'Séquence 3',
      orderIndex: 3,
      weight: 1,
      status: 'open', // Parent T2 est verrouillé -> S3 doit être en lecture seule
      lockedAt: null,
      lockedBy: null,
      syncVersion: 2,
      updatedAt: now,
    },
  ]);

  await db.subjects.put({
    id: SUBJECT_ID,
    code: 'MATH',
    name: 'Mathématiques',
    shortName: 'Maths',
    isActive: true,
    syncVersion: 1,
    updatedAt: now,
  });

  await db.classes.put({
    id: CLASS_ID,
    academicYearId: YEAR_ID,
    name: '6ème A',
    level: '6ème',
    series: null,
    mainTeacherId: TEACHER_ID,
    syncVersion: 1,
    updatedAt: now,
  });

  await db.classSubjects.put({
    id: CS_ID,
    classId: CLASS_ID,
    subjectId: SUBJECT_ID,
    subjectGroupId: null,
    coefficient: 4,
    syncVersion: 1,
    updatedAt: now,
  });

  await db.teacherAssignments.put({
    id: '60000000-0000-4000-8000-000000000001',
    teacherId: TEACHER_ID,
    classSubjectId: CS_ID,
    academicYearId: YEAR_ID,
    isActive: true,
    syncVersion: 1,
    createdAt: now,
    updatedAt: now,
  });

  await db.students.bulkPut([
    {
      id: STU_KAMGA,
      matricule: '26LYC-002',
      lastName: 'Kamga',
      firstName: 'Jean',
      birthDate: '2013-02-10',
      birthPlace: 'Douala',
      sex: 'M',
      syncVersion: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: STU_BELLO,
      matricule: '26LYC-001',
      lastName: 'Bello',
      firstName: 'Aminatou',
      birthDate: '2013-04-18',
      birthPlace: 'Garoua',
      sex: 'F',
      syncVersion: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: STU_ZANGA,
      matricule: '26LYC-003',
      lastName: 'Zanga',
      firstName: 'Paul',
      birthDate: '2013-07-01',
      birthPlace: 'Yaoundé',
      sex: 'M',
      syncVersion: 1,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  await db.enrollments.bulkPut([
    {
      id: ENR_KAMGA,
      studentId: STU_KAMGA,
      classId: CLASS_ID,
      academicYearId: YEAR_ID,
      isRepeater: false,
      status: 'active',
      syncVersion: 1,
      enrolledAt: now,
      updatedAt: now,
    },
    {
      id: ENR_BELLO,
      studentId: STU_BELLO,
      classId: CLASS_ID,
      academicYearId: YEAR_ID,
      isRepeater: true,
      status: 'active',
      syncVersion: 1,
      enrolledAt: now,
      updatedAt: now,
    },
    {
      id: ENR_ZANGA,
      studentId: STU_ZANGA,
      classId: CLASS_ID,
      academicYearId: YEAR_ID,
      isRepeater: false,
      status: 'active',
      syncVersion: 1,
      enrolledAt: now,
      updatedAt: now,
    },
  ]);

  // Note déjà synchronisée pour ZANGA Paul afin de tester la règle de motif obligatoire
  await db.grades.put({
    targetKey: makeGradeTargetKey(ENR_ZANGA, CS_ID, SEQ1_ID),
    id: 'a0000000-0000-4000-8000-000000000099',
    enrollmentId: ENR_ZANGA,
    classSubjectId: CS_ID,
    periodId: SEQ1_ID,
    score: 12,
    status: 'present',
    appreciation: null,
    enteredBy: TEACHER_ID,
    syncVersion: 1,
    createdAt: now,
    updatedAt: now,
  });

  await db.syncMeta.put({ key: 'lastPullAt', value: now });
}

function renderGradesRoute() {
  const router = createAppRouter();
  router.update({
    history: createMemoryHistory({ initialEntries: ['/grades'] }),
  });
  return render(<RouterProvider router={router} />);
}

describe('/grades offline grid & keyboard entry', () => {
  beforeEach(async () => {
    await getUserDb(TEACHER_ID).delete();
    closeAllUserDbs();
    await seedTeacherLocalDb();

    useSessionStore.setState({
      status: 'authenticated',
      user: {
        id: TEACHER_ID,
        username: 'prof.math',
        fullName: 'Prof Maths',
        role: 'teacher',
        isActive: true,
      },
      accessToken: 'token-teacher',
      hasPin: true,
      needsPinSetup: false,
      pinAttempts: 0,
      savedAccounts: [],
      authNotice: null,
      isOnline: false,
    });
  });

  afterEach(() => {
    closeAllUserDbs();
    vi.restoreAllMocks();
  });

  it('supports offline comma grade entry, keyboard navigation, absent status, live @lycee/shared stats, and locked trimester check', async () => {
    const user = userEvent.setup();
    renderGradesRoute();

    expect(await screen.findByText('BELLO Aminatou')).toBeInTheDocument();
    expect(screen.getByText('KAMGA Jean')).toBeInTheDocument();
    expect(screen.getByText('ZANGA Paul')).toBeInTheDocument();

    const belloInput = screen.getByLabelText('Note pour BELLO Aminatou');
    const kamgaInput = screen.getByLabelText('Note pour KAMGA Jean');

    // Saisie décimale virgule + Entrée pour passer à l'élève suivant
    await user.click(belloInput);
    await user.type(belloInput, '15,5{Enter}');

    await waitFor(() => {
      expect(kamgaInput).toHaveFocus();
    });

    // Raccourci clavier 'A' pour marquer KAMGA Absent
    await user.keyboard('a');

    // Vérifie les calculs temps réel (@lycee/shared : (15.5 + 0 + 12) / 3 = 9.17 / 20, 2/3 réussites >= 10 -> 67%)
    await waitFor(() => {
      expect(screen.getByText('3/3')).toBeInTheDocument();
      expect(screen.getByText('9,17 / 20')).toBeInTheDocument();
      expect(screen.getByText('67%')).toBeInTheDocument();
    });

    const outboxOps = await getUserDb(TEACHER_ID).outbox.toArray();
    expect(outboxOps).toHaveLength(2);
    expect(outboxOps.find((o) => o.enrollmentId === ENR_BELLO)?.payload.score).toBe(15.5);
    expect(outboxOps.find((o) => o.enrollmentId === ENR_KAMGA)?.payload.status).toBe('absent');

    // Passage vers Séquence 3 (rattachée au 2e Trimestre verrouillé) -> lecture seule
    await user.click(screen.getByRole('button', { name: /Séquence/ }));
    await user.click(await screen.findByText('Séquence 3 (S3)'));

    expect(await screen.findByText(t('grades.lockedBannerBody'))).toBeInTheDocument();
    expect(screen.getByLabelText('Note pour BELLO Aminatou')).toBeDisabled();
  });

  it('requires a reason modal when modifying an already-synced grade without batch motif', async () => {
    const user = userEvent.setup();
    renderGradesRoute();

    const zangaInput = await screen.findByLabelText('Note pour ZANGA Paul');
    await user.click(zangaInput);
    await user.clear(zangaInput);
    await user.type(zangaInput, '14{Enter}');

    // Modale obligatoire déclenchée car ZANGA avait déjà une note serveur (12)
    expect(await screen.findByText(t('grades.reasonModalTitle'))).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: t('grades.reasonPresets.recount') }));
    await user.click(screen.getByRole('button', { name: t('grades.reasonConfirm') }));

    await waitFor(async () => {
      const op = await getUserDb(TEACHER_ID).outbox.get(
        makeGradeTargetKey(ENR_ZANGA, CS_ID, SEQ1_ID),
      );
      expect(op?.payload.score).toBe(14);
      expect(op?.payload.reason).toBe(t('grades.reasonPresets.recount'));
    });
  });
});
