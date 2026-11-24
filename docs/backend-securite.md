# Durcissement Sécurité & Bilan d'Audit Backend — Gestion des Notes (Lycée)

- **Date :** 2026-11-24
- **Responsable :** Équipe backend & sécurité
- **Périmètre :** `packages/shared`, `apps/api`, schéma PostgreSQL (`0000`..`0002`), templates Typst, `Dockerfile`, `.dockerignore`, `.github/workflows/ci.yml`
- **Bilan global :** **39 / 39 (100 %)** constats d'audit résolus (**1** Critique, **10** Élevés, **18** Moyens, **8** Faibles, **2** Informatifs)

---

## 1. Synthèse de la remédiation

L'audit défensif initial (4 auditeurs parallèles couvrant Auth/Config, RBAC/Scolarité, Notes/Sync/Verrouillage et PDF/Infra) avait recensé **39 points d'amélioration** répartis sur 2 phases de remédiation :

| Vague | Périmètre traité | PR associée | Score |
| :--- | :--- | :---: | :---: |
| **Phase 2 (P0/P1)** | **1** Critique (`SEC-CRIT-01`), **10** Élevées (`SEC-HIGH-01..10`) et **18** Moyennes (`SEC-MED-01..18`) | PR #4 *(fusionnée)* | **29 / 29** |
| **Phase 4 (Clôture MVP)** | **8** Faibles (`SEC-LOW-01..08`) et **2** Informatifs (`SEC-INFO-01..02`) | PR #12 | **10 / 10** |
| **Total** | **Sécurisation complète du MVP Backend** | **PR #4 + PR #12** | **39 / 39 (100 %)** |

---

## 2. Architecture de défense en profondeur

### 2.1 Configuration PaaS, secrets et journaux HTTP
- **Validation *fail-fast* en production (`apps/api/src/config/env.ts`)** : rejet des valeurs par défaut connues pour `DATABASE_URL`, `ADMIN_INITIAL_PASSWORD` (`>= 12` car.), `JWT_ACCESS_SECRET` et `JWT_REFRESH_SECRET` (chacun `>= 32` car. avec `>= 10` caractères distincts), interdiction de `CORS_ORIGIN='*'`, et validation stricte de `JWT_ACCESS_TTL` (`1m..60m`) et `TRUST_PROXY` (`'true'` interdit).
- **Protection HTTP (`apps/api/src/app.ts`)** : `@fastify/helmet` avec CSP stricte (`default-src 'self'`, `script-src 'self'`, `object-src 'none'`, `frame-ancestors 'self'`), `@fastify/cors` (`credentials: false`), `bodyLimit: 2 MiB`, rate-limiting global (`200/min`) + seaux stricts Auth (`10/15m` par `ip:username` et `30/min` par `ip` sur `/login`, `5/15m` sur `/change-password`, `30/min` sur `/refresh`/`/logout`) et PDF (`15/min` par `userId`) et CSV (`10/min` par `userId`).
- **Rédaction des logs Pino (`app.ts`)** : masquage automatique de `req.headers.authorization`, `req.headers.cookie` et `res.headers["set-cookie"]`.

### 2.2 Authentification, cryptographie et cycle de vie des sessions
- **Hachage des mots de passe (`apps/api/src/lib/crypto.ts`)** : `scrypt` explicite `$scrypt$N=32768,r=8,p=1$<salt>$<hash>` avec bornes anti-DoS, comparaison temps constant (`timingSafeEqual`), mise à niveau transparente au login, et hachage factice en temps constant lorsque l'utilisateur n'existe pas (`401` uniforme même pour les comptes inactifs).
- **Politique de mots de passe et identifiants (`packages/shared/src/schemas/auth.schema.ts`, `users.service.ts`)** : `StrongPasswordSchema` (`>= 10` car., max `128`, au moins 1 lettre et 1 chiffre), refus de réutilisation sur `/change-password`, refus d'égalité avec `username` à la création/réinitialisation, login et unicité `username`/`email` insensibles à la casse via index PostgreSQL `lower()`.
- **Access Tokens JWT (`apps/api/src/plugins/auth.ts`)** : algorithme `HS256`, `iss: 'lycee-api'`, `aud: 'lycee-client'`, `requiredClaims: ['sub', 'exp', 'iat', 'ver']`, validation UUID de `sub`, payload minimal `{ sub, ver }` vérifié en base (`isActive`, `tokenVersion`) sur chaque requête.
- **Refresh Tokens (`apps/api/src/services/auth.service.ts`, `auth.schema.ts`)** : jetons opaques CSPRNG 384 bits validés par regex `/^[A-Za-z0-9_-]{32,128}$/`, stockés en **HMAC-SHA256 poivré par `JWT_REFRESH_SECRET`**, rotation atomique conditionnelle (`WHERE revoked_at IS NULL`), révocation de toute la `familyId` sur détection de réutilisation ou `/logout`, plafond absolu `sessionExpiresAt`, max `10` sessions actives/utilisateur, et révocation immédiate (`tokenVersion + 1` + `revokedAt`) sur changement de mot de passe, réinitialisation, désactivation, `/logout-all` **et changement de rôle**.

### 2.3 Contrôle d'accès (RBAC) et protection BOLA/IDOR
- **Liste blanche stricte** : utilisation systématique de `app.requireRoles([...])` ; messages `403` génériques ne divulguant jamais la liste des rôles autorisés.
- **Cloisonnement enseignant & secrétaire** :
  - `teacher` limité à ses affectations actives (`GET /api/classes`, `GET /api/classes/:classId/students`, `GET /api/classes/:classId/subjects`, `GET /api/grades`, `GET /api/sync/pull`, `GET /api/reports/class-list/:classId/pdf`), avec contrôle d'autorisation **`403` avant `404`** pour éviter les oracles d'existence d'entités.
  - Bulletins, résultats de classe, palmarès et décisions du conseil réservés aux rôles direction/secrétariat et au seul **professeur principal (`mainTeacherId`)** de la classe.
  - `secretary` bloqué sur les notes (`403` sur `/api/grades`), exclu des notes/affectations/décisions dans `sync/pull`, et restreint à `role=teacher` sur `GET /api/users`.
- **Séparation des pouvoirs utilisateurs** : un `censor` ne gère que les rôles `teacher` et `secretary` (aucune escalade vers `principal` ou `admin`) ; auto-modification de rôle/statut interdite et dernier `admin` actif protégé transactionnellement (`409`).

### 2.4 Concurrence PostgreSQL, immutabilité et intégrité
- **Verrouillage anti-TOCTOU (`validation.service.ts`, `grades.service.ts`, `sync.service.ts`)** : verrous ordonnés par UUID (`FOR UPDATE` sur `lockPeriod`/`unlockPeriod`, `FOR SHARE` sur les saisies de notes, décisions du conseil, coefficients et règles de notation) empêchant toute course entre saisie et verrouillage.
- **Hiérarchie d'immutabilité** : toute mutation de notes, de décisions du conseil, de périodes/séquences enfants, de coefficients (`class_subjects`) ou de `grading_rules` est bloquée en `409` dès qu'une période concernée ou son trimestre parent est verrouillé. Le déverrouillage d'une séquence est refusé si son trimestre parent reste verrouillé.
- **Contraintes relationnelles (`0001`, `0002`)** : `ON DELETE RESTRICT` sur toutes les tables académiques, d'audit et de snapshots ; contrainte auto-référentielle sur `periods.parent_period_id` ; contraintes SQL `CHECK` (`score`, `coefficient`, `weight`, `dates`, `absences_hours`, `school_profile.id = 1`) ; traduction globale PostgreSQL `23505 -> 409 CONFLICT` (`errors.ts`) et verrou consultatif `pg_advisory_lock(948272)` dans `migrate.ts`.
- **Synchronisation hors-ligne fiable (`sync.service.ts`)** : horloge `sync_seq` protégée par `pg_advisory_xact_lock(948271)`, lectures `pull` en transaction `REPEATABLE READ READ ONLY`, PK composite `(user_id, operation_id)` sur `sync_operations`, bornage temporel `clientTimestamp`, échappement `ILIKE` (`sql.ts`) et pagination systématique.

### 2.5 Médias, moteur PDF Typst, Docker & CI
- **Logo établissement (`school.service.ts`, `school.routes.ts`)** : validation binaire par magic bytes PNG/JPEG, encodage base64 canonique, plafond 512 Ko, et service HTTP sous `Content-Security-Policy: default-src 'none'; sandbox` + `X-Content-Type-Options: nosniff`.
- **Rendu PDF Typst (`pdf.service.ts`, `reports.routes.ts`, `apps/api/src/templates/*.typ`)** : exécution sans shell (`execFile`) confinée par `--root tempDir`, suppression des branches mortes WebP/SVG, sémaphore de concurrence (`503 PDF_SERVICE_BUSY`), cache LRU des documents officiels, erreurs 500 assainies (`stderr` journalisé côté serveur uniquement), `Cache-Control: private, no-store` et `ETag` SHA-256 canonique, `fmt-date` UTF-8 safe et colonnes de séquences adaptatives dans `bulletin.typ`.
- **Conteneur & CI (`Dockerfile`, `.dockerignore`, `.github/workflows/ci.yml`)** : stage `prod-deps` (`--prod --ignore-scripts`), vérification SHA-256 du binaire `typst v0.12.0`, suppression de `curl`/`xz-utils`, exécution sous `USER node`, `.dockerignore` récursif (`**/node_modules`, `**/.env*`, `**/dist`), et workflow CI à privilèges minimaux (`contents: read`, actions épinglées par SHA complet).

---

## 3. Détail des 10 remédiations Faibles & Informatives (Phase 4 — PR #12)

| ID | Problème initial | Remédiation implémentée | Références |
| :--- | :--- | :--- | :--- |
| **SEC-LOW-01** | `stderr` Typst et chemins `/tmp` exposés en HTTP 500 | `stderr` loggué via `console.error` côté serveur ; `AppError(500, 'PDF_GENERATION_FAILED')` générique retourné au client | `apps/api/src/services/pdf.service.ts` |
| **SEC-LOW-02** | Branches mortes SVG/WebP, `s.slice(0, 10)` UTF-8 unsafe et risque débordement `> 6` séquences dans Typst | Suppression `webp`/`svg+xml` dans `parseImageDataUri` (PNG/JPEG strict) ; `fmt-date` par `split("T")` dans les 3 `.typ` ; largeur colonne `calc.min(13mm, 58mm / seq-count)` dans `bulletin.typ` | `apps/api/src/services/pdf.service.ts`, `apps/api/src/templates/*.typ` |
| **SEC-LOW-03** | `Cache-Control: private, max-age=300` sur postes partagés & `JSON.stringify` non canonique pour `ETag` | Passage à `Cache-Control: private, no-store` sur les PDF & `304`, et `canonicalStringify` dans `computePayloadEtag` | `apps/api/src/routes/reports.routes.ts` |
| **SEC-LOW-04** | `.dockerignore` non récursif | Motifs récursifs (`**/node_modules`, `**/.env`, `**/.env.*`, `**/dist`, `**/*.log`, `apps/web/test-results`, `apps/web/playwright-report`) | `.dockerignore` |
| **SEC-LOW-05** | Politique mot de passe faible, casse `username`/`email` et validation laxiste des refresh tokens | `StrongPasswordSchema` (`>= 10` car., lettre+chiffre, refus réutilisation & `username`), regex `/^[A-Za-z0-9_-]{32,128}$/` sur refresh/logout, lookup & unicité `lower()`, index `users_username_lower_uidx` & `users_email_lower_uidx` | `packages/shared/src/schemas/auth.schema.ts`, `apps/api/src/services/{auth,users}.service.ts`, `0002_nice_king_bedlam.sql` |
| **SEC-LOW-06** | Rôle non révoqué en refresh, rôles permis exposés en 403, annuaire `secretary` large, logs Pino bruts | Révocation des `refresh_tokens` sur changement de rôle, message `403` masqué dans `auth.ts`, `secretary` limité à `role=teacher`, Pino `redact` sur `authorization`/`cookie`/`set-cookie` | `apps/api/src/services/users.service.ts`, `apps/api/src/plugins/auth.ts`, `apps/api/src/app.ts` |
| **SEC-LOW-07** | Races PG `23505` non mappées globalement & absence d'unicité sur l'année active | Handler global `23505 -> 409 CONFLICT` dans `registerErrorHandler` et index partiel `academic_years_single_active_uidx` | `apps/api/src/lib/errors.ts`, `apps/api/src/db/schema.ts`, `0002_nice_king_bedlam.sql` |
| **SEC-LOW-08** | Validation incomplète de `GradingRulesSchema` et `404` avant `403` dans les listes de classe | `.superRefine()` vérifiant longueur des poids, ordre des seuils et non-chevauchement des tranches ; contrôle `403` avant `404` dans `listClassStudents` et `listClassSubjects` | `packages/shared/src/schemas/academic.schema.ts`, `apps/api/src/services/{students,subjects}.service.ts` |
| **SEC-INFO-01** | `JWT_REFRESH_SECRET` déclarée mais inutilisée | `hashToken(token, config.JWT_REFRESH_SECRET)` en HMAC-SHA256 et contrôle d'entropie en production (`>= 32` car., `>= 10` car. distincts) | `apps/api/src/lib/crypto.ts`, `apps/api/src/services/auth.service.ts`, `apps/api/src/config/env.ts` |
| **SEC-INFO-02** | `migrate.ts` sans verrou consultatif ni timeouts | `pg_advisory_lock(948272)` / `pg_advisory_unlock` + `connectionTimeoutMillis: 10_000` + `statement_timeout: 60_000` | `apps/api/src/db/migrate.ts` |

---

## 4. Vérification automatisée

L'ensemble des protections Critiques, Élevées, Moyennes, Faibles et Informatives est vérifié en continu par la suite dédiée `apps/api/src/__tests__/security-hardening.test.ts` (exécutée sur PGlite + Fastify + compilation réelle Typst en CI GitHub Actions) et la suite E2E Playwright (`apps/web/e2e/`).
