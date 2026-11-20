import type { UserRole } from '@lycee/shared';

export const fr = {
  app: {
    name: 'Gestion des Notes',
    subtitle: 'Lycée — Espace pédagogique',
    loading: 'Chargement de la session…',
    online: 'En ligne',
    offline: 'Hors ligne',
    offlineBanner: 'Mode hors-ligne actif. Les données locales restent disponibles.',
  },
  roles: {
    admin: 'Administrateur',
    censor: 'Censeur',
    principal: 'Proviseur',
    teacher: 'Enseignant',
    secretary: 'Secrétariat',
  } satisfies Record<UserRole, string>,
  nav: {
    dashboard: 'Tableau de bord',
    grades: 'Saisie des notes',
    classes: 'Classes & Élèves',
    subjects: 'Matières & Affectations',
    academic: 'Année scolaire & Périodes',
    validation: 'Validation & Verrouillage',
    reports: 'Bulletins & Résultats',
    users: 'Utilisateurs',
    school: 'Établissement',
    lockScreen: 'Verrouiller',
    setupPin: 'Configurer un code PIN',
    changePin: 'Modifier le code PIN',
    switchUser: "Changer d'utilisateur",
    logout: 'Déconnexion',
    logoutAll: 'Déconnecter tous les appareils',
  },
  auth: {
    loginTitle: 'Connexion à l’établissement',
    loginSubtitle: 'Connectez-vous en ligne pour synchroniser votre espace de travail.',
    usernameLabel: 'Identifiant',
    usernamePlaceholder: 'ex. admin ou j.dupont',
    passwordLabel: 'Mot de passe',
    passwordPlaceholder: 'Votre mot de passe',
    deviceLabel: 'Poste (optionnel)',
    devicePlaceholder: 'ex. Salle des profs - PC 2',
    submitLogin: 'Se connecter',
    submittingLogin: 'Connexion en cours…',
    offlineLoginDisabled:
      'Connexion impossible hors ligne. Sélectionnez un compte local avec code PIN ou rétablissez la connexion.',
    savedAccountsTitle: 'Comptes enregistrés sur ce poste',
    savedAccountsHint: 'Déverrouillez rapidement avec votre code PIN ou reconnectez-vous.',
    useSavedAccount: 'Déverrouiller',
    forgetSavedAccount: 'Oublier ce compte',
    invalidCredentials: 'Identifiant ou mot de passe incorrect.',
    rateLimited: 'Trop de tentatives. Réessayez dans {seconds} s.',
    networkError: 'Serveur inaccessible. Vérifiez votre connexion réseau.',
    sessionRevoked:
      'Votre session a expiré ou été révoquée. Reconnectez-vous en ligne ; vos brouillons locaux sont conservés.',
    pinLockedOut:
      'Nombre maximal de tentatives PIN atteint. Veuillez vous reconnecter en ligne.',
    logoutSuccess: 'Déconnexion effectuée.',
  },
  pin: {
    setupTitle: 'Sécuriser ce poste avec un code PIN',
    setupDescription:
      'Choisissez un code PIN à 4 à 6 chiffres pour verrouiller et déverrouiller rapidement votre session hors-ligne.',
    pinLabel: 'Code PIN (4 à 6 chiffres)',
    confirmPinLabel: 'Confirmer le code PIN',
    pinMismatch: 'Les deux codes PIN ne correspondent pas.',
    pinInvalidFormat: 'Le code PIN doit contenir entre 4 et 6 chiffres.',
    savePin: 'Enregistrer le code PIN',
    skipPin: 'Plus tard',
    setupSuccess: 'Code PIN enregistré.',
    lockTitle: 'Session verrouillée',
    lockSubtitle: 'Saisissez votre code PIN pour reprendre votre session.',
    unlockButton: 'Déverrouiller',
    wrongPin: 'Code PIN incorrect. {remaining} tentative(s) restante(s).',
    forgotPinLink: 'Code PIN oublié ? Se reconnecter avec mot de passe',
  },
  pwa: {
    updateTitle: 'Mise à jour disponible',
    updateDescription:
      'Une nouvelle version de l’application est prête. Enregistrez votre saisie avant de recharger.',
    updateAction: 'Mettre à jour',
    dismissAction: 'Plus tard',
    offlineReady: 'Application prête pour une utilisation hors-ligne.',
  },
  dashboard: {
    welcome: 'Bonjour, {name}',
    roleSummary: 'Rôle actif : {role}',
    milestoneNoticeTitle: 'Socle applicatif opérationnel (Jalon 1)',
    milestoneNoticeBody:
      'L’authentification, le verrouillage PIN hors-ligne, la garde par rôle et le mode PWA sont actifs. Les écrans métier seront activés dans les prochains jalons.',
    nextStepsTitle: 'Modules prévus pour votre rôle',
    cards: {
      gradesTitle: 'Saisie des notes hors-ligne',
      gradesDesc: 'Grille clavier rapide sur /20 avec calcul instantané des moyennes et file Outbox.',
      gradesPhase: 'Jalon 2',
      adminTitle: 'Paramétrage de l’établissement',
      adminDesc: 'Année scolaire, trimestres/séquences, classes, élèves, matières et affectations.',
      adminPhase: 'Jalon 3',
      reportsTitle: 'Validation & Bulletins PDF',
      reportsDesc: 'Verrouillage des séquences, tableaux d’honneur et génération Typst.',
      reportsPhase: 'Jalon 4',
    },
  },
  errors: {
    forbiddenTitle: 'Accès non autorisé',
    forbiddenDescription:
      'Votre rôle actuel ne permet pas d’accéder à cette section.',
    backHome: 'Retour au tableau de bord',
    notFoundTitle: 'Page introuvable',
    notFoundDescription: 'La page demandée n’existe pas ou a été déplacée.',
  },
} as const;

type NestedKeyOf<T> = T extends string
  ? never
  : {
      [K in keyof T & string]: T[K] extends string
        ? K
        : `${K}.${NestedKeyOf<T[K]>}`;
    }[keyof T & string];

export type TranslationKey = NestedKeyOf<typeof fr>;

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return path;
    }
  }
  return typeof current === 'string' ? current : path;
}

export function t(key: TranslationKey, params?: Record<string, string | number>): string {
  let text = getNestedValue(fr as unknown as Record<string, unknown>, key);
  if (!params) return text;
  for (const [paramKey, paramValue] of Object.entries(params)) {
    text = text.replaceAll(`{${paramKey}}`, String(paramValue));
  }
  return text;
}
