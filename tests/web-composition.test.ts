import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The composition root's five write bindings, wired to spies — no database.
 *
 * The `satisfies` checks cannot see a binding pointed at the WRONG use case: `ExplainTicketsInput`
 * is assignable to `ChangeRequestCandidatesInput`, so `explainTickets` calling
 * `markChangeRequestCandidates` typechecks, and every harness test (which wires its own deps)
 * stays green. Nothing else asserts the Tenant or the audit actor this file states either. So
 * each export is called once and exactly the matching repository function must receive
 * `(handle, DEMO_TENANT_ID, 'user:linh', { ...input, kind })`.
 *
 * In `tests/`, not beside the file: it has to import and mock `@momo/db`, and AD-1 lets exactly
 * one `apps/web` file do that (`pnpm depcruise`, rule `apps-not-to-db`). `tests/` sits outside
 * that graph.
 */

const spies = vi.hoisted(() => ({
  handle: { marker: 'restricted-handle' },
  getDb: vi.fn(),
  recordMapDisposition: vi.fn(async () => {}),
  recordPlanDisposition: vi.fn(async () => {}),
  recordExplainDisposition: vi.fn(async () => {}),
  recordChangeRequestCandidates: vi.fn(async () => {}),
  recordManualMapping: vi.fn(async () => {}),
}));

vi.mock('@momo/db', async (importOriginal) => ({
  // DEMO_TENANT_ID and the read functions stay real; nothing here reaches a database.
  ...(await importOriginal<typeof import('@momo/db')>()),
  getDb: spies.getDb,
  recordMapDisposition: spies.recordMapDisposition,
  recordPlanDisposition: spies.recordPlanDisposition,
  recordExplainDisposition: spies.recordExplainDisposition,
  recordChangeRequestCandidates: spies.recordChangeRequestCandidates,
  recordManualMapping: spies.recordManualMapping,
}));

const APP_URL = 'postgres://momo_app:momo_app@localhost:55433/momo_keikaku';
vi.stubEnv('APP_DATABASE_URL', APP_URL);

const { DEMO_TENANT_ID } = await import('@momo/db');
const composition = await import('../apps/web/src/server/composition');

const RECORDERS = [
  'recordMapDisposition',
  'recordPlanDisposition',
  'recordExplainDisposition',
  'recordChangeRequestCandidates',
  'recordManualMapping',
] as const;

type Recorder = (typeof RECORDERS)[number];

const TICKETS = ['bk-issue-1', 'bk-issue-2'];

const CASES: readonly {
  readonly binding: string;
  readonly call: () => Promise<unknown>;
  readonly recorder: Recorder;
  readonly command: Record<string, unknown>;
}[] = [
  {
    binding: 'mapTickets',
    call: () => composition.mapTickets({ projectId: 'prj-ec2', wpId: 'wp-1-2', ticketIds: TICKETS }),
    recorder: 'recordMapDisposition',
    command: { projectId: 'prj-ec2', wpId: 'wp-1-2', ticketIds: TICKETS, kind: 'map' },
  },
  {
    binding: 'planTicketsAsWorkPackage',
    call: () =>
      composition.planTicketsAsWorkPackage({ projectId: 'prj-ec2', name: 'Scope', ticketIds: TICKETS }),
    recorder: 'recordPlanDisposition',
    command: { projectId: 'prj-ec2', name: 'Scope', ticketIds: TICKETS, kind: 'plan' },
  },
  {
    binding: 'explainTickets',
    call: () => composition.explainTickets({ projectId: 'prj-ec2', note: 'Why.', ticketIds: TICKETS }),
    recorder: 'recordExplainDisposition',
    command: { projectId: 'prj-ec2', note: 'Why.', ticketIds: TICKETS, kind: 'explain' },
  },
  {
    binding: 'markChangeRequestCandidates',
    call: () => composition.markChangeRequestCandidates({ projectId: 'prj-ec2', ticketIds: TICKETS }),
    recorder: 'recordChangeRequestCandidates',
    command: { projectId: 'prj-ec2', ticketIds: TICKETS, kind: 'cr_candidate' },
  },
  {
    binding: 'mapTicket',
    call: () => composition.mapTicket({ projectId: 'prj-ec2', ticketId: 'bk-issue-1', wpId: '' }),
    recorder: 'recordManualMapping',
    command: { projectId: 'prj-ec2', ticketId: 'bk-issue-1', wpId: '' },
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  spies.getDb.mockReturnValue(spies.handle);
});

describe.each(CASES)('the $binding binding', ({ call, recorder, command }) => {
  it(`reaches ${recorder} and nothing else, for the demo Tenant as user:linh`, async () => {
    expect(await call()).toEqual({ ok: true, value: undefined });

    expect(spies.getDb).toHaveBeenCalledWith(APP_URL);
    expect(spies[recorder]).toHaveBeenCalledTimes(1);
    expect(spies[recorder]).toHaveBeenCalledWith(spies.handle, DEMO_TENANT_ID, 'user:linh', command);
    for (const other of RECORDERS.filter((name) => name !== recorder)) {
      expect(spies[other], `${other} must not be called`).not.toHaveBeenCalled();
    }
  });
});
