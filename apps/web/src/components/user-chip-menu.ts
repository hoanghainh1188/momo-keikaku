'use client';

/**
 * Top-bar user chip with an optional Admin menu (story 1.7 + 2.17).
 * Plain `.ts` (createElement) so the unit gate can import it without JSX transform.
 * Uses plain `<a>` for menu links: `createElement(Link, …)` rejects `data-testid` under
 * Next's typed Link props, and full navigation to `/admin/...` does not need client routing.
 */
import { useTranslations } from 'next-intl';
import { createElement } from 'react';

export function UserChip({
  label,
  showAuditLog,
}: {
  label: string;
  /** When true (Tenant Admin), show Organisation + Audit log menuitems. */
  showAuditLog: boolean;
}) {
  const t = useTranslations();
  if (!showAuditLog) {
    return createElement('div', { className: 'userchip', 'data-testid': 'userchip' }, label);
  }

  return createElement(
    'details',
    { className: 'userchip userchip-menu', 'data-testid': 'userchip' },
    createElement('summary', null, label),
    createElement(
      'div',
      { className: 'userchip-dropdown', role: 'menu' },
      createElement(
        'a',
        { href: '/admin/departments', role: 'menuitem', 'data-testid': 'admin-departments-link' },
        t('admin.org.departments'),
      ),
      createElement(
        'a',
        { href: '/admin/programs', role: 'menuitem', 'data-testid': 'admin-programs-link' },
        t('admin.org.programs'),
      ),
      createElement(
        'a',
        { href: '/admin/projects', role: 'menuitem', 'data-testid': 'admin-projects-link' },
        t('admin.org.projects'),
      ),
      createElement(
        'a',
        { href: '/admin/audit', role: 'menuitem', 'data-testid': 'audit-log-link' },
        t('admin.audit.audit_log'),
      ),
    ),
  );
}
