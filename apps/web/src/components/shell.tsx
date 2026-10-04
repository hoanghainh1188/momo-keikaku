'use client';

import { useTranslations } from 'next-intl';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { formatUserChip } from '@/lib/user-chip';
import { useReviewPin } from './review-pin-context';
import { SnapshotPin } from './snapshot-pin';
import { UserChip } from './user-chip-menu';

export { UserChip } from './user-chip-menu';

const SURFACES = [
  { slug: 'review', glyph: '≡', messageKey: 'shell.surfaces.review' as const },
  { slug: 'plan', glyph: '⌷', messageKey: 'shell.surfaces.plan' as const },
  { slug: 'mapping', glyph: '⇄', messageKey: 'shell.surfaces.mapping' as const },
  { slug: 'baselines', glyph: '▤', messageKey: 'shell.surfaces.baselines' as const },
  { slug: 'connectors', glyph: '⟲', messageKey: 'shell.surfaces.connectors' as const },
  { slug: 'settings', glyph: '⚙', messageKey: 'shell.surfaces.settings' as const },
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
  const t = useTranslations();
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const chipText = formatUserChip(userLabel, roleLabel);
  const { reviewPinnedSnapshotId } = useReviewPin();

  return (
    <div className="app">
      <header className="topbar">
        <Link className="brand" href="/" data-testid="brand">
          {t('auth.signIn.momo_keikaku')} <span>{t('shell.brandSuffix')}</span>
        </Link>
        <div className="project-switcher" data-testid="project-switcher">
          <strong>{projectName}</strong>
          <span style={{ color: 'var(--ink-faint)' }}>{clientName}</span>
        </div>
        <SnapshotPin
          projectId={projectId}
          initialLabel={snapshotLabel}
          initialAgeMinutes={snapshotAgeMinutes}
          reviewPinnedSnapshotId={reviewPinnedSnapshotId}
        />
        <UserChip label={chipText} showAuditLog={showAuditLog} />
      </header>

      <nav className={`sidebar${collapsed ? ' collapsed' : ''}`} aria-label={t('shell.nav_aria_project_surfaces')}>
        <div className="sect">{t('shell.projectSection')}</div>
        {SURFACES.map((s) => {
          const href = `/p/${projectId}/${s.slug}`;
          const active = pathname?.startsWith(href);
          return (
            <Link
              key={s.slug}
              href={href}
              className="navitem"
              aria-current={active ? 'page' : undefined}
              title={t(`${s.messageKey}.title`)}
            >
              <span className="glyph" aria-hidden>
                {s.glyph}
              </span>
              <span className="navlabel">{t(`${s.messageKey}.label`)}</span>
            </Link>
          );
        })}
        <button
          type="button"
          className="collapse-btn"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
        >
          {collapsed ? t('shell.expand') : t('shell.collapse')}
        </button>
      </nav>

      <main className="main">{children}</main>
    </div>
  );
}
