import { describe, expect, it } from 'vitest';
import { ratio } from '@momo/domain';
import type { ProjectReadDeps, ProjectReview } from '../ports/project-read';
import { getClientView, getProjectMapping } from '.';
import { MAPPING_TICKET_LIMIT } from './get-project-mapping';
import type { RequestContext } from '../authz/request-context';

/** A signed-in caller in `tenantId` that reaches `prj-1` (story 1.5). */
function ctxOf(tenantId: string): RequestContext {
  return { tenantId, userId: 'test-reader', roles: ['pm'], projectIds: ['prj-1'], locale: 'en' };
}

/**
 * The two reads that PROJECT the Review for one page — the Client View and the Mapping surface
 * — against a fake port: no database, no environment.
 *
 * They exist so that no page computes from the domain (AD-1's web → domain/present edge): the
 * Client View page used to call `clientProjection` itself, the Mapping page `mappingHead` and a
 * `compareBigint` sort. What is pinned here is what moved: the Tenant comes from the context,
 * the projection is the default-visibility one, the Mapping rows arrive joined and ordered —
 * and the shared contract (`not_found`, `invalid_input`, anything else propagates). The
 * cross-tenant harness proves the same reads end to end against row-level security.
 */

const HANDLE = { marker: 'handle' };

const wp = (id: string, wbsCode: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  wbsCode,
  name,
  isLeaf: true,
  isMilestone: false,
  ...extra,
});

const ticket = (trackerIssueId: string, categoryIds: string[] = []) => ({
  trackerIssueId,
  key: `KEY-${trackerIssueId}`,
  title: `Title ${trackerIssueId}`,
  statusId: 'open',
  categoryIds,
});

/**
 * A Review carrying just the fields the two projections read. `t-3` has the most hours and is
 * mapped by a rule; `t-1` and `t-2` tie, so snapshot order must decide; `t-4` is mapped to a
 * Work Package the surface does not list (a parent), so its id stands in for a label; `t-5`
 * was never mapped.
 */
const REVIEW = {
  bundle: {
    project: { name: 'Project Name' },
    meta: { clientName: 'Client Name' },
    wps: [
      wp('wp-1', '1.1', 'Design'),
      wp('wp-2', '1.2', 'Build'),
      wp('wp-p', '1', 'Parent', { isLeaf: false }),
      wp('wp-m', '1.9', 'Go-live', { isMilestone: true }),
    ],
    rules: [
      { id: 'r-2', priority: 2, name: 'Second', wpId: 'wp-p', match: { field: 'category', value: 'c' }, currentlyMapped: 0 },
      { id: 'r-1', priority: 1, name: 'First', wpId: 'wp-2', match: { field: 'keyPrefix', value: 'K' }, currentlyMapped: 3 },
    ],
    input: {
      mappingEvents: [
        { seq: 1, ticketId: 't-1', wpId: 'wp-2', source: 'manual', at: '', actor: 'a' },
        { seq: 2, ticketId: 't-3', wpId: 'wp-1', source: 'rule', at: '', actor: 'a' },
        { seq: 3, ticketId: 't-1', wpId: null, source: 'manual', at: '', actor: 'a' },
        { seq: 4, ticketId: 't-4', wpId: 'wp-p', source: 'disposition', at: '', actor: 'a' },
      ],
      pinnedSnapshot: {
        tickets: [ticket('t-1'), ticket('t-2', ['c', 'd']), ticket('t-3'), ticket('t-4'), ticket('t-5')],
      },
    },
  },
  review: {
    snapshot: { observedAt: '2026-09-17T00:00:00Z' },
    health: {
      overall: 'amber',
      indicators: [{ key: 'effort_cost', colour: 'amber', driver: 'CPI 0.89', rule: 'rule' }],
    },
    unplanned: {
      sharePeriod: ratio(1n, 4n),
      period: { unplannedMh: 12_340n },
      components: [{ key: 'unmapped', label: 'Unmapped Work', mh: 1n, jpy: 0n, share: null }],
    },
    explainNotes: [{ note: 'A note.', ticketCount: 1, mh: 1n }],
    milestones: [],
    divergence: [
      {
        wbsCode: '1.1',
        name: 'Design',
        baselineStart: null,
        baselineFinish: null,
        currentStart: null,
        currentFinish: null,
        pctComplete: ratio(3n, 8n),
      },
      { wbsCode: '1.1.1', name: 'Too deep', pctComplete: ratio(1n, 1n) },
    ],
    evm: { spi: { kind: 'value', value: ratio(91n, 100n), unit: 'ratio' }, evMh: 1n },
    attribution: {
      cumulative: { totalMh: 99_000n },
      hoursByTicket: new Map([
        ['t-1', 5_000n],
        ['t-2', 5_000n],
        ['t-3', 9_000n],
        ['t-4', 1_000n],
      ]),
    },
    scopeLedger: [{ key: 'unmapped', label: 'Unmapped Work', mh: 1n, share: ratio(1n, 1n) }],
    coverage: { mappedTicketShare: ratio(2n, 5n), mappedHourShare: ratio(1n, 2n), unmappedTickets: 3 },
    openingBalanceMh: 7_000n,
  },
} as unknown as ProjectReview;

interface Call {
  readonly handle: unknown;
  readonly tenantId: string;
  readonly projectId: string;
}

/** A port whose `loadReview` records its calls and answers from `behave`. */
function fakeDeps(behave: (projectId: string) => ProjectReview | Error) {
  const calls: Call[] = [];
  const deps: ProjectReadDeps<typeof HANDLE> = {
    handle: HANDLE,
    projectRead: {
      loadProjectBundle: async () => {
        throw new Error('the projection reads load the Review, never the bare bundle');
      },
      loadReview: async (handle, tenantId, projectId) => {
        calls.push({ handle, tenantId, projectId });
        const outcome = behave(projectId);
        if (outcome instanceof Error) throw outcome;
        return outcome;
      },
    },
  };
  return { deps, calls };
}

describe('getClientView', () => {
  it('projects the Review with the default visibility, for the context\'s Tenant', async () => {
    const { deps, calls } = fakeDeps(() => REVIEW);
    const result = await getClientView(deps, ctxOf('ten-a'), { projectId: 'prj-1' });

    expect(calls).toEqual([{ handle: HANDLE, tenantId: 'ten-a', projectId: 'prj-1' }]);
    if (!result.ok) throw new Error(`answered ${result.error.code}`);
    const { clientName, projection } = result.value;
    expect(clientName).toBe('Client Name');
    expect(projection.projectName).toBe('Project Name');
    expect(projection.unplanned).toEqual({
      sharePeriod: '25.0%',
      hours: '12.3',
      statement: expect.any(String),
      notes: ['A note.'],
      // DEFAULT_VISIBILITY: the breakdown and the EVM detail stay hidden.
      breakdown: null,
    });
    expect(projection.evm).toBeNull();
    // WBS level 2 at most, and progress presented — never the exact Ratio.
    expect(projection.schedule).toEqual([
      expect.objectContaining({ wbsCode: '1.1', progress: { fraction: 0.375, label: '38' } }),
    ]);
  });
});

describe('getProjectMapping', () => {
  it('joins and orders the Mapping surface\'s rows, for the context\'s Tenant', async () => {
    const { deps, calls } = fakeDeps(() => REVIEW);
    const result = await getProjectMapping(deps, ctxOf('ten-a'), { projectId: 'prj-1' });

    expect(calls).toEqual([{ handle: HANDLE, tenantId: 'ten-a', projectId: 'prj-1' }]);
    if (!result.ok) throw new Error(`answered ${result.error.code}`);
    const m = result.value;

    // Leaf, non-milestone Work Packages only, labelled `${wbsCode} ${name}`.
    expect(m.leafWps).toEqual([
      { id: 'wp-1', wbsCode: '1.1', name: 'Design', label: '1.1 Design' },
      { id: 'wp-2', wbsCode: '1.2', name: 'Build', label: '1.2 Build' },
    ]);
    // In the order the rules were read; a target the surface does not list keeps its id.
    expect(m.rules.map((r) => [r.id, r.wpLabel, r.currentlyMapped])).toEqual([
      ['r-2', 'wp-p', 0],
      ['r-1', '1.2 Build', 3],
    ]);
    // Most hours first, ties in snapshot order; the CURRENT Mapping (t-1 was unmapped at seq 3).
    expect(m.tickets.map((t) => [t.trackerIssueId, t.mh, t.wpId, t.wpLabel, t.source])).toEqual([
      ['t-3', 9_000n, 'wp-1', '1.1 Design', 'rule'],
      ['t-1', 5_000n, null, null, 'manual'],
      ['t-2', 5_000n, null, null, 'none'],
      ['t-4', 1_000n, 'wp-p', 'wp-p', 'disposition'],
      ['t-5', 0n, null, null, 'none'],
    ]);
    expect(m.tickets[1]).toMatchObject({ key: 'KEY-t-1', title: 'Title t-1', statusId: 'open' });
    expect(m.tickets[2]?.categoryIds).toEqual(['c', 'd']);
    // The Coverage figures pass through untouched.
    expect(m.totalMh).toBe(99_000n);
    expect(m.openingBalanceMh).toBe(7_000n);
    expect(m.coverage).toBe(REVIEW.review.coverage);
    expect(m.scopeLedger).toBe(REVIEW.review.scopeLedger);
  });

  it(`lists at most ${MAPPING_TICKET_LIMIT} Tickets, the ones carrying the most hours`, async () => {
    const many = Array.from({ length: MAPPING_TICKET_LIMIT + 5 }, (_, i) => ticket(`n-${i}`));
    const hoursByTicket = new Map(many.map((t, i) => [t.trackerIssueId, BigInt(i)]));
    const review = {
      bundle: { ...REVIEW.bundle, input: { ...REVIEW.bundle.input, pinnedSnapshot: { tickets: many } } },
      review: { ...REVIEW.review, attribution: { ...REVIEW.review.attribution, hoursByTicket } },
    } as unknown as ProjectReview;
    const { deps } = fakeDeps(() => review);
    const result = await getProjectMapping(deps, ctxOf('ten-a'), { projectId: 'prj-1' });

    if (!result.ok) throw new Error(`answered ${result.error.code}`);
    expect(result.value.tickets).toHaveLength(MAPPING_TICKET_LIMIT);
    expect(result.value.tickets[0]?.trackerIssueId).toBe(`n-${MAPPING_TICKET_LIMIT + 4}`);
    expect(result.value.tickets.at(-1)?.trackerIssueId).toBe('n-5');
  });
});

/** packages/db's wording for an invisible Project, verbatim (repo.ts). */
const notFoundError = (projectId: string) =>
  new Error(`project ${projectId} not found — run \`pnpm demo\` to seed`);

describe.each([
  { name: 'getClientView', run: getClientView },
  { name: 'getProjectMapping', run: getProjectMapping },
] as const)('$name, the shared read contract', ({ run }) => {
  it('answers not_found — never a throw — for a Project the Tenant cannot see', async () => {
    const { deps, calls } = fakeDeps((projectId) => notFoundError(projectId));
    const ctx = { ...ctxOf('ten-b'), projectIds: ['prj-of-a'] };
    expect(await run(deps, ctx, { projectId: 'prj-of-a' })).toEqual({
      ok: false,
      error: { code: 'not_found', messageKey: 'errors.not_found' },
    });
    expect(calls).toEqual([{ handle: HANDLE, tenantId: 'ten-b', projectId: 'prj-of-a' }]);
  });

  it('answers not_found for a viewer, without calling the port', async () => {
    const { deps, calls } = fakeDeps(() => REVIEW);
    const viewer = { ...ctxOf('ten-a'), roles: ['client_viewer'] as const };
    expect(await run(deps, viewer, { projectId: 'prj-1' })).toMatchObject({ error: { code: 'not_found' } });
    expect(calls).toEqual([]);
  });

  it('rethrows any other failure rather than answering not_found for it', async () => {
    const outage = new Error('connect ECONNREFUSED 127.0.0.1:55433');
    const { deps } = fakeDeps(() => outage);
    await expect(run(deps, ctxOf('ten-a'), { projectId: 'prj-1' })).rejects.toBe(outage);
  });

  it.each([
    ['empty', { projectId: '' }],
    ['absent', {}],
  ])('answers invalid_input for an %s projectId, without calling the port', async (_label, input) => {
    const { deps, calls } = fakeDeps(() => REVIEW);
    const result = await run(deps, ctxOf('ten-a'), input as { projectId: string });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_input');
    expect(calls).toEqual([]);
  });
});
