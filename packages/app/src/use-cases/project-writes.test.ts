import { describe, expect, it } from 'vitest';
import type { ProjectWriteDeps, ProjectWritePort } from '../ports/project-write';
import type { Result } from '../result';
import type { UseCaseContext } from './context';
import {
  explainTickets,
  mapTicket,
  mapTickets,
  markChangeRequestCandidates,
  planTicketsAsWorkPackage,
} from '.';

/**
 * The five project write use cases against a fake port — no database, no environment.
 *
 * Pinned here, where it is cheap: the exact `Result` of each branch, that a malformed command
 * never reaches the port (so nothing can be written), that the Tenant comes from the context
 * and the actor from the deps, and that a failure which is NOT an invisible Project propagates
 * instead of being reported as `not_found` — or, worse, as success. The cross-tenant harness
 * then proves the `not_found` contract end to end against real row-level security.
 */

const HANDLE = { marker: 'handle' };
const ACTOR = 'user:test-actor';
const CTX: UseCaseContext = { tenantId: 'ten-a' };

type Member = keyof ProjectWritePort<typeof HANDLE>;

interface Call {
  readonly member: Member;
  readonly handle: unknown;
  readonly tenantId: string;
  readonly actor: string;
  readonly command: unknown;
}

/** A port whose every member records its call and answers from `behave`. */
function fakeDeps(behave: (command: { projectId: string }) => 'ok' | Error = () => 'ok') {
  const calls: Call[] = [];
  const member =
    (name: Member) =>
    async (
      handle: typeof HANDLE,
      tenantId: string,
      actor: string,
      command: { readonly projectId: string },
    ): Promise<void> => {
      calls.push({ member: name, handle, tenantId, actor, command });
      const outcome = behave(command);
      if (outcome instanceof Error) throw outcome;
    };
  const deps: ProjectWriteDeps<typeof HANDLE> = {
    handle: HANDLE,
    actor: ACTOR,
    projectWrite: {
      recordMapDisposition: member('recordMapDisposition'),
      recordPlanDisposition: member('recordPlanDisposition'),
      recordExplainDisposition: member('recordExplainDisposition'),
      recordChangeRequestCandidates: member('recordChangeRequestCandidates'),
      recordManualMapping: member('recordManualMapping'),
    },
  };
  return { deps, calls };
}

/** packages/db's wording for an invisible Project, verbatim (repo-writes.ts, repo.ts). */
const notFoundError = (projectId: string) =>
  new Error(`project ${projectId} not found — run \`pnpm demo\` to seed`);

type Run = (
  deps: ProjectWriteDeps<typeof HANDLE>,
  ctx: UseCaseContext,
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
    invalid: commonInvalid(CR),
  },
  {
    name: 'mapTicket',
    run: mapTicket as Run,
    member: 'recordManualMapping',
    valid: SINGLE,
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

describe.each(CASES)('$name', ({ run, member, valid, kind, invalid }) => {
  it('hands the command to its port member, for the context\'s Tenant and the deps\' actor', async () => {
    const { deps, calls } = fakeDeps();
    const result = await run(deps, CTX, valid as never);

    expect(result).toEqual({ ok: true, value: undefined });
    const command = kind === undefined ? valid : { ...valid, kind };
    expect(calls).toEqual([{ member, handle: HANDLE, tenantId: 'ten-a', actor: ACTOR, command }]);
  });

  it('ignores a tenantId or actor smuggled into the input', async () => {
    // The Tenant comes from ctx and the actor from deps, never from what the caller posted:
    // zod strips the unknown keys, so the command carries neither.
    const { deps, calls } = fakeDeps();
    const result = await run(
      deps,
      CTX,
      { ...valid, tenantId: 'ten-b', actor: 'user:evil' } as never,
    );

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.tenantId).toBe('ten-a');
    expect(calls[0]!.actor).toBe(ACTOR);
    expect(calls[0]!.command).not.toHaveProperty('tenantId');
    expect(calls[0]!.command).not.toHaveProperty('actor');
  });

  it('stamps its own kind, whatever kind the caller sent', async () => {
    const { deps, calls } = fakeDeps();
    await run(deps, CTX, { ...valid, kind: 'forged' } as never);
    expect(calls.map((call) => (call.command as { kind?: unknown }).kind)).toEqual([kind]);
  });

  it('answers not_found — never a throw, never ok — for a Project the Tenant cannot see', async () => {
    const { deps } = fakeDeps((command) => notFoundError(command.projectId));
    const result = await run(deps, { tenantId: 'ten-b' }, valid as never);

    // No `details`: the refusal must carry nothing, so it cannot disclose anything.
    expect(result).toEqual({ ok: false, error: { code: 'not_found', messageKey: 'errors.not_found' } });
  });

  it('rethrows any other failure rather than answering not_found or ok for it', async () => {
    const outage = new Error('connect ECONNREFUSED 127.0.0.1:55433');
    const { deps } = fakeDeps(() => outage);
    await expect(run(deps, CTX, valid as never)).rejects.toBe(outage);
  });

  it('does not mistake another Project\'s not-found for this one', async () => {
    const { deps } = fakeDeps(() => notFoundError('prj-other'));
    await expect(run(deps, CTX, valid as never)).rejects.toThrow('project prj-other not found');
  });

  it.each(invalid)('answers invalid_input for %s, without calling the port', async (_label, input, field) => {
    const { deps, calls } = fakeDeps();
    const result = await run(deps, CTX, input as never);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invalid_input');
    expect(result.error.messageKey).toBe('errors.invalid_input');
    expect(Object.keys(result.error.details ?? {})).toEqual([field]);
    expect(calls).toEqual([]);
  });
});

describe('mapTicket', () => {
  it('accepts an empty wpId — the unmap — and passes it through as the empty string', async () => {
    const { deps, calls } = fakeDeps();
    const result = await mapTicket(deps, CTX, { ...SINGLE, wpId: '' });

    expect(result.ok).toBe(true);
    expect(calls.map((call) => call.command)).toEqual([{ ...SINGLE, wpId: '' }]);
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
