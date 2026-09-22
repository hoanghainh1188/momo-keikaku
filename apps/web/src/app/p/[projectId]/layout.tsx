import type { ReactNode } from 'react';
import type { Role } from '@momo/app';
import { currentUserIdentity, getProjectHeader, requestContext } from '@/server/composition';
import { valueOrNotFound } from '@/server/result';
import { Shell } from '@/components/shell';
import { userLabelFromIdentity } from '@/lib/user-chip';

export const dynamic = 'force-dynamic';

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  // Resolved once per render (the page's binding shares it through React `cache()`); redirects
  // to /sign-in or /no-access before anything under /p/ renders.
  const ctx = await requestContext();
  const bundle = valueOrNotFound(await getProjectHeader({ projectId }, ctx));
  const identity = await currentUserIdentity(ctx);
  const observed = new Date(bundle.input.pinnedSnapshot.observedAt);
  const userLabel = userLabelFromIdentity(identity);

  return (
    <Shell
      projectId={projectId}
      projectName={bundle.project.name}
      clientName={bundle.meta.clientName}
      snapshotLabel={formatJst(observed)}
      snapshotAgeMinutes={bundle.meta.snapshotAgeMinutes}
      roleLabel={roleLabel(ctx.roles)}
      userLabel={userLabel}
      showAuditLog={ctx.roles.includes('tenant_admin')}
    >
      {children}
    </Shell>
  );
}

const ROLE_LABELS: Readonly<Record<Role, string>> = {
  tenant_admin: 'Tenant Admin',
  pm: 'PM',
  client_viewer: 'Client Viewer',
  internal_viewer: 'Internal Viewer',
};

function roleLabel(roles: readonly Role[]): string {
  // A context with no role is not reachable today — the resolver refuses before a page renders —
  // but an empty join renders an empty chip, which reads as a broken header rather than as the
  // absence it is. Say it instead.
  if (roles.length === 0) return 'No role';
  return roles.map((role) => ROLE_LABELS[role]).join(' · ');
}

function formatJst(d: Date): string {
  const jst = new Date(d.getTime() + 9 * 3600_000);
  const day = jst.getUTCDate();
  const month = jst.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
  const hh = String(jst.getUTCHours()).padStart(2, '0');
  const mm = String(jst.getUTCMinutes()).padStart(2, '0');
  return `${day} ${month} ${hh}:${mm} JST`;
}
