import {
  CreateSubjectGroupSchema,
  CreateSubjectSchema,
  CreateTeacherAssignmentSchema,
  UpdateSubjectSchema,
  UpsertClassSubjectSchema,
} from '@lycee/shared';
import {
  RiAddCircleFill,
  RiBookOpenFill,
  RiDeleteBin6Fill,
  RiEdit2Fill,
  RiFolderAddFill,
  RiLockFill,
  RiSchoolFill,
  RiUserAddFill,
  RiUserStarFill,
} from '@remixicon/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Dropdown } from '@/components/ui/dropdown';
import { FieldMessage, Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import {
  createSubject,
  createSubjectGroup,
  createTeacherAssignment,
  deactivateTeacherAssignment,
  listClasses,
  listClassSubjects,
  listPeriods,
  listSubjectGroups,
  listSubjects,
  listTeacherAssignments,
  listUsers,
  updateSubject,
  upsertClassSubject,
  type ClassSubjectDetailDto,
  type SubjectDto,
  type TeacherAssignmentDetailDto,
} from '@/lib/api/admin';
import { adminKeys } from '@/lib/api/query-keys';
import { t } from '@/lib/i18n';
import { getAdminErrorMessage, refreshLocalSyncSnapshot } from './admin-utils';

const NO_GROUP_VALUE = '__none__';
const ALL_CLASSES_VALUE = '__all__';

export function SubjectsAssignmentsTab({
  selectedYearId,
  isOnline,
}: {
  selectedYearId?: string;
  isOnline: boolean;
}) {
  const queryClient = useQueryClient();

  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [assignmentClassFilter, setAssignmentClassFilter] = useState<string>(ALL_CLASSES_VALUE);

  // Modale groupe de matières
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupOrder, setGroupOrder] = useState('1');
  const [groupError, setGroupError] = useState<string | null>(null);

  // Modale matière catalogue
  const [subjectModalMode, setSubjectModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingSubject, setEditingSubject] = useState<SubjectDto | null>(null);
  const [subjCode, setSubjCode] = useState('');
  const [subjName, setSubjName] = useState('');
  const [subjShort, setSubjShort] = useState('');
  const [subjActive, setSubjActive] = useState(true);
  const [subjError, setSubjError] = useState<string | null>(null);

  // Modale matière-classe (coefficient)
  const [csModalOpen, setCsModalOpen] = useState(false);
  const [csSubjectId, setCsSubjectId] = useState('');
  const [csGroupId, setCsGroupId] = useState<string>(NO_GROUP_VALUE);
  const [csCoefficient, setCsCoefficient] = useState('2');
  const [csError, setCsError] = useState<string | null>(null);

  // Modale affectation enseignant
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignClassId, setAssignClassId] = useState('');
  const [assignClassSubjectId, setAssignClassSubjectId] = useState('');
  const [assignTeacherId, setAssignTeacherId] = useState('');
  const [assignError, setAssignError] = useState<string | null>(null);
  const [removingAssignment, setRemovingAssignment] =
    useState<TeacherAssignmentDetailDto | null>(null);

  const classesQuery = useQuery({
    queryKey: adminKeys.classes(selectedYearId),
    queryFn: () => listClasses(selectedYearId),
    enabled: Boolean(selectedYearId),
  });

  const periodsQuery = useQuery({
    queryKey: adminKeys.periods(selectedYearId ?? ''),
    queryFn: () => listPeriods(selectedYearId!),
    enabled: Boolean(selectedYearId),
  });

  const groupsQuery = useQuery({
    queryKey: adminKeys.subjectGroups(selectedYearId),
    queryFn: () => listSubjectGroups(selectedYearId),
    enabled: Boolean(selectedYearId),
  });

  const subjectsQuery = useQuery({
    queryKey: adminKeys.subjects(false),
    queryFn: () => listSubjects(false),
  });

  const teachersQuery = useQuery({
    queryKey: adminKeys.users('teacher'),
    queryFn: () => listUsers('teacher'),
  });

  const classes = classesQuery.data ?? [];

  useEffect(() => {
    if (classes.length > 0 && !classes.some((c) => c.id === selectedClassId)) {
      setSelectedClassId(classes[0]!.id);
    } else if (classes.length === 0) {
      setSelectedClassId('');
    }
  }, [classes, selectedClassId]);

  const classSubjectsQuery = useQuery({
    queryKey: adminKeys.classSubjects(selectedClassId),
    queryFn: () => listClassSubjects(selectedClassId),
    enabled: Boolean(selectedClassId),
  });

  const modalClassSubjectsQuery = useQuery({
    queryKey: adminKeys.classSubjects(assignClassId),
    queryFn: () => listClassSubjects(assignClassId),
    enabled: assignModalOpen && Boolean(assignClassId),
  });

  const assignmentFilterClassId =
    assignmentClassFilter === ALL_CLASSES_VALUE ? undefined : assignmentClassFilter;

  const assignmentsQuery = useQuery({
    queryKey: adminKeys.teacherAssignments({
      academicYearId: selectedYearId,
      classId: assignmentFilterClassId,
    }),
    queryFn: () =>
      listTeacherAssignments({
        academicYearId: selectedYearId,
        classId: assignmentFilterClassId,
      }),
    enabled: Boolean(selectedYearId),
  });

  const hasLockedPeriod = useMemo(
    () => (periodsQuery.data ?? []).some((p) => p.status === 'locked'),
    [periodsQuery.data],
  );

  const activeSubjects = useMemo(
    () => (subjectsQuery.data ?? []).filter((s) => s.isActive),
    [subjectsQuery.data],
  );

  const activeTeachers = useMemo(
    () => (teachersQuery.data ?? []).filter((u) => u.isActive),
    [teachersQuery.data],
  );

  const totalCoefficients = useMemo(
    () => (classSubjectsQuery.data ?? []).reduce((sum, item) => sum + item.coefficient, 0),
    [classSubjectsQuery.data],
  );

  // Mutations
  const createGroupMutation = useMutation({
    mutationFn: () => {
      if (!selectedYearId) throw new Error('Aucune année scolaire sélectionnée.');
      const parsed = CreateSubjectGroupSchema.safeParse({
        academicYearId: selectedYearId,
        name: groupName,
        orderIndex: Number.parseInt(groupOrder, 10),
      });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'Groupe invalide.');
      }
      return createSubjectGroup(parsed.data);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.subjectGroups(selectedYearId) });
      setGroupOpen(false);
      setGroupName('');
      setGroupError(null);
      toast.success(t('admin.subjects.groupCreated'));
      refreshLocalSyncSnapshot();
    },
    onError: (err) => {
      const msg = getAdminErrorMessage(err);
      setGroupError(msg);
      toast.error(msg);
    },
  });

  const saveSubjectMutation = useMutation({
    mutationFn: () => {
      if (subjectModalMode === 'edit' && editingSubject) {
        const parsed = UpdateSubjectSchema.safeParse({
          code: subjCode,
          name: subjName,
          shortName: subjShort,
          isActive: subjActive,
        });
        if (!parsed.success) {
          throw new Error(parsed.error.issues[0]?.message ?? 'Matière invalide.');
        }
        return updateSubject(editingSubject.id, parsed.data);
      }

      const parsed = CreateSubjectSchema.safeParse({
        code: subjCode,
        name: subjName,
        shortName: subjShort,
        isActive: subjActive,
      });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'Matière invalide.');
      }
      return createSubject(parsed.data);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [...adminKeys.all, 'subjects'] });
      if (selectedClassId) {
        await queryClient.invalidateQueries({ queryKey: adminKeys.classSubjects(selectedClassId) });
      }
      setSubjectModalMode(null);
      setEditingSubject(null);
      setSubjError(null);
      toast.success(t('admin.subjects.subjectSaved'));
      refreshLocalSyncSnapshot();
    },
    onError: (err) => {
      const msg = getAdminErrorMessage(err);
      setSubjError(msg);
      toast.error(msg);
    },
  });

  const upsertCsMutation = useMutation({
    mutationFn: () => {
      if (!selectedClassId) throw new Error('Aucune classe sélectionnée.');
      const parsed = UpsertClassSubjectSchema.safeParse({
        classId: selectedClassId,
        subjectId: csSubjectId,
        subjectGroupId: csGroupId === NO_GROUP_VALUE ? null : csGroupId,
        coefficient: Number(csCoefficient),
      });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'Coefficient invalide.');
      }
      return upsertClassSubject(parsed.data);
    },
    onSuccess: async () => {
      if (selectedClassId) {
        await queryClient.invalidateQueries({ queryKey: adminKeys.classSubjects(selectedClassId) });
      }
      await queryClient.invalidateQueries({ queryKey: [...adminKeys.all, 'teacher-assignments'] });
      setCsModalOpen(false);
      setCsError(null);
      toast.success(t('admin.subjects.classSubjectSaved'));
      refreshLocalSyncSnapshot();
    },
    onError: (err) => {
      const msg = getAdminErrorMessage(err);
      setCsError(msg);
      toast.error(msg);
    },
  });

  const createAssignmentMutation = useMutation({
    mutationFn: () => {
      if (!selectedYearId) throw new Error('Aucune année scolaire sélectionnée.');
      const parsed = CreateTeacherAssignmentSchema.safeParse({
        teacherId: assignTeacherId,
        classSubjectId: assignClassSubjectId,
        academicYearId: selectedYearId,
      });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'Affectation invalide.');
      }
      return createTeacherAssignment(parsed.data);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [...adminKeys.all, 'teacher-assignments'] });
      setAssignModalOpen(false);
      setAssignError(null);
      toast.success(t('admin.subjects.assignmentCreated'));
      refreshLocalSyncSnapshot();
    },
    onError: (err) => {
      const msg = getAdminErrorMessage(err);
      setAssignError(msg);
      toast.error(msg);
    },
  });

  const removeAssignmentMutation = useMutation({
    mutationFn: (id: string) => deactivateTeacherAssignment(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [...adminKeys.all, 'teacher-assignments'] });
      setRemovingAssignment(null);
      toast.success(t('admin.subjects.assignmentRemoved'));
      refreshLocalSyncSnapshot();
    },
    onError: (err) => {
      toast.error(getAdminErrorMessage(err));
    },
  });

  const openAttachSubjectModal = (existing?: ClassSubjectDetailDto) => {
    setCsSubjectId(existing?.subjectId ?? activeSubjects[0]?.id ?? '');
    setCsGroupId(existing?.subjectGroupId ?? NO_GROUP_VALUE);
    setCsCoefficient(existing ? String(existing.coefficient) : '2');
    setCsError(null);
    setCsModalOpen(true);
  };

  const openAssignModal = () => {
    const initialClassId = selectedClassId || classes[0]?.id || '';
    setAssignClassId(initialClassId);
    setAssignClassSubjectId('');
    setAssignTeacherId(activeTeachers[0]?.id ?? '');
    setAssignError(null);
    setAssignModalOpen(true);
  };

  useEffect(() => {
    if (!assignModalOpen) return;
    const list = modalClassSubjectsQuery.data ?? [];
    if (list.length > 0 && !list.some((item) => item.id === assignClassSubjectId)) {
      setAssignClassSubjectId(list[0]!.id);
    } else if (list.length === 0) {
      setAssignClassSubjectId('');
    }
  }, [assignModalOpen, modalClassSubjectsQuery.data, assignClassSubjectId]);

  return (
    <div className="space-y-6">
      {/* 1. Matières & coefficients par classe */}
      <Card variant="elevated">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{t('admin.subjects.classSubjectsTitle')}</CardTitle>
            <CardDescription>{t('admin.subjects.classSubjectsDesc')}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedClassId && (
              <Badge variant="secondary" className="tabular-nums">
                {t('admin.subjects.totalCoefLabel', { total: totalCoefficients })}
              </Badge>
            )}
            <Button
              type="button"
              icon={<RiAddCircleFill />}
              disabled={
                !isOnline ||
                !selectedClassId ||
                hasLockedPeriod ||
                activeSubjects.length === 0
              }
              onClick={() => openAttachSubjectModal()}
            >
              {t('admin.subjects.addClassSubjectBtn')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasLockedPeriod && (
            <Card variant="info" className="flex items-center gap-3 p-4 text-sm font-semibold">
              <RiLockFill className="size-5 shrink-0" />
              <span>{t('admin.subjects.classSubjectsLockedBanner')}</span>
            </Card>
          )}

          {classes.length > 0 && (
            <div className="max-w-sm">
              <Dropdown
                label={t('admin.subjects.selectClassLabel')}
                value={selectedClassId}
                onChange={setSelectedClassId}
                options={classes.map((c) => ({
                  value: c.id,
                  label: c.name,
                  description: `${c.level}${c.series ? ` · Série ${c.series}` : ''}`,
                  icon: <RiSchoolFill />,
                }))}
              />
            </div>
          )}

          {classSubjectsQuery.isLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Spinner className="size-4 text-primary" />
              <span>{t('admin.common.loading')}</span>
            </div>
          ) : (classSubjectsQuery.data ?? []).length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-muted-foreground">
              Aucune matière associée à cette classe pour le moment.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="border-b border-border bg-muted/60 text-xs font-extrabold tracking-wide text-muted-foreground uppercase">
                  <tr>
                    <th className="px-4 py-3">{t('admin.subjects.codeLabel')}</th>
                    <th className="px-4 py-3">{t('admin.subjects.subjectSelectLabel')}</th>
                    <th className="px-4 py-3">{t('admin.subjects.subjectGroupSelectLabel')}</th>
                    <th className="px-4 py-3">{t('admin.subjects.coefficientLabel')}</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {(classSubjectsQuery.data ?? []).map((cs) => (
                    <tr key={cs.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-bold text-primary tabular-nums">
                        {cs.subjectCode}
                      </td>
                      <td className="px-4 py-3 font-bold">{cs.subjectName}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {cs.subjectGroupName ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="accent" className="tabular-nums">
                          {cs.coefficient}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          icon={<RiEdit2Fill />}
                          disabled={!isOnline || hasLockedPeriod}
                          onClick={() => openAttachSubjectModal(cs)}
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

      {/* 2. Affectations enseignants */}
      <Card variant="elevated">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{t('admin.subjects.assignmentsTitle')}</CardTitle>
            <CardDescription>{t('admin.subjects.assignmentsDesc')}</CardDescription>
          </div>
          <Button
            type="button"
            variant="accent"
            icon={<RiUserAddFill />}
            disabled={!isOnline || classes.length === 0 || activeTeachers.length === 0}
            onClick={openAssignModal}
          >
            {t('admin.subjects.newAssignmentBtn')}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {classes.length > 0 && (
            <div className="max-w-sm">
              <Dropdown
                label={t('admin.subjects.filterByClassLabel')}
                value={assignmentClassFilter}
                onChange={setAssignmentClassFilter}
                options={[
                  {
                    value: ALL_CLASSES_VALUE,
                    label: t('admin.subjects.allClassesOption'),
                    icon: <RiSchoolFill />,
                  },
                  ...classes.map((c) => ({
                    value: c.id,
                    label: c.name,
                    icon: <RiSchoolFill />,
                  })),
                ]}
              />
            </div>
          )}

          {assignmentsQuery.isLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Spinner className="size-4 text-primary" />
              <span>{t('admin.common.loading')}</span>
            </div>
          ) : (assignmentsQuery.data ?? []).length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-muted-foreground">
              Aucune affectation active pour ce filtre.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="border-b border-border bg-muted/60 text-xs font-extrabold tracking-wide text-muted-foreground uppercase">
                  <tr>
                    <th className="px-4 py-3">{t('admin.subjects.teacherSelectLabel')}</th>
                    <th className="px-4 py-3">{t('admin.classes.nameLabel')}</th>
                    <th className="px-4 py-3">{t('admin.subjects.subjectSelectLabel')}</th>
                    <th className="px-4 py-3">{t('admin.subjects.coefficientLabel')}</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {(assignmentsQuery.data ?? []).map((a) => (
                    <tr key={a.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-bold">
                        <span className="inline-flex items-center gap-2">
                          <RiUserStarFill className="size-4 text-primary" />
                          <span>{a.teacherName}</span>
                          <span className="text-xs font-medium text-muted-foreground">
                            @{a.teacherUsername}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold">{a.className}</td>
                      <td className="px-4 py-3">
                        <span className="mr-1.5 text-xs font-bold text-primary">
                          {a.subjectCode}
                        </span>
                        {a.subjectName}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{a.coefficient}</td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          icon={<RiDeleteBin6Fill />}
                          disabled={!isOnline}
                          onClick={() => setRemovingAssignment(a)}
                        >
                          {t('admin.subjects.removeAssignmentBtn')}
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

      {/* 3. Catalogue global des matières & Groupes de matières */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card variant="elevated">
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle>{t('admin.subjects.groupsTitle')}</CardTitle>
              <CardDescription>{t('admin.subjects.groupsDesc')}</CardDescription>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              icon={<RiFolderAddFill />}
              disabled={!isOnline || !selectedYearId}
              onClick={() => {
                setGroupName('');
                setGroupOrder(String((groupsQuery.data?.length ?? 0) + 1));
                setGroupError(null);
                setGroupOpen(true);
              }}
            >
              {t('admin.subjects.newGroupBtn')}
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {(groupsQuery.data ?? []).map((grp) => (
              <div
                key={grp.id}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2.5 text-sm"
              >
                <span className="font-bold">{grp.name}</span>
                <Badge variant="neutral" className="tabular-nums">
                  #{grp.orderIndex}
                </Badge>
              </div>
            ))}
            {(groupsQuery.data ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">Aucun groupe pour cette année.</p>
            )}
          </CardContent>
        </Card>

        <Card variant="elevated" className="lg:col-span-2">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>{t('admin.subjects.catalogTitle')}</CardTitle>
              <CardDescription>{t('admin.subjects.catalogDesc')}</CardDescription>
            </div>
            <Button
              type="button"
              size="sm"
              icon={<RiAddCircleFill />}
              disabled={!isOnline}
              onClick={() => {
                setSubjectModalMode('create');
                setEditingSubject(null);
                setSubjCode('');
                setSubjName('');
                setSubjShort('');
                setSubjActive(true);
                setSubjError(null);
              }}
            >
              {t('admin.subjects.newSubjectBtn')}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="border-b border-border bg-muted/60 text-xs font-extrabold tracking-wide text-muted-foreground uppercase">
                  <tr>
                    <th className="px-4 py-2.5">{t('admin.subjects.codeLabel')}</th>
                    <th className="px-4 py-2.5">{t('admin.subjects.nameLabel')}</th>
                    <th className="px-4 py-2.5">{t('admin.subjects.shortNameLabel')}</th>
                    <th className="px-4 py-2.5">Statut</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {(subjectsQuery.data ?? []).map((subj) => (
                    <tr key={subj.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-bold text-primary">{subj.code}</td>
                      <td className="px-4 py-2.5 font-semibold">{subj.name}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{subj.shortName}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant={subj.isActive ? 'success' : 'neutral'}>
                          {subj.isActive
                            ? t('admin.subjects.activeTag')
                            : t('admin.subjects.archivedTag')}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          icon={<RiEdit2Fill />}
                          disabled={!isOnline}
                          onClick={() => {
                            setSubjectModalMode('edit');
                            setEditingSubject(subj);
                            setSubjCode(subj.code);
                            setSubjName(subj.name);
                            setSubjShort(subj.shortName);
                            setSubjActive(subj.isActive);
                            setSubjError(null);
                          }}
                        >
                          {t('admin.common.edit')}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modale groupe de matières */}
      <Dialog open={groupOpen} onOpenChange={setGroupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.subjects.groupModalTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="subj-group-name">{t('admin.subjects.groupNameLabel')}</Label>
              <Input
                id="subj-group-name"
                placeholder={t('admin.subjects.groupNamePlaceholder')}
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subj-group-order">{t('admin.subjects.groupOrderLabel')}</Label>
              <Input
                id="subj-group-order"
                type="number"
                min={1}
                max={20}
                className="tabular-nums"
                value={groupOrder}
                onChange={(e) => setGroupOrder(e.target.value)}
              />
            </div>
            {groupError && <FieldMessage tone="error">{groupError}</FieldMessage>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setGroupOpen(false)}>
              {t('admin.common.cancel')}
            </Button>
            <Button
              type="button"
              loading={createGroupMutation.isPending}
              onClick={() => createGroupMutation.mutate()}
            >
              {t('admin.common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modale matière catalogue */}
      <Dialog
        open={subjectModalMode !== null}
        onOpenChange={(open) => !open && setSubjectModalMode(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {subjectModalMode === 'edit'
                ? t('admin.subjects.editSubjectModalTitle', { code: editingSubject?.code ?? '' })
                : t('admin.subjects.createSubjectModalTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="subject-code">{t('admin.subjects.codeLabel')}</Label>
                <Input
                  id="subject-code"
                  placeholder={t('admin.subjects.codePlaceholder')}
                  value={subjCode}
                  onChange={(e) => setSubjCode(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="subject-short">{t('admin.subjects.shortNameLabel')}</Label>
                <Input
                  id="subject-short"
                  placeholder={t('admin.subjects.shortNamePlaceholder')}
                  value={subjShort}
                  onChange={(e) => setSubjShort(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subject-name">{t('admin.subjects.nameLabel')}</Label>
              <Input
                id="subject-name"
                placeholder={t('admin.subjects.namePlaceholder')}
                value={subjName}
                onChange={(e) => setSubjName(e.target.value)}
              />
            </div>
            <Switch
              id="subject-active"
              checked={subjActive}
              onCheckedChange={setSubjActive}
              label={t('admin.subjects.activeLabel')}
            />
            {subjError && <FieldMessage tone="error">{subjError}</FieldMessage>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setSubjectModalMode(null)}>
              {t('admin.common.cancel')}
            </Button>
            <Button
              type="button"
              loading={saveSubjectMutation.isPending}
              onClick={() => saveSubjectMutation.mutate()}
            >
              {t('admin.common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modale matière-classe */}
      <Dialog open={csModalOpen} onOpenChange={setCsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.subjects.classSubjectModalTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Dropdown
              label={t('admin.subjects.subjectSelectLabel')}
              value={csSubjectId}
              onChange={setCsSubjectId}
              options={activeSubjects.map((s) => ({
                value: s.id,
                label: `${s.name} (${s.code})`,
                icon: <RiBookOpenFill />,
              }))}
            />
            <Dropdown
              label={t('admin.subjects.subjectGroupSelectLabel')}
              value={csGroupId}
              onChange={setCsGroupId}
              options={[
                {
                  value: NO_GROUP_VALUE,
                  label: t('admin.common.noneOption'),
                  icon: <RiFolderAddFill />,
                },
                ...(groupsQuery.data ?? []).map((g) => ({
                  value: g.id,
                  label: g.name,
                  icon: <RiFolderAddFill />,
                })),
              ]}
            />
            <div className="space-y-1.5">
              <Label htmlFor="cs-coefficient">{t('admin.subjects.coefficientLabel')}</Label>
              <Input
                id="cs-coefficient"
                type="number"
                step="0.5"
                min={0.01}
                max={20}
                className="tabular-nums"
                value={csCoefficient}
                onChange={(e) => setCsCoefficient(e.target.value)}
              />
            </div>
            {csError && <FieldMessage tone="error">{csError}</FieldMessage>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setCsModalOpen(false)}>
              {t('admin.common.cancel')}
            </Button>
            <Button
              type="button"
              loading={upsertCsMutation.isPending}
              onClick={() => upsertCsMutation.mutate()}
            >
              {t('admin.common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modale nouvelle affectation enseignant */}
      <Dialog open={assignModalOpen} onOpenChange={setAssignModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.subjects.assignmentModalTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Dropdown
              label={t('admin.classes.nameLabel')}
              value={assignClassId}
              onChange={(id) => {
                setAssignClassId(id);
                setAssignClassSubjectId('');
              }}
              options={classes.map((c) => ({
                value: c.id,
                label: c.name,
                icon: <RiSchoolFill />,
              }))}
            />
            <Dropdown
              label={t('admin.subjects.classSubjectSelectLabel')}
              placeholder={
                modalClassSubjectsQuery.isLoading
                  ? t('admin.common.loading')
                  : 'Aucune matière configurée dans cette classe'
              }
              value={assignClassSubjectId}
              onChange={setAssignClassSubjectId}
              options={(modalClassSubjectsQuery.data ?? []).map((cs) => ({
                value: cs.id,
                label: `${cs.subjectName} (${cs.subjectCode})`,
                description: `Coef. ${cs.coefficient}`,
                icon: <RiBookOpenFill />,
              }))}
            />
            <Dropdown
              label={t('admin.subjects.teacherSelectLabel')}
              value={assignTeacherId}
              onChange={setAssignTeacherId}
              options={activeTeachers.map((teacher) => ({
                value: teacher.id,
                label: teacher.fullName,
                description: `@${teacher.username}`,
                icon: <RiUserStarFill />,
              }))}
            />
            {assignError && <FieldMessage tone="error">{assignError}</FieldMessage>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setAssignModalOpen(false)}>
              {t('admin.common.cancel')}
            </Button>
            <Button
              type="button"
              loading={createAssignmentMutation.isPending}
              disabled={!assignClassSubjectId || !assignTeacherId}
              onClick={() => createAssignmentMutation.mutate()}
            >
              {t('admin.common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modale confirmation suppression affectation */}
      <Dialog
        open={Boolean(removingAssignment)}
        onOpenChange={(open) => !open && setRemovingAssignment(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.subjects.confirmRemoveAssignmentTitle')}</DialogTitle>
            <DialogDescription>
              {t('admin.subjects.confirmRemoveAssignmentBody', {
                teacher: removingAssignment?.teacherName ?? '',
                subject: removingAssignment?.subjectName ?? '',
                className: removingAssignment?.className ?? '',
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setRemovingAssignment(null)}>
              {t('admin.common.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              loading={removeAssignmentMutation.isPending}
              onClick={() =>
                removingAssignment && removeAssignmentMutation.mutate(removingAssignment.id)
              }
            >
              {t('admin.subjects.removeAssignmentBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
