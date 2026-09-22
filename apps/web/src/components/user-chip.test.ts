/**
 * UserChip audit-log menu (story 1.7): link present only when showAuditLog is true.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children?: unknown;
    'data-testid'?: string;
  }) => createElement('a', { href, ...rest }, children as never),
}));

// Import after the mock so the chip sees the stub Link.
const { UserChip } = await import('./user-chip-menu');

describe('UserChip audit-log link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders audit-log-link when showAuditLog is true', () => {
    const html = renderToStaticMarkup(
      createElement(UserChip, { label: 'Hoang · Tenant Admin', showAuditLog: true }),
    );
    expect(html).toContain('data-testid="audit-log-link"');
    expect(html).toContain('href="/admin/audit"');
  });

  it('omits audit-log-link when showAuditLog is false', () => {
    const html = renderToStaticMarkup(
      createElement(UserChip, { label: 'Linh · PM', showAuditLog: false }),
    );
    expect(html).not.toContain('audit-log-link');
    expect(html).not.toContain('/admin/audit');
  });
});
