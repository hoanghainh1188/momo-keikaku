import { describe, expect, it } from 'vitest';
import type { AuditEntry } from '../audit';
import type { ProjectWriteDeps, ProjectWriteRepository, WriteStamp } from '../ports/project-write';
import type { Result } from '../result';
import type { RequestContext } from '../authz/request-context';
import {
  explainTickets,
  mapTicket,
  mapTickets,
  markChangeRequestCandidates,
  planTicketsAsWorkPackage,
} from '.';
import { mapTicketInputSchema, runProjectWrite } from './project-write-input';

/**
 * The five project write use cases against a fake tenant transaction — no database, no
 * environment.
 *
 * Pinned here, where it is cheap: the exact `Result` of each branch; that a malformed command
 * never opens a transaction (so nothing can be written); that the Tenant comes from the context
 * and the actor from the deps; that the change and its audit record land in ONE transaction —
 * the record committed with it, and discarded with it when anything throws; and that a failure
 * which is NOT an invisible Project propagates instead of being reported as `not_found` — or,
 * worse, as success. The cross-tenant harness then proves the `not_found` contract and the
 * rollback end to end against real row-level security, and `tests/audited-use-cases.test.ts`
 * holds the audit contract for every write on the surface.
 */

const HANDLE = { marker: 'handle' };
/** The signed-in caller; the audit actor is derived from its user id (story 1.4 slice 1). */
const CTX: RequestContext = {
  tenantId: 'ten-a',
  userId: 'test-actor',
  roles: ['pm'],
  projectIds: ['prj-1'],
  locale: 'en',
};
const ACTOR = 'user:test-actor';
/** The Project's anchor the fake answers: the event time every row and record carries. */
const AT = new Date('2026-09-01T00:00:00Z');
const PLANNED_WP = 'wp-new-fake';

type Member = Exclude<keyof ProjectWriteRepository, 'projectAnchor' | 'workPackageInProject'>;

interface Call {
  readonly member: Member;
  readonly stamp: WriteStamp;
  readonly command: unknown;
}

interface Behaviour {
  /** What `projectAnchor` does for a Project id. */
  readonly anchor?: (projectId: string) => Date | Error;
  /** Whether a Work Package is one of a Project's (AD-12). Every Work Package is, by default. */
  readonly wpInProject?: (projectId: string, wpId: string) => boolean;
  /** What a repository member does, once its call is recorded. */
  readonly member?: () => 'ok' | Error;
  /** What the audit sink does, once its call is recorded. */
  readonly audit?: () => 'ok' | Error;
}

/**
 * A tenant transaction that commits what its work did when the work resolves, and discards it
 * when the work throws — the contract `packages/db`'s `inTenantTransaction` keeps with Postgres.
 */
function fakeDeps(behave: Behaviour = {}) {
  const transactions: { readonly handle: unknown; readonly tenantId: string }[] = [];
  const calls: Call[] = [];
  const audits: AuditEntry[] = [];
  const asked: { readonly projectId: string; readonly wpId: string }[] = [];

  const deps: ProjectWriteDeps<typeof HANDLE> = {
    handle: HANDLE,
    transaction: async (handle, tenantId, work) => {
      transactions.push({ handle, tenantId });
      const pendingCalls: Call[] = [];
      const pendingAudits: AuditEntry[] = [];
      const member =
        <Landed>(name: Member, landed: Landed) =>
        async (stamp: WriteStamp, command: unknown): Promise<Landed> => {
          pendingCalls.push({ member: name, stamp, command });
          const outcome = behave.member?.() ?? 'ok';
          if (outcome instanceof Error) throw outcome;
          return landed;
        };
      const result = await work({
        projectWrite: {
          projectAnchor: async (projectId) => {
            const outcome = behave.anchor?.(projectId) ?? AT;
            if (outcome instanceof Error) throw outcome;
            return outcome;
          },
          workPackageInProject: async (projectId, wpId) => {
            asked.push({ projectId, wpId });
            return behave.wpInProject?.(projectId, wpId) ?? true;
          },
          recordMapDisposition: member('recordMapDisposition', undefined),
          recordPlanDisposition: member('recordPlanDisposition', { wpId: PLANNED_WP }),
          recordExplainDisposition: member('recordExplainDisposition', undefined),
          recordChangeRequestCandidates: member('recordChangeRequestCandidates', undefined),
          recordManualMapping: member('recordManualMapping', undefined),
        },
        audit: {
          append: async (entry) => {
            pendingAudits.push(entry);
            const outcome = behave.audit?.() ?? 'ok';
            if (outcome instanceof Error) throw outcome;
          },
        },
      });
      // Reached only when `work` resolved: commit.
      calls.push(...pendingCalls);
      audits.push(...pendingAudits);
      return result;
    },
  };
  return { deps, transactions, calls, audits, asked };
}

/** packages/db's wording for an invisible Project, verbatim (repo-writes.ts, repo.ts). */
const notFoundError = (projectId: string) =>
  new Error(`project ${projectId} not found — run \`pnpm demo\` to seed`);

type Run = (
  deps: ProjectWriteDeps<typeof HANDLE>,
  ctx: RequestContext,
  input: never,
) => Promise<Result<void>>;

interface Case {
  readonly name: string;
  readonly run: Run;
  readonly member: Member;
  /** A command the use case must accept and hand to the port unchanged (plus `kind`). */
  readonly valid: Record<string, unknown>;
  /** The Disposition kind the use case stamps on the port command; none for manual Mapping. */
  readonly kind?: string;
  /** Commands it must refuse, with the field `details` must name. */
  readonly invalid: readonly (readonly [label: string, input: unknown, field: string])[];
  /** The one audit record the valid command commits: action, target and payload. */
  readonly record: Pick<AuditEntry, 'action' | 'target' | 'payload'>;
}

const TICKETS = ['tkt-1', 'tkt-2'];

/** The refusals every Disposition shares: the Project id and the Ticket list. */
function commonInvalid(valid: Record<string, unknown>) {
  return [
    ['an empty projectId', { ...valid, projectId: '' }, 'projectId'],
    ['an absent projectId', { ...valid, projectId: undefined }, 'projectId'],
    ['a NUL-bearing projectId', { ...valid, projectId: 'prj\0ec2' }, 'projectId'],
    ['no Tickets', { ...valid, ticketIds: [] }, 'ticketIds'],
    ['an empty Ticket id', { ...valid, ticketIds: ['tkt-1', ''] }, 'ticketIds.1'],
    ['a NUL-bearing Ticket id', { ...valid, ticketIds: ['tkt\0'] }, 'ticketIds.0'],
  ] as const;
}

const MAP = { projectId: 'prj-1', wpId: 'wp-1', ticketIds: TICKETS };
const PLAN = { projectId: 'prj-1', name: 'New scope', ticketIds: TICKETS };
const EXPLAIN = { projectId: 'prj-1', note: 'Client asked for it.', ticketIds: TICKETS };
const CR = { projectId: 'prj-1', ticketIds: TICKETS };
const SINGLE = { projectId: 'prj-1', ticketId: 'tkt-1', wpId: 'wp-1' };

const CASES: readonly Case[] = [
  {
    name: 'mapTickets',
    kind: 'map',
    run: mapTickets as Run,
    member: 'recordMapDisposition',
    valid: MAP,
    record: {
      action: 'disposition.map',
      target: 'prj-1',
      payload: { ticketIds: TICKETS, wpId: 'wp-1', note: null },
    },
    invalid: [
      ...commonInvalid(MAP),
      ['an empty wpId', { ...MAP, wpId: '' }, 'wpId'],
      ['a NUL-bearing wpId', { ...MAP, wpId: 'wp\0' }, 'wpId'],
    ],
  },
  {
    name: 'planTicketsAsWorkPackage',
    kind: 'plan',
    run: planTicketsAsWorkPackage as Run,
    member: 'recordPlanDisposition',
    valid: PLAN,
    // The Work Package id is the repository's, returned from the insert — not rebuilt here.
    record: {
      action: 'disposition.plan',
      target: 'prj-1',
      payload: { ticketIds: TICKETS, wpId: PLANNED_WP, note: null },
    },
    invalid: [
      ...commonInvalid(PLAN),
      ['an empty name', { ...PLAN, name: '' }, 'name'],
      ['a blank name', { ...PLAN, name: '   ' }, 'name'],
      ['a NUL-bearing name', { ...PLAN, name: 'a\0b' }, 'name'],
    ],
  },
  {
    name: 'explainTickets',
    kind: 'explain',
    run: explainTickets as Run,
    member: 'recordExplainDisposition',
    valid: EXPLAIN,
    record: {
      action: 'disposition.explain',
      target: 'prj-1',
      payload: { ticketIds: TICKETS, wpId: null, note: 'Client asked for it.' },
    },
    invalid: [
      ...commonInvalid(EXPLAIN),
      ['an empty note', { ...EXPLAIN, note: '' }, 'note'],
      ['a blank note', { ...EXPLAIN, note: ' \n ' }, 'note'],
      ['a NUL-bearing note', { ...EXPLAIN, note: 'a\0b' }, 'note'],
      ['a note over 1000 characters', { ...EXPLAIN, note: 'x'.repeat(1001) }, 'note'],
    ],
  },
  {
    name: 'markChangeRequestCandidates',
    kind: 'cr_candidate',
    run: markChangeRequestCandidates as Run,
    member: 'recordChangeRequestCandidates',
    valid: CR,
    record: {
      action: 'disposition.cr_candidate',
      target: 'prj-1',
      payload: { ticketIds: TICKETS, wpId: null, note: null },
    },
    invalid: commonInvalid(CR),
  },
  {
    name: 'mapTicket',
    run: mapTicket as Run,
    member: 'recordManualMapping',
    valid: SINGLE,
    record: { action: 'mapping.map', target: 'tkt-1', payload: { wpId: 'wp-1' } },
    invalid: [
      ['an empty projectId', { ...SINGLE, projectId: '' }, 'projectId'],
      ['a NUL-bearing projectId', { ...SINGLE, projectId: 'p\0' }, 'projectId'],
      ['an empty ticketId', { ...SINGLE, ticketId: '' }, 'ticketId'],
      ['an absent ticketId', { ...SINGLE, ticketId: undefined }, 'ticketId'],
      ['a NUL-bearing wpId', { ...SINGLE, wpId: 'wp\0' }, 'wpId'],
      ['an absent wpId', { ...SINGLE, wpId: undefined }, 'wpId'],
    ],
  },
];

describe.each(CASES)('$name', ({ run, member, valid, kind, invalid, record }) => {
  it('makes its change and its audit record in ONE transaction, for the context\'s Tenant and the deps\' actor', async () => {
    const { deps, transactions, calls, audits } = fakeDeps();
    const result = await run(deps, CTX, valid as never);

    expect(result).toEqual({ ok: true, value: undefined });
    expect(transactions).toEqual([{ handle: HANDLE, tenantId: 'ten-a' }]);
    const command = kind === undefined ? valid : { ...valid, kind };
    expect(calls).toEqual([{ member, stamp: { actor: ACTOR, at: AT }, command }]);
    expect(audits).toEqual([{ actor: ACTOR, at: AT, ...record }]);
  });

  it('ignores a tenantId or actor smuggled into the input', async () => {
    // The Tenant and the actor both come from ctx (story 1.4), never from what the caller posted:
    // zod strips the unknown keys, so the command carries neither.
    const { deps, transactions, calls, audits } = fakeDeps();
    const result = await run(
      deps,
      CTX,
      { ...valid, tenantId: 'ten-b', actor: 'user:evil' } as never,
    );

    expect(result.ok).toBe(true);
    expect(transactions.map((t) => t.tenantId)).toEqual(['ten-a']);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.stamp.actor).toBe(ACTOR);
    expect(calls[0]!.command).not.toHaveProperty('tenantId');
    expect(calls[0]!.command).not.toHaveProperty('actor');
    expect(audits.map((entry) => entry.actor)).toEqual([ACTOR]);
  });

  it('stamps its own kind, whatever kind the caller sent', async () => {
    const { deps, calls } = fakeDeps();
    await run(deps, CTX, { ...valid, kind: 'forged' } as never);
    expect(calls.map((call) => (call.command as { kind?: unknown }).kind)).toEqual([kind]);
  });

  it('answers not_found — never a throw, never ok — for a Project the Tenant cannot see, and records nothing', async () => {
    const { deps, calls, audits } = fakeDeps({ anchor: (projectId) => notFoundError(projectId) });
    const result = await run(deps, { ...CTX, tenantId: 'ten-b' }, valid as never);

    // No `details`: the refusal must carry nothing, so it cannot disclose anything.
    expect(result).toEqual({ ok: false, error: { code: 'not_found', messageKey: 'errors.not_found' } });
    expect({ calls, audits }).toEqual({ calls: [], audits: [] });
  });

  it('answers not_found for a viewer, opening no transaction', async () => {
    const { deps, transactions } = fakeDeps();
    const viewer = { ...CTX, roles: ['client_viewer'] as const };
    expect(await run(deps, viewer, valid as never)).toMatchObject({ error: { code: 'not_found' } });
    expect(transactions).toEqual([]);
  });

  it('answers not_found, not invalid_input, to a viewer sending malformed input', async () => {
    // Pins role-before-parse: moving authorize after parse would answer invalid_input here.
    const { deps, transactions } = fakeDeps();
    const viewer = { ...CTX, roles: ['client_viewer'] as const };
    expect(await run(deps, viewer, { ...valid, projectId: '' } as never)).toEqual({
      ok: false,
      error: { code: 'not_found', messageKey: 'errors.not_found' },
    });
    expect(transactions).toEqual([]);
  });

  it('answers not_found when a PM\'s projectIds does not contain the Project', async () => {
    const { deps, transactions } = fakeDeps();
    const unassigned = { ...CTX, projectIds: ['prj-other'] };
    expect(await run(deps, unassigned, valid as never)).toMatchObject({ error: { code: 'not_found' } });
    expect(transactions).toEqual([]);
  });

  it('lets a tenant_admin through with empty projectIds', async () => {
    const { deps, transactions } = fakeDeps();
    const admin = { ...CTX, roles: ['tenant_admin'] as const, projectIds: [] };
    expect(await run(deps, admin, valid as never)).toMatchObject({ ok: true });
    expect(transactions).toEqual([{ handle: HANDLE, tenantId: 'ten-a' }]);
  });

  it('rethrows any other failure rather than answering not_found or ok for it — and commits no record', async () => {
    const outage = new Error('connect ECONNREFUSED 127.0.0.1:55433');
    const { deps, audits } = fakeDeps({ member: () => outage });
    await expect(run(deps, CTX, valid as never)).rejects.toBe(outage);
    expect(audits).toEqual([]);
  });

  it('rolls its change back when the audit insert is refused', async () => {
    const refused = new Error('audit_log insert refused');
    const { deps, calls, audits } = fakeDeps({ audit: () => refused });
    await expect(run(deps, CTX, valid as never)).rejects.toBe(refused);
    expect({ calls, audits }).toEqual({ calls: [], audits: [] });
  });

  it('does not mistake another Project\'s not-found for this one', async () => {
    const { deps } = fakeDeps({ anchor: () => notFoundError('prj-other') });
    await expect(run(deps, CTX, valid as never)).rejects.toThrow('project prj-other not found');
  });

  it.each(invalid)('answers invalid_input for %s, without opening a transaction', async (_label, input, field) => {
    const { deps, transactions } = fakeDeps();
    const result = await run(deps, CTX, input as never);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invalid_input');
    expect(result.error.messageKey).toBe('errors.invalid_input');
    expect(Object.keys(result.error.details ?? {})).toEqual([field]);
    expect(transactions).toEqual([]);
  });
});

describe('mapTicket', () => {
  it('accepts an empty wpId — the unmap — passes it through, and records mapping.unmap with the empty string', async () => {
    const { deps, calls, audits, asked } = fakeDeps();
    const result = await mapTicket(deps, CTX, { ...SINGLE, wpId: '' });

    expect(result.ok).toBe(true);
    expect(calls.map((call) => call.command)).toEqual([{ ...SINGLE, wpId: '' }]);
    expect(audits).toEqual([
      { actor: ACTOR, at: AT, action: 'mapping.unmap', target: 'tkt-1', payload: { wpId: '' } },
    ]);
    // An unmap names no Work Package, so there is nothing to check it belongs to.
    expect(asked).toEqual([]);
  });
});

// AD-12: a project-scoped call's other ids belong to its Project. The two writes that name a Work
// Package ask the repository first; a Work Package of another Project (or another Tenant, which
// row-level security makes the same answer) is refused before anything is written.
describe.each([
  { name: 'mapTickets', run: mapTickets as Run, valid: MAP },
  { name: 'mapTicket', run: mapTicket as Run, valid: SINGLE },
])('$name, naming a Work Package of another Project', ({ run, valid }) => {
  it('answers not_found and records nothing', async () => {
    const { deps, calls, audits, asked } = fakeDeps({ wpInProject: () => false });
    const result = await run(deps, CTX, valid as never);

    expect(result).toEqual({ ok: false, error: { code: 'not_found', messageKey: 'errors.not_found' } });
    expect(asked).toEqual([{ projectId: 'prj-1', wpId: 'wp-1' }]);
    expect({ calls, audits }).toEqual({ calls: [], audits: [] });
  });

  it('asks about the command\'s own Project and Work Package, and writes when they match', async () => {
    const { deps, calls, asked } = fakeDeps();
    expect(await run(deps, CTX, valid as never)).toMatchObject({ ok: true });
    expect(asked).toEqual([{ projectId: 'prj-1', wpId: 'wp-1' }]);
    expect(calls).toHaveLength(1);
  });
});

describe('explainTickets', () => {
  it('accepts a note of exactly 1000 characters, stored as given', async () => {
    const { deps, calls } = fakeDeps();
    const note = `  ${'x'.repeat(996)}  `;
    const result = await explainTickets(deps, CTX, { ...EXPLAIN, note });

    expect(result.ok).toBe(true);
    // Not trimmed by the use case: what lands is what the caller sent.
    expect(calls.map((call) => call.command)).toEqual([{ ...EXPLAIN, note, kind: 'explain' }]);
  });
});

describe('runProjectWrite', () => {
  it('hands the work a sink that refuses a direct append with a non-enum action, committing nothing', async () => {
    const { deps, audits } = fakeDeps();
    const run = runProjectWrite(mapTicketInputSchema, deps, CTX, SINGLE, async (scope, stamp) => {
      await scope.audit.append({ ...stamp, action: 'mapping.forged' as never, target: 'tkt-1', payload: {} });
    });
    await expect(run).rejects.toThrow(/not a member of AUDIT_ACTIONS/);
    expect(audits).toEqual([]);
  });
});
