import type { ReactNode } from 'react';
import { loadProjectBundle } from '@momo/db';
import { Shell } from '@/components/shell';

export const dynamic = 'force-dynamic';

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const bundle = await loadProjectBundle(projectId);
  const observed = new Date(bundle.input.pinnedSnapshot.observedAt);

  return (
    <Shell
      projectId={projectId}
      projectName={bundle.project.name}
      clientName={bundle.meta.clientName}
      snapshotLabel={formatJst(observed)}
      snapshotAgeMinutes={bundle.meta.snapshotAgeMinutes}
    >
      {children}
    </Shell>
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
