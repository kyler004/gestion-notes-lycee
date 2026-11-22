import { zodResolver } from '@hookform/resolvers/zod';
import { UpdateSchoolProfileSchema } from '@lycee/shared';
import {
  RiBuilding2Fill,
  RiImage2Fill,
  RiImageUploadFill,
  RiInformationFill,
  RiSaveFill,
} from '@remixicon/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { FieldMessage, Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import {
  fetchSchoolLogoBlob,
  fileToLogoPayload,
  getSchoolProfile,
  updateSchoolProfile,
  uploadSchoolLogo,
} from '@/lib/api/admin';
import { adminKeys } from '@/lib/api/query-keys';
import { t } from '@/lib/i18n';
import { getAdminErrorMessage } from './admin-utils';

type SchoolFormValues = z.input<typeof UpdateSchoolProfileSchema>;

export function SchoolSettingsTab({
  canEdit,
  isOnline,
}: {
  canEdit: boolean;
  isOnline: boolean;
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);

  const profileQuery = useQuery({
    queryKey: adminKeys.school(),
    queryFn: getSchoolProfile,
  });

  const logoQuery = useQuery({
    queryKey: adminKeys.schoolLogo(profileQuery.data?.updatedAt),
    queryFn: fetchSchoolLogoBlob,
    enabled: Boolean(profileQuery.data?.hasLogo),
  });

  useEffect(() => {
    const blob = logoQuery.data;
    if (!blob) {
      setLogoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(blob);
    setLogoPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [logoQuery.data]);

  const form = useForm<SchoolFormValues>({
    resolver: zodResolver(UpdateSchoolProfileSchema),
    defaultValues: {
      name: '',
      motto: '',
      country: 'République du Cameroun',
      ministry: 'Ministère des Enseignements Secondaires',
      region: '',
      delegation: '',
      city: '',
      phone: '',
      email: '',
    },
  });

  useEffect(() => {
    const p = profileQuery.data;
    if (!p) return;
    form.reset({
      name: p.name,
      motto: p.motto,
      country: p.country,
      ministry: p.ministry,
      region: p.region,
      delegation: p.delegation,
      city: p.city,
      phone: p.phone,
      email: p.email,
    });
  }, [profileQuery.data, form]);

  const saveMutation = useMutation({
    mutationFn: (values: SchoolFormValues) =>
      updateSchoolProfile(UpdateSchoolProfileSchema.parse(values)),
    onSuccess: (updated) => {
      queryClient.setQueryData(adminKeys.school(), updated);
      toast.success(t('admin.school.savedSuccess'));
    },
    onError: (err) => {
      toast.error(getAdminErrorMessage(err));
    },
  });

  const logoMutation = useMutation({
    mutationFn: async (file: File) => {
      const payload = await fileToLogoPayload(file);
      return uploadSchoolLogo(payload);
    },
    onSuccess: async (updated) => {
      setLogoError(null);
      queryClient.setQueryData(adminKeys.school(), updated);
      await queryClient.invalidateQueries({ queryKey: [...adminKeys.all, 'school-logo'] });
      toast.success(t('admin.school.logoSuccess'));
    },
    onError: (err) => {
      const message = getAdminErrorMessage(err);
      setLogoError(message);
      toast.error(message);
    },
  });

  if (profileQuery.isLoading) {
    return (
      <Card className="flex items-center justify-center gap-3 p-12 text-sm text-muted-foreground">
        <Spinner className="size-5 text-primary" />
        <span>{t('admin.common.loading')}</span>
      </Card>
    );
  }

  if (profileQuery.isError) {
    return (
      <Card variant="outline" className="p-6 text-sm text-brick-500">
        {getAdminErrorMessage(profileQuery.error)}
      </Card>
    );
  }

  const readOnly = !canEdit || !isOnline;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = form;

  return (
    <div className="space-y-6">
      {!canEdit && (
        <Card variant="info" className="flex items-center gap-3 p-4 text-sm font-semibold">
          <RiInformationFill className="size-5 shrink-0" />
          <span>{t('admin.common.readOnlyNotice')}</span>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Identité établissement */}
        <Card variant="elevated" className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>{t('admin.school.profileTitle')}</CardTitle>
                <CardDescription>{t('admin.school.profileDesc')}</CardDescription>
              </div>
              <span className="grid size-10 shrink-0 place-items-center rounded-md bg-violet-50 text-violet-400">
                <RiBuilding2Fill className="size-5" />
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={handleSubmit((values) => saveMutation.mutate(values))}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="school-name">{t('admin.school.nameLabel')}</Label>
                  <Input
                    id="school-name"
                    placeholder={t('admin.school.namePlaceholder')}
                    disabled={readOnly || saveMutation.isPending}
                    state={errors.name ? 'error' : 'default'}
                    {...register('name')}
                  />
                  {errors.name && <FieldMessage tone="error">{errors.name.message}</FieldMessage>}
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="school-motto" optional>
                    {t('admin.school.mottoLabel')}
                  </Label>
                  <Input
                    id="school-motto"
                    placeholder={t('admin.school.mottoPlaceholder')}
                    disabled={readOnly || saveMutation.isPending}
                    {...register('motto')}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="school-country">{t('admin.school.countryLabel')}</Label>
                  <Input
                    id="school-country"
                    disabled={readOnly || saveMutation.isPending}
                    state={errors.country ? 'error' : 'default'}
                    {...register('country')}
                  />
                  {errors.country && (
                    <FieldMessage tone="error">{errors.country.message}</FieldMessage>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="school-ministry" optional>
                    {t('admin.school.ministryLabel')}
                  </Label>
                  <Input
                    id="school-ministry"
                    disabled={readOnly || saveMutation.isPending}
                    {...register('ministry')}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="school-region" optional>
                    {t('admin.school.regionLabel')}
                  </Label>
                  <Input
                    id="school-region"
                    placeholder={t('admin.school.regionPlaceholder')}
                    disabled={readOnly || saveMutation.isPending}
                    {...register('region')}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="school-delegation" optional>
                    {t('admin.school.delegationLabel')}
                  </Label>
                  <Input
                    id="school-delegation"
                    placeholder={t('admin.school.delegationPlaceholder')}
                    disabled={readOnly || saveMutation.isPending}
                    {...register('delegation')}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="school-city" optional>
                    {t('admin.school.cityLabel')}
                  </Label>
                  <Input
                    id="school-city"
                    placeholder={t('admin.school.cityPlaceholder')}
                    disabled={readOnly || saveMutation.isPending}
                    {...register('city')}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="school-phone" optional>
                    {t('admin.school.phoneLabel')}
                  </Label>
                  <Input
                    id="school-phone"
                    placeholder={t('admin.school.phonePlaceholder')}
                    disabled={readOnly || saveMutation.isPending}
                    {...register('phone')}
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="school-email" optional>
                    {t('admin.school.emailLabel')}
                  </Label>
                  <Input
                    id="school-email"
                    type="email"
                    placeholder={t('admin.school.emailPlaceholder')}
                    disabled={readOnly || saveMutation.isPending}
                    state={errors.email ? 'error' : 'default'}
                    {...register('email')}
                  />
                  {errors.email && (
                    <FieldMessage tone="error">{errors.email.message}</FieldMessage>
                  )}
                </div>
              </div>

              {canEdit && (
                <div className="flex justify-end pt-2">
                  <Button
                    type="submit"
                    icon={<RiSaveFill />}
                    loading={saveMutation.isPending}
                    disabled={!isOnline}
                  >
                    {saveMutation.isPending ? t('admin.common.saving') : t('admin.common.save')}
                  </Button>
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Logo officiel */}
        <Card variant="elevated" className="flex flex-col">
          <CardHeader>
            <CardTitle>{t('admin.school.logoTitle')}</CardTitle>
            <CardDescription>{t('admin.school.logoDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col justify-between gap-5">
            <div className="flex min-h-48 items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-muted/45 p-5">
              {logoQuery.isLoading ? (
                <Spinner className="size-6 text-primary" />
              ) : logoPreviewUrl ? (
                <img
                  src={logoPreviewUrl}
                  alt={t('admin.school.logoTitle')}
                  className="max-h-36 max-w-full rounded-sm object-contain shadow-xs"
                />
              ) : (
                <div className="space-y-2 text-center text-muted-foreground">
                  <RiImage2Fill className="mx-auto size-10 text-slate-300" />
                  <p className="text-xs font-medium">{t('admin.school.logoEmpty')}</p>
                </div>
              )}
            </div>

            {profileQuery.data?.hasLogo && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Format enregistré</span>
                <Badge variant="success">{profileQuery.data.logoMimeType ?? 'image'}</Badge>
              </div>
            )}

            {logoError && <FieldMessage tone="error">{logoError}</FieldMessage>}

            {canEdit && (
              <div>
                <input
                  ref={fileInputRef}
                  data-testid="school-logo-input"
                  type="file"
                  accept="image/png,image/jpeg"
                  className="sr-only"
                  disabled={!isOnline || logoMutation.isPending}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (!file) return;
                    if (
                      (file.type !== 'image/png' && file.type !== 'image/jpeg') ||
                      file.size > 512 * 1024
                    ) {
                      setLogoError(t('admin.school.logoInvalidError'));
                      return;
                    }
                    setLogoError(null);
                    logoMutation.mutate(file);
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  icon={<RiImageUploadFill />}
                  loading={logoMutation.isPending}
                  disabled={!isOnline}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {profileQuery.data?.hasLogo
                    ? t('admin.school.logoReplaceButton')
                    : t('admin.school.logoUploadButton')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
