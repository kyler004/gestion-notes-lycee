# Design System — Gestion des Notes (Lycée)

- **Date :** 2026-11-20
- **Responsable :** Équipe frontend
- **Périmètre :** Client PWA `@lycee/web` — **source unique et obligatoire** pour tous les écrans, composants et jalons futurs. Aucun design externe ni composant hors système n'est autorisé.
- **Vitrine interactive :** route `/design-system` (`apps/web/src/routes/design-system.tsx`)
- **Jetons CSS :** `apps/web/src/index.css` (`@theme` Tailwind v4)

---

## 1. Règles strictes

1. **Source unique :** utiliser exclusivement les jetons de `apps/web/src/index.css` et les primitives de `apps/web/src/components/ui/`. Ne jamais introduire de thème externe, de classes de couleurs brutes hors palette (ex. `red-500`, `gray-700`, `emerald-600` par défaut) ni de librairie d'icônes supplémentaire.
2. **Icônes pleines uniquement :** utiliser exclusivement `@remixicon/react` en variante **Fill** (`Ri*Fill`). Les variantes `Line` et `lucide-react` sont interdites.
3. **Typographie unique hors-ligne :** `Plus Jakarta Sans Variable` auto-hébergée via `@fontsource-variable/plus-jakarta-sans` (aucun CDN externe). Appliquer `.tabular-nums` sur toutes les notes, moyennes, rangs, codes PIN et compteurs.
4. **Français uniquement :** tout texte visible passe par le dictionnaire centralisé `t()` (`apps/web/src/lib/i18n/fr.ts`).
5. **Accessibilité & sobriété :** privilégier les contrastes AA, les animations légères respectant `prefers-reduced-motion`, et éviter les clichés génériques (texte en dégradé, halos néon, cartes « pilule »).

---

## 2. Palette de couleurs

### 2.1 Échelles de la palette projet (clair → foncé)

| Famille | Jetons `@theme` | Valeurs hexadécimales |
| :--- | :--- | :--- |
| **Émeraude** | `--color-emerald-50` … `600` | `#76fcc9`, `#41d4a1`, `#32a980`, `#248060`, `#165a42`, `#0a3627`, `#02140d` |
| **Ardoise** | `--color-slate-50` … `600` | `#e5f3f7`, `#a8dae7`, `#83b2be`, `#668895`, `#4a666d`, `#2f4348`, `#172326` |
| **Violet** | `--color-violet-50` … `600` | `#e1d4ec`, `#c3a7d9`, `#a679c5`, `#8353a1`, `#59376e`, `#321d40`, `#180c20` |
| **Bleu** | `--color-blue-50` … `600` | `#edf1fa`, `#c6d4f1`, `#8eade5`, `#5788ce`, `#3f6499`, `#284267`, `#132339` |
| **Prune** | `--color-plum-50` … `600` | `#f4eff8`, `#e0cde9`, `#c49fd5`, `#aa71c0`, `#815093`, `#563463`, `#2f1a37` |
| **Neutres (Ink)** | `--color-ink-50` … `600` | `#dad8d8`, `#b4b0b6`, `#908993`, `#6b656e`, `#48444a`, `#282529`, `#121013` |

### 2.2 Teintes sémantiques dérivées (erreur & alerte)

| Famille | Jetons `@theme` | Valeurs hexadécimales | Usage |
| :--- | :--- | :--- | :--- |
| **Brique** | `--color-brick-50, 100, 300, 400, 500` | `#fbe9e7`, `#f2b9b2`, `#d4574d`, `#b23a3a`, `#7d2227` | Erreurs, actions destructives |
| **Ambre** | `--color-amber-50, 100, 300, 500` | `#fdf2d6`, `#f6d88b`, `#d99a1f`, `#7a5107` | Mode hors-ligne, avertissements |

### 2.3 Jetons sémantiques

| Jeton | Valeur | Rôle |
| :--- | :--- | :--- |
| `--color-background` | `#f1f5f6` | Fond de page principal |
| `--color-foreground` | `#172326` | Texte principal (ardoise 600) |
| `--color-card` | `#ffffff` | Surface des cartes et panneaux clairs |
| `--color-sidebar` | `#172326` | Barre latérale et surfaces sombres |
| `--color-sidebar-foreground` | `#c9dde2` | Texte sur barre latérale |
| `--color-primary` | `#248060` | Action principale (contraste AA avec blanc) |
| `--color-ring` | `#32a980` | Anneau de focus (`3px`, 55 % opacité) |
| `--color-secondary` | `#e5f3f7` | Action secondaire douce (texte `#2f4348`) |
| `--color-accent` | `#e1d4ec` | Accent violet doux (texte `#321d40`) |
| `--color-info` | `#284267` | Information / actions bleues |
| `--color-destructive` | `#b23a3a` | Action destructive |
| `--color-warning` | `#d99a1f` | Avertissement / état hors-ligne |
| `--color-muted` | `#e7eef0` | Zones neutres atténuées (texte `#5a6f75`) |
| `--color-border` / `--color-input` | `#d3dee1` / `#c3d1d5` | Bordures subtiles / bordures de champs |

---

## 3. Géométrie, ombres et signature visuelle

- **Rayons :** `--radius-sm` `8px` (`0.5rem`), `--radius-md` `12px` (`0.75rem`), `--radius-lg` `18px` (`1.125rem`), `--radius-xl` `24px` (`1.5rem`). Jamais de rayon « pilule » (`rounded-full`) sur les cartes, boutons ou pastilles.
- **Ombres teintées ardoise (`rgb(23 35 38 / ...)`):** `--shadow-xs`, `--shadow-sm`, `--shadow-md`, `--shadow-lg` (jamais de noir pur).
- **Arête tactile (`--shadow-edge`):** bord inférieur sombre discret (`inset 0 -3px 0`) + reflet supérieur sur les boutons pleins, la tuile de marque et l'élément actif de navigation.
- **Signature visuelle :**
  - `BrandMark` (`apps/web/src/components/layout/Brand.tsx`) : tuile émeraude (`bg-emerald-100`) avec coin supérieur droit accentué (`rounded-md rounded-tr-xl`) et toque pleine ardoise (`RiGraduationCapFill`).
  - Motifs de quarts de disques subtils en arrière-plan des `PageHeader` et des panneaux sombres (connexion, verrouillage).
  - Titres `h1, h2, h3` en `font-extrabold` avec `letter-spacing: -0.02em`.

---

## 4. Catalogue des composants (`apps/web/src/components/ui/`)

| Composant | Fichier | Variantes & contrat |
| :--- | :--- | :--- |
| **Button** | `button.tsx` | Variantes : `default`, `dark`, `accent`, `info`, `destructive`, `secondary`, `outline`, `ghost`, `link`. Tailles : `sm`, `default`, `lg`, `icon`. Props `icon?: ReactNode` (icône pleine) et `loading?: boolean` (remplace l'icône par `Spinner`). |
| **PageHeader** | `header.tsx` | Tons : `emerald`, `slate`, `violet`, `plum`, `blue`, `light`, `mint`, `lilac`. Props : `title`, `subtitle`, `icon`, `actions`. Convention par module : Saisie des notes = `emerald`, Administration = `violet`, Bulletins/Rapports = `blue`, Enseignants = `plum`, Vue d'ensemble = `slate` ou `emerald`. |
| **Spinner** | `spinner.tsx` | Cadran circulaire plein héritant de `currentColor`, `role="status"`, `aria-label` personnalisable. |
| **Card & StatCard** | `card.tsx` | Variantes `Card` : `default`, `elevated`, `outline`, `interactive`, `dark`, `accent`, `info`, `success`. `StatCard` : `label`, `value` (`tabular-nums`), `icon`, `tone` (`emerald` \| `violet` \| `blue` \| `slate`). Supporte aussi les cartes à bandeau sombre (`CardHeader` sur `bg-slate-600`). |
| **Dropdown** | `dropdown.tsx` | Sélecteur Radix sur mesure pour classe, matière, période, rôle. Déclencheur tuile (`h-14`) avec étiquette majuscule, description optionnelle, icône pleine et coche `RiCheckboxCircleFill` sur l'élément sélectionné. |
| **Badge (pastilles)** | `badge.tsx` | Variantes colorées selon le message : `success`, `warning`, `destructive`, `info`, `accent`, `neutral`, `dark`, `default`, `secondary`, `outline`. Prop `icon?: ReactNode`. |
| **Toaster (toasts)** | `sonner.tsx` | Carte sombre `bg-slate-600`, bande colorée à gauche (`6px`) et pastille d'icône pleine teintée selon le type (`success`, `error`, `warning`, `info`, `loading`). |
| **Input & Label** | `input.tsx`, `label.tsx` | Champs `h-11`, bordure `2px`, anneau de focus `ring-4 ring-ring/20`. |
| **Dialog** | `dialog.tsx` | Fond flouté ardoise (`bg-slate-600/60 backdrop-blur-sm`), carte `rounded-xl`, animation `animate-pop`, fermeture `RiCloseFill`. |

---

## 5. Architecture des écrans

- **AppShell** (`components/layout/AppShell.tsx`) : barre latérale fixe sombre (`bg-sidebar`, `w-68`) sur bureau, tiroir mobile sur petits écrans, lien actif en surbrillance menthe (`bg-emerald-50 text-slate-600 shadow-edge`), barre supérieure légère translucide avec `NetworkBadge`, verrouillage PIN, changement d'utilisateur et déconnexion.
- **Connexion (`/login`)** : mise en page divisée sur bureau (panneau de marque sombre ardoise à gauche avec pastilles hors-ligne/PIN/sync, carte élevée à droite avec comptes enregistrés).
- **Verrouillage (`/lock`)** : fond sombre ardoise plein écran avec motifs disques et carte élevée centrée, champ PIN `h-14` en `tabular-nums`.
- **PWA** : `theme_color` `#172326`, `background_color` `#f1f5f6`, `favicon.svg` et icônes PNG alignés sur `BrandMark`.
