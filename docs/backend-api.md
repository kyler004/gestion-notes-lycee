# Référence Backend & API — Gestion des Notes (Lycée)

- **Date :** 2026-11-24
- **Responsable :** Équipe backend
- **Périmètre :** `@lycee/shared` (contrat DTO, validation Zod, moteur de calcul camerounais) et `@lycee/api` (API HTTP Fastify v5, PostgreSQL/Drizzle, sync hors-ligne, rendu PDF Typst)

---

## 1. Vue d'ensemble et capacités

Le backend du MVP expose **69 endpoints HTTP** (`1` sonde `/health` + `68` routes `/api/*` réparties sur 10 modules) et s'appuie sur **21 tables PostgreSQL**, une séquence globale monotone `sync_seq` et **3 migrations Drizzle** (`0000` à `0002`).

| Composant | Chemin | Responsabilité |
| :--- | :--- | :--- |
| **Contrat & Calculateur** | `packages/shared/src/` | Types de domaine, schémas Zod partagés, calculateur `calculator.ts` (`sequence`, `trimester`, `annual`) |
| **Serveur Fastify** | `apps/api/src/app.ts` | Configuration Helmet CSP, CORS, rate-limiting, Pino `redact`, routes `/api/*` et fallback SPA (`apps/web/dist`) |
| **Schéma & Migrations** | `apps/api/src/db/` | 21 tables PostgreSQL (`ON DELETE RESTRICT`, `CHECK`, index uniques partiels/`lower()`), `migrate.ts` verrouillé par `pg_advisory_lock(948272)` |
| **Rendu PDF Typst** | `apps/api/src/services/pdf.service.ts`, `apps/api/src/templates/` | 3 gabarits (`bulletin.typ`, `class-list.typ`, `honor-roll.typ`) compilés sans shell (`--root tempDir`) |
| **Parseur CSV natif** | `apps/api/src/lib/csv.ts` | Import RFC 4180 (BOM UTF-8, `,`/`;`, champs entre guillemets, dates `YYYY-MM-DD` / `DD/MM/YYYY`, 500 lignes max) |

---

## 2. Configuration environnement (`apps/api/src/config/env.ts`)

| Variable | Défaut (dev) | Contraintes & Comportement |
| :--- | :--- | :--- |
| `NODE_ENV`, `HOST`, `PORT` | `development`, `0.0.0.0`, `3000` | `PORT` entier `1..65535` |
| `DATABASE_URL` | Postgres local par défaut | Valeur par défaut interdite en `production` |
| `JWT_ACCESS_SECRET` | Secret dev | En `production` : **`>= 32` car.**, **`>= 10` caractères distincts**, valeurs connues/faibles rejetées |
| `JWT_REFRESH_SECRET` | Secret dev | Clé HMAC-SHA256 (*pepper*) des refresh tokens ; en `production` : **`>= 32` car.**, **`>= 10` car. distincts**, valeurs faibles rejetées |
| `JWT_ACCESS_TTL` | `15m` | Regex stricte `1m..60m` |
| `JWT_REFRESH_TTL_DAYS` / `JWT_REFRESH_MAX_SESSION_DAYS` | `30` / `90` | Expiration glissante + plafond absolu `sessionExpiresAt` (`1..365` jours) |
| `TRUST_PROXY` | `false` | `'true'` **interdit** ; accepte `'false'`, entier `0..10` (sauts), ou liste IP/CIDR/`loopback`/`linklocal`/`uniquelocal` |
| `CORS_ORIGIN` | `http://localhost:5173` | `'*'` **interdit** en `production` ; origines `http`/`https` validées par `new URL()`, ou `'none'`/`'false'` |
| `AUTO_SEED` & `ADMIN_INITIAL_*` | `false`, `admin` / `AdminLycee2026!` | Seed au boot désactivé par défaut (`db:seed` dédié) ; en `production`, mot de passe initial **`>= 12` car.** et non par défaut |
| `TYPST_BIN` | `typst` | Chemin vers le binaire CLI `typst` (`v0.12.0` dans l'image Docker) |

---

## 3. Base de données PostgreSQL & Migrations

### 3.1 Tables (`21`) et séquence globale (`sync_seq`)

- **Établissement & Auth (`3`)** : `school_profile` (singleton `id = 1`, logo en `bytea`), `users` (`token_version`, unicité insensible à la casse sur `username` et `email`), `refresh_tokens` (hash HMAC-SHA256 unique, `family_id`, `replaced_by_id`, `session_expires_at`, `ON DELETE CASCADE`).
- **Structure académique & Matières (`9`)** : `academic_years` (`end_date > start_date`, unicité d'une seule année active), `grading_rules` (1:1 année, pondérations et tranches d'appréciation JSONB), `periods` (FK auto-référentielle `parent_period_id RESTRICT`, `type`, `status`, `weight > 0`), `period_audit_logs`, `classes`, `subject_groups`, `subjects`, `class_subjects` (`0 < coefficient <= 20`), `teacher_assignments` (activation logique `is_active`).
- **Scolarité, Notes & Sync (`5`)** : `students` (`matricule` unique), `enrollments` (unique `(student_id, academic_year_id)`), `grades` (`0 <= score <= 20`, cohérence `status`/`score`), `grade_audit_logs`, `sync_operations` (PK composite `(user_id, operation_id)`).
- **Validation, Conseil & Snapshots (`4`)** : `council_decisions` (`0 <= absences_hours <= 5000`), `council_decision_audit_logs`, `period_student_results` & `period_subject_results` (résultats officiels figés lors du verrouillage, incluant `sequence_scores_json`).
- **Horloge logique (`sync_seq`)** : séquence `BIGINT` incrémentée sous verrou consultatif transactionnel `pg_advisory_xact_lock(948271)` pour garantir l'ordre strict des curseurs de delta-sync.

### 3.2 Historique des migrations Drizzle (`apps/api/drizzle/`)

1. `0000_gifted_black_queen.sql` : schéma initial complet des 21 tables et de `sync_seq`.
2. `0001_wakeful_groot.sql` : passage des clés étrangères métier/audit/snapshots en `ON DELETE RESTRICT`, contrainte FK auto-référentielle `periods.parent_period_id`, contraintes SQL `CHECK`, PK composite `sync_operations(user_id, operation_id)`, table `council_decision_audit_logs` et colonne `users.token_version`.
3. `0002_nice_king_bedlam.sql` : index unique partiel `academic_years_single_active_uidx` (`WHERE is_active = true`) et index uniques insensibles à la casse `users_username_lower_uidx` (`lower(username)`) et `users_email_lower_uidx` (`lower(email) WHERE email IS NOT NULL`).

> `apps/api/src/db/migrate.ts` sérialise l'exécution de Drizzle `migrate()` via `pg_advisory_lock(948272)` avec `connectionTimeoutMillis: 10_000` et `statement_timeout: 60_000`.

---

## 4. Catalogue des 69 endpoints HTTP

> Sauf mention contraire, les routes paginées acceptent `limit` (`1..200`, défaut `100`) et `offset` (`>= 0`, défaut `0`). Tous les identifiants sont validés en `UUID`. Le format d'erreur uniforme est `{ error: { code, message, details? } }`.

### 4.1 Système & Authentification (`7` endpoints)

| Méthode & Route | RBAC | Rate Limit | Description |
| :--- | :--- | :--- | :--- |
| `GET /health` | Public | Global (`200/m`) | Exécute `SELECT 1` sur PostgreSQL |
| `POST /api/auth/login` | Public | `10/15m` (`ip:username`) + `30/1m` (`ip`) | Login insensible à la casse (`lower(username)`), hash factice si inexistant, `401` uniforme si inactif, mise à niveau `scrypt`, max `10` sessions actives |
| `POST /api/auth/refresh` | Public | `30/1m` par IP | Format jeton `/^[A-Za-z0-9_-]{32,128}$/`, rotation atomique HMAC-SHA256, détection de réutilisation révoquant toute la `familyId`, borné par `sessionExpiresAt` |
| `POST /api/auth/logout` | Public | `30/1m` par IP | Révoque toute la famille (`familyId`) du refresh token fourni |
| `POST /api/auth/logout-all` | Authentifié | `15/1m` par `userId` | Incrémente `users.tokenVersion` et révoque tous les refresh tokens du compte |
| `GET /api/auth/me` | Authentifié | Global | Retourne `AuthUserPayload` rafraîchi depuis PostgreSQL |
| `POST /api/auth/change-password` | Authentifié | `5/15m` par `userId` | Exige `newPassword >= 10` car. (lettre + chiffre), différent de l'actuel et du `username` ; incrémente `tokenVersion` et révoque les refresh tokens |

### 4.2 Utilisateurs & Profil Établissement (`8` endpoints)

| Méthode & Route | RBAC | Description |
| :--- | :--- | :--- |
| `GET /api/users` | `admin`, `censor`, `principal`, `secretary` | Liste paginée (`?role=`). **`secretary` restreint strictement à `role=teacher` (`403` si autre rôle demandé)** |
| `POST /api/users` | `admin`, `censor` | Crée un compte (`censor` limité à `teacher`/`secretary`). Unicité `username`/`email` insensible à la casse (`409`) |
| `PATCH /api/users/:id` | `admin`, `censor` | Interdit l'auto-modification de `role`/`isActive` et le retrait du dernier `admin` actif (`409`). **Tout changement de rôle ou désactivation incrémente `tokenVersion` et révoque les refresh tokens** |
| `POST /api/users/:id/reset-password` | `admin` | Mot de passe fort (`>= 10` car., lettre + chiffre, différent de `username`), incrémente `tokenVersion` et révoque les refresh tokens |
| `GET /api/school` | Authentifié | Profil établissement singleton (ou valeurs camerounaises par défaut) + `hasLogo` |
| `PUT /api/school` | `admin` | Met à jour les métadonnées de l'établissement |
| `PUT /api/school/logo` | `admin` | Upload logo (`png`/`jpeg` strict, `<= 512 Ko`, base64 canonique, vérification des magic bytes) |
| `GET /api/school/logo` | Authentifié | Sert le logo (`CSP: default-src 'none'; sandbox`, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`) |

### 4.3 Structure Académique (`11` endpoints)

| Méthode & Route | RBAC | Description |
| :--- | :--- | :--- |
| `GET /api/academic-years` | Authentifié | Liste des années scolaires (tri décroissant sur `startDate`) |
| `POST /api/academic-years` | `admin`, `censor` | Crée une année scolaire et initialise par défaut `T1..T3`, `S1..S6` et les `grading_rules` camerounaises |
| `PATCH /api/academic-years/:id/activate` | `admin`, `censor` | Transaction atomique activant l'année cible (en cohérence avec `academic_years_single_active_uidx`) |
| `GET /api/academic-years/:yearId/grading-rules` | Authentifié | Retourne les règles de notation de l'année |
| `PUT /api/academic-years/:yearId/grading-rules` | `admin`, `censor` | Validation sémantique (`sequenceWeights.length === sequencesPerTrimester`, `trimesterWeights.length === trimestersCount`, ordre monotone des seuils, non-chevauchement des tranches). Bloqué (`409`) si une période de l'année est verrouillée |
| `GET /api/academic-years/:yearId/periods` | Authentifié | Liste ordonnée des trimestres et séquences |
| `POST /api/periods` | `admin`, `censor` | Crée une période (bloqué `409` si le trimestre parent est verrouillé) |
| `PATCH /api/periods/:id` | `admin`, `censor` | Modifie nom/poids (refuse `status` direct en `400`, bloqué `409` si la période, son parent ou un enfant est verrouillé) |
| `GET /api/classes` | Authentifié | Liste paginée filtrable par `academicYearId`. **`teacher` filtré à ses affectations actives ou classes où il est `mainTeacherId`** |
| `POST /api/classes` | `admin`, `censor` | Crée une classe (`mainTeacherId` validé `teacher` actif) |
| `PATCH /api/classes/:id` | `admin`, `censor` | Met à jour une classe (`mainTeacherId` validé `teacher` actif) |

### 4.4 Élèves, Inscriptions, Import CSV & Matières (`18` endpoints)

| Méthode & Route | RBAC | Description |
| :--- | :--- | :--- |
| `GET /api/students` | `admin`, `censor`, `principal`, `secretary` | Recherche `q` (`<= 100` car., jokers `ILIKE` échappés) sur matricule, nom, prénom |
| `POST /api/students` | `admin`, `censor`, `secretary` | Crée un élève (`birthDate` calendaire exacte, `matricule` unique) |
| `POST /api/students/import-csv` | `admin`, `censor`, `secretary` | Import CSV en masse (`10/1m` par `userId`, `<= 512 Ko`, `<= 500` lignes). Voir §5.5 |
| `PATCH /api/students/:id` | `admin`, `censor`, `secretary` | Met à jour l'état civil et incrémente `syncVersion` |
| `POST /api/enrollments` | `admin`, `censor`, `secretary` | Inscrit un élève actif dans une classe de l'année |
| `PATCH /api/enrollments/:id` | `admin`, `censor`, `secretary` | Met à jour statut / redoublement (changement `classId` bloqué `409` si notes/décisions/snapshots existent) |
| `GET /api/classes/:classId/students` | Authentifié | **Contrôle d'autorisation (`403`) vérifié avant l'existence (`404`)** ; `teacher` limité aux classes affectées ou `mainTeacherId` |
| `GET /api/subject-groups` | Authentifié | Liste les groupes de matières par année |
| `POST /api/subject-groups` | `admin`, `censor` | Crée un groupe de matières |
| `GET /api/subjects` | Authentifié | Liste les matières (`?activeOnly=`) |
| `POST /api/subjects` | `admin`, `censor` | Crée une matière (`code` unique) |
| `PATCH /api/subjects/:id` | `admin`, `censor` | Met à jour ou archive une matière |
| `GET /api/classes/:classId/subjects` | Authentifié | **Contrôle `403` avant `404`** ; `teacher` limité aux classes affectées ou `mainTeacherId` |
| `PUT /api/class-subjects` | `admin`, `censor` | Associe matière/groupe/coefficient (`0.01..20`) ; bloqué si matière inactive ou période verrouillée |
| `GET /api/teacher-assignments` | `admin`, `censor`, `principal` | Liste filtrable (`academicYearId`, `classId`, `teacherId`, `includeInactive`) |
| `POST /api/teacher-assignments` | `admin`, `censor` | Crée (`201`) ou réactive (`200`) une affectation pour un `teacher` actif |
| `DELETE /api/teacher-assignments/:id` | `admin`, `censor` | Désactivation logique (`isActive = false` + incrément `syncVersion`) |
| `GET /api/teachers/me/assignments` | Authentifié | Affectations actives de l'utilisateur courant |

### 4.5 Notes, Sync Hors-Ligne, Validation & Audit (`12` endpoints)

| Méthode & Route | RBAC | Description |
| :--- | :--- | :--- |
| `GET /api/grades` | `teacher`, `admin`, `censor`, `principal` | `secretary` refusé (`403`). Un `teacher` ne lit que ses `classSubjectId` actifs |
| `PUT /api/grades/bulk` | `teacher`, `admin`, `censor` | Lot `1..200` notes (`0..20` max 2 décimales) ; verrous `FOR SHARE` séquence+parent ; `reason` requis si note/statut modifié ; trace `grade_audit_logs` |
| `GET /api/grades/audit` | `admin`, `censor`, `principal` | Historique complet des modifications de notes (filtres `classId`, `periodId`, `enrollmentId`, `classSubjectId`) |
| `GET /api/sync/pull` | Authentifié | Delta incrémental (`since >= 0`, `limit 1..2000`) sous `REPEATABLE READ READ ONLY` ; backfill des nouvelles affectations enseignant ; aucune note/affectation/décision exposée à `secretary` |
| `POST /api/sync/push` | `teacher`, `admin`, `censor` | Lot `1..500` opérations `UPSERT_GRADE` ; idempotence PK `(user_id, operation_id)` ; statuts par op (`applied`, `duplicate`, `rejected_locked`, `rejected_forbidden`, `rejected_validation`) |
| `GET /api/periods/audit` | `admin`, `censor`, `principal` | **Nouveau :** journal des verrouillages et déverrouillages (`?academicYearId=&periodId=&action=locked\|unlocked`) |
| `GET /api/periods/:periodId/completeness` | `admin`, `censor`, `principal` | Taux de complétude par classe et matière sur une séquence ou un trimestre |
| `POST /api/periods/:periodId/lock` | `admin`, `censor`, `principal` | Verrouille `FOR UPDATE` période + parent/enfants, calcule et fige `period_student_results` et `period_subject_results`, trace `period_audit_logs` |
| `POST /api/periods/:periodId/unlock` | `admin`, `principal` | Déverrouillage exceptionnel (bloqué si trimestre parent verrouillé) avec `reason >= 5` car. ; purge les snapshots et trace `period_audit_logs` |
| `PUT /api/council-decisions/bulk` | `admin`, `censor`, `principal` | Lot `1..200` décisions/appréciations/absences (`FOR SHARE` période+parent, bloqué si verrouillé ou élève inactif) ; trace `council_decision_audit_logs` |
| `GET /api/council-decisions/audit` | `admin`, `censor`, `principal` | **Nouveau :** journal d'audit des décisions du conseil (`?academicYearId=&classId=&periodId=&enrollmentId=`) |
| `GET /api/council-decisions` | `admin`, `censor`, `principal`, `teacher` | Un `teacher` n'accède qu'aux classes dont il est `mainTeacherId` (`403` si `classId` non autorisé) |

### 4.6 Rapports JSON & Export PDF Typst (`13` endpoints)

> Tous les endpoints PDF appliquent un rate-limit de `15 req/min` par `userId`, un sémaphore Typst borné (`503 PDF_SERVICE_BUSY` en cas de saturation), des en-têtes `Cache-Control: private, no-store` et `ETag` SHA-256 canonique (`304 Not Modified`).

| Méthode & Route | RBAC | Description |
| :--- | :--- | :--- |
| `GET /api/reports/class-results` | `admin`, `censor`, `principal`, `secretary`, `teacher` *(mainTeacher)* | Résultats par classe et période (`sequence`/`trimester`, avec détail des séquences) |
| `GET /api/reports/honor-roll` | `admin`, `censor`, `principal`, `secretary`, `teacher` *(mainTeacher)* | Palmarès classé des élèves admissibles au tableau d'honneur |
| `GET /api/reports/school-stats` | `admin`, `censor`, `principal` | Statistiques globales et par classe de l'établissement (requêtes groupées) |
| `GET /api/reports/bulletins/student/:enrollmentId/pdf` | `admin`, `censor`, `principal`, `secretary`, `teacher` *(mainTeacher)* | Bulletin PDF individuel (`bulletin.typ`, filigrane `PROVISOIRE` si période ouverte) |
| `GET /api/reports/bulletins/class/:classId/pdf` | `admin`, `censor`, `principal`, `secretary` | Bulletins PDF consolidés de toute la classe |
| `GET /api/reports/honor-roll/:classId/pdf` | `admin`, `censor`, `principal`, `secretary` | Tableau d'honneur PDF (`honor-roll.typ`) |
| `GET /api/reports/class-list/:classId/pdf` | `admin`, `censor`, `principal`, `secretary`, `teacher` *(affecté ou mainTeacher)* | Liste nominative PDF de la classe (`class-list.typ`) |
| `GET /api/reports/annual/class-results` | `admin`, `censor`, `principal`, `secretary`, `teacher` *(mainTeacher)* | **Nouveau :** résultats annuels d'une classe (`?classId=`) consolidant `T1`/`T2`/`T3` et la moyenne annuelle pondérée |
| `GET /api/reports/annual/honor-roll` | `admin`, `censor`, `principal`, `secretary`, `teacher` *(mainTeacher)* | **Nouveau :** tableau d'honneur annuel d'une classe (`?classId=`) |
| `GET /api/reports/annual/school-stats` | `admin`, `censor`, `principal` | **Nouveau :** statistiques annuelles globales de l'établissement (`?academicYearId=`) |
| `GET /api/reports/annual/bulletins/student/:enrollmentId/pdf` | `admin`, `censor`, `principal`, `secretary`, `teacher` *(mainTeacher)* | **Nouveau :** bulletin annuel PDF individuel (colonnes `T1`/`T2`/`T3` + `Moy. An`) |
| `GET /api/reports/annual/bulletins/class/:classId/pdf` | `admin`, `censor`, `principal`, `secretary` | **Nouveau :** bulletins annuels PDF de toute la classe |
| `GET /api/reports/annual/honor-roll/:classId/pdf` | `admin`, `censor`, `principal`, `secretary` | **Nouveau :** tableau d'honneur annuel PDF de la classe |

---

## 5. Détails des systèmes clés et ajouts récents

### 5.1 Bulletins & Synthèses Annuelles (`/api/reports/annual/*`)
- Implémentés dans `apps/api/src/services/results.service.ts` et `apps/api/src/templates/bulletin.typ` avec les types rétrocompatibles `TrimesterScoreDetail` et `StudentTrimesterSummary` (`packages/shared/src/types/domain.ts`).
- Les moyennes trimestrielles `T1..Tn` sont lues prioritairement depuis les snapshots officiels figés (`period_subject_results` / `period_student_results`) lorsqu'ils existent, puis agrégées avec `trimesterWeights` pour produire la moyenne annuelle et le rang.
- La décision du conseil annuelle provient du dernier trimestre ordonné ; `absencesHours` cumule les heures de tous les trimestres ; `isOfficial` vaut `true` uniquement lorsque **tous** les trimestres configurés pour l'année sont verrouillés.

### 5.2 Consultation d'audit (`/api/periods/audit`, `/api/council-decisions/audit`)
- Complètent `GET /api/grades/audit` pour offrir une traçabilité consultable côté direction (`admin`, `censor`, `principal`).
- Retournent les entrées paginées triées du plus récent au plus ancien avec nom/identifiant de l'auteur (`actorName`, `actorUsername`), contexte classe/période/élève, valeurs avant/après et motif.

### 5.3 Import CSV en masse des élèves (`POST /api/students/import-csv`)
- Parseur RFC 4180 natif sans dépendance externe (`apps/api/src/lib/csv.ts`) :
  - Gère le BOM UTF-8, le choix de délimiteur (`auto` | `,` | `;`), les champs entre guillemets et guillemets doublés `""`, les retours ligne `CRLF`/`LF` et rejette tout octet nul `\0` ou caractère de contrôle.
  - Plafonds : **512 Ko** max sur `csvContent` et **500 lignes de données** max par import.
  - En-têtes FR/EN normalisés sans accents :
    - Obligatoires : `matricule`, `lastName` (`nom`), `firstName` (`prenom`), `birthDate` (`datedenaissance` — formats `YYYY-MM-DD` et `DD/MM/YYYY` avec validation calendaire stricte), `sex` (`sexe` — `M`/`H`/`Masculin` ou `F`/`Féminin`).
    - Optionnelles : `birthPlace` (`lieudenaissance`), `isRepeater` (`redoublant` — `oui`/`non`/`true`/`false`/`1`/`0`), `className` (`classe`).
- Deux modes d'exécution :
  - `dryRun: true` : retourne HTTP `200` avec `summary`, `preview` et la liste exhaustive des `errors` par ligne sans écriture en base.
  - `dryRun: false` : transaction atomique sous `acquireSyncWriteLock` ; en cas d'erreur de validation sur au moins une ligne, rejette l'intégralité du lot en HTTP `422 VALIDATION_ERROR` (aucune insertion partielle) ; sinon crée les élèves (ou réutilise les matricules existants si `reuseExistingStudents: true` avec `classId`/`academicYearId`), crée les inscriptions actives et incrémente `sync_seq` (`201 Created`).
