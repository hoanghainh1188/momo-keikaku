import type { Role } from '@momo/app';
import type { getTranslations } from 'next-intl/server';

type T = Awaited<ReturnType<typeof getTranslations>>;

export function formatRoleLabels(roles: readonly Role[], t: T): string {
  if (roles.length === 0) return t('shell.roleLabels.none');
  return roles.map((role) => t(`shell.roleLabels.${role}`)).join(' · ');
}
