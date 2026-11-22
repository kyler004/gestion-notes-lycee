import { CreateClassSchema, UpdateClassSchema } from '@lycee/shared';
import {
  RiAddCircleFill,
  RiEdit2Fill,
  RiSchoolFill,
  RiUserStarFill,
} from '@remixicon/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Dropdown } from '@/components/ui/dropdown';
import { FieldMessage, Input, SearchInput } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import {
  createClass,
  listClasses,
  listUsers,
  updateClass,
  type ClassDto,
} from '@/lib/api/admin';
import { adminKeys } from '@/lib/api/query-keys';
import { t } from '@/lib/i18n';
import { getAdminErrorMessage, refreshLocalSyncSnapshot } from './admin-utils';

const NO_TEACHER_VALUE = '__none__';

export function ClassesTab({
  selectedYearId,
  isOnline,
}: {
  selectedYearId?: string;
  isOnline: boolean;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingClass, setEditingClass] = useState<ClassDto | null>(null);
  const [name, setName] = useState('');
  const [level, setLevel] = useState('');
  const [series, setSeries] = useState('');
  const [mainTeacherId, setMainTeacherId] = useState<string>(NO_TEACHER_VALUE);
  const [formError, setFormError] = useState<string | null>(null);

  const classesQuery = useQuery({
    queryKey: adminKeys.classes(selectedYearId),
    queryFn: () => listClasses(selectedYearId),
    enabled: Boolean(selectedYearId),
  });

  const teachersQuery = useQuery({
    queryKey: adminKeys.users('teacher'),
    queryFn: () => listUsers('teacher'),
  });

  const activeTeachers = useMemo(
    () => (teachersQuery.data ?? []).filter((u) => u.isActive),
    [teachersQuery.data],
  );

  const filteredClasses = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = classesQuery.data ?? [];
    if (!q) return list;
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.level.toLowerCase().includes(q) ||
        (c.series ?? '').toLowerCase().includes(q) ||
        (c.mainTeacherName ?? '').toLowerCase().includes(q),
    );
  }, [classesQuery.data, search]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedYearId) throw new Error('Aucune année scolaire sélectionnée.');
      const resolvedTeacherId = mainTeacherId === NO_TEACHER_VALUE ? null : mainTeacherId;
      const resolvedSeries = series.trim() ? series.trim() : null;

      if (modalMode === 'edit' && editingClass) {
        const parsed = UpdateClassSchema.safeParse({
          name,
          level,
          series: resolvedSeries,
          mainTeacherId: resolvedTeacherId,
        });
        if (!parsed.success) {
          throw new Error(parsed.error.issues[0]?.message ?? 'Données de classe invalides.');
        }
        return updateClass(editingClass.id, parsed.data);
      }

      const parsed = CreateClassSchema.safeParse({
        academicYearId: selectedYearId,
        name,
        level,
        series: resolvedSeries,
        mainTeacherId: resolvedTeacherId,
      });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'Données de classe invalides.');
      }
      return createClass(parsed.data);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.classes(selectedYearId) });
      setModalMode(null);
      setEditingClass(null);
      setFormError(null);
      toast.success(t('admin.classes.savedSuccess'));
      refreshLocalSyncSnapshot();
    },
    onError: (err) => {
      const msg = getAdminErrorMessage(err);
      setFormError(msg);
      toast.error(msg);
    },
  });

  const openCreate = () => {
    setModalMode('create');
    setEditingClass(null);
    setName('');
    setLevel('');
    setSeries('');
    setMainTeacherId(NO_TEACHER_VALUE);
    setFormError(null);
  };

  const openEdit = (cls: ClassDto) => {
    setModalMode('edit');
    setEditingClass(cls);
    setName(cls.name);
    setLevel(cls.level);
    setSeries(cls.series ?? '');
    setMainTeacherId(cls.mainTeacherId ?? NO_TEACHER_VALUE);
    setFormError(null);
  };

  return (
    <div className="space-y-5">
      <Card variant="elevated">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{t('admin.classes.title')}</CardTitle>
            <CardDescription>{t('admin.classes.desc')}</CardDescription>
          </div>
          <Button
            type="button"
            icon={<RiAddCircleFill />}
            disabled={!isOnline || !selectedYearId}
            onClick={openCreate}
          >
            {t('admin.classes.newClassBtn')}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-md">
            <SearchInput
              aria-label={t('admin.classes.searchPlaceholder')}
              placeholder={t('admin.classes.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClear={() => setSearch('')}
            />
          </div>

          {classesQuery.isLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Spinner className="size-4 text-primary" />
              <span>{t('admin.common.loading')}</span>
            </div>
          ) : filteredClasses.length === 0 ? (
            <Card variant="outline" className="p-8 text-center">
              <p className="text-base font-extrabold">{t('admin.classes.emptyTitle')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t('admin.classes.emptyBody')}</p>
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="border-b border-border bg-muted/60 text-xs font-extrabold tracking-wide text-muted-foreground uppercase">
                  <tr>
                    <th className="px-4 py-3">{t('admin.classes.nameLabel')}</th>
                    <th className="px-4 py-3">{t('admin.classes.levelLabel')}</th>
                    <th className="px-4 py-3">{t('admin.classes.seriesLabel')}</th>
                    <th className="px-4 py-3">{t('admin.classes.mainTeacherLabel')}</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {filteredClasses.map((cls) => (
                    <tr key={cls.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-extrabold text-foreground">
                        <span className="inline-flex items-center gap-2">
                          <RiSchoolFill className="size-4 text-violet-400" />
                          {cls.name}
                        </span>
                      </td>
                      <td className="px-4 py-3">{cls.level}</td>
                      <td className="px-4 py-3">
                        {cls.series ? (
                          <Badge variant="accent">{cls.series}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {cls.mainTeacherName ? (
                          <span className="inline-flex items-center gap-1.5 font-semibold">
                            <RiUserStarFill className="size-4 text-primary" />
                            {cls.mainTeacherName}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            {t('admin.classes.noMainTeacher')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          icon={<RiEdit2Fill />}
                          disabled={!isOnline}
                          onClick={() => openEdit(cls)}
                        >
                          {t('admin.common.edit')}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={modalMode !== null} onOpenChange={(open) => !open && setModalMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {modalMode === 'edit'
                ? t('admin.classes.editModalTitle', { name: editingClass?.name ?? '' })
                : t('admin.classes.createModalTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="class-name">{t('admin.classes.nameLabel')}</Label>
              <Input
                id="class-name"
                placeholder={t('admin.classes.namePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="class-level">{t('admin.classes.levelLabel')}</Label>
                <Input
                  id="class-level"
                  placeholder={t('admin.classes.levelPlaceholder')}
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="class-series" optional>
                  {t('admin.classes.seriesLabel')}
                </Label>
                <Input
                  id="class-series"
                  placeholder={t('admin.classes.seriesPlaceholder')}
                  value={series}
                  onChange={(e) => setSeries(e.target.value)}
                />
              </div>
            </div>

            <Dropdown
              label={t('admin.classes.mainTeacherLabel')}
              value={mainTeacherId}
              onChange={setMainTeacherId}
              options={[
                {
                  value: NO_TEACHER_VALUE,
                  label: t('admin.classes.noMainTeacher'),
                  icon: <RiUserStarFill />,
                },
                ...activeTeachers.map((teacher) => ({
                  value: teacher.id,
                  label: teacher.fullName,
                  description: `@${teacher.username}`,
                  icon: <RiUserStarFill />,
                })),
              ]}
            />

            {formError && <FieldMessage tone="error">{formError}</FieldMessage>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setModalMode(null)}>
              {t('admin.common.cancel')}
            </Button>
            <Button
              type="button"
              loading={saveMutation.isPending}
              disabled={!isOnline}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? t('admin.common.saving') : t('admin.common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
