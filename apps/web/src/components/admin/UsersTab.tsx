import {
  CreateUserSchema,
  ResetPasswordSchema,
  USER_ROLES,
  UpdateUserSchema,
  type AuthUserPayload,
  type UserRole,
} from '@lycee/shared';
import {
  RiEdit2Fill,
  RiInformationFill,
  RiKey2Fill,
  RiShieldUserFill,
  RiUserAddFill,
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
  DialogDescription,
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
  createUser,
  listUsers,
  resetUserPassword,
  updateUser,
  type AdminUserDto,
} from '@/lib/api/admin';
import { adminKeys } from '@/lib/api/query-keys';
import { t } from '@/lib/i18n';
import { getAdminErrorMessage } from './admin-utils';

const ALL_ROLES_VALUE = '__all__';
const CENSOR_MANAGEABLE: readonly UserRole[] = ['teacher', 'secretary'];

function roleBadgeVariant(role: UserRole) {
  switch (role) {
    case 'admin':
      return 'dark' as const;
    case 'censor':
      return 'accent' as const;
    case 'principal':
      return 'info' as const;
    case 'teacher':
      return 'success' as const;
    case 'secretary':
      return 'secondary' as const;
  }
}

export function UsersTab({
  actor,
  isOnline,
}: {
  actor: AuthUserPayload;
  isOnline: boolean;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>(ALL_ROLES_VALUE);

  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingUser, setEditingUser] = useState<AdminUserDto | null>(null);
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('teacher');
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const [resetTarget, setResetTarget] = useState<AdminUserDto | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: adminKeys.users(),
    queryFn: () => listUsers(),
  });

  const allowedAssignableRoles: readonly UserRole[] =
    actor.role === 'admin' ? USER_ROLES : CENSOR_MANAGEABLE;

  const canManageTarget = (target: AdminUserDto): boolean => {
    if (actor.role === 'admin') return true;
    if (actor.role === 'censor') {
      return CENSOR_MANAGEABLE.includes(target.role);
    }
    return false;
  };

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (usersQuery.data ?? []).filter((u) => {
      if (roleFilter !== ALL_ROLES_VALUE && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        u.fullName.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q)
      );
    });
  }, [usersQuery.data, search, roleFilter]);

  const saveUserMutation = useMutation({
    mutationFn: async () => {
      const normalizedEmail = email.trim() ? email.trim() : null;

      if (modalMode === 'edit' && editingUser) {
        const isSelf = editingUser.id === actor.id;
        const parsed = UpdateUserSchema.safeParse({
          fullName,
          email: normalizedEmail,
          ...(isSelf ? {} : { role, isActive }),
        });
        if (!parsed.success) {
          throw new Error(parsed.error.issues[0]?.message ?? 'Données utilisateur invalides.');
        }
        return updateUser(editingUser.id, parsed.data);
      }

      const parsed = CreateUserSchema.safeParse({
        username,
        fullName,
        email: normalizedEmail,
        role,
        password,
        isActive,
      });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'Données utilisateur invalides.');
      }
      return createUser(parsed.data);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [...adminKeys.all, 'users'] });
      setModalMode(null);
      setEditingUser(null);
      setFormError(null);
      toast.success(
        modalMode === 'edit' ? t('admin.users.userUpdated') : t('admin.users.userCreated'),
      );
    },
    onError: (err) => {
      const msg = getAdminErrorMessage(err);
      setFormError(msg);
      toast.error(msg);
    },
  });

  const resetPwdMutation = useMutation({
    mutationFn: () => {
      if (!resetTarget) throw new Error('Utilisateur non sélectionné.');
      const parsed = ResetPasswordSchema.safeParse({ newPassword: resetPasswordValue });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'Mot de passe invalide.');
      }
      return resetUserPassword(resetTarget.id, parsed.data);
    },
    onSuccess: () => {
      setResetTarget(null);
      setResetPasswordValue('');
      setResetError(null);
      toast.success(t('admin.users.passwordResetSuccess'));
    },
    onError: (err) => {
      const msg = getAdminErrorMessage(err);
      setResetError(msg);
      toast.error(msg);
    },
  });

  const openCreate = () => {
    setModalMode('create');
    setEditingUser(null);
    setUsername('');
    setFullName('');
    setEmail('');
    setRole('teacher');
    setPassword('');
    setIsActive(true);
    setFormError(null);
  };

  const openEdit = (target: AdminUserDto) => {
    setModalMode('edit');
    setEditingUser(target);
    setUsername(target.username);
    setFullName(target.fullName);
    setEmail(target.email ?? '');
    setRole(target.role);
    setPassword('');
    setIsActive(target.isActive);
    setFormError(null);
  };

  const isEditingSelf = editingUser?.id === actor.id;

  return (
    <div className="space-y-5">
      {actor.role === 'censor' && (
        <Card variant="info" className="flex items-center gap-3 p-4 text-sm font-semibold">
          <RiInformationFill className="size-5 shrink-0" />
          <span>{t('admin.users.censorNotice')}</span>
        </Card>
      )}

      <Card variant="elevated">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{t('admin.users.title')}</CardTitle>
            <CardDescription>{t('admin.users.desc')}</CardDescription>
          </div>
          <Button
            type="button"
            icon={<RiUserAddFill />}
            disabled={!isOnline}
            onClick={openCreate}
          >
            {t('admin.users.newUserBtn')}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1">
              <SearchInput
                aria-label={t('admin.users.searchPlaceholder')}
                placeholder={t('admin.users.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClear={() => setSearch('')}
              />
            </div>
            <div className="w-full sm:w-64">
              <Dropdown
                label={t('admin.users.roleFilterLabel')}
                value={roleFilter}
                onChange={setRoleFilter}
                options={[
                  {
                    value: ALL_ROLES_VALUE,
                    label: t('admin.users.allRoles'),
                    icon: <RiShieldUserFill />,
                  },
                  ...USER_ROLES.map((r) => ({
                    value: r,
                    label: t(`roles.${r}`),
                    icon: <RiShieldUserFill />,
                  })),
                ]}
              />
            </div>
          </div>

          {usersQuery.isLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Spinner className="size-4 text-primary" />
              <span>{t('admin.common.loading')}</span>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="border-b border-border bg-muted/60 text-xs font-extrabold tracking-wide text-muted-foreground uppercase">
                  <tr>
                    <th className="px-4 py-3">{t('admin.users.fullNameLabel')}</th>
                    <th className="px-4 py-3">{t('admin.users.usernameLabel')}</th>
                    <th className="px-4 py-3">{t('admin.users.roleLabel')}</th>
                    <th className="px-4 py-3">Statut</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {filteredUsers.map((u) => {
                    const editable = canManageTarget(u);
                    return (
                      <tr key={u.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <p className="font-bold text-foreground">{u.fullName}</p>
                          {u.email && (
                            <p className="text-xs text-muted-foreground">{u.email}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 font-semibold text-primary">@{u.username}</td>
                        <td className="px-4 py-3">
                          <Badge variant={roleBadgeVariant(u.role)}>
                            {t(`roles.${u.role}`)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={u.isActive ? 'success' : 'neutral'}>
                            {u.isActive
                              ? t('admin.users.statusActive')
                              : t('admin.users.statusInactive')}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {editable && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                icon={<RiEdit2Fill />}
                                disabled={!isOnline}
                                onClick={() => openEdit(u)}
                              >
                                {t('admin.common.edit')}
                              </Button>
                            )}
                            {actor.role === 'admin' && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                icon={<RiKey2Fill />}
                                disabled={!isOnline}
                                onClick={() => {
                                  setResetTarget(u);
                                  setResetPasswordValue('');
                                  setResetError(null);
                                }}
                              >
                                {t('admin.users.resetPasswordBtn')}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modale création/édition utilisateur */}
      <Dialog open={modalMode !== null} onOpenChange={(open) => !open && setModalMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {modalMode === 'edit'
                ? t('admin.users.editModalTitle', { name: editingUser?.fullName ?? '' })
                : t('admin.users.createModalTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {modalMode === 'create' && (
              <div className="space-y-1.5">
                <Label htmlFor="user-username">{t('admin.users.usernameLabel')}</Label>
                <Input
                  id="user-username"
                  placeholder={t('admin.users.usernamePlaceholder')}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="user-fullname">{t('admin.users.fullNameLabel')}</Label>
              <Input
                id="user-fullname"
                placeholder={t('admin.users.fullNamePlaceholder')}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="user-email" optional>
                {t('admin.users.emailLabel')}
              </Label>
              <Input
                id="user-email"
                type="email"
                placeholder={t('admin.users.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {!isEditingSelf ? (
              <>
                <Dropdown
                  label={t('admin.users.roleLabel')}
                  value={role}
                  onChange={(v) => setRole(v as UserRole)}
                  options={allowedAssignableRoles.map((r) => ({
                    value: r,
                    label: t(`roles.${r}`),
                    icon: <RiShieldUserFill />,
                  }))}
                />
                <Switch
                  id="user-active-switch"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                  label={t('admin.users.isActiveLabel')}
                  description={t('admin.users.isActiveDesc')}
                />
              </>
            ) : (
              <FieldMessage tone="hint">{t('admin.users.selfProtectHint')}</FieldMessage>
            )}

            {modalMode === 'create' && (
              <div className="space-y-1.5">
                <Label htmlFor="user-password">{t('admin.users.passwordLabel')}</Label>
                <Input
                  id="user-password"
                  type="password"
                  passwordToggle
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            )}

            {formError && <FieldMessage tone="error">{formError}</FieldMessage>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setModalMode(null)}>
              {t('admin.common.cancel')}
            </Button>
            <Button
              type="button"
              loading={saveUserMutation.isPending}
              disabled={!isOnline}
              onClick={() => saveUserMutation.mutate()}
            >
              {saveUserMutation.isPending ? t('admin.common.saving') : t('admin.common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modale réinitialisation mot de passe (admin uniquement) */}
      <Dialog open={Boolean(resetTarget)} onOpenChange={(open) => !open && setResetTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('admin.users.resetPasswordModalTitle', { name: resetTarget?.fullName ?? '' })}
            </DialogTitle>
            <DialogDescription>{t('admin.users.resetPasswordDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="reset-new-password">{t('admin.users.newPasswordLabel')}</Label>
              <Input
                id="reset-new-password"
                type="password"
                passwordToggle
                value={resetPasswordValue}
                onChange={(e) => setResetPasswordValue(e.target.value)}
              />
            </div>
            {resetError && <FieldMessage tone="error">{resetError}</FieldMessage>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setResetTarget(null)}>
              {t('admin.common.cancel')}
            </Button>
            <Button
              type="button"
              loading={resetPwdMutation.isPending}
              disabled={!isOnline}
              onClick={() => resetPwdMutation.mutate()}
            >
              {t('admin.common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
