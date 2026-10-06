import { describe, expect, it } from 'vitest';
import type { AuditEntry } from '../audit';
import type { RequestContext } from '../authz/request-context';
import type { ResourceWriteDeps, ResourceWriteRepository } from '../ports/resource-write';
import {
  appendProjectDefaultRate,
  appendResourceRate,
  createResource,
  linkTrackerAccount,
  unlinkTrackerAccount,
} from './resource-writes';

/**
 * Resource / Rate writes against a fake tenant transaction (story 1.6) — I/O matrix at the
 * use-case level. Postgres suite covers ledger-untouched and foreign `not_found`.
 */

const HANDLE = { marker: 'handle' };
const ADMIN: RequestContext = {
  tenantId: 'ten-a',
  userId: 'test-admin',
  roles: ['tenant_admin'],
  projectIds: [],
  locale: 'en',
};
const PM: RequestContext = { ...ADMIN, userId: 'test-pm', roles: ['pm'] };
const VIEWER: RequestContext = { ...ADMIN, userId: 'test-viewer', roles: ['client_viewer'] };
const ACTOR = 'user:test-admin';
const NOW = new Date('2026-09-22T10:00:00Z');

const WORLD = {
  departments: [{ id: 'dep-x' }, { id: 'dep-y' }],
  resources: [
    { id: 'res-1', departmentId: 'dep-x', name: 'Linh', role: 'PM' },
  ],
  projects: [{ id: 'prj-1' }],
};

interface Call {
  readonly member: string;
  readonly arg: unknown;
}

function fakeDeps(world: typeof WORLD = WORLD) {
  const transactions: string[] = [];
  const committed: Call[] = [];
  const audits: AuditEntry[] = [];
  let issued = 0;

  const deps: ResourceWriteDeps<typeof HANDLE> = {
    handle: HANDLE,
    clock: { now: () => NOW },
    ids: { next: () => `new-${(issued += 1)}` },
    transaction: async (_handle, tenantId, work) => {
      transactions.push(tenantId);
      const calls: Call[] = [];
      const pendingAudits: AuditEntry[] = [];
      const write =
        <A>(member: string) =>
        async (arg: A): Promise<void> => {
          calls.push({ member, arg });
        };
      const resources: ResourceWriteRepository = {
        findDepartment: async (id) => world.departments.find((d) => d.id === id) ?? null,
        findResource: async (id) => world.resources.find((r) => r.id === id) ?? null,
        findProject: async (id) => world.projects.find((p) => p.id === id) ?? null,
        findTrackerAccount: async (id) =>
          id === 'ta-1' ? { id: 'ta-1', accountId: 'acct-1' } : null,
        insertResource: write('insertResource'),
        appendResourceRate: write('appendResourceRate'),
        appendProjectDefaultRate: write('appendProjectDefaultRate'),
        appendTrackerAccountLink: async (row) => {
          calls.push({ member: 'appendTrackerAccountLink', arg: row });
          return 1;
        },
      };
      const result = await work({
        resources,
        audit: { append: async (entry) => void pendingAudits.push(entry) },
      });
      committed.push(...calls);
      audits.push(...pendingAudits);
      return result;
    },
  };
  return { deps, transactions, committed, audits };
}

describe('the role gate', () => {
  it('lets a PM create a Resource', async () => {
    const { deps, committed, transactions } = fakeDeps();
    expect(await createResource(deps, PM, { departmentId: 'dep-x', name: 'Minh', role: 'Engineer' })).toEqual({
      ok: true,
      value: { id: 'new-1' },
    });
    expect(transactions).toEqual(['ten-a']);
    expect(committed[0]?.member).toBe('insertResource');
  });

  it('answers not_found to a viewer creating a Resource, opening no transaction', async () => {
    const { deps, transactions } = fakeDeps();
    expect(await createResource(deps, VIEWER, { departmentId: 'dep-x', name: 'X', role: 'Y' })).toMatchObject({
      error: { code: 'not_found' },
    });
    expect(transactions).toEqual([]);
  });

  it('answers not_found, not invalid_input, to a viewer sending malformed input', async () => {
    const { deps, transactions } = fakeDeps();
    expect(await createResource(deps, VIEWER, { departmentId: '', name: '', role: '' })).toEqual({
      ok: false,
      error: { code: 'not_found', messageKey: 'errors.not_found' },
    });
    expect(transactions).toEqual([]);
  });

  it('answers not_found to a PM appending a Resource Rate', async () => {
    const { deps, transactions } = fakeDeps();
    expect(
      await appendResourceRate(deps, PM, {
        resourceId: 'res-1',
        effectiveFrom: '2026-06-01',
        yenPerHour: 5000,
      }),
    ).toMatchObject({ error: { code: 'not_found' } });
    expect(transactions).toEqual([]);
  });

  it('answers not_found to a PM appending a Project default Rate', async () => {
    const { deps, transactions } = fakeDeps();
    expect(
      await appendProjectDefaultRate(deps, PM, {
        projectId: 'prj-1',
        effectiveFrom: '2026-06-01',
        yenPerHour: 4000,
      }),
    ).toMatchObject({ error: { code: 'not_found' } });
    expect(transactions).toEqual([]);
  });
});

describe('createResource', () => {
  it('inserts a Resource with no Rate row, audited as resource.create', async () => {
    const { deps, committed, audits } = fakeDeps();
    expect(await createResource(deps, ADMIN, { departmentId: 'dep-x', name: '  Minh  ', role: ' Engineer ' })).toEqual({
      ok: true,
      value: { id: 'new-1' },
    });
    expect(committed).toEqual([
      {
        member: 'insertResource',
        arg: { id: 'new-1', departmentId: 'dep-x', name: 'Minh', role: 'Engineer' },
      },
    ]);
    expect(audits).toEqual([
      {
        actor: ACTOR,
        at: NOW,
        action: 'resource.create',
        target: 'new-1',
        payload: { departmentId: 'dep-x', name: 'Minh', role: 'Engineer' },
      },
    ]);
  });

  it('answers not_found for a foreign Department', async () => {
    const { deps, committed, audits } = fakeDeps();
    expect(await createResource(deps, ADMIN, { departmentId: 'dep-gone', name: 'X', role: 'Y' })).toMatchObject({
      error: { code: 'not_found' },
    });
    expect(committed).toEqual([]);
    expect(audits).toEqual([]);
  });

  it('answers invalid_input for a blank name', async () => {
    const { deps, transactions } = fakeDeps();
    expect(await createResource(deps, ADMIN, { departmentId: 'dep-x', name: '  ', role: 'Y' })).toMatchObject({
      error: { code: 'invalid_input' },
    });
    expect(transactions).toEqual([]);
  });
});

describe('appendResourceRate', () => {
  it('appends a Rate and audits it', async () => {
    const { deps, committed, audits } = fakeDeps();
    expect(
      await appendResourceRate(deps, ADMIN, {
        resourceId: 'res-1',
        effectiveFrom: '2026-03-01',
        yenPerHour: 6500,
      }),
    ).toEqual({ ok: true, value: undefined });
    expect(committed).toEqual([
      {
        member: 'appendResourceRate',
        arg: { resourceId: 'res-1', effectiveFrom: '2026-03-01', yenPerHour: 6500 },
      },
    ]);
    expect(audits).toEqual([
      {
        actor: ACTOR,
        at: NOW,
        action: 'rate.append',
        target: 'res-1',
        payload: { effectiveFrom: '2026-03-01', yenPerHour: 6500 },
      },
    ]);
  });

  it('answers not_found for a missing Resource', async () => {
    const { deps, committed } = fakeDeps();
    expect(
      await appendResourceRate(deps, ADMIN, {
        resourceId: 'res-gone',
        effectiveFrom: '2026-03-01',
        yenPerHour: 1,
      }),
    ).toMatchObject({ error: { code: 'not_found' } });
    expect(committed).toEqual([]);
  });

  it('answers invalid_input for a negative yen', async () => {
    const { deps, transactions } = fakeDeps();
    expect(
      await appendResourceRate(deps, ADMIN, {
        resourceId: 'res-1',
        effectiveFrom: '2026-03-01',
        yenPerHour: -1,
      }),
    ).toMatchObject({ error: { code: 'invalid_input' } });
    expect(transactions).toEqual([]);
  });

  it('answers invalid_input for a non-YYYY-MM-DD effectiveFrom, opening no transaction', async () => {
    const { deps, transactions } = fakeDeps();
    expect(
      await appendResourceRate(deps, ADMIN, {
        resourceId: 'res-1',
        effectiveFrom: '03/01/2026',
        yenPerHour: 5000,
      }),
    ).toMatchObject({ error: { code: 'invalid_input' } });
    expect(transactions).toEqual([]);
  });
});

describe('appendProjectDefaultRate', () => {
  it('appends a Project default Rate and audits it', async () => {
    const { deps, committed, audits } = fakeDeps();
    expect(
      await appendProjectDefaultRate(deps, ADMIN, {
        projectId: 'prj-1',
        effectiveFrom: '2026-04-01',
        yenPerHour: 4000,
      }),
    ).toEqual({ ok: true, value: undefined });
    expect(committed).toEqual([
      {
        member: 'appendProjectDefaultRate',
        arg: { projectId: 'prj-1', effectiveFrom: '2026-04-01', yenPerHour: 4000 },
      },
    ]);
    expect(audits).toEqual([
      {
        actor: ACTOR,
        at: NOW,
        action: 'project_default_rate.append',
        target: 'prj-1',
        payload: { effectiveFrom: '2026-04-01', yenPerHour: 4000 },
      },
    ]);
  });

  it('answers not_found for a missing Project', async () => {
    const { deps, committed } = fakeDeps();
    expect(
      await appendProjectDefaultRate(deps, ADMIN, {
        projectId: 'prj-gone',
        effectiveFrom: '2026-04-01',
        yenPerHour: 1,
      }),
    ).toMatchObject({ error: { code: 'not_found' } });
    expect(committed).toEqual([]);
  });

  it('answers invalid_input for a non-YYYY-MM-DD effectiveFrom, opening no transaction', async () => {
    const { deps, transactions } = fakeDeps();
    expect(
      await appendProjectDefaultRate(deps, ADMIN, {
        projectId: 'prj-1',
        effectiveFrom: 'not-a-date',
        yenPerHour: 4000,
      }),
    ).toMatchObject({ error: { code: 'invalid_input' } });
    expect(transactions).toEqual([]);
  });
});

describe('linkTrackerAccount / unlinkTrackerAccount (story 5.8)', () => {
  it('links a Tracker Account to a Resource and audits opaque ids only', async () => {
    const { deps, committed, audits } = fakeDeps();
    expect(
      await linkTrackerAccount(deps, PM, {
        projectId: 'prj-1',
        trackerAccountId: 'ta-1',
        resourceId: 'res-1',
      }),
    ).toEqual({ ok: true, value: { seq: 1 } });
    expect(committed[0]?.member).toBe('appendTrackerAccountLink');
    expect(audits[0]).toMatchObject({
      action: 'tracker_account.link',
      target: 'ta-1',
      payload: { resourceId: 'res-1', accountId: 'acct-1' },
    });
  });

  it('unlinks a Tracker Account', async () => {
    const { deps, committed, audits } = fakeDeps();
    expect(
      await unlinkTrackerAccount(deps, ADMIN, {
        projectId: 'prj-1',
        trackerAccountId: 'ta-1',
      }),
    ).toEqual({ ok: true, value: { seq: 1 } });
    expect(committed[0]?.member).toBe('appendTrackerAccountLink');
    expect(audits[0]).toMatchObject({
      action: 'tracker_account.unlink',
      payload: { accountId: 'acct-1' },
    });
  });

  it('answers not_found for a missing Tracker Account', async () => {
    const { deps, committed } = fakeDeps();
    expect(
      await linkTrackerAccount(deps, PM, {
        projectId: 'prj-1',
        trackerAccountId: 'ta-gone',
        resourceId: 'res-1',
      }),
    ).toMatchObject({ error: { code: 'not_found' } });
    expect(committed).toEqual([]);
  });
});
