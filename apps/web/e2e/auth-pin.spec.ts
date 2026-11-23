import { expect, test } from '@playwright/test';

test.describe('Auth, PIN lock, offline reload & shared-PC switching', () => {
  test('logs in, configures PIN, locks, unlocks offline after reload, and switches user', async ({
    page,
    context,
  }) => {
    await page.goto('/');

    // Redirigé vers /login
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText('Connexion à l’établissement')).toBeVisible();

    // Attend que le Service Worker PWA soit actif pour garantir le démarrage hors-ligne
    await page.evaluate(async () => {
      if ('serviceWorker' in navigator) {
        await navigator.serviceWorker.ready;
      }
    });

    // Connexion avec le compte administrateur initial du seed
    await page.getByLabel('Identifiant').fill('admin');
    await page.getByLabel('Mot de passe').fill('AdminLycee2026!');
    await page.getByRole('button', { name: 'Se connecter' }).click();

    // Accès au tableau de bord + modale de configuration PIN
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText('Bonjour, Administrateur Principal')).toBeVisible();
    await expect(page.getByText('Sécuriser ce poste avec un code PIN')).toBeVisible();

    await page.getByLabel('Code PIN (4 à 6 chiffres)').fill('2468');
    await page.getByLabel('Confirmer le code PIN').fill('2468');
    await page.getByRole('button', { name: 'Enregistrer le code PIN' }).click();

    await expect(page.getByText('Sécuriser ce poste avec un code PIN')).toBeHidden();

    // Verrouillage manuel de la session
    await page.getByRole('button', { name: 'Verrouiller' }).click();
    await expect(page).toHaveURL(/\/lock$/);
    await expect(page.getByText('Session verrouillée')).toBeVisible();

    // Passage hors-ligne + rechargement complet de la PWA depuis le Service Worker
    await context.setOffline(true);
    await page.reload();

    await expect(page).toHaveURL(/\/lock$/);
    await expect(page.getByTestId('network-badge')).toContainText('Hors ligne');

    // Déverrouillage hors-ligne via code PIN
    await page.getByLabel('Code PIN (4 à 6 chiffres)').fill('2468');
    await page.getByRole('button', { name: 'Déverrouiller' }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText('Bonjour, Administrateur Principal')).toBeVisible();
    await expect(page.getByTestId('network-badge')).toContainText('Hors ligne');

    // Retour en ligne + rechargement pour vérifier la reprise de session serveur
    await context.setOffline(false);
    await page.reload();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('network-badge')).toContainText('En ligne');

    await page.getByRole('button', { name: "Changer d'utilisateur" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText('Comptes enregistrés sur ce poste')).toBeVisible();
    await expect(page.getByText('Administrateur Principal')).toBeVisible();
  });

  test('blocks /design-system in production build and supports self-service password change', async ({
    page,
    request,
  }) => {
    const tag = `${Date.now().toString(36)}pw`;
    const username = `prof.${tag}`;
    const initialPassword = 'InitPass2026!';
    const updatedPassword = 'NewPass2026!';

    const adminLogin = await request.post('/api/auth/login', {
      data: { username: 'admin', password: 'AdminLycee2026!' },
    });
    expect(adminLogin.ok()).toBeTruthy();
    const { accessToken } = (await adminLogin.json()) as { accessToken: string };

    const createUserRes = await request.post('/api/users', {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        username,
        fullName: `Compte Test ${tag}`,
        role: 'teacher',
        password: initialPassword,
        isActive: true,
      },
    });
    expect(createUserRes.status()).toBe(201);

    // /design-system doit rediriger vers /login sur le build de production
    await page.goto('/design-system');
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel('Identifiant').fill(username);
    await page.getByLabel('Mot de passe').fill(initialPassword);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.getByRole('button', { name: 'Plus tard' }).click();

    await page.getByRole('button', { name: 'Modifier le mot de passe' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Mot de passe actuel').fill(initialPassword);
    await dialog.getByLabel('Nouveau mot de passe (min. 8 caractères)').fill(updatedPassword);
    await dialog.getByLabel('Confirmer le nouveau mot de passe').fill(updatedPassword);
    await dialog.getByRole('button', { name: 'Mettre à jour le mot de passe' }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByText('Mot de passe modifié. Connectez-vous avec votre nouveau mot de passe.'),
    ).toBeVisible();

    // L'ancien mot de passe échoue et le nouveau permet la reconnexion
    await page.getByLabel('Identifiant').fill(username);
    await page.getByLabel('Mot de passe').fill(updatedPassword);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText(`Bonjour, Compte Test ${tag}`)).toBeVisible();
  });
});
