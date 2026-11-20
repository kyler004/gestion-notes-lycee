import type { UserRole } from '@lycee/shared';
import type { TranslationKey } from '@/lib/i18n';

export interface NavItemConfig {
  to: '/' | '/grades' | '/admin' | '/reports';
  labelKey: TranslationKey;
  allowedRoles: readonly UserRole[];
  milestoneTag?: string;
}

export const NAV_ITEMS: readonly NavItemConfig[] = [
  {
    to: '/',
    labelKey: 'nav.dashboard',
    allowedRoles: ['admin', 'censor', 'principal', 'teacher', 'secretary'],
  },
  {
    to: '/grades',
    labelKey: 'nav.grades',
    allowedRoles: ['teacher', 'admin', 'censor'],
    milestoneTag: 'Jalon 2',
  },
  {
    to: '/admin',
    labelKey: 'nav.academic',
    allowedRoles: ['admin', 'censor'],
    milestoneTag: 'Jalon 3',
  },
  {
    to: '/reports',
    labelKey: 'nav.reports',
    allowedRoles: ['admin', 'censor', 'principal', 'secretary'],
    milestoneTag: 'Jalon 4',
  },
];

export function hasRoleAccess(
  role: UserRole | undefined | null,
  allowedRoles: readonly UserRole[],
): boolean {
  if (!role) return false;
  return allowedRoles.includes(role);
}
