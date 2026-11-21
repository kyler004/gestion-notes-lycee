import {
  RiAddCircleFill,
  RiAlertFill,
  RiBookOpenFill,
  RiCheckboxCircleFill,
  RiDeleteBin6Fill,
  RiDownload2Fill,
  RiFileTextFill,
  RiGroupFill,
  RiInformationFill,
  RiLockFill,
  RiRefreshFill,
  RiSaveFill,
  RiSchoolFill,
  RiCalendarFill,
  RiCloseCircleFill,
  RiWifiOffFill,
} from '@remixicon/react';
import { createFileRoute } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle, StatCard } from '@/components/ui/card';
import { Dropdown } from '@/components/ui/dropdown';
import { PageHeader } from '@/components/ui/header';
import { Spinner } from '@/components/ui/spinner';

export const Route = createFileRoute('/design-system')({ component: DesignSystemPage });

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="space-y-4">
      <h2 className="text-xl font-extrabold">{title}</h2>
      {children}
    </section>
  );
}

const swatches: Array<[string, string[]]> = [
  ['Émeraude', ['#76fcc9', '#41d4a1', '#32a980', '#248060', '#165a42', '#0a3627', '#02140d']],
  ['Ardoise', ['#e5f3f7', '#a8dae7', '#83b2be', '#668895', '#4a666d', '#2f4348', '#172326']],
  ['Violet', ['#e1d4ec', '#c3a7d9', '#a679c5', '#8353a1', '#59376e', '#321d40', '#180c20']],
  ['Bleu', ['#edf1fa', '#c6d4f1', '#8eade5', '#5788ce', '#3f6499', '#284267', '#132339']],
  ['Prune', ['#f4eff8', '#e0cde9', '#c49fd5', '#aa71c0', '#815093', '#563463', '#2f1a37']],
  ['Neutre', ['#dad8d8', '#b4b0b6', '#908993', '#6b656e', '#48444a', '#282529', '#121013']],
  ['Brique (danger)', ['#fbe9e7', '#f2b9b2', '#d4574d', '#b23a3a', '#7d2227']],
  ['Ambre (alerte)', ['#fdf2d6', '#f6d88b', '#d99a1f', '#7a5107']],
];

function DesignSystemPage() {
  const [classe, setClasse] = useState<string | undefined>('3eme-a');
  const [periode, setPeriode] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  return (
    <div className="mx-auto max-w-6xl space-y-12 px-4 py-10 sm:px-8">
      <PageHeader
        tone="slate"
        icon={<RiSchoolFill />}
        title="Design system — Gestion des notes"
        subtitle="Plus Jakarta Sans · Remix Icon (plein) · palette du lycée"
      />

      <Section id="couleurs" title="Couleurs">
        <div className="space-y-2">
          {swatches.map(([name, colors]) => (
            <div key={name} className="flex items-center gap-3">
              <span className="w-32 shrink-0 text-xs font-bold text-muted-foreground">{name}</span>
              <div className="flex flex-1 overflow-hidden rounded-md shadow-sm">
                {colors.map((c) => (
                  <span key={c} className="h-10 flex-1" style={{ background: c }} title={c} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section id="boutons" title="Boutons">
        <Card className="space-y-5 p-6">
          <div className="flex flex-wrap gap-3">
            <Button icon={<RiSaveFill />}>Enregistrer</Button>
            <Button variant="dark" icon={<RiRefreshFill />}>Synchroniser</Button>
            <Button variant="accent" icon={<RiGroupFill />}>Changer d'utilisateur</Button>
            <Button variant="info" icon={<RiDownload2Fill />}>Télécharger</Button>
            <Button variant="destructive" icon={<RiDeleteBin6Fill />}>Supprimer</Button>
            <Button variant="secondary" icon={<RiLockFill />}>Verrouiller</Button>
            <Button variant="outline" icon={<RiAddCircleFill />}>Ajouter</Button>
            <Button variant="ghost">Annuler</Button>
            <Button variant="link">Lien</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" icon={<RiSaveFill />}>Petit</Button>
            <Button icon={<RiSaveFill />}>Normal</Button>
            <Button size="lg" icon={<RiSaveFill />}>Grand</Button>
            <Button size="icon" aria-label="Ajouter"><RiAddCircleFill /></Button>
            <Button size="icon" variant="dark" aria-label="Synchroniser"><RiRefreshFill /></Button>
            <Button size="icon" variant="secondary" aria-label="Verrouiller"><RiLockFill /></Button>
            <Button
              loading={loading}
              onClick={() => {
                setLoading(true);
                setTimeout(() => setLoading(false), 1800);
              }}
            >
              {loading ? 'Envoi…' : 'État de chargement'}
            </Button>
            <Button disabled icon={<RiSaveFill />}>Désactivé</Button>
          </div>
        </Card>
      </Section>

      <Section id="entetes" title="En-têtes">
        <div className="grid gap-4 md:grid-cols-2">
          <PageHeader tone="emerald" icon={<RiBookOpenFill />} title="Saisie des notes" subtitle="3ème A · Mathématiques" />
          <PageHeader tone="slate" icon={<RiFileTextFill />} title="Bulletins" subtitle="Trimestre 1" />
          <PageHeader tone="violet" icon={<RiSchoolFill />} title="Administration" subtitle="Classes et matières" />
          <PageHeader tone="blue" icon={<RiCalendarFill />} title="Périodes" subtitle="Année 2025-2026" />
          <PageHeader tone="plum" icon={<RiGroupFill />} title="Enseignants" subtitle="42 comptes" />
          <PageHeader tone="mint" icon={<RiCheckboxCircleFill />} title="Notes validées" subtitle="Toutes les classes" />
          <PageHeader tone="lilac" icon={<RiGroupFill />} title="Élèves" subtitle="Inscriptions" />
          <PageHeader tone="light" icon={<RiFileTextFill />} title="Clair" subtitle="Pour les pages denses" />
        </div>
      </Section>

      <Section id="chargement" title="Indicateur de chargement">
        <Card className="flex flex-wrap items-center gap-8 p-6">
          <Spinner className="text-primary [&_svg]:size-6" />
          <Spinner className="text-info [&_svg]:size-8" />
          <Spinner className="text-violet-300 [&_svg]:size-10" />
          <span className="flex items-center gap-3 rounded-md bg-slate-600 px-4 py-3 text-sm font-bold text-white">
            <Spinner className="text-emerald-50" /> Synchronisation…
          </span>
        </Card>
      </Section>

      <Section id="cartes" title="Cartes">
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <Card className="p-5">
            <CardTitle className="text-base">Standard</CardTitle>
            <CardDescription className="mt-1 text-muted-foreground">Contenu courant, bordure fine.</CardDescription>
          </Card>
          <Card variant="elevated" className="p-5">
            <CardTitle className="text-base">Élevée</CardTitle>
            <CardDescription className="mt-1 text-muted-foreground">Ombre teintée ardoise.</CardDescription>
          </Card>
          <Card variant="interactive" className="p-5">
            <CardTitle className="text-base">Interactive</CardTitle>
            <CardDescription className="mt-1 text-muted-foreground">Se soulève au survol.</CardDescription>
          </Card>
          <Card variant="outline" className="p-5">
            <CardTitle className="text-base">Vide</CardTitle>
            <CardDescription className="mt-1 text-muted-foreground">Zone à compléter.</CardDescription>
          </Card>
          <Card variant="dark" className="p-5">
            <CardTitle className="text-base text-white">Sombre</CardTitle>
            <CardDescription className="mt-1 text-slate-100">Information à mettre en avant.</CardDescription>
          </Card>
          <Card variant="accent" className="p-5">
            <CardTitle className="text-base">Violet</CardTitle>
            <CardDescription className="mt-1">Accent doux.</CardDescription>
          </Card>
          <Card variant="info" className="p-5">
            <CardTitle className="text-base">Info</CardTitle>
            <CardDescription className="mt-1">Note informative.</CardDescription>
          </Card>
          <Card variant="success" className="p-5">
            <CardTitle className="text-base">Succès</CardTitle>
            <CardDescription className="mt-1">Tout est synchronisé.</CardDescription>
          </Card>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Notes saisies" value="1 284" icon={<RiBookOpenFill />} />
          <StatCard label="Classes" value="18" tone="violet" icon={<RiSchoolFill />} />
          <StatCard label="À synchroniser" value="12" tone="blue" icon={<RiRefreshFill />} />
          <StatCard label="Élèves" value="742" tone="slate" icon={<RiGroupFill />} />
        </div>
        <Card variant="elevated">
          <CardHeader className="rounded-t-lg bg-slate-600 text-white">
            <CardTitle>Carte avec bandeau</CardTitle>
            <CardDescription className="text-slate-100 opacity-100">Titre sur fond ardoise</CardDescription>
          </CardHeader>
          <div className="p-6 text-sm text-muted-foreground">Le contenu de la carte vient ici.</div>
        </Card>
      </Section>

      <Section id="menu" title="Menu déroulant">
        <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
          <Dropdown
            label="Classe"
            value={classe}
            onChange={setClasse}
            options={[
              { value: '3eme-a', label: '3ème A', description: '42 élèves', icon: <RiSchoolFill /> },
              { value: '3eme-b', label: '3ème B', description: '39 élèves', icon: <RiSchoolFill /> },
              { value: '2nde-c', label: '2nde C', description: '45 élèves', icon: <RiSchoolFill /> },
            ]}
          />
          <Dropdown
            label="Période"
            value={periode}
            onChange={setPeriode}
            placeholder="Choisir une période"
            options={[
              { value: 't1', label: 'Trimestre 1', icon: <RiCalendarFill /> },
              { value: 't2', label: 'Trimestre 2', icon: <RiCalendarFill /> },
              { value: 't3', label: 'Trimestre 3', icon: <RiCalendarFill /> },
            ]}
          />
        </div>
      </Section>

      <Section id="pastilles" title="Pastilles de message">
        <Card className="space-y-4 p-6">
          <div className="flex flex-wrap gap-2">
            <Badge variant="success" icon={<RiCheckboxCircleFill />}>Synchronisé</Badge>
            <Badge variant="warning" icon={<RiWifiOffFill />}>Hors ligne</Badge>
            <Badge variant="destructive" icon={<RiCloseCircleFill />}>Échec</Badge>
            <Badge variant="info" icon={<RiInformationFill />}>Brouillon</Badge>
            <Badge variant="accent" icon={<RiLockFill />}>Validé par le censeur</Badge>
            <Badge variant="neutral">En attente</Badge>
            <Badge variant="dark">Administrateur</Badge>
            <Badge variant="default">Nouveau</Badge>
            <Badge variant="outline">Phase 2</Badge>
          </div>
        </Card>
      </Section>

      <Section id="toasts" title="Notifications (toasts)">
        <Card className="flex flex-wrap gap-3 p-6">
          <Button onClick={() => toast.success('Notes enregistrées', { description: '24 notes synchronisées.' })} icon={<RiCheckboxCircleFill />}>Succès</Button>
          <Button variant="info" onClick={() => toast.info('Mise à jour disponible', { description: 'Rechargez pour appliquer.' })} icon={<RiInformationFill />}>Info</Button>
          <Button variant="outline" onClick={() => toast.warning('Mode hors ligne', { description: 'Vos notes seront envoyées au retour du réseau.' })} icon={<RiAlertFill />}>Alerte</Button>
          <Button variant="destructive" onClick={() => toast.error('Échec de la synchronisation', { description: 'Réessayez dans un instant.' })} icon={<RiCloseCircleFill />}>Erreur</Button>
          <Button variant="dark" onClick={() => toast.loading('Synchronisation…')}>Chargement</Button>
        </Card>
      </Section>
    </div>
  );
}
