/**
 * `listAuditLog` (story 1.7): Tenant Admin only, filters, actor email resolution, opaque
 * non-enum actions. Pure — no database; the port is faked.
 */
import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '../authz/request-context';
import type { AuditLogReadDeps, AuditLogRow } from '../ports/audit-log-read';
import { listAuditLog } from './list-audit-log';

const ADMIN: RequestContext = {
  tenantId: 'ten-a',
  userId: 'usr-admin',
  roles: ['tenant_admin'],
  projectIds: [],
  locale: 'en',
};

const PM: RequestContext = {
  tenantId: 'ten-a',
  userId: 'usr-pm',
  roles: ['pm'],
  projectIds: ['prj-1'],
  locale: 'en',
};

const VIEWER: RequestContext = {
  tenantId: 'ten-a',
  userId: 'usr-viewer',
  roles: ['client_viewer'],
  projectIds: ['prj-1'],
  locale: 'en',
};

const ROWS: readonly AuditLogRow[] = [
  {
    seq: 1,
    actor: 'user:usr-known',
    action: 'department.create',
    target: 'dep-1',
    payload: { name: 'Delivery' },
    at: new Date('2026-09-01T00:00:00Z'),
  },
  {
    seq: 2,
    actor: 'system:seed',
    action: 'demo.seed',
    target: 'prj-1',
    payload: { snapshots: 1, ledgerEntries: 2, mappingEvents: 3, anchor: '2026-09-01T00:00:00Z' },
    at: new Date('2026-09-02T00:00:00Z'),
  },
  {
    seq: 3,
    actor: 'user:usr-gone',
    action: 'resource.create',
    target: 'res-1',
    payload: { departmentId: 'dep-1', name: 'Ada', role: 'Engineer' },
    at: new Date('2026-09-03T00:00:00Z'),
  },
];

function deps(rows: readonly AuditLogRow[] = ROWS): AuditLogReadDeps<{ marker: string }> {
  return {
    handle: { marker: 'handle' },
    auditLogRead: {
      list: vi.fn(async (_handle, _tenantId, filters) => {
        return rows.filter((row) => {
          if (filters.action !== undefined && row.action !== filters.action) return false;
          if (filters.actor !== undefined && row.actor !== filters.actor) return false;
          if (filters.from !== undefined && row.at < filters.from) return false;
          if (filters.to !== undefined && row.at > filters.to) return false;
          return true;
        });
      }),
    },
    lookupUser: vi.fn(async (userId: string) => {
      if (userId === 'usr-known') {
        return { userId, email: 'known@example.test', locale: 'en', name: 'Known User' };
      }
      return null;
    }),
  };
}

describe('listAuditLog', () => {
  it('refuses a PM with not_found before touching the port', async () => {
    const d = deps();
    const result = await listAuditLog(d, PM, {});
    expect(result).toEqual({
      ok: false,
      error: { code: 'not_found', messageKey: 'errors.not_found' },
    });
    expect(d.auditLogRead.list).not.toHaveBeenCalled();
  });

  it('refuses a viewer with not_found before touching the port', async () => {
    const d = deps();
    const result = await listAuditLog(d, VIEWER, { action: 'department.create' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('not_found');
    expect(d.auditLogRead.list).not.toHaveBeenCalled();
  });

  it('lists rows with actor email when known, raw actor when not, opaque non-enum action', async () => {
    const result = await listAuditLog(deps(), ADMIN, {});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows).toHaveLength(3);
    expect(result.value.rows[0]).toMatchObject({
      actorDisplay: 'known@example.test',
      action: 'department.create',
      target: 'dep-1',
      payload: { name: 'Delivery' },
    });
    expect(result.value.rows[1]).toMatchObject({
      actorDisplay: 'system:seed',
      action: 'demo.seed',
      target: 'prj-1',
    });
    expect(result.value.rows[2]).toMatchObject({
      actorDisplay: 'user:usr-gone',
      action: 'resource.create',
    });
  });

  it('filters by action, actor and date range', async () => {
    const d = deps();
    const result = await listAuditLog(d, ADMIN, {
      action: 'department.create',
      actor: 'user:usr-known',
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-01T23:59:59.000Z',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows).toHaveLength(1);
    expect(result.value.rows[0]!.action).toBe('department.create');
    expect(d.auditLogRead.list).toHaveBeenCalledWith(d.handle, 'ten-a', {
      action: 'department.create',
      actor: 'user:usr-known',
      from: new Date('2026-09-01T00:00:00.000Z'),
      to: new Date('2026-09-01T23:59:59.000Z'),
    });
  });

  it('refuses from > to as invalid_input', async () => {
    const d = deps();
    const result = await listAuditLog(d, ADMIN, {
      from: '2026-09-10T00:00:00.000Z',
      to: '2026-09-01T00:00:00.000Z',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_input');
    expect(d.auditLogRead.list).not.toHaveBeenCalled();
  });

  it('refuses a non-enum action filter as invalid_input', async () => {
    const d = deps();
    const result = await listAuditLog(d, ADMIN, { action: 'demo.seed' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_input');
    expect(d.auditLogRead.list).not.toHaveBeenCalled();
  });
});
