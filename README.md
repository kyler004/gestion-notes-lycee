# Gestion des Notes — Lycée

Application de gestion des notes scolaires conçue pour remplacer les cahiers de notes et classeurs Excel par un outil unique, fiable et utilisable même avec une connexion internet instable : saisie des notes, calcul automatique des moyennes et rangs, tableaux de résultats et génération des bulletins officiels en PDF.

> La description détaillée des choix techniques et d'architecture est disponible dans [`docs/architecture.md`](docs/architecture.md).

---

## 1. Objectif et contexte

Dans de nombreux lycées (notamment dans le système francophone camerounais), la gestion manuelle des notes génère des erreurs de calcul, des retards lors des conseils de classe et des risques de perte de données.

Ce projet vise à fournir un outil adapté aux contraintes réelles des établissements :

- **Connexion internet instable** : application web installable (**PWA**) utilisable **100 % hors-ligne** avec synchronisation vers le serveur dès que le réseau est disponible.
- **Matériel modeste** : interface légère et peu gourmande en mémoire, fonctionnant aussi bien sur de vieux PC que sur les smartphones des enseignants.
- **Simplicité d'utilisation** : ergonomie épurée, saisie clavier rapide façon tableur, adaptée à des utilisateurs peu habitués à l'informatique.
- **Conformité locale** : notes sur `20`, coefficients par matière et par classe, séquences regroupées en trimestres, groupes de matières, tableaux d'honneur et décisions du conseil de classe.

---

## 2. Utilisateurs et rôles

| Rôle | Responsabilités principales |
| :--- | :--- |
| **Administrateur / Censeur / Surveillant général** | Configure l'établissement, l'année scolaire, les classes, les matières, les coefficients, les affectations et verrouille/valide les séquences. |
| **Enseignant** | Saisit (y compris hors-ligne) et soumet les notes uniquement pour ses matières et ses classes affectées. |
| **Chef d'établissement / Proviseur** | Consulte les statistiques globales de réussite et valide les bulletins. |
| **Secrétariat** | Gère les inscriptions des élèves et imprime les bulletins (individuellement ou par classe). |
| **Élève / Parent** *(phase ultérieure)* | Consulte les notes et bulletins en lecture seule. |

---

## 3. Périmètre fonctionnel

### Version minimale (MVP)

1. **Gestion de l'année scolaire** : paramétrage des trimestres et des séquences d'évaluation.
2. **Gestion des classes et des élèves** : matricule, nom, date de naissance, classe, statut redoublant.
3. **Gestion des matières** : groupes de matières, coefficients par matière et par classe, affectation des enseignants.
4. **Saisie des notes** : par classe, matière et séquence, sur `20`, avec contrôles de validité (`0 <= note <= 20`), gestion des absences et notes manquantes.
5. **Calculs automatiques** : moyenne par matière, moyenne générale pondérée, rang dans la classe, moyenne de la classe, plus forte et plus faible moyenne.
6. **Bulletins PDF** : génération et impression en PDF (individuel ou par classe complète), avec appréciations et décisions du conseil de classe.
7. **Tableaux de résultats** : listes de classe, tableaux d'honneur, statistiques de réussite par classe et par matière.
8. **Sécurité et traçabilité** : authentification par compte, droits par rôle (RBAC), historique complet des modifications de notes et verrouillage d'une séquence après validation.

### Évolutions prévues (post-MVP)

- Gestion des absences, retards et discipline.
- Portail parents / élèves et notifications SMS.
- Gestion des frais de scolarité et des emplois du temps.
- Import/export Excel avancé et sauvegardes automatiques étendues.

---

## 4. Architecture et stack technique

Le projet repose sur une architecture **monorepo TypeScript** mono-établissement (une instance dédiée par lycée) pensée pour le mode hors-ligne et le déploiement simple sur PaaS managé :

| Composant | Technologie retenue |
| :--- | :--- |
| **Client (PWA)** | `React` + `TypeScript` + `Vite` (`vite-plugin-pwa` / Workbox) |
| **Interface utilisateur** | `Tailwind CSS` + composants `shadcn/ui` (Radix) + `Zod` |
| **Stockage local & sync** | `IndexedDB` via `Dexie.js` + file d'attente **Outbox** |
| **Authentification** | Connexion initiale en ligne (JWT / refresh token) + **PIN local** hors-ligne |
| **API Backend** | `Node.js 24 LTS` + `Fastify` + `TypeScript` |
| **Base de données** | `PostgreSQL` managé + `Drizzle ORM` |
| **Moteur de calcul** | Package partagé `@lycee/shared` (paramétrable, pré-rempli standard camerounais) |
| **Génération PDF** | `Typst` côté serveur (gabarits déterministes) + cache PWA hors-ligne |
| **Déploiement** | Conteneur **Docker** unique (API + Typst + PWA statique) sur PaaS managé (Railway / Render / Fly.io) |

Pour les justifications détaillées, les diagrammes de flux et les décisions d'architecture (ADR), consulter [`docs/architecture.md`](docs/architecture.md).

---

## 5. Structure cible du dépôt

```text
gestion-notes-lycee/
├── apps/
│   ├── web/              # Application client PWA (React, Vite, Tailwind, Dexie.js)
│   └── api/              # Serveur HTTP Fastify, Drizzle ORM, sync & génération Typst
├── packages/
│   └── shared/           # Types partagés, schémas Zod et moteur de calcul des moyennes/rangs
├── docs/
│   └── architecture.md   # Document d'architecture et décisions techniques (ADR)
├── Dockerfile            # Conteneur unique servant API + Typst + assets PWA
└── pnpm-workspace.yaml
```

---

## 6. Points fonctionnels à confirmer avec l'établissement

Bien que le moteur de calcul soit conçu pour être paramétrable par année scolaire, les détails suivants seront confirmés avec l'administration du lycée lors de la mise en place des gabarits officiels :

- Format exact du bulletin officiel du lycée (en-têtes, colonnes, regroupement des matières).
- Règles précises de pondération entre séquences/évaluations, barèmes d'appréciation et seuils de passage ou d'attribution du tableau d'honneur.
