import { expect, test, type APIRequestContext } from '@playwright/test';

interface SeededClassFixture {
  adminToken: string;
  teacherUsername: string;
  teacherPassword: string;
  className: string;
  seq1Id: string;
}

async function seedTeacherAndClassViaApi(
  request: APIRequestContext,
): Promise<SeededClassFixture> {
  const tag = Date.now().toString(36);

  // 1. Connexion administrateur initial (seedIfEmpty)
  const loginRes = await request.post('/api/auth/login', {
    data: {
      username: 'admin',
      password: 'AdminLycee2026!',
    },
  });
  expect(loginRes.ok()).toBeTruthy();
  const { accessToken: adminToken } = (await loginRes.json()) as { accessToken: string };
  const authHeaders = { Authorization: `Bearer ${adminToken}` };

  // 2. Récupère l'année active et Séquence 1
  const yearsRes = await request.get('/api/academic-years', { headers: authHeaders });
  expect(yearsRes.ok()).toBeTruthy();
  const { academicYears } = (await yearsRes.json()) as {
    academicYears: Array<{ id: string; isActive: boolean }>;
  };
  const activeYear = academicYears.find((y) => y.isActive) ?? academicYears[0]!;

  const periodsRes = await request.get(`/api/academic-years/${activeYear.id}/periods`, {
    headers: authHeaders,
  });
  expect(periodsRes.ok()).toBeTruthy();
  const { periods } = (await periodsRes.json()) as {
    periods: Array<{ id: string; code: string; status: string }>;
  };
  const seq1 = periods.find((p) => p.code === 'S1')!;

  // 3. Crée un compte enseignant
  const teacherUsername = `prof.${tag}`;
  const teacherPassword = 'ProfLycee2026!';
  const userRes = await request.post('/api/users', {
    headers: authHeaders,
    data: {
      username: teacherUsername,
      fullName: `Professeur Maths ${tag}`,
      role: 'teacher',
      password: teacherPassword,
      isActive: true,
    },
  });
  expect(userRes.status()).toBe(201);
  const teacher = (await userRes.json()) as { id: string };

  // 4. Crée matière + classe + matière-classe + affectation enseignant
  const subjectRes = await request.post('/api/subjects', {
    headers: authHeaders,
    data: {
      code: `MAT-${tag}`,
      name: `Mathématiques ${tag}`,
      shortName: 'Maths',
      isActive: true,
    },
  });
  expect(subjectRes.status()).toBe(201);
  const subject = (await subjectRes.json()) as { id: string };

  const className = `3ème ${tag}`;
  const classRes = await request.post('/api/classes', {
    headers: authHeaders,
    data: {
      academicYearId: activeYear.id,
      name: className,
      level: '3ème',
      mainTeacherId: teacher.id,
    },
  });
  expect(classRes.status()).toBe(201);
  const cls = (await classRes.json()) as { id: string };

  const csRes = await request.put('/api/class-subjects', {
    headers: authHeaders,
    data: {
      classId: cls.id,
      subjectId: subject.id,
      coefficient: 4,
    },
  });
  expect(csRes.ok()).toBeTruthy();
  const cs = (await csRes.json()) as { id: string };

  const assignRes = await request.post('/api/teacher-assignments', {
    headers: authHeaders,
    data: {
      teacherId: teacher.id,
      classSubjectId: cs.id,
      academicYearId: activeYear.id,
    },
  });
  expect(assignRes.status()).toBe(201);

  // 5. Crée et inscrit 3 élèves
  const studentsToSeed = [
    { matricule: `26-${tag}-1`, lastName: 'Bello', firstName: 'Aminatou', sex: 'F' },
    { matricule: `26-${tag}-2`, lastName: 'Kamga', firstName: 'Jean', sex: 'M' },
    { matricule: `26-${tag}-3`, lastName: 'Tchoumi', firstName: 'Paul', sex: 'M' },
  ] as const;

  for (const s of studentsToSeed) {
    const stuRes = await request.post('/api/students', {
      headers: authHeaders,
      data: {
        matricule: s.matricule,
        lastName: s.lastName,
        firstName: s.firstName,
        birthDate: '2012-03-14',
        birthPlace: 'Yaoundé',
        sex: s.sex,
      },
    });
    expect(stuRes.status()).toBe(201);
    const createdStudent = (await stuRes.json()) as { id: string };

    const enrRes = await request.post('/api/enrollments', {
      headers: authHeaders,
      data: {
        studentId: createdStudent.id,
        classId: cls.id,
        academicYearId: activeYear.id,
        isRepeater: false,
        status: 'active',
      },
    });
    expect(enrRes.status()).toBe(201);
  }

  return {
    adminToken,
    teacherUsername,
    teacherPassword,
    className,
    seq1Id: seq1.id,
  };
}

test.describe('Teacher Grade Entry & Offline Outbox Sync (Milestone 2)', () => {
  test('enters grades offline across reload, syncs online with edit reason, and handles concurrent period lock rejection', async ({
    browser,
    request,
  }) => {
    const fx = await seedTeacherAndClassViaApi(request);
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    try {
      await page.goto('/');
      await expect(page).toHaveURL(/\/login$/);

      await page.evaluate(async () => {
        if ('serviceWorker' in navigator) {
          await navigator.serviceWorker.ready;
        }
      });

      // 1. Connexion enseignant + configuration PIN + synchronisation initiale
      await page.getByLabel('Identifiant').fill(fx.teacherUsername);
      await page.getByLabel('Mot de passe').fill(fx.teacherPassword);
      await page.getByRole('button', { name: 'Se connecter' }).click();

      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByText('Sécuriser ce poste avec un code PIN')).toBeVisible();
      await page.getByLabel('Code PIN (4 à 6 chiffres)').fill('1357');
      await page.getByLabel('Confirmer le code PIN').fill('1357');
      await page.getByRole('button', { name: 'Enregistrer le code PIN' }).click();
      await expect(page.getByText('Sécuriser ce poste avec un code PIN')).toBeHidden();

      // Navigation vers Saisie des notes -> pull automatique des 3 élèves
      await page.getByRole('link', { name: 'Saisie des notes', exact: true }).click();
      await expect(page).toHaveURL(/\/grades$/);
      await expect(page.getByText('BELLO Aminatou')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText('KAMGA Jean')).toBeVisible();
      await expect(page.getByText('TCHOUMI Paul')).toBeVisible();

      // 2. Passage hors-ligne : saisie décimale (15,5) + ABS, puis rechargement complet PWA + déverrouillage PIN
      await context.setOffline(true);
      await page.evaluate(() => window.dispatchEvent(new Event('offline')));
      await expect(page.getByTestId('network-badge')).toContainText('Hors ligne');

      const belloInput = page.getByLabel('Note pour BELLO Aminatou');
      await belloInput.click();
      await belloInput.fill('15,5');
      await belloInput.press('Enter');

      // Raccourci 'a' pour marquer KAMGA Absent
      const kamgaInput = page.getByLabel('Note pour KAMGA Jean');
      await expect(kamgaInput).toBeFocused();
      await kamgaInput.press('a');

      // Vérifie l'indicateur Outbox et le calcul client en direct ((15.5 + 0) / 2 = 7.75 / 20)
      await expect(page.getByTestId('sync-outbox-trigger')).toContainText('2 en attente');
      await expect(page.getByText('7,75 / 20')).toBeVisible();

      // Rechargement complet hors-ligne -> verrouillé PIN -> déverrouillage -> brouillons intacts
      await page.reload();
      await expect(page).toHaveURL(/\/lock$/);
      await page.getByLabel('Code PIN (4 à 6 chiffres)').fill('1357');
      await page.getByRole('button', { name: 'Déverrouiller' }).click();
      await expect(page).toHaveURL(/\/$/);

      await page.getByRole('link', { name: 'Saisie des notes', exact: true }).click();
      await expect(page).toHaveURL(/\/grades$/);
      await expect(page.getByLabel('Note pour BELLO Aminatou')).toHaveValue('15,5');
      await expect(page.getByTestId('sync-outbox-trigger')).toContainText('2 en attente');

      // 3. Retour en ligne -> reprise de connexion & synchronisation automatique de la file Outbox
      await context.setOffline(false);
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await expect(page.getByTestId('network-badge')).toContainText('En ligne');
      await expect(page.getByTestId('sync-outbox-trigger')).toContainText('Synchronisé', {
        timeout: 10_000,
      });

      // Modification d'une note déjà synchronisée -> exige le motif d'audit
      const syncedBelloInput = page.getByLabel('Note pour BELLO Aminatou');
      await syncedBelloInput.click();
      await syncedBelloInput.fill('17');
      await syncedBelloInput.press('Enter');

      await expect(page.getByText('Motif de modification obligatoire')).toBeVisible();
      await page.getByRole('button', { name: 'Recomptage copie' }).click();
      const reasonPushDone = page.waitForResponse(
        (res) => res.url().includes('/api/sync/push') && res.status() === 200,
      );
      await page.getByRole('button', { name: 'Enregistrer la modification' }).click();
      await reasonPushDone;

      await expect(page.getByTestId('sync-outbox-trigger')).toContainText('Synchronisé', {
        timeout: 10_000,
      });

      // 4. Conflit verrouillage concurrent : l'admin verrouille S1 pendant que l'enseignant est hors-ligne
      await context.setOffline(true);
      await page.evaluate(() => window.dispatchEvent(new Event('offline')));
      await expect(page.getByTestId('network-badge')).toContainText('Hors ligne');

      const tchoumiInput = page.getByLabel('Note pour TCHOUMI Paul');
      await tchoumiInput.click();
      await tchoumiInput.fill('18');
      await tchoumiInput.press('Enter');
      await expect(page.getByTestId('sync-outbox-trigger')).toContainText('1 en attente');

      // Admin verrouille Séquence 1 côté serveur
      const lockRes = await request.post(`/api/periods/${fx.seq1Id}/lock`, {
        headers: { Authorization: `Bearer ${fx.adminToken}` },
        data: { reason: 'Clôture E2E' },
      });
      expect(lockRes.ok()).toBeTruthy();

      // Reconnexion -> la synchronisation automatique détecte rejected_locked et affiche le rejet
      await context.setOffline(false);
      await page.evaluate(() => window.dispatchEvent(new Event('online')));

      await expect(page.getByTestId('sync-outbox-trigger')).toContainText('1 rejet(s)', {
        timeout: 10_000,
      });
      await page.getByTestId('sync-outbox-trigger').click();
      await expect(page.getByText('Séquence verrouillée', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Abandonner' }).click();
      await expect(page.getByText('Tout est à jour')).toBeVisible();
      await page.getByRole('button', { name: 'Fermer' }).first().click();

      await expect(page.getByText('Séquence verrouillée : lecture seule').first()).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
