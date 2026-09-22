/**
 * A minimal Admin chrome (story 1.7): brand + user chip, no Project sidebar. Admin surfaces
 * are reached from the user menu (EXPERIENCE.md), not the Project nav.
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import type { Role } from '@momo/app';
import { currentUserIdentity, requestContext } from '@/server/composition';
import { UserChip } from '@/components/shell';
import { formatUserChip, userLabelFromIdentity } from '@/lib/user-chip';

export const dynamic = 'force-dynamic';

const ROLE_LABELS: Readonly<Record<Role, string>> = {
  tenant_admin: 'Tenant Admin',
  pm: 'PM',
  client_viewer: 'Client Viewer',
  internal_viewer: 'Internal Viewer',
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const ctx = await requestContext();
  const identity = await currentUserIdentity(ctx);
  const roleLabel =
    ctx.roles.length === 0
      ? 'No role'
      : ctx.roles.map((role) => ROLE_LABELS[role]).join(' · ');
  const chipText = formatUserChip(userLabelFromIdentity(identity), roleLabel);
  const isAdmin = ctx.roles.includes('tenant_admin');

  return (
    <div className="app admin-app">
      <header className="topbar">
        <Link className="brand" href="/" data-testid="brand">
          momo-keikaku <span>／ 計画</span>
        </Link>
        <div className="project-switcher" data-testid="admin-title">
          <strong>Administration</strong>
        </div>
        <UserChip label={chipText} showAuditLog={isAdmin} />
      </header>
      <main className="main admin-main">{children}</main>
    </div>
  );
}
