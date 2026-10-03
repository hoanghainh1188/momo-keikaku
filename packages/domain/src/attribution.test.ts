import { describe, expect, it } from 'vitest';
import { attribute, rateOnDate } from './attribution';
import { periodOf } from './calendar';
import { checkLedgerInvariant, ingestSnapshot } from './ledger';
import { applyRules, evaluateRules, mappingHead } from './mapping';
import { DEFAULT_THRESHOLDS, type LedgerEntry, type MappingEvent, type ProjectConfig, type Resource, type SnapshotRead, type TicketObservation, type WorkPackage } from './types';
import { hoursToMh } from './units';

const project: ProjectConfig = {
  id: 'p',
  name: 'p',
  clientName: 'c',
  contractType: '準委任',
  tzOffsetMinutes: 540,
  teireiWeekday: 4,
  defaultRateYenPerHour: 4000n,
  eacMethod: 'typical',
  thresholds: DEFAULT_THRESHOLDS,
};

const obs = (
  id: string,
  actualHours: number | null,
  over: Partial<TicketObservation> = {},
): TicketObservation => ({
  trackerIssueId: id,
  key: id,
  title: id,
  statusId: 'Open',
  resolved: false,
  estimateMh: null,
  actualMh: actualHours === null ? null : hoursToMh(actualHours),
  assigneeAccountId: 'acct-1',
  issueTypeId: 'Task',
  categoryIds: [],
  milestoneIds: [],
  createdAt: '2026-06-01T00:00:00.000Z',
  ...over,
});

const snap = (observedAt: string, tickets: TicketObservation[]): SnapshotRead => ({
  observedAt,
  hoursFieldPresent: tickets.some((t) => t.actualMh !== null),
  tickets,
});

const wp = (over: Partial<WorkPackage> & { id: string }): WorkPackage => ({
  wbsCode: over.id,
  name: over.id,
  parentId: null,
  isLeaf: true,
  isMilestone: false,
  isCatchAll: false,
  plannedMh: 0n,
  actualStart: null,
  actualFinish: null,
  assignedResourceIds: [],
  ...over,
});

describe('ingestSnapshot (FR-25, FR-42)', () => {
  it('records the first snapshot as Opening Balances and later changes as deltas', () => {
    const s1 = snap('2026-09-01T09:00:00.000Z', [obs('t1', 10), obs('t2', 4)]);
    const s2 = snap('2026-09-08T09:00:00.000Z', [obs('t1', 14), obs('t2', 4), obs('t3', 6)]);

    const r1 = ingestSnapshot({ prev: null, next: s1, activeBaselineVersionSeq: 1, seqFrom: 1 });
    expect(r1.entries.map((e) => [e.ticketId, e.kind, e.deltaMh])).toEqual([
      ['t1', 'opening_balance', hoursToMh(10)],
      ['t2', 'opening_balance', hoursToMh(4)],
    ]);

    const r2 = ingestSnapshot({
      prev: s1,
      next: s2,
      activeBaselineVersionSeq: 1,
      seqFrom: r1.nextSeq,
    });
    // t2 unchanged -> no entry. t3 first seen in a LATER snapshot -> a normal delta.
    expect(r2.entries.map((e) => [e.ticketId, e.kind, e.deltaMh])).toEqual([
      ['t1', 'delta', hoursToMh(4)],
      ['t3', 'delta', hoursToMh(6)],
    ]);
  });

  it('records negative deltas rather than discarding them', () => {
    const s1 = snap('2026-09-01T09:00:00.000Z', [obs('t1', 10)]);
    const s2 = snap('2026-09-08T09:00:00.000Z', [obs('t1', 7)]);
    const r1 = ingestSnapshot({ prev: null, next: s1, activeBaselineVersionSeq: 1, seqFrom: 1 });
    const r2 = ingestSnapshot({ prev: s1, next: s2, activeBaselineVersionSeq: 1, seqFrom: r1.nextSeq });
    expect(r2.entries[0]!.deltaMh).toBe(hoursToMh(-3));
    expect(
      checkLedgerInvariant([...r1.entries, ...r2.entries], s2).ok,
    ).toBe(true);
  });

  it('keeps the history of a Ticket that leaves scope and stops recording deltas', () => {
    const s1 = snap('2026-09-01T09:00:00.000Z', [obs('t1', 10), obs('t2', 5)]);
    const s2 = snap('2026-09-08T09:00:00.000Z', [obs('t1', 12)]);
    const r1 = ingestSnapshot({ prev: null, next: s1, activeBaselineVersionSeq: 1, seqFrom: 1 });
    const r2 = ingestSnapshot({ prev: s1, next: s2, activeBaselineVersionSeq: 1, seqFrom: r1.nextSeq });
    expect(r2.leftScope).toEqual([{ ticketId: 't2', key: 't2' }]);
    expect(r2.entries.some((e) => e.ticketId === 't2')).toBe(false);
  });

  it('detects the measurement basis from the data (AD-8)', () => {
    const noHours = snap('2026-09-01T09:00:00.000Z', [obs('t1', null), obs('t2', null)]);
    expect(
      ingestSnapshot({ prev: null, next: noHours, activeBaselineVersionSeq: 1, seqFrom: 1 })
        .measurementBasis,
    ).toBe('count');
  });

  it('stamps the active Baseline by SEQUENCE, so fixture replay is not mis-classified', () => {
    // adversarial review H3: the fixture's observedAt is weeks before the seeded
    // Baseline's created_at, which under a timestamp comparison would leave every
    // entry with no active Baseline and make 100% of the hours Unplanned.
    const s1 = snap('2026-08-01T09:00:00.000Z', [obs('t1', 10)]);
    const r = ingestSnapshot({ prev: null, next: s1, activeBaselineVersionSeq: 7, seqFrom: 1 });
    expect(r.entries[0]!.activeBaselineVersionSeq).toBe(7);
  });
});

describe('mapping rules (FR-22)', () => {
  const rules = [
    { id: 'r1', priority: 1, name: 'support', wpId: 'WP-CATCH', match: { field: 'category' as const, value: 'Support' } },
    { id: 'r2', priority: 2, name: 'bugs', wpId: 'WP-2', match: { field: 'issueType' as const, value: 'Bug' } },
  ];

  it('matches in strict priority order', () => {
    const t = obs('t1', 1, { categoryIds: ['Support'], issueTypeId: 'Bug' });
    expect(evaluateRules(rules, t)).toBe('WP-CATCH');
    expect(evaluateRules([rules[1]!, rules[0]!], t)).toBe('WP-CATCH'); // sorted by priority, not order
  });

  it('never overrides a manual Mapping', () => {
    const t = obs('t1', 1, { categoryIds: ['Support'] });
    const head = mappingHead([
      { seq: 1, ticketId: 't1', wpId: 'WP-9', source: 'manual', at: 'x', actor: 'pm' },
    ]);
    expect(applyRules(rules, [t], head, 2, 'x')).toEqual([]);
  });

  it('appends an event only when the rule result changes', () => {
    const t = obs('t1', 1, { categoryIds: ['Support'] });
    const first = applyRules(rules, [t], new Map(), 1, 'x');
    expect(first).toHaveLength(1);
    expect(applyRules(rules, [t], mappingHead(first), 2, 'x')).toEqual([]);
  });
});

describe('attribution (FR-20, FR-21, FR-24)', () => {
  const period = periodOf('2026-09-16T09:00:00.000Z', 540, 4); // 2026-09-11 .. 2026-09-17
  const resources: Resource[] = [
    {
      id: 'r1',
      name: 'R',
      departmentId: 'd',
      trackerAccountIds: ['acct-1'],
      rates: [{ seq: 1, effectiveFrom: '2026-01-01', yenPerHour: 5000n }],
    },
  ];
  const wps = [
    wp({ id: 'WP-B' }), // baselined
    wp({ id: 'WP-N' }), // non-baselined (created by the Plan disposition)
    wp({ id: 'WP-C', isCatchAll: true }),
  ];
  const baselineVersions = [
    {
      seq: 1,
      id: 'bl-1',
      reason: 'x',
      recordedAt: '2026-06-01T00:00:00.000Z',
      actor: 'user:pm',
      wps: [
        { wpId: 'WP-B', start: '2026-06-01', finish: '2026-12-01', baselineMh: hoursToMh(200), isMilestone: false },
        { wpId: 'WP-C', start: '2026-06-01', finish: '2026-12-01', baselineMh: hoursToMh(10), isMilestone: false },
      ],
    },
  ];

  const entry = (seq: number, ticketId: string, h: number, windowEnd: string, kind: LedgerEntry['kind'] = 'delta'): LedgerEntry => ({
    seq,
    ticketId,
    kind,
    deltaMh: hoursToMh(h),
    windowStart: null,
    windowEnd,
    assigneeAccountId: 'acct-1',
    activeBaselineVersionSeq: 1,
  });

  const IN = '2026-09-15T09:00:00.000Z'; // inside the period
  const OUT = '2026-08-15T09:00:00.000Z'; // before it

  const events: MappingEvent[] = [
    { seq: 1, ticketId: 'tb', wpId: 'WP-B', source: 'manual', at: 'x', actor: 'pm' },
    { seq: 2, ticketId: 'tn', wpId: 'WP-N', source: 'disposition', at: 'x', actor: 'pm' },
    { seq: 3, ticketId: 'tc', wpId: 'WP-C', source: 'rule', at: 'x', actor: 'sys' },
  ];

  const run = (entries: LedgerEntry[], ev = events) =>
    attribute({
      entries,
      head: mappingHead(ev),
      wps,
      baselineVersions,
      resources,
      project,
      period,
    });

  it('splits hours into the four mutually exclusive FR-20 buckets that sum to the total', () => {
    const r = run([
      entry(1, 'tb', 30, IN),
      entry(2, 'tn', 12, IN),
      entry(3, 'tc', 25, IN), // Catch-all: 10h within the LOE Baseline, 15h overflow
      entry(4, 'tu', 8, IN), // unmapped
    ]);
    const c = r.cumulative;
    expect(c.mappedBaselinedMh).toBe(hoursToMh(30));
    expect(c.mappedNonBaselinedMh).toBe(hoursToMh(12));
    expect(c.catchAllMh).toBe(hoursToMh(10));
    expect(c.catchAllOverflowMh).toBe(hoursToMh(15));
    expect(c.unmappedMh).toBe(hoursToMh(8));
    expect(
      c.mappedBaselinedMh + c.mappedNonBaselinedMh + c.catchAllMh + c.catchAllOverflowMh + c.unmappedMh,
    ).toBe(c.totalMh);
    // FR-20 Unplanned Work = unmapped + non-baselined + catch-all overflow
    expect(c.unplannedMh).toBe(hoursToMh(12 + 15 + 8));
  });

  it('excludes Opening Balances from period metrics but counts them in cumulative AC', () => {
    const r = run([
      entry(1, 'tb', 100, OUT, 'opening_balance'),
      entry(2, 'tb', 20, IN),
    ]);
    expect(r.openingBalanceMh).toBe(hoursToMh(100));
    expect(r.cumulative.totalMh).toBe(hoursToMh(120));
    expect(r.period.totalMh).toBe(hoursToMh(20));
  });

  it('moves hours out of Unplanned Work as soon as the Mapping changes (FR-21)', () => {
    const entries = [entry(1, 'tu', 8, IN)];
    expect(run(entries).cumulative.unplannedMh).toBe(hoursToMh(8));
    // the PM records a Map disposition
    const mapped = [
      ...events,
      { seq: 4, ticketId: 'tu', wpId: 'WP-B', source: 'disposition' as const, at: 'x', actor: 'pm' },
    ];
    const after = run(entries, mapped);
    expect(after.cumulative.unplannedMh).toBe(0n);
    expect(after.cumulative.mappedBaselinedMh).toBe(hoursToMh(8));
    expect(after.acByWp.get('WP-B')).toBe(hoursToMh(8));
  });

  it('keeps Plan-disposition hours Unplanned until a Re-baseline includes the WP', () => {
    const entries = [entry(1, 'tn', 12, IN)];
    expect(run(entries).cumulative.unplannedMh).toBe(hoursToMh(12));
  });

  it('keeps hours stamped before a Re-baseline Unplanned after the new version includes their WP (FR-30 / FR-16)', () => {
    // Entry stamped against seq 1 (or null) where WP-N is absent; Re-baseline seq 2 includes WP-N.
    // Judgment must use the stamp, not today's active seq — else Unplanned history is erased.
    const afterRebaseline = [
      ...baselineVersions,
      {
        seq: 2,
        id: 'bl-2',
        reason: 'Include Plan WP',
        recordedAt: '2026-09-20T00:00:00.000Z',
        actor: 'user:pm',
        wps: [
          ...baselineVersions[0]!.wps,
          {
            wpId: 'WP-N',
            start: '2026-06-01',
            finish: '2026-12-01',
            baselineMh: hoursToMh(50),
            isMilestone: false,
          },
        ],
      },
    ];
    const stampedAtSeq1: LedgerEntry[] = [entry(1, 'tn', 12, IN)]; // activeBaselineVersionSeq: 1
    const stampedNull: LedgerEntry[] = [
      { ...entry(1, 'tn', 12, IN), activeBaselineVersionSeq: null },
    ];
    for (const entries of [stampedAtSeq1, stampedNull]) {
      const r = attribute({
        entries,
        head: mappingHead(events),
        wps,
        baselineVersions: afterRebaseline,
        resources,
        project,
        period,
      });
      expect(r.cumulative.unplannedMh).toBe(hoursToMh(12));
      expect(r.cumulative.mappedNonBaselinedMh).toBe(hoursToMh(12));
      expect(r.cumulative.mappedBaselinedMh).toBe(0n);
    }
  });

  it('costs each entry at the Resource Rate in effect, and falls back to the Project default', () => {
    const r = run([entry(1, 'tb', 10, IN)]);
    expect(r.cumulative.totalJpy).toBe(10n * 5000n);
    const unattributed = attribute({
      entries: [{ ...entry(1, 'tb', 10, IN), assigneeAccountId: 'acct-unlinked' }],
      head: mappingHead(events),
      wps,
      baselineVersions,
      resources,
      project,
      period,
    });
    expect(unattributed.cumulative.totalJpy).toBe(10n * project.defaultRateYenPerHour);
  });

  it('falls back to the Project default when the linked Resource has an empty Rate history', () => {
    const emptyHistory: Resource[] = [{ ...resources[0]!, rates: [] }];
    const r = attribute({
      entries: [entry(1, 'tb', 10, IN)],
      head: mappingHead(events),
      wps,
      baselineVersions,
      resources: emptyHistory,
      project,
      period,
    });
    expect(r.cumulative.totalJpy).toBe(10n * project.defaultRateYenPerHour);
  });

  it('honours an optional rate_seq_max pin and leaves a retroactive head unused under the pin', () => {
    const withHistory: Resource[] = [
      {
        ...resources[0]!,
        rates: [
          { seq: 1, effectiveFrom: '2026-01-01', yenPerHour: 5000n },
          { seq: 2, effectiveFrom: '2026-01-01', yenPerHour: 9000n }, // retroactive head
        ],
      },
    ];
    const live = attribute({
      entries: [entry(1, 'tb', 1, IN)],
      head: mappingHead(events),
      wps,
      baselineVersions,
      resources: withHistory,
      project,
      period,
    });
    // Equal effectiveFrom: higher seq wins live (not insertion order / engine quirk).
    expect(live.cumulative.totalJpy).toBe(9000n);
    const pinned = attribute({
      entries: [entry(1, 'tb', 1, IN)],
      head: mappingHead(events),
      wps,
      baselineVersions,
      resources: withHistory,
      project,
      period,
      pins: { rateSeqMax: 1 },
    });
    expect(pinned.cumulative.totalJpy).toBe(5000n);
  });

  it('honours projectDefaultRateSeqMax against history, while live unpinned uses the column', () => {
    // Column head ≠ pinned history head under the ceiling — so the two paths cannot agree by accident.
    const column = 4000n;
    const underPin = 2500n;
    const laterHead = 6000n;
    const projectWithColumn: typeof project = { ...project, defaultRateYenPerHour: column };
    const history = [
      { seq: 1, effectiveFrom: '2026-01-01', yenPerHour: underPin },
      { seq: 2, effectiveFrom: '2026-01-01', yenPerHour: laterHead },
    ];
    const unattributed = [{ ...entry(1, 'tb', 1, IN), assigneeAccountId: 'acct-unlinked' }];
    const live = attribute({
      entries: unattributed,
      head: mappingHead(events),
      wps,
      baselineVersions,
      resources,
      project: projectWithColumn,
      period,
    });
    expect(live.cumulative.totalJpy).toBe(column);
    const pinned = attribute({
      entries: unattributed,
      head: mappingHead(events),
      wps,
      baselineVersions,
      resources,
      project: projectWithColumn,
      period,
      pins: { projectDefaultRateSeqMax: 1 },
      projectDefaultRates: history,
    });
    expect(pinned.cumulative.totalJpy).toBe(underPin);
  });
});

describe('rateOnDate (story 1.6 pins)', () => {
  it('picks the latest effective_from under an optional seq ceiling', () => {
    const rates = [
      { seq: 1, effectiveFrom: '2026-01-01', yenPerHour: 3000n },
      { seq: 2, effectiveFrom: '2026-06-01', yenPerHour: 4000n },
      { seq: 3, effectiveFrom: '2026-03-01', yenPerHour: 3500n },
    ];
    expect(rateOnDate(rates, '2026-07-01')).toBe(4000n);
    expect(rateOnDate(rates, '2026-07-01', 2)).toBe(4000n);
    expect(rateOnDate(rates, '2026-07-01', 1)).toBe(3000n);
    expect(rateOnDate(rates, '2026-02-01', 3)).toBe(3000n);
    expect(rateOnDate(rates, '2025-12-01')).toBeUndefined();
  });

  it('on equal effectiveFrom picks the higher seq', () => {
    // Lower seq listed last — without a seq tie-break the old comparator returned −1 on ties
    // and kept whichever the engine left first.
    const rates = [
      { seq: 2, effectiveFrom: '2026-01-01', yenPerHour: 9000n },
      { seq: 1, effectiveFrom: '2026-01-01', yenPerHour: 5000n },
    ];
    expect(rateOnDate(rates, '2026-06-01')).toBe(9000n);
    expect(rateOnDate([...rates].reverse(), '2026-06-01')).toBe(9000n);
  });
});
