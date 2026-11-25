import { expect, test } from '@playwright/test';

// PNG 1x1 authentique (octets magiques PNG valides + chunks IHDR/IDAT/IEND)
const ONE_PX_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test.describe('School & Academic Administration (Milestone 3)', () => {
  test('configures school & logo, creates teacher/class/subject/assignment & student, then verifies teacher view on /grades', async ({
    browser,
  }) => {
    const tag = `${Date.now().toString(36)}adm`;
    const schoolName = `Lycée Pilote ${tag}`;
    const teacherUsername = `prof.${tag}`;
    const teacherName = `Mme Fotso ${tag}`;
    const teacherPassword = 'ProfLycee2026!';
    const className = `Tle C ${tag}`;
    const subjectCode = `PHY-${tag}`.slice(0, 16);
    const subjectName = `Physique ${tag}`;
    const matricule = `MAT-${tag}`.slice(0, 20);

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto('/');
      await expect(page).toHaveURL(/\/login$/);

      // 1. Connexion en administrateur
      await page.getByLabel('Identifiant').fill('admin');
      await page.getByLabel('Mot de passe').fill('AdminLycee2026!');
      await page.getByRole('button', { name: 'Se connecter' }).click();

      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByText('Sécuriser ce poste avec un code PIN')).toBeVisible();
      await page.getByLabel('Code PIN (4 à 6 chiffres)').fill('1357');
      await page.getByLabel('Confirmer le code PIN').fill('1357');
      await page.getByRole('button', { name: 'Enregistrer le code PIN' }).click();
      await expect(page.getByText('Sécuriser ce poste avec un code PIN')).toBeHidden();

      // 2. Ouverture de /admin et configuration de l'établissement + upload logo PNG
      await page.getByRole('link', { name: 'Administration', exact: true }).click();
      await expect(page).toHaveURL(/\/admin/);

      const schoolInput = page.getByLabel('Nom de l’établissement');
      await expect(schoolInput).toBeVisible();
      await schoolInput.fill(schoolName);
      await page.getByRole('button', { name: 'Enregistrer' }).click();
      await expect(page.getByText('Profil de l’établissement enregistré.')).toBeVisible();

      await page.getByTestId('school-logo-input').setInputFiles({
        name: 'blason.png',
        mimeType: 'image/png',
        buffer: ONE_PX_PNG_BUFFER,
      });
      await expect(page.getByAltText('Logo officiel (PNG / JPEG)')).toBeVisible({
        timeout: 10_000,
      });

      // Vérifie persistance profil + logo après rechargement
      await page.reload();
      await expect(page.getByLabel('Nom de l’établissement')).toHaveValue(schoolName);
      await expect(page.getByAltText('Logo officiel (PNG / JPEG)')).toBeVisible();

      // 3. Création compte enseignant dans Utilisateurs
      await page.getByRole('tab', { name: 'Utilisateurs' }).click();
      await page.getByRole('button', { name: 'Nouvel utilisateur' }).click();
      const userDialog = page.getByRole('dialog');
      await userDialog.getByLabel('Identifiant de connexion').fill(teacherUsername);
      await userDialog.getByLabel('Nom complet').fill(teacherName);
      await userDialog.getByLabel('Mot de passe initial (min. 10 caractères)').fill(teacherPassword);
      await userDialog.getByRole('button', { name: 'Enregistrer' }).click();
      await expect(userDialog).toBeHidden();
      await expect(page.getByText(`@${teacherUsername}`)).toBeVisible();

      // 4. Création classe dans Classes
      await page.getByRole('tab', { name: 'Classes' }).click();
      await page.getByRole('button', { name: 'Nouvelle classe' }).click();
      const classDialog = page.getByRole('dialog');
      await classDialog.getByLabel('Nom de la classe').fill(className);
      await classDialog.getByLabel('Niveau').fill('Tle');
      await classDialog.getByLabel(/Série/).fill('C');
      await classDialog.getByRole('button', { name: /Professeur principal/ }).click();
      await page.getByRole('menuitem', { name: new RegExp(teacherName) }).click();
      await classDialog.getByRole('button', { name: 'Enregistrer' }).click();
      await expect(classDialog).toBeHidden();
      await expect(page.getByText(className)).toBeVisible();

      // 5. Création matière, coefficient classe & affectation dans Matières & Affectations
      await page.getByRole('tab', { name: 'Matières & Affectations' }).click();

      await page.getByRole('button', { name: 'Nouvelle matière' }).click();
      const subjectDialog = page.getByRole('dialog');
      await subjectDialog.getByLabel('Code').fill(subjectCode);
      await subjectDialog.getByLabel('Abréviation bulletin').fill('PHY');
      await subjectDialog.getByLabel('Intitulé complet').fill(subjectName);
      await subjectDialog.getByRole('button', { name: 'Enregistrer' }).click();
      await expect(subjectDialog).toBeHidden();
      await expect(page.getByText(subjectName)).toBeVisible();

      await page.getByRole('button', { name: /Classe sélectionnée/ }).click();
      await page.getByRole('menuitem', { name: className }).click();
      await page.getByRole('button', { name: 'Associer une matière' }).click();
      const csDialog = page.getByRole('dialog');
      await csDialog.getByRole('button', { name: /Matière/ }).click();
      await page.getByRole('menuitem', { name: new RegExp(subjectName) }).click();
      await csDialog.getByLabel('Coefficient').fill('5');
      await csDialog.getByRole('button', { name: 'Enregistrer' }).click();
      await expect(csDialog).toBeHidden();
      await expect(page.getByText('Total coefficients : 5')).toBeVisible();

      await page.getByRole('button', { name: 'Affecter un enseignant' }).click();
      const assignDialog = page.getByRole('dialog');
      await assignDialog.getByRole('button', { name: /Nom de la classe/ }).click();
      await page.getByRole('menuitem', { name: className }).click();
      const classSubjTrigger = assignDialog.getByRole('button', { name: /Matière de la classe/ });
      await expect(classSubjTrigger).not.toContainText('Chargement');
      await classSubjTrigger.click();
      await page.getByRole('menuitem', { name: new RegExp(subjectName) }).click();
      await assignDialog.getByRole('button', { name: /Enseignant/ }).click();
      await page.getByRole('menuitem', { name: new RegExp(teacherName) }).click();
      await assignDialog.getByRole('button', { name: 'Enregistrer' }).click();
      await expect(assignDialog).toBeHidden();
      await expect(page.getByText(teacherName).first()).toBeVisible();

      // 6. Création élève + import CSV dans Élèves & Inscriptions
      await page.getByRole('tab', { name: 'Élèves & Inscriptions' }).click();
      await expect(page.getByText('Effectif par classe')).toBeVisible();
      const classDropdown = page.getByRole('button', { name: /^Classe\s/ });
      await expect(classDropdown).toBeVisible();
      await classDropdown.click();
      await page.getByRole('menuitem', { name: className }).click();

      await page.getByRole('button', { name: 'Nouvel élève' }).click();
      const studentDialog = page.getByRole('dialog');
      await studentDialog.getByLabel('Matricule').fill(matricule);
      await studentDialog.getByLabel('Nom', { exact: true }).fill('NDONGO');
      await studentDialog.getByLabel('Prénom(s)').fill('Claire');
      await studentDialog.getByLabel('Lieu de naissance').fill('Bafoussam');
      await studentDialog.getByRole('button', { name: 'Enregistrer' }).click();
      await expect(studentDialog).toBeHidden();
      await expect(page.getByText('NDONGO Claire').first()).toBeVisible();

      const csvMatricule = `CSV-${tag}`.slice(0, 20);
      await page.getByRole('button', { name: 'Importer CSV' }).click();
      const csvDialog = page.getByRole('dialog');
      await csvDialog
        .getByLabel('Contenu CSV')
        .fill(`matricule;nom;prenom;date_naissance;lieu_naissance;sexe;redoublant\n${csvMatricule};TCHOUA;Marc;12/04/2009;Douala;M;non`);
      await csvDialog.getByRole('button', { name: 'Analyser le fichier (aperçu)' }).click();
      await expect(csvDialog.getByText('TCHOUA Marc')).toBeVisible();
      await csvDialog.getByRole('button', { name: 'Confirmer l’import (1)' }).click();
      await expect(csvDialog).toBeHidden();
      await expect(page.getByText('TCHOUA Marc').first()).toBeVisible();

      // 7. Déconnexion puis connexion avec le nouvel enseignant -> vérification sur /grades
      await page.getByRole('button', { name: 'Déconnexion' }).click();
      await expect(page).toHaveURL(/\/login$/);

      await page.getByLabel('Identifiant').fill(teacherUsername);
      await page.getByLabel('Mot de passe').fill(teacherPassword);
      await page.getByRole('button', { name: 'Se connecter' }).click();

      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByText('Sécuriser ce poste avec un code PIN')).toBeVisible();
      await page.getByRole('button', { name: 'Plus tard' }).click();
      await expect(page.getByText('Sécuriser ce poste avec un code PIN')).toBeHidden();

      await page.getByRole('link', { name: 'Saisie des notes', exact: true }).click();
      await expect(page).toHaveURL(/\/grades$/);

      await expect(page.getByText('NDONGO Claire')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText('TCHOUA Marc')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole('button', { name: new RegExp(className) })).toBeVisible();
      await expect(page.getByRole('button', { name: new RegExp(subjectName) })).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
