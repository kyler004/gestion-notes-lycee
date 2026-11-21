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
    logoutPendingTitle: 'Notes non synchronisées sur ce poste',
    logoutPendingBody:
      '{count} modification(s) locale(s) n’ont pas encore été envoyées au serveur. Pour conserver vos brouillons, utilisez « Changer d’utilisateur » ou verrouillez votre session.',
    logoutSyncAndExit: 'Synchroniser et quitter',
    logoutConfirmForce: 'Quitter sans synchroniser',
    logoutCancel: 'Rester connecté',
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
  sync: {
    synced: 'Synchronisé',
    syncing: 'Synchronisation…',
    pendingCount: '{count} en attente',
    failedCount: '{count} rejet(s)',
    syncNow: 'Synchroniser',
    outboxTitle: 'File de synchronisation (Outbox)',
    outboxSubtitle:
      'Suivez vos modifications hors-ligne et résolvez les éventuels refus serveur.',
    lastSyncLabel: 'Dernière synchronisation :',
    neverSynced: 'Jamais synchronisé',
    emptyOutboxTitle: 'Tout est à jour',
    emptyOutboxBody:
      'Toutes vos saisies locales ont été transmises et validées par le serveur.',
    statusPending: 'En attente',
    statusSyncing: 'Envoi…',
    statusFailed: 'Refusé',
    outcomeLocked: 'Séquence verrouillée',
    outcomeForbidden: 'Accès refusé',
    outcomeValidation: 'Validation requise',
    retryAction: 'Réessayer',
    discardAction: 'Abandonner',
    reasonPlaceholder: 'Motif de correction (ex. Recomptage copie)…',
    syncSuccess: 'Synchronisation terminée.',
    syncPartialFailure: '{count} note(s) refusée(s) par le serveur. Vérifiez la file Outbox.',
    closeDialog: 'Fermer',
  },
  grades: {
    pageTitle: 'Saisie des notes',
    pageSubtitle: 'Année {year} · Saisie hors-ligne et calcul instantané des moyennes',
    pageSubtitleEmpty: 'Espace de saisie et de consultation hors-ligne des notes sur /20',
    classLabel: 'Classe',
    classPlaceholder: 'Choisir une classe',
    subjectLabel: 'Matière',
    subjectPlaceholder: 'Choisir une matière',
    sequenceLabel: 'Séquence',
    sequencePlaceholder: 'Choisir une séquence',
    searchPlaceholder: 'Rechercher un élève (nom, prénom ou matricule)…',
    filterAll: 'Tous ({count})',
    filterMissing: 'Non saisis ({count})',
    filterAttention: 'À synchroniser ({count})',
    lockedBannerTitle: 'Séquence verrouillée : lecture seule',
    lockedBannerBody:
      'La période sélectionnée (ou son trimestre parent) est verrouillée. La consultation et le calcul restent disponibles, mais les notes ne peuvent plus être modifiées.',
    batchReasonLabel: 'Motif pour modifier une note déjà synchronisée',
    batchReasonHint: 'Renseignez un motif ici pour enchaîner plusieurs corrections sans fenêtre de confirmation.',
    reasonPresets: {
      typo: 'Correction erreur de saisie',
      recount: 'Recomptage copie',
      justified: 'Justificatif reçu',
    },
    reasonModalTitle: 'Motif de modification obligatoire',
    reasonModalDesc:
      'Cette note est déjà enregistrée sur le serveur. Indiquez la raison de la modification pour le journal d’audit.',
    reasonModalStudent: 'Élève : {name}',
    reasonModalChange: 'Nouvelle valeur : {value}',
    reasonInputLabel: 'Motif de correction',
    reasonMinError: 'Veuillez saisir un motif de correction.',
    reasonConfirm: 'Enregistrer la modification',
    reasonCancel: 'Annuler',
    appreciationModalTitle: 'Appréciation personnalisée',
    appreciationModalDesc:
      'Laissez vide pour utiliser l’appréciation automatique issue du barème ({auto}).',
    appreciationLabel: 'Appréciation enseignant',
    appreciationPlaceholder: 'ex. Très bon trimestre, participe activement…',
    appreciationSave: 'Enregistrer',
    statFilled: 'Notes saisies',
    statAverage: 'Moyenne classe',
    statPassRate: 'Réussite (≥ {threshold}/20)',
    statMinMax: 'Min / Max',
    colIndex: '#',
    colStudent: 'Élève',
    colStatus: 'Statut',
    colScore: 'Note / 20',
    colAppreciation: 'Appréciation',
    colRank: 'Rang',
    colSync: 'Sync',
    statusPresent: 'Présent',
    statusAbsent: 'ABS',
    statusExcused: 'EXC',
    repeaterTag: 'Red.',
    inactiveTag: 'Inactif',
    keyboardHint:
      'Navigation clavier : Entrée ou ↑/↓ entre les élèves · Virgule ou point accepté · A = Absent · E = Excusé',
    emptyNoSyncTitle: 'Synchronisation requise',
    emptyNoSyncBody:
      'Aucune donnée locale n’a encore été téléchargée. Cliquez sur « Synchroniser » en étant en ligne pour charger vos classes et listes d’élèves.',
    emptyNoAssignmentsTitle: 'Aucune affectation active',
    emptyNoAssignmentsBody:
      'Aucune classe ou matière ne vous est actuellement affectée pour cette année scolaire.',
    emptyNoStudentsTitle: 'Aucun élève inscrit',
    emptyNoStudentsBody:
      'Cette classe ne contient pas encore d’élèves actifs pour la période sélectionnée.',
    emptyNoFilterMatch: 'Aucun élève ne correspond au filtre actuel.',
    resetFilters: 'Réinitialiser les filtres',
  },
  dashboard: {
    welcome: 'Bonjour, {name}',
    roleSummary: 'Rôle actif : {role}',
    milestoneNoticeTitle: 'Saisie hors-ligne et synchronisation prêtes (Jalon 2)',
    milestoneNoticeBody:
      'La grille de saisie clavier sur /20, le calcul instantané @lycee/shared et la file hors-ligne Outbox sont actifs.',
    nextStepsTitle: 'Modules prévus pour votre rôle',
    cards: {
      gradesTitle: 'Saisie des notes hors-ligne',
      gradesDesc: 'Grille clavier rapide sur /20 avec calcul instantané des moyennes et file Outbox.',
      gradesPhase: 'Disponible',
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
