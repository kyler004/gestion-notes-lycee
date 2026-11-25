import { expect, test, type APIRequestContext } from '@playwright/test';

interface SeededReportsFixture {
  className: string;
  seq2Id: string;
}

async function seedReportsFixtureViaApi(
  request: APIRequestContext,
): Promise<SeededReportsFixture> {
  const tag = `${Date.now().toString(36)}rep`;

  const loginRes = await request.post('/api/auth/login', {
    data: { username: 'admin', password: 'AdminLycee2026!' },
  });
  expect(loginRes.ok()).toBeTruthy();
  const { accessToken: adminToken } = (await loginRes.json()) as { accessToken: string };
  const adminHeaders = { Authorization: `Bearer ${adminToken}` };

  const yearsRes = await request.get('/api/academic-years', { headers: adminHeaders });
  const { academicYears } = (await yearsRes.json()) as {
    academicYears: Array<{ id: string; isActive: boolean }>;
  };
  const activeYear = academicYears.find((y) => y.isActive) ?? academicYears[0]!;

  const periodsRes = await request.get(`/api/academic-years/${activeYear.id}/periods`, {
    headers: adminHeaders,
  });
  const { periods } = (await periodsRes.json()) as {
    periods: Array<{ id: string; code: string; status: string; type: string }>;
  };
  for (const locked of [...periods]
    .filter((p) => p.status === 'locked')
    .sort((a, b) => (a.type === b.type ? 0 : a.type === 'trimester' ? -1 : 1))) {
    const unlockRes = await request.post(`/api/periods/${locked.id}/unlock`, {
      headers: adminHeaders,
      data: { reason: 'Réinitialisation E2E Jalon 4' },
    });
    expect(unlockRes.ok()).toBeTruthy();
  }
  const seq2 = periods.find((p) => p.code === 'S2')!;

  const teacherUsername = `prof.${tag}`;
  const teacherPassword = 'ProfLycee2026!';
  const teacherRes = await request.post('/api/users', {
    headers: adminHeaders,
    data: {
      username: teacherUsername,
      fullName: `Prof Rapports ${tag}`,
      role: 'teacher',
      password: teacherPassword,
      isActive: true,
    },
  });
  expect(teacherRes.status()).toBe(201);
  const teacher = (await teacherRes.json()) as { id: string };

  const subjRes = await request.post('/api/subjects', {
    headers: adminHeaders,
    data: {
      code: `INF-${tag}`.slice(0, 16),
      name: `Informatique ${tag}`,
      shortName: 'INFO',
      isActive: true,
    },
  });
  expect(subjRes.status()).toBe(201);
  const subj = (await subjRes.json()) as { id: string };

  const className = `1ère D ${tag}`;
  const classRes = await request.post('/api/classes', {
    headers: adminHeaders,
    data: {
      academicYearId: activeYear.id,
      name: className,
      level: '1ère',
      series: 'D',
      mainTeacherId: teacher.id,
    },
  });
  expect(classRes.status()).toBe(201);
  const cls = (await classRes.json()) as { id: string };

  const csRes = await request.put('/api/class-subjects', {
    headers: adminHeaders,
    data: {
      classId: cls.id,
      subjectId: subj.id,
      coefficient: 3,
    },
  });
  expect(csRes.ok()).toBeTruthy();
  const cs = (await csRes.json()) as { id: string };

  const assignRes = await request.post('/api/teacher-assignments', {
    headers: adminHeaders,
    data: {
      teacherId: teacher.id,
      classSubjectId: cs.id,
      academicYearId: activeYear.id,
    },
  });
  expect(assignRes.status()).toBe(201);

  const enrollmentIds: string[] = [];
  for (const s of [
    { matricule: `26-${tag}-A`, lastName: 'MVOGO', firstName: 'Alice', sex: 'F' },
    { matricule: `26-${tag}-B`, lastName: 'FOUDA', firstName: 'Brice', sex: 'M' },
  ] as const) {
    const stuRes = await request.post('/api/students', {
      headers: adminHeaders,
      data: {
        matricule: s.matricule,
        lastName: s.lastName,
        firstName: s.firstName,
        birthDate: '2009-03-10',
        birthPlace: 'Yaoundé',
        sex: s.sex,
      },
    });
    expect(stuRes.status()).toBe(201);
    const stu = (await stuRes.json()) as { id: string };

    const enrRes = await request.post('/api/enrollments', {
      headers: adminHeaders,
      data: {
        studentId: stu.id,
        classId: cls.id,
        academicYearId: activeYear.id,
        isRepeater: false,
        status: 'active',
      },
    });
    expect(enrRes.status()).toBe(201);
    const enr = (await enrRes.json()) as { id: string };
    enrollmentIds.push(enr.id);
  }

  // Connexion enseignant pour créer puis corriger une note (alimente le journal d'audit)
  const profLoginRes = await request.post('/api/auth/login', {
    data: { username: teacherUsername, password: teacherPassword },
  });
  const { accessToken: profToken } = (await profLoginRes.json()) as { accessToken: string };
  const profHeaders = { Authorization: `Bearer ${profToken}` };

  const bulk1 = await request.put('/api/grades/bulk', {
    headers: profHeaders,
    data: {
      entries: [
        {
          enrollmentId: enrollmentIds[0],
          classSubjectId: cs.id,
          periodId: seq2.id,
          score: 14,
          status: 'present',
        },
        {
          enrollmentId: enrollmentIds[1],
          classSubjectId: cs.id,
          periodId: seq2.id,
          score: 11,
          status: 'present',
        },
      ],
    },
  });
  expect(bulk1.ok()).toBeTruthy();

  const bulk2 = await request.put('/api/grades/bulk', {
    headers: profHeaders,
    data: {
      entries: [
        {
          enrollmentId: enrollmentIds[0],
          classSubjectId: cs.id,
          periodId: seq2.id,
          score: 16.5,
          status: 'present',
          reason: 'Recomptage copie E2E',
        },
      ],
    },
  });
  expect(bulk2.ok()).toBeTruthy();

  return { className, seq2Id: seq2.id };
}

test.describe('Validation, Council Decisions & PDF Reports (Milestone 4)', () => {
  test('validates completeness, saves council decisions, locks period, downloads PDFs, and performs exceptional unlock', async ({
    browser,
    request,
  }) => {
    const fx = await seedReportsFixtureViaApi(request);
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();

    try {
      await page.goto('/');
      await expect(page).toHaveURL(/\/login$/);

      await page.getByLabel('Identifiant').fill('admin');
      await page.getByLabel('Mot de passe').fill('AdminLycee2026!');
      await page.getByRole('button', { name: 'Se connecter' }).click();

      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByText('Sécuriser ce poste avec un code PIN')).toBeVisible();
      await page.getByLabel('Code PIN (4 à 6 chiffres)').fill('1357');
      await page.getByLabel('Confirmer le code PIN').fill('1357');
      await page.getByRole('button', { name: 'Enregistrer le code PIN' }).click();
      await expect(page.getByText('Sécuriser ce poste avec un code PIN')).toBeHidden();

      // 1. Ouverture /reports et sélection de Séquence 2 (S2)
      await page.getByRole('link', { name: 'Bulletins & Résultats', exact: true }).click();
      await expect(page).toHaveURL(/\/reports/);

      await page.getByRole('button', { name: /Période évaluée/ }).click();
      await page.getByRole('menuitem', { name: /Séquence 2 \(S2\)/ }).click();

      // Synthèse établissement contient notre classe créée
      await expect(page.getByText(fx.className)).toBeVisible();

      // 2. Journaux d'audit (Notes)
      await page.getByRole('tab', { name: 'Journaux d’audit' }).click();
      await expect(page.getByText('Recomptage copie E2E').first()).toBeVisible();
      await expect(page.getByText('14,00 → 16,50').first()).toBeVisible();

      // 3. Conseil de classe -> sélection classe -> auto-suggestion -> enregistrement
      await page.getByRole('tab', { name: 'Conseil de classe' }).click();
      await page.getByRole('button', { name: /^Classe\s/ }).click();
      await page.getByRole('menuitem', { name: new RegExp(fx.className) }).click();

      await expect(page.getByText('MVOGO Alice')).toBeVisible();
      await page.getByRole('button', { name: 'Pré-remplir selon le barème' }).click();
      await page.getByLabel('Appréciation générale MVOGO Alice').fill('Excellente progression E2E');
      await page.getByRole('button', { name: 'Enregistrer les décisions' }).click();
      await expect(page.getByText('2 décision(s) du conseil enregistrée(s).')).toBeVisible();

      // 4. Validation & Verrouillage -> verrouille S2 -> conseil passe en lecture seule
      await page.getByRole('tab', { name: 'Validation & Verrouillage' }).click();
      await expect(page.getByText(fx.className)).toBeVisible();
      await page.getByRole('button', { name: 'Verrouiller la période' }).click();
      const lockDialog = page.getByRole('dialog');
      await lockDialog.getByLabel(/Motif de clôture/).fill('Clôture E2E S2');
      await lockDialog.getByRole('button', { name: 'Confirmer le verrouillage' }).click();
      await expect(lockDialog).toBeHidden();
      await expect(page.getByText('Officiel · Période verrouillée').first()).toBeVisible();

      await page.getByRole('tab', { name: 'Conseil de classe' }).click();
      await expect(
        page.getByText('Période verrouillée : les décisions du conseil sont en lecture seule.'),
      ).toBeVisible();

      // 5. Résultats & téléchargements PDF (Bulletins classe, Tableau d'honneur, Liste de classe, Bulletin élève)
      await page.getByRole('tab', { name: 'Résultats & Bulletins PDF' }).click();
      await expect(page.getByText(/Résultats officiels issus des snapshots figés/)).toBeVisible();

      const classPdfPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Bulletins classe (PDF)' }).click();
      const classPdf = await classPdfPromise;
      expect(classPdf.suggestedFilename()).toMatch(/^bulletins-.*-S2\.pdf$/);

      const honorPdfPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Tableau d’honneur (PDF)' }).click();
      const honorPdf = await honorPdfPromise;
      expect(honorPdf.suggestedFilename()).toMatch(/^tableau-honneur-.*-S2\.pdf$/);

      const listPdfPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Liste de classe (PDF)' }).click();
      const listPdf = await listPdfPromise;
      expect(listPdf.suggestedFilename()).toMatch(/^liste-classe-.*\.pdf$/);

      const studentPdfPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Bulletin PDF' }).first().click();
      const studentPdf = await studentPdfPromise;
      expect(studentPdf.suggestedFilename()).toMatch(/^bulletin-.*-S2\.pdf$/);

      // 5b. Bilan annuel (T1–T3) -> résultats annuels + téléchargement bulletin annuel PDF
      await page.getByRole('button', { name: /Période évaluée/ }).click();
      await page.getByRole('menuitem', { name: /Bilan annuel \(T1–T3\)/ }).click();
      await expect(page.getByText(/Calcul annuel provisoire/)).toBeVisible();
      const annualClassPdfPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Bulletins annuels (PDF)' }).click();
      const annualClassPdf = await annualClassPdfPromise;
      expect(annualClassPdf.suggestedFilename()).toMatch(/^bulletins-annuels-.*\.pdf$/);

      // 6. Déverrouillage exceptionnel -> motif < 5 car. bloqué -> motif valide déverrouille
      await page.getByRole('tab', { name: 'Validation & Verrouillage' }).click();
      await page.getByRole('button', { name: 'Déverrouillage exceptionnel' }).click();
      const unlockDialog = page.getByRole('dialog');
      await unlockDialog.getByLabel(/Motif justificatif obligatoire/).fill('abc');
      await unlockDialog.getByRole('button', { name: 'Confirmer le déverrouillage' }).click();
      await expect(unlockDialog.getByRole('alert')).toContainText('5 caractères');

      await unlockDialog.getByLabel(/Motif justificatif obligatoire/).fill('Recours accepté E2E');
      await unlockDialog.getByRole('button', { name: 'Confirmer le déverrouillage' }).click();
      await expect(unlockDialog).toBeHidden();
      await expect(page.getByRole('button', { name: 'Verrouiller la période' })).toBeVisible();

      // 7. Vérification des nouveaux journaux d'audit périodes & conseil
      await page.getByRole('button', { name: 'Historique des verrouillages' }).click();
      await expect(page.getByText('Clôture E2E S2').first()).toBeVisible();
      await expect(page.getByText('Recours accepté E2E').first()).toBeVisible();

      await page.getByRole('button', { name: 'Décisions du conseil' }).click();
      await expect(page.getByText('Excellente progression E2E').first()).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
