import { getTranslations } from 'next-intl/server';
/**
 * A minimal Admin chrome (story 1.7): brand + user chip, no Project sidebar. Admin surfaces
 * are reached from the user menu (EXPERIENCE.md), not the Project nav.
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { currentUserIdentity, requestContext } from '@/server/composition';
import { UserChip } from '@/components/shell';
import { formatRoleLabels } from '@/lib/role-labels';
import { formatUserChip, userLabelFromIdentity } from '@/lib/user-chip';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations();
  const ctx = await requestContext();
  const identity = await currentUserIdentity(ctx);
  const roleLabel = formatRoleLabels(ctx.roles, t);
  const chipText = formatUserChip(userLabelFromIdentity(identity), roleLabel);
  const isAdmin = ctx.roles.includes('tenant_admin');

  return (
    <div className="app admin-app">
      <header className="topbar">
        <Link className="brand" href="/" data-testid="brand">{t('admin.momo_keikaku')}<span>{t('shell.brandSuffix')}</span>
        </Link>
        <div className="project-switcher" data-testid="admin-title">
          <strong>{t('admin.administration')}</strong>
        </div>
        <UserChip label={chipText} showAuditLog={isAdmin} />
      </header>
      <main className="main admin-main">{children}</main>
    </div>
  );
}
