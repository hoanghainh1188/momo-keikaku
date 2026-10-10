import { describe, expect, it } from 'vitest';
import { ratio } from '@momo/domain';
import type { ProjectReadDeps, ProjectReview } from '../ports/project-read';
import { getProjectMapping } from '.';
import { MAPPING_TICKET_LIMIT, ticketsInBucket, type MappingTicketRow } from './get-project-mapping';
import type { RequestContext } from '../authz/request-context';

/** A signed-in caller in `tenantId` that reaches `prj-1` (story 1.5). */
function ctxOf(tenantId: string): RequestContext {
  return { tenantId, userId: 'test-reader', roles: ['pm'], projectIds: ['prj-1'], locale: 'en' };
}

/**
 * The read that PROJECTS the Review for one page — the Mapping surface — against a fake port:
 * no database, no environment.
 *
 * It exists so that no page computes from the domain (AD-1's web → domain/present edge): the
 * Mapping page used to call `mappingHead` and a `compareBigint` sort. What is pinned here is
 * what moved: the Tenant comes from the context, the Mapping rows arrive joined and ordered —
 * and the shared contract (`not_found`, `invalid_input`, anything else propagates). The
 * cross-tenant harness proves the same read end to end against row-level security. (The Client
 * View's projection read was removed with the Client View, story 2.2.)
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
  attributes: categoryIds.map((id) => ({ kind: 'category' as const, id })),
});

/**
 * A Review carrying just the fields the projection reads. `t-3` has the most hours and is
 * mapped by a rule; `t-1` and `t-2` tie, so snapshot order must decide; `t-4` is mapped to a
 * Work Package the surface does not list (a parent), so its id stands in for a label; `t-5`
 * was never mapped.
 */
const PER_CONNECTOR = {
  connectors: [],
  projectTotal: {
    connectorId: 'project-total',
    label: 'Project total',
    measurementBasis: 'hours',
    ticketShare: {
      counts: { mapped: 0, catchAll: 0, unmapped: 0, total: 0 },
      mapped: ratio(0n, 1n),
      catchAll: ratio(0n, 1n),
      unmapped: ratio(0n, 1n),
      segments: [],
    },
    hourShare: { kind: 'unavailable', reasonCode: 'tracker_provides_no_hours' },
  },
  sm5: { kind: 'unavailable', reasonCode: 'project_younger_than_14_days' },
  overflowMhByTicket: new Map<string, bigint>(),
};

const REVIEW = {
  bundle: {
    wps: [
      wp('wp-1', '1.1', 'Design', { isCatchAll: false }),
      wp('wp-2', '1.2', 'Build', { isCatchAll: false }),
      wp('wp-p', '1', 'Parent', { isLeaf: false, isCatchAll: false }),
      wp('wp-m', '1.9', 'Go-live', { isMilestone: true, isCatchAll: false }),
    ],
    rules: [
      { id: 'r-2', priority: 2, name: 'Second', wpId: 'wp-p', match: { field: 'category', value: 'c' }, currentlyMapped: 0, parentKey: null },
      { id: 'r-1', priority: 1, name: 'First', wpId: 'wp-2', match: { field: 'keyPattern', value: 'K*' }, currentlyMapped: 3, parentKey: null },
      // Story 5.10: a parent OUTSIDE the pinned snapshot still shows (and pre-fills) its key.
      { id: 'r-3', priority: 3, name: 'Children', wpId: 'wp-1', match: { field: 'parent', value: 'iss-700' }, currentlyMapped: 0, parentKey: 'EC2-700' },
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
      activeBaselineSeq: null,
      baselineVersions: [],
      ownerConnectorByTicket: new Map([
        ['t-1', 'con-a'],
        ['t-2', 'con-a'],
        ['t-3', 'con-a'],
        ['t-4', 'con-a'],
        ['t-5', 'con-a'],
      ]),
      connectorsForCoverage: [{ id: 'con-a', label: 'Space A', measurementBasis: 'hours' }],
    },
  },
  review: {
    attribution: {
      cumulative: { totalMh: 99_000n, catchAllOverflowMh: 0n },
      hoursByTicket: new Map([
        ['t-1', 5_000n],
        ['t-2', 5_000n],
        ['t-3', 9_000n],
        ['t-4', 1_000n],
      ]),
      overflowMhByTicket: new Map<string, bigint>(),
    },
    scopeLedger: [{ key: 'unmapped', label: 'Unmapped Work', mh: 1n, share: ratio(1n, 1n) }],
    coverage: {
      mappedTicketShare: ratio(2n, 5n),
      mappedHourShare: {
        kind: 'value' as const,
        value: ratio(1n, 2n),
        unit: 'ratio' as const,
        coverage: null,
      },
      unmappedTickets: 3,
      perConnector: PER_CONNECTOR,
    },
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
      loadRuleEvaluation: async () => {
        throw new Error('the projection reads never load a rule evaluation');
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
      ['r-3', '1.1 Design', 0],
    ]);
    // A parent rule reads as its parent's key; every other rule as its stored value.
    expect(m.rules.map((r) => [r.id, r.match.value, r.displayValue])).toEqual([
      ['r-2', 'c', 'c'],
      ['r-1', 'K*', 'K*'],
      ['r-3', 'iss-700', 'EC2-700'],
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
    expect(m.coverageByConnector).toBe(REVIEW.review.coverage.perConnector);
    expect(m.scopeLedger).toBe(REVIEW.review.scopeLedger);
    expect(m.allTickets).toHaveLength(5);
    expect(m.tickets[0]).toMatchObject({
      ownerConnectorId: 'con-a',
      ticketShareBucket: 'mapped',
      hourShareBucket: 'mapped-non-baselined',
    });
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
    expect(result.value.allTickets).toHaveLength(MAPPING_TICKET_LIMIT + 5);
  });

  it('pages every Ticket in a segment bucket, not only the top-60 list', () => {
    const rows = Array.from({ length: 55 }, (_, i) => ({
      trackerIssueId: `u-${i}`,
      key: `K-${i}`,
      title: `T-${i}`,
      categoryIds: [],
      statusId: 'open',
      mh: 1n,
      wpId: null,
      wpLabel: null,
      source: 'none',
      ownerConnectorId: 'con-a',
      ticketShareBucket: 'unmapped' as const,
      hourShareBucket: 'unmapped' as const,
      inCatchAllOverflow: false,
    })) satisfies MappingTicketRow[];
    const page0 = ticketsInBucket(rows, {
      connectorId: 'con-a',
      basis: 'tickets',
      segmentKey: 'unmapped',
      page: 0,
    });
    expect(page0.total).toBe(55);
    expect(page0.tickets).toHaveLength(50);
    const page1 = ticketsInBucket(rows, {
      connectorId: 'con-a',
      basis: 'tickets',
      segmentKey: 'unmapped',
      page: 1,
    });
    expect(page1.tickets).toHaveLength(5);
  });

  it('sets inCatchAllOverflow only for Tickets with coverage overflowMhByTicket > 0', async () => {
    const review = {
      bundle: {
        ...REVIEW.bundle,
        wps: [
          ...REVIEW.bundle.wps,
          wp('wp-ca', '1.8', 'Misc', { isCatchAll: true }),
        ],
        input: {
          ...REVIEW.bundle.input,
          mappingEvents: [
            ...REVIEW.bundle.input.mappingEvents,
            { seq: 5, ticketId: 't-3', wpId: 'wp-ca', source: 'manual', at: '', actor: 'a' },
            { seq: 6, ticketId: 't-4', wpId: 'wp-ca', source: 'manual', at: '', actor: 'a' },
          ],
          wpFlagEvents: [{ seq: 1, wpId: 'wp-ca', isCatchAll: true, actor: 'a', at: '' }],
          wpFlagSeqMax: 1,
        },
      },
      review: {
        ...REVIEW.review,
        // Review attribution may still disagree (OB path); Mapping filter uses Coverage pass.
        attribution: {
          ...REVIEW.review.attribution,
          cumulative: { totalMh: 99_000n, catchAllOverflowMh: 50_800n },
          overflowMhByTicket: new Map<string, bigint>([
            ['t-3', 50_800n],
            ['t-4', 0n],
          ]),
        },
        coverage: {
          ...REVIEW.review.coverage,
          perConnector: {
            ...PER_CONNECTOR,
            // Only t-3 has positive overflow on the Coverage (ledgerNoOb) pass.
            overflowMhByTicket: new Map<string, bigint>([
              ['t-3', 3_000n],
              ['t-4', 0n],
            ]),
          },
        },
      },
    } as unknown as ProjectReview;
    const { deps } = fakeDeps(() => review);
    const result = await getProjectMapping(deps, ctxOf('ten-a'), { projectId: 'prj-1' });
    if (!result.ok) throw new Error(`answered ${result.error.code}`);
    const byId = new Map(result.value.allTickets.map((t) => [t.trackerIssueId, t]));
    expect(byId.get('t-3')?.inCatchAllOverflow).toBe(true);
    expect(byId.get('t-4')?.inCatchAllOverflow).toBe(false);
    expect(byId.get('t-1')?.inCatchAllOverflow).toBe(false);
  });

  it('omits left-scope Tickets from allTickets', async () => {
    const review = {
      bundle: {
        ...REVIEW.bundle,
        input: {
          ...REVIEW.bundle.input,
          leftScopeTicketIds: new Set(['t-5']),
        },
      },
      review: REVIEW.review,
    } as unknown as ProjectReview;
    const { deps } = fakeDeps(() => review);
    const result = await getProjectMapping(deps, ctxOf('ten-a'), { projectId: 'prj-1' });
    if (!result.ok) throw new Error(`answered ${result.error.code}`);
    expect(result.value.allTickets.map((t) => t.trackerIssueId)).not.toContain('t-5');
    expect(result.value.allTickets).toHaveLength(4);
  });

  it('does not invent an owner Connector when the ownership map misses a Ticket', async () => {
    const review = {
      bundle: {
        ...REVIEW.bundle,
        input: {
          ...REVIEW.bundle.input,
          ownerConnectorByTicket: new Map([['t-3', 'con-a']]),
        },
      },
      review: REVIEW.review,
    } as unknown as ProjectReview;
    const { deps } = fakeDeps(() => review);
    const result = await getProjectMapping(deps, ctxOf('ten-a'), { projectId: 'prj-1' });
    if (!result.ok) throw new Error(`answered ${result.error.code}`);
    const orphan = result.value.allTickets.find((t) => t.trackerIssueId === 't-1');
    expect(orphan?.ownerConnectorId).toBe('');
    const owned = result.value.allTickets.find((t) => t.trackerIssueId === 't-3');
    expect(owned?.ownerConnectorId).toBe('con-a');
  });
});

/** packages/db's wording for an invisible Project, verbatim (repo.ts). */
const notFoundError = (projectId: string) =>
  new Error(`project ${projectId} not found — run \`pnpm seed\` to seed`);

describe.each([
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
