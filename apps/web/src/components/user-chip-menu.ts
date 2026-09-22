/**
 * Top-bar user chip with an optional Admin menu (Audit log) — story 1.7.
 * Plain `.ts` (createElement) so the unit gate can import it without JSX transform.
 * Uses a plain `<a>` for the menu link: `createElement(Link, …)` rejects `data-testid` under
 * Next's typed Link props, and a full navigation to `/admin/audit` does not need client routing.
 */
import { createElement } from 'react';

export function UserChip({
  label,
  showAuditLog,
}: {
  label: string;
  showAuditLog: boolean;
}) {
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
        { href: '/admin/audit', role: 'menuitem', 'data-testid': 'audit-log-link' },
        'Audit log',
      ),
    ),
  );
}
