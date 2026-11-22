import {
  RiBookOpenFill,
  RiBuilding2Fill,
  RiCalendar2Fill,
  RiGroupFill,
  RiSchoolFill,
  RiShieldUserFill,
  RiWifiOffFill,
} from '@remixicon/react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { AcademicStructureTab } from '@/components/admin/AcademicStructureTab';
import { AdminYearContextBar } from '@/components/admin/AdminYearContextBar';
import { ClassesTab } from '@/components/admin/ClassesTab';
import { SchoolSettingsTab } from '@/components/admin/SchoolSettingsTab';
import { StudentsEnrollmentsTab } from '@/components/admin/StudentsEnrollmentsTab';
import { SubjectsAssignmentsTab } from '@/components/admin/SubjectsAssignmentsTab';
import { UsersTab } from '@/components/admin/UsersTab';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/header';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import { listAcademicYears } from '@/lib/api/admin';
import { adminKeys } from '@/lib/api/query-keys';
import { hasRoleAccess } from '@/lib/auth/roles';
import { t } from '@/lib/i18n';
import { useSessionStore } from '@/stores/session.store';

const ALLOWED_ROLES = ['admin', 'censor', 'secretary'] as const;

const ADMIN_TABS = ['school', 'academic', 'classes', 'subjects', 'students', 'users'] as const;
export type AdminTabKey = (typeof ADMIN_TABS)[number];

interface AdminSearch {
  tab?: AdminTabKey;
}

function isAdminTab(value: unknown): value is AdminTabKey {
  return typeof value === 'string' && (ADMIN_TABS as readonly string[]).includes(value);
}

export const Route = createFileRoute('/_authenticated/admin')({
  validateSearch: (search: Record<string, unknown>): AdminSearch => ({
    tab: isAdminTab(search.tab) ? search.tab : undefined,
  }),
  beforeLoad: () => {
    const role = useSessionStore.getState().user?.role;
    if (!hasRoleAccess(role, ALLOWED_ROLES)) {
      throw redirect({ to: '/forbidden' });
    }
  },
  component: AdminPage,
});

function AdminPage() {
  const user = useSessionStore((s) => s.user);
  const isOnline = useSessionStore((s) => s.isOnline);
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const [selectedYearId, setSelectedYearId] = useState<string | undefined>();

  const isSecretary = user?.role === 'secretary';

  const visibleTabs = useMemo<TabItem<AdminTabKey>[]>(() => {
    if (isSecretary) {
      return [
        {
          value: 'students',
          label: t('admin.tabs.students'),
          icon: <RiGroupFill />,
        },
      ];
    }

    return [
      { value: 'school', label: t('admin.tabs.school'), icon: <RiBuilding2Fill /> },
      { value: 'academic', label: t('admin.tabs.academic'), icon: <RiCalendar2Fill /> },
      { value: 'classes', label: t('admin.tabs.classes'), icon: <RiSchoolFill /> },
      { value: 'subjects', label: t('admin.tabs.subjects'), icon: <RiBookOpenFill /> },
      { value: 'students', label: t('admin.tabs.students'), icon: <RiGroupFill /> },
      { value: 'users', label: t('admin.tabs.users'), icon: <RiShieldUserFill /> },
    ];
  }, [isSecretary]);

  const activeTab: AdminTabKey = useMemo(() => {
    if (search.tab && visibleTabs.some((tab) => tab.value === search.tab)) {
      return search.tab;
    }
    return visibleTabs[0]!.value;
  }, [search.tab, visibleTabs]);

  const handleTabChange = (nextTab: AdminTabKey) => {
    void navigate({
      search: () => ({ tab: nextTab }),
      replace: true,
    });
  };

  const needsYearContext =
    activeTab === 'academic' ||
    activeTab === 'classes' ||
    activeTab === 'subjects' ||
    activeTab === 'students';

  const yearsQuery = useQuery({
    queryKey: adminKeys.academicYears(),
    queryFn: listAcademicYears,
    enabled: needsYearContext || Boolean(user),
  });

  const years = yearsQuery.data ?? [];

  useEffect(() => {
    if (years.length === 0) return;
    if (!selectedYearId || !years.some((y) => y.id === selectedYearId)) {
      const preferred = years.find((y) => y.isActive) ?? years[0]!;
      setSelectedYearId(preferred.id);
    }
  }, [years, selectedYearId]);

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        tone="violet"
        icon={isSecretary ? <RiGroupFill /> : <RiBuilding2Fill />}
        title={isSecretary ? t('admin.pageTitleSecretary') : t('admin.pageTitle')}
        subtitle={isSecretary ? t('admin.pageSubtitleSecretary') : t('admin.pageSubtitle')}
        actions={
          <Badge variant="dark">{t(`roles.${user.role}`)}</Badge>
        }
      />

      {!isOnline && (
        <Card variant="info" className="flex items-start gap-3 p-4">
          <RiWifiOffFill className="mt-0.5 size-5 shrink-0 text-amber-500" />
          <div>
            <p className="text-sm font-extrabold">{t('admin.offlineRequiredTitle')}</p>
            <p className="mt-0.5 text-xs opacity-90">{t('admin.offlineRequiredBody')}</p>
          </div>
        </Card>
      )}

      {visibleTabs.length > 1 && (
        <Tabs
          ariaLabel={t('admin.pageTitle')}
          value={activeTab}
          onChange={handleTabChange}
          items={visibleTabs}
        />
      )}

      {needsYearContext && years.length > 0 && (
        <AdminYearContextBar
          years={years}
          selectedYearId={selectedYearId}
          onSelectYear={setSelectedYearId}
        />
      )}

      <div
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
      >
        {activeTab === 'school' && (
          <SchoolSettingsTab canEdit={user.role === 'admin'} isOnline={isOnline} />
        )}
        {activeTab === 'academic' && (
          <AcademicStructureTab
            years={years}
            selectedYearId={selectedYearId}
            onSelectYear={setSelectedYearId}
            isOnline={isOnline}
          />
        )}
        {activeTab === 'classes' && (
          <ClassesTab selectedYearId={selectedYearId} isOnline={isOnline} />
        )}
        {activeTab === 'subjects' && (
          <SubjectsAssignmentsTab selectedYearId={selectedYearId} isOnline={isOnline} />
        )}
        {activeTab === 'students' && (
          <StudentsEnrollmentsTab selectedYearId={selectedYearId} isOnline={isOnline} />
        )}
        {activeTab === 'users' && <UsersTab actor={user} isOnline={isOnline} />}
      </div>
    </div>
  );
}
