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
});
