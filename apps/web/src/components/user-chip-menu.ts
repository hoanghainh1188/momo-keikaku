/**
 * Top-bar user chip with an optional Admin menu (Audit log) — story 1.7.
 * Plain `.ts` (createElement) so the unit gate can import it without JSX transform.
 */
import { createElement } from 'react';
import Link from 'next/link';

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
        Link,
        { href: '/admin/audit', role: 'menuitem', 'data-testid': 'audit-log-link' },
        'Audit log',
      ),
    ),
  );
}
