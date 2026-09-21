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
  loadProjectBundle: vi.fn(),
  loadReview: vi.fn(),
}));

vi.mock('@momo/db', async (importOriginal) => ({
  // DEMO_TENANT_ID stays real; every function that would reach a database is a spy.
  ...(await importOriginal<typeof import('@momo/db')>()),
  getDb: spies.getDb,
  recordMapDisposition: spies.recordMapDisposition,
  recordPlanDisposition: spies.recordPlanDisposition,
  recordExplainDisposition: spies.recordExplainDisposition,
  recordChangeRequestCandidates: spies.recordChangeRequestCandidates,
  recordManualMapping: spies.recordManualMapping,
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
    for (const recorder of RECORDERS) {
      expect(spies[recorder], `a read must not reach ${recorder}`).not.toHaveBeenCalled();
    }
  });
});
