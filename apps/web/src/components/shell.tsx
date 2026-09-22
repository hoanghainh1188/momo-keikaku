'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { formatUserChip } from '@/lib/user-chip';
import { UserChip } from './user-chip-menu';

export { UserChip } from './user-chip-menu';

const SURFACES = [
  { slug: 'review', label: 'Review', glyph: '≡', title: 'Reconciliation Review' },
  { slug: 'plan', label: 'Plan', glyph: '⌷', title: 'Plan (WBS)' },
  { slug: 'mapping', label: 'Mapping', glyph: '⇄', title: 'Work Package ↔ Ticket Mapping' },
  { slug: 'baselines', label: 'Baselines', glyph: '▤', title: 'Baseline history' },
  { slug: 'connectors', label: 'Connectors', glyph: '⟲', title: 'Tracker Connectors' },
];

export interface ShellProps {
  projectId: string;
  projectName: string;
  clientName: string;
  snapshotLabel: string;
  snapshotAgeMinutes: number;
  /** The signed-in user's role in this Tenant, as a label (story 1.4: no longer a constant). */
  roleLabel: string;
  /**
   * Name (preferred) or email for the top-bar chip (story 1.7). When absent, the chip shows
   * the role alone — the lookup returned nothing.
   */
  userLabel?: string;
  /** When true, the user menu offers the Audit log (Tenant Admin only). */
  showAuditLog?: boolean;
  children: ReactNode;
}

export function Shell({
  projectId,
  projectName,
  clientName,
  snapshotLabel,
  snapshotAgeMinutes,
  roleLabel,
  userLabel,
  showAuditLog = false,
  children,
}: ShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const stale = snapshotAgeMinutes > 24 * 60;
  const chipText = formatUserChip(userLabel, roleLabel);

  return (
    <div className="app">
      <header className="topbar">
        <Link className="brand" href="/" data-testid="brand">
          momo-keikaku <span>／ 計画</span>
        </Link>
        <div className="project-switcher" data-testid="project-switcher">
          <strong>{projectName}</strong>
          <span style={{ color: 'var(--ink-faint)' }}>{clientName}</span>
        </div>
        <div
          className={`snapshot-pin${stale ? ' stale' : ''}`}
          data-testid="snapshot-pin"
          title="The Tracker Snapshot this view is pinned to"
        >
          <span aria-hidden>{stale ? '▲' : '◉'}</span>
          <span>
            Snapshot {snapshotLabel} · {formatAge(snapshotAgeMinutes)}
          </span>
        </div>
        <UserChip label={chipText} showAuditLog={showAuditLog} />
      </header>

      <nav className={`sidebar${collapsed ? ' collapsed' : ''}`} aria-label="Project surfaces">
        <div className="sect">Project</div>
        {SURFACES.map((s) => {
          const href = `/p/${projectId}/${s.slug}`;
          const active = pathname?.startsWith(href);
          return (
            <Link
              key={s.slug}
              href={href}
              className="navitem"
              aria-current={active ? 'page' : undefined}
              title={s.title}
            >
              <span className="glyph" aria-hidden>
                {s.glyph}
              </span>
              <span className="navlabel">{s.label}</span>
            </Link>
          );
        })}
        <div className="sect" style={{ marginTop: 24 }}>
          Client
        </div>
        <Link
          href={`/c/${projectId}`}
          className="navitem"
          aria-current={pathname?.startsWith(`/c/${projectId}`) ? 'page' : undefined}
          title="Client View preview"
        >
          <span className="glyph" aria-hidden>
            ◻
          </span>
          <span className="navlabel">Client View</span>
        </Link>
        <button
          type="button"
          className="collapse-btn"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
        >
          {collapsed ? '»' : '« Collapse'}
        </button>
      </nav>

      <main className="main">{children}</main>
    </div>
  );
}

function formatAge(minutes: number): string {
  if (minutes < 60) return `${minutes} min ago`;
  const h = Math.round(minutes / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}
