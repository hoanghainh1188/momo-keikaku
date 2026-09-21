import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computeReview } from '@momo/domain';
import type { ProjectReview } from '../packages/app/src/ports/project-read';
import { MAPPING_TICKET_LIMIT } from '../packages/app/src/use-cases/get-project-mapping';
import { asOfDate, buildDemoState, currentPeriod } from '../packages/db/src/fixtures';

/**
 * The composition root's bindings — the five writes, then the four reads — wired to spies, no
 * database.
 *
 * The `satisfies` checks cannot see a binding pointed at the WRONG use case: `ExplainTicketsInput`
 * is assignable to `ChangeRequestCandidatesInput`, so `explainTickets` calling
 * `markChangeRequestCandidates` typechecks, and every harness test (which wires its own deps)
 * stays green. Nothing else asserts the Tenant or the audit actor this file states either. So
 * each export is called once: exactly one tenant transaction must open, on the restricted handle
 * for `DEMO_TENANT_ID`; inside it exactly the matching repository member must receive
 * `({ actor: 'user:linh', at: anchor }, { ...input, kind })`, and the audit sink exactly one
 * record of the matching action.
 *
 * In `tests/`, not beside the file: it has to import and mock `@momo/db`, and AD-1 lets exactly
 * one `apps/web` file do that (`pnpm depcruise`, rule `apps-not-to-db`). `tests/` sits outside
 * that graph.
 */

const spies = vi.hoisted(() => {
  const anchor = new Date('2026-09-01T00:00:00Z');
  const repository = {
    projectAnchor: vi.fn(async (_projectId: string) => anchor),
    recordMapDisposition: vi.fn(async () => {}),
    recordPlanDisposition: vi.fn(async () => ({ wpId: 'wp-new-spy' })),
    recordExplainDisposition: vi.fn(async () => {}),
    recordChangeRequestCandidates: vi.fn(async () => {}),
    recordManualMapping: vi.fn(async () => {}),
  };
  const append = vi.fn(async (_entry: unknown) => {});
  return {
    anchor,
    handle: { marker: 'restricted-handle' },
    getDb: vi.fn(),
    repository,
    append,
    inTenantTransaction: vi.fn(
      async (_handle: unknown, _tenantId: string, work: (scope: unknown) => Promise<unknown>) =>
        work({ projectWrite: repository, audit: { append } }),
    ),
    loadProjectBundle: vi.fn(),
    loadReview: vi.fn(),
  };
});

vi.mock('@momo/db', async (importOriginal) => ({
  // DEMO_TENANT_ID stays real; every function that would reach a database is a spy.
  ...(await importOriginal<typeof import('@momo/db')>()),
  getDb: spies.getDb,
  inTenantTransaction: spies.inTenantTransaction,
  loadProjectBundle: spies.loadProjectBundle,
  loadReview: spies.loadReview,
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
  readonly action: string;
}[] = [
  {
    binding: 'mapTickets',
    call: () => composition.mapTickets({ projectId: 'prj-ec2', wpId: 'wp-1-2', ticketIds: TICKETS }),
    recorder: 'recordMapDisposition',
    command: { projectId: 'prj-ec2', wpId: 'wp-1-2', ticketIds: TICKETS, kind: 'map' },
    action: 'disposition.map',
  },
  {
    binding: 'planTicketsAsWorkPackage',
    call: () =>
      composition.planTicketsAsWorkPackage({ projectId: 'prj-ec2', name: 'Scope', ticketIds: TICKETS }),
    recorder: 'recordPlanDisposition',
    command: { projectId: 'prj-ec2', name: 'Scope', ticketIds: TICKETS, kind: 'plan' },
    action: 'disposition.plan',
  },
  {
    binding: 'explainTickets',
    call: () => composition.explainTickets({ projectId: 'prj-ec2', note: 'Why.', ticketIds: TICKETS }),
    recorder: 'recordExplainDisposition',
    command: { projectId: 'prj-ec2', note: 'Why.', ticketIds: TICKETS, kind: 'explain' },
    action: 'disposition.explain',
  },
  {
    binding: 'markChangeRequestCandidates',
    call: () => composition.markChangeRequestCandidates({ projectId: 'prj-ec2', ticketIds: TICKETS }),
    recorder: 'recordChangeRequestCandidates',
    command: { projectId: 'prj-ec2', ticketIds: TICKETS, kind: 'cr_candidate' },
    action: 'disposition.cr_candidate',
  },
  {
    binding: 'mapTicket',
    call: () => composition.mapTicket({ projectId: 'prj-ec2', ticketId: 'bk-issue-1', wpId: '' }),
    recorder: 'recordManualMapping',
    command: { projectId: 'prj-ec2', ticketId: 'bk-issue-1', wpId: '' },
    action: 'mapping.unmap',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  spies.getDb.mockReturnValue(spies.handle);
});

describe.each(CASES)('the $binding binding', ({ call, recorder, command, action }) => {
  it(`reaches ${recorder} and nothing else, for the demo Tenant as user:linh, audited as ${action}`, async () => {
    expect(await call()).toEqual({ ok: true, value: undefined });

    expect(spies.getDb).toHaveBeenCalledWith(APP_URL);
    expect(spies.inTenantTransaction).toHaveBeenCalledTimes(1);
    expect(spies.inTenantTransaction).toHaveBeenCalledWith(
      spies.handle,
      DEMO_TENANT_ID,
      expect.any(Function),
    );
    const stamp = { actor: 'user:linh', at: spies.anchor };
    expect(spies.repository[recorder]).toHaveBeenCalledTimes(1);
    expect(spies.repository[recorder]).toHaveBeenCalledWith(stamp, command);
    for (const other of RECORDERS.filter((name) => name !== recorder)) {
      expect(spies.repository[other], `${other} must not be called`).not.toHaveBeenCalled();
    }
    expect(spies.append).toHaveBeenCalledTimes(1);
    expect(spies.append).toHaveBeenCalledWith(expect.objectContaining({ ...stamp, action }));
  });
});

/**
 * The read bindings, the same way: each must reach the read port as the demo Tenant, on the
 * restricted handle, and run ITS use case. The two projection reads (the web → domain/present
 * edge moved the Client View's projection and the Mapping join off the pages) both load the
 * Review, so a binding pointed at the other one would still typecheck — the value's shape is
 * what tells them apart. The Review is the demo fixture computed through the domain, no
 * database; the bundle carries the fields the projections read.
 */
function demoReview(): ProjectReview {
  const state = buildDemoState();
  const pinnedSnapshot = state.snapshots[state.snapshots.length - 1]!;
  const input = {
    project: state.project,
    calendar: state.calendar,
    wps: state.wps,
    baselineVersions: state.baselineVersions,
    activeBaselineSeq: state.activeBaselineSeq,
    ledger: state.ledger,
    mappingEvents: state.mappingEvents,
    pinnedSnapshot,
    resources: state.resources,
    period: currentPeriod(state),
    asOf: asOfDate(state),
    dispositions: [],
  };
  const bundle = {
    project: state.project,
    meta: { clientName: 'Demo Client' },
    input,
    wps: state.wps,
    rules: state.fixture.mappingRules.map((rule) => ({ ...rule, currentlyMapped: 0 })),
  };
  return { bundle, review: computeReview(input) } as unknown as ProjectReview;
}

const REVIEW = demoReview();

const READ_CASES: readonly {
  readonly binding: string;
  readonly call: () => Promise<{ ok: boolean; value?: unknown }>;
  readonly port: 'loadReview' | 'loadProjectBundle';
  readonly check: (value: unknown) => void;
}[] = [
  {
    binding: 'getProjectHeader',
    call: () => composition.getProjectHeader({ projectId: 'prj-ec2' }),
    port: 'loadProjectBundle',
    check: (value) => expect(value).toBe(REVIEW.bundle),
  },
  {
    binding: 'getProjectReview',
    call: () => composition.getProjectReview({ projectId: 'prj-ec2' }),
    port: 'loadReview',
    check: (value) => expect(value).toBe(REVIEW),
  },
  {
    binding: 'getClientView',
    call: () => composition.getClientView({ projectId: 'prj-ec2' }),
    port: 'loadReview',
    check: (value) =>
      expect(value).toMatchObject({
        clientName: 'Demo Client',
        projection: { projectName: REVIEW.bundle.project.name, evm: null },
      }),
  },
  {
    binding: 'getProjectMapping',
    call: () => composition.getProjectMapping({ projectId: 'prj-ec2' }),
    port: 'loadReview',
    check: (value) => {
      const mapping = value as { tickets: unknown[]; totalMh: bigint };
      expect(mapping.tickets).toHaveLength(MAPPING_TICKET_LIMIT);
      expect(mapping.totalMh).toBe(REVIEW.review.attribution.cumulative.totalMh);
    },
  },
];

describe.each(READ_CASES)('the $binding read binding', ({ call, port, check }) => {
  it(`reaches ${port} for the demo Tenant and returns its own use case's value`, async () => {
    spies.loadReview.mockResolvedValue(REVIEW);
    spies.loadProjectBundle.mockResolvedValue(REVIEW.bundle);

    const result = await call();
    expect(result.ok).toBe(true);
    check(result.value);

    expect(spies.getDb).toHaveBeenCalledWith(APP_URL);
    expect(spies[port]).toHaveBeenCalledTimes(1);
    expect(spies[port]).toHaveBeenCalledWith(spies.handle, DEMO_TENANT_ID, 'prj-ec2');
    const other = port === 'loadReview' ? 'loadProjectBundle' : 'loadReview';
    expect(spies[other], `${other} must not be called`).not.toHaveBeenCalled();
    expect(spies.inTenantTransaction, 'a read must not open a write transaction').not.toHaveBeenCalled();
    for (const recorder of RECORDERS) {
      expect(spies.repository[recorder], `a read must not reach ${recorder}`).not.toHaveBeenCalled();
    }
  });
});
