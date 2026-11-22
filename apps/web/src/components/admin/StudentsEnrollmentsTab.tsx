import {
  CreateEnrollmentSchema,
  CreateStudentSchema,
  UpdateEnrollmentSchema,
  UpdateStudentSchema,
  type EnrollmentStatus,
  type StudentSex,
} from '@lycee/shared';
import {
  RiEdit2Fill,
  RiGroupFill,
  RiSchoolFill,
  RiUserAddFill,
  RiUserFill,
} from '@remixicon/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
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
import { Switch } from '@/components/ui/switch';
import {
  createEnrollment,
  createStudent,
  listClasses,
  listClassStudents,
  listStudents,
  updateEnrollment,
  updateStudent,
  type ClassStudentDto,
  type StudentDto,
} from '@/lib/api/admin';
import { adminKeys } from '@/lib/api/query-keys';
import { t } from '@/lib/i18n';
import { getAdminErrorMessage, refreshLocalSyncSnapshot } from './admin-utils';

type StatusFilter = 'all' | EnrollmentStatus;

function enrollmentStatusBadge(status: EnrollmentStatus) {
  switch (status) {
    case 'active':
      return <Badge variant="success">{t('admin.students.rowStatusActive')}</Badge>;
    case 'transferred':
      return <Badge variant="info">{t('admin.students.rowStatusTransferred')}</Badge>;
    case 'dropped':
      return <Badge variant="warning">{t('admin.students.rowStatusDropped')}</Badge>;
  }
}

export function StudentsEnrollmentsTab({
  selectedYearId,
  isOnline,
}: {
  selectedYearId?: string;
  isOnline: boolean;
}) {
  const queryClient = useQueryClient();

  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [registrySearch, setRegistrySearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Modale élève (création + inscription optionnelle ou édition)
  const [studentModalMode, setStudentModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [matricule, setMatricule] = useState('');
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [birthDate, setBirthDate] = useState('2010-05-14');
  const [birthPlace, setBirthPlace] = useState('');
  const [sex, setSex] = useState<StudentSex>('M');
  const [enrollImmediately, setEnrollImmediately] = useState(true);
  const [enrollRepeaterOnCreate, setEnrollRepeaterOnCreate] = useState(false);
  const [studentFormError, setStudentFormError] = useState<string | null>(null);

  // Modale inscription élève existant
  const [enrollingStudent, setEnrollingStudent] = useState<StudentDto | null>(null);
  const [enrollTargetClassId, setEnrollTargetClassId] = useState('');
  const [enrollIsRepeater, setEnrollIsRepeater] = useState(false);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  // Modale mise à jour inscription (statut / redoublement / transfert)
  const [editingEnrollment, setEditingEnrollment] = useState<ClassStudentDto | null>(null);
  const [editEnrollClassId, setEditEnrollClassId] = useState('');
  const [editEnrollStatus, setEditEnrollStatus] = useState<EnrollmentStatus>('active');
  const [editEnrollRepeater, setEditEnrollRepeater] = useState(false);
  const [editEnrollError, setEditEnrollError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(registrySearch.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [registrySearch]);

  const classesQuery = useQuery({
    queryKey: adminKeys.classes(selectedYearId),
    queryFn: () => listClasses(selectedYearId),
    enabled: Boolean(selectedYearId),
  });

  const classes = classesQuery.data ?? [];

  useEffect(() => {
    if (classes.length > 0 && !classes.some((c) => c.id === selectedClassId)) {
      setSelectedClassId(classes[0]!.id);
    } else if (classes.length === 0) {
      setSelectedClassId('');
    }
  }, [classes, selectedClassId]);

  const classStudentsQuery = useQuery({
    queryKey: adminKeys.classStudents(
      selectedClassId,
      statusFilter === 'all' ? undefined : statusFilter,
    ),
    queryFn: () =>
      listClassStudents(selectedClassId, statusFilter === 'all' ? undefined : statusFilter),
    enabled: Boolean(selectedClassId),
  });

  const registryQuery = useQuery({
    queryKey: adminKeys.students(debouncedSearch),
    queryFn: () => listStudents(debouncedSearch, 100, 0),
  });

  const invalidateStudentQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [...adminKeys.all, 'students'] }),
      queryClient.invalidateQueries({ queryKey: [...adminKeys.all, 'class-students'] }),
    ]);
    refreshLocalSyncSnapshot();
  };

  const saveStudentMutation = useMutation({
    mutationFn: async () => {
      if (studentModalMode === 'edit' && editingStudentId) {
        const parsed = UpdateStudentSchema.safeParse({
          matricule,
          lastName,
          firstName,
          birthDate,
          birthPlace,
          sex,
        });
        if (!parsed.success) {
          throw new Error(parsed.error.issues[0]?.message ?? 'Fiche élève invalide.');
        }
        const updated = await updateStudent(editingStudentId, parsed.data);
        return { student: updated, enrolled: false };
      }

      const parsed = CreateStudentSchema.safeParse({
        matricule,
        lastName,
        firstName,
        birthDate,
        birthPlace,
        sex,
      });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'Fiche élève invalide.');
      }
      const created = await createStudent(parsed.data);

      if (enrollImmediately && selectedClassId && selectedYearId) {
        const enrollParsed = CreateEnrollmentSchema.parse({
          studentId: created.id,
          classId: selectedClassId,
          academicYearId: selectedYearId,
          isRepeater: enrollRepeaterOnCreate,
          status: 'active',
        });
        await createEnrollment(enrollParsed);
        return { student: created, enrolled: true };
      }
      return { student: created, enrolled: false };
    },
    onSuccess: async (res) => {
      await invalidateStudentQueries();
      setStudentModalMode(null);
      setEditingStudentId(null);
      setStudentFormError(null);
      toast.success(
        res.enrolled
          ? t('admin.students.studentAndEnrolledSuccess')
          : t('admin.students.studentSaved'),
      );
    },
    onError: (err) => {
      const msg = getAdminErrorMessage(err);
      setStudentFormError(msg);
      toast.error(msg);
    },
  });

  const enrollExistingMutation = useMutation({
    mutationFn: () => {
      if (!enrollingStudent || !selectedYearId || !enrollTargetClassId) {
        throw new Error('Sélectionnez une classe et une année scolaire.');
      }
      const parsed = CreateEnrollmentSchema.parse({
        studentId: enrollingStudent.id,
        classId: enrollTargetClassId,
        academicYearId: selectedYearId,
        isRepeater: enrollIsRepeater,
        status: 'active',
      });
      return createEnrollment(parsed);
    },
    onSuccess: async () => {
      await invalidateStudentQueries();
      setEnrollingStudent(null);
      setEnrollError(null);
      toast.success(t('admin.students.enrollmentCreated'));
    },
    onError: (err) => {
      const msg = getAdminErrorMessage(err);
      setEnrollError(msg);
      toast.error(msg);
    },
  });

  const updateEnrollmentMutation = useMutation({
    mutationFn: () => {
      if (!editingEnrollment) throw new Error('Inscription non sélectionnée.');
      const parsed = UpdateEnrollmentSchema.parse({
        classId:
          editEnrollClassId !== editingEnrollment.classId ? editEnrollClassId : undefined,
        isRepeater: editEnrollRepeater,
        status: editEnrollStatus,
      });
      return updateEnrollment(editingEnrollment.enrollmentId, parsed);
    },
    onSuccess: async () => {
      await invalidateStudentQueries();
      setEditingEnrollment(null);
      setEditEnrollError(null);
      toast.success(t('admin.students.enrollmentUpdated'));
    },
    onError: (err) => {
      const msg = getAdminErrorMessage(err);
      setEditEnrollError(msg);
      toast.error(msg);
    },
  });

  const openCreateStudent = () => {
    setStudentModalMode('create');
    setEditingStudentId(null);
    setMatricule('');
    setLastName('');
    setFirstName('');
    setBirthDate('2010-05-14');
    setBirthPlace('');
    setSex('M');
    setEnrollImmediately(Boolean(selectedClassId));
    setEnrollRepeaterOnCreate(false);
    setStudentFormError(null);
  };

  const openEditStudent = (s: {
    id: string;
    matricule: string;
    lastName: string;
    firstName: string;
    birthDate: string;
    birthPlace: string;
    sex: StudentSex;
  }) => {
    setStudentModalMode('edit');
    setEditingStudentId(s.id);
    setMatricule(s.matricule);
    setLastName(s.lastName);
    setFirstName(s.firstName);
    setBirthDate(s.birthDate);
    setBirthPlace(s.birthPlace);
    setSex(s.sex);
    setStudentFormError(null);
  };

  const openEditEnrollment = (row: ClassStudentDto) => {
    setEditingEnrollment(row);
    setEditEnrollClassId(row.classId);
    setEditEnrollStatus(row.status);
    setEditEnrollRepeater(row.isRepeater);
    setEditEnrollError(null);
  };

  const statusButtons: Array<{ value: StatusFilter; label: string }> = [
    { value: 'all', label: t('admin.students.statusAll') },
    { value: 'active', label: t('admin.students.statusActive') },
    { value: 'transferred', label: t('admin.students.statusTransferred') },
    { value: 'dropped', label: t('admin.students.statusDropped') },
  ];

  return (
    <div className="space-y-6">
      {/* 1. Effectif par classe */}
      <Card variant="elevated">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{t('admin.students.rosterTitle')}</CardTitle>
            <CardDescription>{t('admin.students.rosterDesc')}</CardDescription>
          </div>
          <Button
            type="button"
            icon={<RiUserAddFill />}
            disabled={!isOnline}
            onClick={openCreateStudent}
          >
            {t('admin.students.newStudentBtn')}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {classes.length > 0 ? (
              <div className="w-full sm:w-80">
                <Dropdown
                  label={t('admin.students.selectClassLabel')}
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
            ) : (
              <p className="text-sm text-muted-foreground">
                Aucune classe disponible pour cette année scolaire.
              </p>
            )}

            <div className="flex flex-wrap gap-1.5">
              {statusButtons.map((btn) => (
                <Button
                  key={btn.value}
                  type="button"
                  size="sm"
                  variant={statusFilter === btn.value ? 'dark' : 'outline'}
                  onClick={() => setStatusFilter(btn.value)}
                >
                  {btn.label}
                </Button>
              ))}
            </div>
          </div>

          {selectedClassId &&
            (classStudentsQuery.isLoading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Spinner className="size-4 text-primary" />
                <span>{t('admin.common.loading')}</span>
              </div>
            ) : (classStudentsQuery.data ?? []).length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-muted-foreground">
                Aucun élève correspondant dans cette classe.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="border-b border-border bg-muted/60 text-xs font-extrabold tracking-wide text-muted-foreground uppercase">
                    <tr>
                      <th className="px-4 py-3">{t('admin.students.matriculeLabel')}</th>
                      <th className="px-4 py-3">Élève</th>
                      <th className="px-4 py-3">{t('admin.students.sexLabel')}</th>
                      <th className="px-4 py-3">{t('admin.students.birthDateLabel')}</th>
                      <th className="px-4 py-3">Statut</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-card">
                    {(classStudentsQuery.data ?? []).map((row) => (
                      <tr key={row.enrollmentId} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-bold text-primary tabular-nums">
                          {row.matricule}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-foreground">
                              {row.lastName} {row.firstName}
                            </span>
                            {row.isRepeater && (
                              <Badge variant="accent">{t('grades.repeaterTag')}</Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-semibold">{row.sex}</td>
                        <td className="px-4 py-3 text-muted-foreground tabular-nums">
                          {row.birthDate}
                        </td>
                        <td className="px-4 py-3">{enrollmentStatusBadge(row.status)}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              icon={<RiEdit2Fill />}
                              disabled={!isOnline}
                              onClick={() =>
                                openEditStudent({
                                  id: row.studentId,
                                  matricule: row.matricule,
                                  lastName: row.lastName,
                                  firstName: row.firstName,
                                  birthDate: row.birthDate,
                                  birthPlace: row.birthPlace,
                                  sex: row.sex,
                                })
                              }
                            >
                              Fiche
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={!isOnline}
                              onClick={() => openEditEnrollment(row)}
                            >
                              Inscription
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
        </CardContent>
      </Card>

      {/* 2. Registre global des élèves */}
      <Card variant="elevated">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>{t('admin.students.registryTitle')}</CardTitle>
              <CardDescription>{t('admin.students.registryDesc')}</CardDescription>
            </div>
            <span className="grid size-10 shrink-0 place-items-center rounded-md bg-violet-50 text-violet-400">
              <RiGroupFill className="size-5" />
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-lg">
            <SearchInput
              aria-label={t('admin.students.searchPlaceholder')}
              placeholder={t('admin.students.searchPlaceholder')}
              value={registrySearch}
              onChange={(e) => setRegistrySearch(e.target.value)}
              onClear={() => setRegistrySearch('')}
            />
          </div>

          {registryQuery.isLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Spinner className="size-4 text-primary" />
              <span>{t('admin.common.loading')}</span>
            </div>
          ) : (registryQuery.data ?? []).length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-muted-foreground">
              Aucun élève trouvé dans le registre.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="border-b border-border bg-muted/60 text-xs font-extrabold tracking-wide text-muted-foreground uppercase">
                  <tr>
                    <th className="px-4 py-3">{t('admin.students.matriculeLabel')}</th>
                    <th className="px-4 py-3">Nom & Prénom</th>
                    <th className="px-4 py-3">{t('admin.students.birthDateLabel')}</th>
                    <th className="px-4 py-3">{t('admin.students.birthPlaceLabel')}</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {(registryQuery.data ?? []).map((student) => (
                    <tr key={student.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-bold text-primary tabular-nums">
                        {student.matricule}
                      </td>
                      <td className="px-4 py-3 font-bold">
                        {student.lastName} {student.firstName}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">
                        {student.birthDate}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {student.birthPlace || '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            icon={<RiEdit2Fill />}
                            disabled={!isOnline}
                            onClick={() => openEditStudent(student)}
                          >
                            {t('admin.common.edit')}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={!isOnline || classes.length === 0 || !selectedYearId}
                            onClick={() => {
                              setEnrollingStudent(student);
                              setEnrollTargetClassId(selectedClassId || classes[0]?.id || '');
                              setEnrollIsRepeater(false);
                              setEnrollError(null);
                            }}
                          >
                            {t('admin.students.enrollExistingBtn')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modale création/édition élève */}
      <Dialog
        open={studentModalMode !== null}
        onOpenChange={(open) => !open && setStudentModalMode(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {studentModalMode === 'edit'
                ? t('admin.students.editStudentTitle')
                : t('admin.students.createStudentTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="student-matricule">{t('admin.students.matriculeLabel')}</Label>
                <Input
                  id="student-matricule"
                  placeholder={t('admin.students.matriculePlaceholder')}
                  className="tabular-nums"
                  value={matricule}
                  onChange={(e) => setMatricule(e.target.value)}
                />
              </div>
              <Dropdown
                label={t('admin.students.sexLabel')}
                value={sex}
                onChange={(v) => setSex(v as StudentSex)}
                options={[
                  { value: 'M', label: t('admin.students.sexM'), icon: <RiUserFill /> },
                  { value: 'F', label: t('admin.students.sexF'), icon: <RiUserFill /> },
                ]}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="student-lastname">{t('admin.students.lastNameLabel')}</Label>
                <Input
                  id="student-lastname"
                  placeholder={t('admin.students.lastNamePlaceholder')}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="student-firstname">{t('admin.students.firstNameLabel')}</Label>
                <Input
                  id="student-firstname"
                  placeholder={t('admin.students.firstNamePlaceholder')}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="student-birthdate">{t('admin.students.birthDateLabel')}</Label>
                <Input
                  id="student-birthdate"
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="student-birthplace" optional>
                  {t('admin.students.birthPlaceLabel')}
                </Label>
                <Input
                  id="student-birthplace"
                  placeholder={t('admin.students.birthPlacePlaceholder')}
                  value={birthPlace}
                  onChange={(e) => setBirthPlace(e.target.value)}
                />
              </div>
            </div>

            {studentModalMode === 'create' && selectedClassId && selectedYearId && (
              <div className="space-y-2.5 pt-1">
                <Switch
                  id="student-enroll-now"
                  checked={enrollImmediately}
                  onCheckedChange={setEnrollImmediately}
                  label={t('admin.students.enrollNowLabel')}
                  description={t('admin.students.enrollNowDesc')}
                />
                {enrollImmediately && (
                  <Switch
                    id="student-create-repeater"
                    checked={enrollRepeaterOnCreate}
                    onCheckedChange={setEnrollRepeaterOnCreate}
                    label={t('admin.students.isRepeaterLabel')}
                  />
                )}
              </div>
            )}

            {studentFormError && <FieldMessage tone="error">{studentFormError}</FieldMessage>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setStudentModalMode(null)}>
              {t('admin.common.cancel')}
            </Button>
            <Button
              type="button"
              loading={saveStudentMutation.isPending}
              disabled={!isOnline}
              onClick={() => saveStudentMutation.mutate()}
            >
              {saveStudentMutation.isPending
                ? t('admin.common.saving')
                : t('admin.common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modale inscription élève existant */}
      <Dialog
        open={Boolean(enrollingStudent)}
        onOpenChange={(open) => !open && setEnrollingStudent(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('admin.students.enrollExistingTitle', {
                name: enrollingStudent
                  ? `${enrollingStudent.lastName} ${enrollingStudent.firstName}`
                  : '',
              })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Dropdown
              label={t('admin.students.classTransferLabel')}
              value={enrollTargetClassId}
              onChange={setEnrollTargetClassId}
              options={classes.map((c) => ({
                value: c.id,
                label: c.name,
                icon: <RiSchoolFill />,
              }))}
            />
            <Switch
              id="enroll-existing-repeater"
              checked={enrollIsRepeater}
              onCheckedChange={setEnrollIsRepeater}
              label={t('admin.students.isRepeaterLabel')}
            />
            {enrollError && <FieldMessage tone="error">{enrollError}</FieldMessage>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setEnrollingStudent(null)}>
              {t('admin.common.cancel')}
            </Button>
            <Button
              type="button"
              loading={enrollExistingMutation.isPending}
              disabled={!enrollTargetClassId || !isOnline}
              onClick={() => enrollExistingMutation.mutate()}
            >
              {t('admin.common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modale modification inscription */}
      <Dialog
        open={Boolean(editingEnrollment)}
        onOpenChange={(open) => !open && setEditingEnrollment(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('admin.students.editEnrollmentTitle', {
                name: editingEnrollment
                  ? `${editingEnrollment.lastName} ${editingEnrollment.firstName}`
                  : '',
              })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Dropdown
              label={t('admin.students.classTransferLabel')}
              value={editEnrollClassId}
              onChange={setEditEnrollClassId}
              options={classes.map((c) => ({
                value: c.id,
                label: c.name,
                icon: <RiSchoolFill />,
              }))}
            />
            <Dropdown
              label={t('admin.students.enrollmentStatusLabel')}
              value={editEnrollStatus}
              onChange={(v) => setEditEnrollStatus(v as EnrollmentStatus)}
              options={[
                { value: 'active', label: t('admin.students.rowStatusActive') },
                { value: 'transferred', label: t('admin.students.rowStatusTransferred') },
                { value: 'dropped', label: t('admin.students.rowStatusDropped') },
              ]}
            />
            <Switch
              id="edit-enrollment-repeater"
              checked={editEnrollRepeater}
              onCheckedChange={setEditEnrollRepeater}
              label={t('admin.students.isRepeaterLabel')}
            />
            {editEnrollError && <FieldMessage tone="error">{editEnrollError}</FieldMessage>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setEditingEnrollment(null)}>
              {t('admin.common.cancel')}
            </Button>
            <Button
              type="button"
              loading={updateEnrollmentMutation.isPending}
              disabled={!isOnline}
              onClick={() => updateEnrollmentMutation.mutate()}
            >
              {t('admin.common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
