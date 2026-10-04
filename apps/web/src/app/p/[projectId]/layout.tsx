import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { currentUserIdentity, getProjectHeader, requestContext } from '@/server/composition';
import { valueOrNotFound } from '@/server/result';
import { ReviewPinProvider } from '@/components/review-pin-context';
import { Shell } from '@/components/shell';
import { formatRoleLabels } from '@/lib/role-labels';
import { userLabelFromIdentity } from '@/lib/user-chip';

export const dynamic = 'force-dynamic';

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const t = await getTranslations();
  const { projectId } = await params;
  // Resolved once per render (the page's binding shares it through React `cache()`); redirects
  // to /sign-in or /no-access before anything under /p/ renders.
  const ctx = await requestContext();
  const bundle = valueOrNotFound(await getProjectHeader({ projectId }, ctx));
  const identity = await currentUserIdentity(ctx);
  const observed = new Date(bundle.input.pinnedSnapshot.observedAt);
  const userLabel = userLabelFromIdentity(identity);

  return (
    <ReviewPinProvider>
      <Shell
        projectId={projectId}
        projectName={bundle.project.name}
        clientName={bundle.meta.clientName}
        snapshotLabel={formatJst(observed)}
        snapshotAgeMinutes={bundle.meta.snapshotAgeMinutes}
        roleLabel={formatRoleLabels(ctx.roles, t)}
        userLabel={userLabel}
        showAuditLog={ctx.roles.includes('tenant_admin')}
      >
        {children}
      </Shell>
    </ReviewPinProvider>
  );
}

function formatJst(d: Date): string {
  const jst = new Date(d.getTime() + 9 * 3600_000);
  const day = jst.getUTCDate();
  const month = jst.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
  const hh = String(jst.getUTCHours()).padStart(2, '0');
  const mm = String(jst.getUTCMinutes()).padStart(2, '0');
  return `${day} ${month} ${hh}:${mm} JST`;
}
