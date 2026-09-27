/**
 * UserChip Admin menu (stories 1.7 + 2.17): Organisation + Audit links only when showAuditLog.
 */
import { createElement, type ReactNode } from 'react';
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

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const labels: Record<string, string> = {
      'admin.org.departments': 'Departments',
      'admin.org.programs': 'Programs',
      'admin.org.projects': 'Projects',
      'admin.audit.audit_log': 'Audit log',
    };
    return labels[key] ?? key;
  },
}));

const { UserChip } = await import('./user-chip-menu');

describe('UserChip Admin menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Organisation and Audit links when showAuditLog is true', () => {
    const html = renderToStaticMarkup(
      createElement(UserChip, { label: 'Hoang · Tenant Admin', showAuditLog: true }) as ReactNode,
    );
    expect(html).toContain('data-testid="admin-departments-link"');
    expect(html).toContain('href="/admin/departments"');
    expect(html).toContain('data-testid="admin-programs-link"');
    expect(html).toContain('href="/admin/programs"');
    expect(html).toContain('data-testid="admin-projects-link"');
    expect(html).toContain('href="/admin/projects"');
    expect(html).toContain('data-testid="audit-log-link"');
    expect(html).toContain('href="/admin/audit"');
  });

  it('omits Admin links when showAuditLog is false', () => {
    const html = renderToStaticMarkup(
      createElement(UserChip, { label: 'Linh · PM', showAuditLog: false }) as ReactNode,
    );
    expect(html).not.toContain('admin-departments-link');
    expect(html).not.toContain('admin-programs-link');
    expect(html).not.toContain('admin-projects-link');
    expect(html).not.toContain('audit-log-link');
    expect(html).not.toContain('/admin/');
  });
});
