import { describe, expect, it } from 'vitest';
import type { AuditEntry } from '../audit';
import type { RequestContext, Role } from '../authz/request-context';
import type {
  LockedMemberRow,
  MembershipWriteDeps,
  MembershipWriteRepository,
} from '../ports/membership-write';
import { assignMemberProject, changeMemberRole, revokeMembership, unassignMemberProject } from '.';
import { LAST_TENANT_ADMIN } from './membership-writes';

/**
 * The four membership writes against a fake tenant transaction over an in-memory bridge — no
 * database, no environment (story 1.4 slice 2).
 *
 * Pinned here, at the use-case level: the declared-roles gate (`authorize`) answers `not_found`
 * before any parse or transaction; the caller is re-checked against the LOCKED rows (a stale
 * context is `not_found`); the target must have a membership in this Tenant; the last
 * `tenant_admin` cannot be revoked or demoted; only `tenant_admin` and `pm` are assignable; a
 * foreign Project is `not_found`, a stale id may still be unassigned; no-ops record nothing; every
 * change records the previous value, on the member's user id, stamped by the Clock; and every
 * write takes exactly one lock, first. `tests/membership.test.ts` proves the same against
 * Postgres, concurrency included.
 */

const HANDLE = { marker: 'handle' };
const NOW = new Date('2026-09-21T10:00:00Z');

const ADMIN = 'usr-admin';
const OTHER_ADMIN = 'usr-admin-2';
const PM = 'usr-pm';
const ODD = 'usr-odd';

function ctxOf(userId: string, roles: readonly Role[] = ['tenant_admin']): RequestContext {
  return { tenantId: 'ten-a', userId, roles, projectIds: [], locale: 'en' };
}

const CTX = ctxOf(ADMIN);

/** The bridge rows of the Tenant: two admins, a PM on one Project, a member with an unknown role. */
const MEMBERS: readonly LockedMemberRow[] = [
  { userId: ADMIN, role: 'tenant_admin', projectIds: [] },
  { userId: OTHER_ADMIN, role: 'tenant_admin', projectIds: [] },
  { userId: PM, role: 'pm', projectIds: ['prj-1', 'prj-gone'] },
  { userId: ODD, role: 'auditor', projectIds: [] },
];

const PROJECTS = ['prj-1', 'prj-2'];

interface Call {
  readonly member: keyof MembershipWriteRepository | 'findProject';
  readonly arg: unknown;
}

/**
 * A tenant transaction that commits the calls its work made when the work resolves and discards
 * them when it throws — the contract `packages/db`'s `inTenantTransaction` keeps with Postgres.
 * `lockMembers` answers what the real statement would.
 */
function fakeDeps(members: readonly LockedMemberRow[] = MEMBERS) {
  const transactions: string[] = [];
  const committed: Call[] = [];
  const audits: AuditEntry[] = [];

  const deps: MembershipWriteDeps<typeof HANDLE> = {
    handle: HANDLE,
    clock: { now: () => NOW },
    transaction: async (_handle, tenantId, work) => {
      transactions.push(tenantId);
      const calls: Call[] = [];
      const pendingAudits: AuditEntry[] = [];
      const record =
        <A>(member: Call['member']) =>
        async (arg: A): Promise<void> => {
          calls.push({ member, arg });
        };
      const membership: MembershipWriteRepository = {
        lockMembers: async (ids) => {
          calls.push({ member: 'lockMembers', arg: ids });
          return members
            .filter((row) => row.role === 'tenant_admin' || row.userId === ids.callerId || row.userId === ids.targetId)
            .slice()
            .sort((a, b) => a.userId.localeCompare(b.userId));
        },
        deleteMembership: record('deleteMembership'),
        setRole: record('setRole'),
        setProjectIds: record('setProjectIds'),
      };
      const result = await work({
        membership,
        org: {
          findProject: async (id) => {
            calls.push({ member: 'findProject', arg: id });
            return PROJECTS.includes(id) ? { id, name: id, departmentId: 'dep', programId: null } : null;
          },
        },
        audit: { append: async (entry) => void pendingAudits.push(entry) },
      });
      committed.push(...calls);
      audits.push(...pendingAudits);
      return result;
    },
  };
  const writes = () => committed.filter((call) => !['lockMembers', 'findProject'].includes(call.member));
  return { deps, transactions, committed, audits, writes };
}

const audited = (action: string, target: string, payload: unknown) => [
  { actor: `user:${ADMIN}`, at: NOW, action, target, payload },
];

describe('the admin gate', () => {
  it.each([
    ['revokeMembership', (deps: MembershipWriteDeps<typeof HANDLE>, ctx: RequestContext) => revokeMembership(deps, ctx, { userId: PM })],
    ['changeMemberRole', (deps: MembershipWriteDeps<typeof HANDLE>, ctx: RequestContext) => changeMemberRole(deps, ctx, { userId: PM, role: 'tenant_admin' })],
    ['assignMemberProject', (deps: MembershipWriteDeps<typeof HANDLE>, ctx: RequestContext) => assignMemberProject(deps, ctx, { userId: PM, projectId: 'prj-2' })],
    ['unassignMemberProject', (deps: MembershipWriteDeps<typeof HANDLE>, ctx: RequestContext) => unassignMemberProject(deps, ctx, { userId: PM, projectId: 'prj-1' })],
  ] as const)('%s answers not_found to a caller without tenant_admin, opening no transaction', async (_name, run) => {
    const fake = fakeDeps();
    expect(await run(fake.deps, ctxOf(ADMIN, ['pm']))).toMatchObject({ ok: false, error: { code: 'not_found' } });
    expect(fake.transactions).toEqual([]);
  });

  it('answers not_found, not invalid_input, to a non-admin sending malformed input', async () => {
    const fake = fakeDeps();
    const result = await changeMemberRole(fake.deps, ctxOf(ADMIN, ['pm']), { userId: '', role: 'client_viewer' as never });
    expect(result).toEqual({ ok: false, error: { code: 'not_found', messageKey: 'errors.not_found' } });
    expect(fake.transactions).toEqual([]);
  });

  it('re-checks the caller against the locked rows: a context that is stale answers not_found', async () => {
    // The context says tenant_admin; the bridge says the caller was demoted since.
    const demoted = MEMBERS.map((row) => (row.userId === ADMIN ? { ...row, role: 'pm' } : row));
    const fake = fakeDeps(demoted);
    expect(await revokeMembership(fake.deps, CTX, { userId: PM })).toMatchObject({ error: { code: 'not_found' } });
    expect(fake.writes()).toEqual([]);
    expect(fake.audits).toEqual([]);
  });

  it('answers not_found for a caller with no membership in this Tenant at all', async () => {
    const fake = fakeDeps(MEMBERS.filter((row) => row.userId !== ADMIN));
    expect(await assignMemberProject(fake.deps, CTX, { userId: PM, projectId: 'prj-2' })).toMatchObject({
      error: { code: 'not_found' },
    });
    expect(fake.writes()).toEqual([]);
  });
});

describe('revokeMembership', () => {
  it('deletes the row and records its role and Projects, on the member, stamped by the Clock', async () => {
    const fake = fakeDeps();
    expect(await revokeMembership(fake.deps, CTX, { userId: PM })).toEqual({ ok: true, value: undefined });
    expect(fake.transactions).toEqual(['ten-a']);
    expect(fake.committed[0]).toEqual({ member: 'lockMembers', arg: { callerId: ADMIN, targetId: PM } });
    expect(fake.committed.filter((call) => call.member === 'lockMembers')).toHaveLength(1);
    expect(fake.writes()).toEqual([{ member: 'deleteMembership', arg: PM }]);
    expect(fake.audits).toEqual(
      audited('membership.revoke', PM, { before: { role: 'pm', projectIds: ['prj-1', 'prj-gone'] } }),
    );
  });

  it('answers not_found for a user with no membership in this Tenant, writing nothing', async () => {
    const fake = fakeDeps();
    expect(await revokeMembership(fake.deps, CTX, { userId: 'usr-elsewhere' })).toMatchObject({
      error: { code: 'not_found' },
    });
    expect(fake.writes()).toEqual([]);
    expect(fake.audits).toEqual([]);
  });

  it('lets an admin revoke themself while another admin remains', async () => {
    const fake = fakeDeps();
    expect(await revokeMembership(fake.deps, CTX, { userId: ADMIN })).toEqual({ ok: true, value: undefined });
    expect(fake.writes()).toEqual([{ member: 'deleteMembership', arg: ADMIN }]);
  });

  it('refuses to revoke the last tenant_admin, the caller included', async () => {
    const alone = MEMBERS.filter((row) => row.userId !== OTHER_ADMIN);
    const fake = fakeDeps(alone);
    expect(await revokeMembership(fake.deps, CTX, { userId: ADMIN })).toEqual({
      ok: false,
      error: { code: 'invalid_input', messageKey: 'errors.invalid_input', details: { userId: [LAST_TENANT_ADMIN] } },
    });
    expect(fake.writes()).toEqual([]);
    expect(fake.audits).toEqual([]);
  });

  it('revokes a member whose stored role this release does not know', async () => {
    const fake = fakeDeps();
    expect(await revokeMembership(fake.deps, CTX, { userId: ODD })).toEqual({ ok: true, value: undefined });
    expect(fake.audits).toEqual(audited('membership.revoke', ODD, { before: { role: 'auditor', projectIds: [] } }));
  });

  it('refuses a malformed id with invalid_input and opens no transaction', async () => {
    const fake = fakeDeps();
    expect(await revokeMembership(fake.deps, CTX, { userId: 'a\0b' })).toMatchObject({
      error: { code: 'invalid_input' },
    });
    expect(fake.transactions).toEqual([]);
  });
});

describe('changeMemberRole', () => {
  it('promotes a PM and keeps their Projects, recording { before, after }', async () => {
    const fake = fakeDeps();
    expect(await changeMemberRole(fake.deps, CTX, { userId: PM, role: 'tenant_admin' })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(fake.writes()).toEqual([{ member: 'setRole', arg: { userId: PM, role: 'tenant_admin' } }]);
    expect(fake.audits).toEqual(audited('membership.change_role', PM, { before: 'pm', after: 'tenant_admin' }));
  });

  it('is a no-op, recording nothing, when the role is already the one asked for', async () => {
    const fake = fakeDeps();
    expect(await changeMemberRole(fake.deps, CTX, { userId: PM, role: 'pm' })).toEqual({ ok: true, value: undefined });
    expect(fake.writes()).toEqual([]);
    expect(fake.audits).toEqual([]);
  });

  it('demotes an admin while another remains', async () => {
    const fake = fakeDeps();
    expect(await changeMemberRole(fake.deps, CTX, { userId: OTHER_ADMIN, role: 'pm' })).toMatchObject({ ok: true });
    expect(fake.audits).toEqual(audited('membership.change_role', OTHER_ADMIN, { before: 'tenant_admin', after: 'pm' }));
  });

  it('refuses to demote the last tenant_admin — the caller demoting themself included', async () => {
    const fake = fakeDeps(MEMBERS.filter((row) => row.userId !== OTHER_ADMIN));
    expect(await changeMemberRole(fake.deps, CTX, { userId: ADMIN, role: 'pm' })).toMatchObject({
      error: { code: 'invalid_input', details: { userId: [LAST_TENANT_ADMIN] } },
    });
    expect(fake.writes()).toEqual([]);
  });

  /**
   * THE OTHER SIDE OF THE SAME RULE, which nothing pinned. `keepAnAdmin` is skipped when the
   * REQUESTED role is `tenant_admin`, so naming the role a member already holds stays a no-op
   * rather than a refusal — including for a Tenant's only admin re-confirming their own. Delete
   * that condition and this is the one test that notices: every other case targets a `pm`, or a
   * Tenant with two admins, or asks for `pm`, and both enumeration gates drive a `pm` target in a
   * two-admin Tenant.
   */
  it('lets the sole tenant_admin be given the role they already hold, writing and recording nothing', async () => {
    const fake = fakeDeps(MEMBERS.filter((row) => row.userId !== OTHER_ADMIN));
    expect(await changeMemberRole(fake.deps, CTX, { userId: ADMIN, role: 'tenant_admin' })).toMatchObject({
      ok: true,
    });
    expect(fake.writes()).toEqual([]);
    expect(fake.audits).toEqual([]);
  });

  it('re-roles a member whose stored role is unknown', async () => {
    const fake = fakeDeps();
    expect(await changeMemberRole(fake.deps, CTX, { userId: ODD, role: 'pm' })).toMatchObject({ ok: true });
    expect(fake.audits).toEqual(audited('membership.change_role', ODD, { before: 'auditor', after: 'pm' }));
  });

  it.each(['client_viewer', 'internal_viewer', 'owner', ''])(
    'refuses the unassignable role %j with invalid_input, opening no transaction',
    async (role) => {
      const fake = fakeDeps();
      expect(await changeMemberRole(fake.deps, CTX, { userId: PM, role: role as never })).toMatchObject({
        error: { code: 'invalid_input', details: { role: expect.any(Array) } },
      });
      expect(fake.transactions).toEqual([]);
    },
  );
});

describe('assignMemberProject and unassignMemberProject', () => {
  it('appends a Project of this Tenant once, recording the previous list', async () => {
    const fake = fakeDeps();
    expect(await assignMemberProject(fake.deps, CTX, { userId: PM, projectId: 'prj-2' })).toMatchObject({ ok: true });
    expect(fake.writes()).toEqual([
      { member: 'setProjectIds', arg: { userId: PM, projectIds: ['prj-1', 'prj-gone', 'prj-2'] } },
    ]);
    expect(fake.audits).toEqual(
      audited('membership.assign_project', PM, { before: ['prj-1', 'prj-gone'], after: ['prj-1', 'prj-gone', 'prj-2'] }),
    );
    // The lock comes first, then the Project; one membership lock only.
    expect(fake.committed.map((call) => call.member)).toEqual(['lockMembers', 'findProject', 'setProjectIds']);
  });

  it('assigns to a Tenant Admin too', async () => {
    const fake = fakeDeps();
    expect(await assignMemberProject(fake.deps, CTX, { userId: OTHER_ADMIN, projectId: 'prj-1' })).toMatchObject({
      ok: true,
    });
    expect(fake.audits).toEqual(audited('membership.assign_project', OTHER_ADMIN, { before: [], after: ['prj-1'] }));
  });

  it('is a no-op for a Project already held', async () => {
    const fake = fakeDeps();
    expect(await assignMemberProject(fake.deps, CTX, { userId: PM, projectId: 'prj-1' })).toMatchObject({ ok: true });
    expect(fake.writes()).toEqual([]);
    expect(fake.audits).toEqual([]);
  });

  it('answers not_found for a Project this Tenant cannot see — even the stale id it holds', async () => {
    for (const projectId of ['prj-foreign', 'prj-gone']) {
      const fake = fakeDeps();
      expect(await assignMemberProject(fake.deps, CTX, { userId: PM, projectId })).toMatchObject({
        error: { code: 'not_found' },
      });
      expect(fake.writes()).toEqual([]);
    }
  });

  it('unassigns a stale id whose Project no longer exists, without looking the Project up', async () => {
    const fake = fakeDeps();
    expect(await unassignMemberProject(fake.deps, CTX, { userId: PM, projectId: 'prj-gone' })).toMatchObject({
      ok: true,
    });
    expect(fake.committed.map((call) => call.member)).toEqual(['lockMembers', 'setProjectIds']);
    expect(fake.audits).toEqual(
      audited('membership.unassign_project', PM, { before: ['prj-1', 'prj-gone'], after: ['prj-1'] }),
    );
  });

  it('is a no-op for an id not held', async () => {
    const fake = fakeDeps();
    expect(await unassignMemberProject(fake.deps, CTX, { userId: PM, projectId: 'prj-2' })).toMatchObject({ ok: true });
    expect(fake.writes()).toEqual([]);
    expect(fake.audits).toEqual([]);
  });

  it('answers not_found for a member of no membership here', async () => {
    const fake = fakeDeps();
    expect(await unassignMemberProject(fake.deps, CTX, { userId: 'usr-elsewhere', projectId: 'prj-1' })).toMatchObject({
      error: { code: 'not_found' },
    });
  });
});
