import { describe, expect, it } from 'vitest';
import {
  attribute,
  departmentEffortRollup,
  periodUnplannedTicketCount,
  rateOnDate,
  suggestTrackerAccountLinks,
  trackerAccountIdsFromLinkHeads,
} from './attribution';
import { periodOf } from './calendar';
import {
  AdapterKindMismatchError,
  advanceLeftScopeState,
  checkLedgerInvariant,
  ingestSnapshot,
  partitionOwnedTickets,
} from './ledger';
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
  estimateMh: null,
  actualMh: actualHours === null ? null : hoursToMh(actualHours),
  assigneeAccountId: 'acct-1',
  createdAt: '2026-06-01T00:00:00.000Z',
  parentIssueId: null,
  issueTypeId: 'Task',
  trackerProjectId: null,
  attributes: [],
  ...over,
});

const snap = (observedAt: string, tickets: TicketObservation[]): SnapshotRead => ({
  observedAt,
  hoursFieldPresent: tickets.some((t) => t.actualMh !== null),
  tickets,
  adapterKind: 'fixture',
  complete: true,
  accounts: [],
  rateLimit: null,
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

    const r1 = ingestSnapshot({ prev: null, next: s1, activeBaselineVersionSeq: 1, seqFrom: 1,
      approvalRecordedAt: '2026-09-01T00:00:00.000Z'});
    expect(r1.entries.map((e) => [e.ticketId, e.kind, e.deltaMh])).toEqual([
      ['t1', 'opening_balance', hoursToMh(10)],
      ['t2', 'opening_balance', hoursToMh(4)],
    ]);

    const r2 = ingestSnapshot({
      prev: s1,
      next: s2,
      activeBaselineVersionSeq: 1,
      seqFrom: r1.nextSeq,
      approvalRecordedAt: '2026-09-01T00:00:00.000Z',});
    // t2 unchanged -> no entry. t3 first seen in a LATER snapshot -> a normal delta.
    expect(r2.entries.map((e) => [e.ticketId, e.kind, e.deltaMh])).toEqual([
      ['t1', 'delta', hoursToMh(4)],
      ['t3', 'delta', hoursToMh(6)],
    ]);
  });

  it('records negative deltas rather than discarding them', () => {
    const s1 = snap('2026-09-01T09:00:00.000Z', [obs('t1', 10)]);
    const s2 = snap('2026-09-08T09:00:00.000Z', [obs('t1', 7)]);
    const r1 = ingestSnapshot({ prev: null, next: s1, activeBaselineVersionSeq: 1, seqFrom: 1,
      approvalRecordedAt: '2026-09-01T00:00:00.000Z'});
    const r2 = ingestSnapshot({ prev: s1, next: s2, activeBaselineVersionSeq: 1, seqFrom: r1.nextSeq,
      approvalRecordedAt: '2026-09-01T00:00:00.000Z'});
    expect(r2.entries[0]!.deltaMh).toBe(hoursToMh(-3));
    expect(
      checkLedgerInvariant([...r1.entries, ...r2.entries], s2).ok,
    ).toBe(true);
  });

  it('keeps the history of a Ticket that leaves scope and stops recording deltas', () => {
    const s1 = snap('2026-09-01T09:00:00.000Z', [obs('t1', 10), obs('t2', 5)]);
    const s2 = snap('2026-09-08T09:00:00.000Z', [obs('t1', 12)]);
    const r1 = ingestSnapshot({ prev: null, next: s1, activeBaselineVersionSeq: 1, seqFrom: 1,
      approvalRecordedAt: '2026-09-01T00:00:00.000Z'});
    const r2 = ingestSnapshot({ prev: s1, next: s2, activeBaselineVersionSeq: 1, seqFrom: r1.nextSeq,
      approvalRecordedAt: '2026-09-01T00:00:00.000Z'});
    expect(r2.leftScope).toEqual([{ ticketId: 't2', key: 't2' }]);
    expect(r2.entries.some((e) => e.ticketId === 't2')).toBe(false);
  });

  it('detects the measurement basis from the data (AD-8)', () => {
    const noHours = snap('2026-09-01T09:00:00.000Z', [obs('t1', null), obs('t2', null)]);
    expect(
      ingestSnapshot({ prev: null, next: noHours, activeBaselineVersionSeq: 1, seqFrom: 1,
      approvalRecordedAt: '2026-09-01T00:00:00.000Z'})
        .measurementBasis,
    ).toBe('count');
  });

  it('stamps the active Baseline by SEQUENCE, so fixture replay is not mis-classified', () => {
    // adversarial review H3: the fixture's observedAt is weeks before the seeded
    // Baseline's created_at, which under a timestamp comparison would leave every
    // entry with no active Baseline and make 100% of the hours Unplanned.
    const s1 = snap('2026-08-01T09:00:00.000Z', [obs('t1', 10)]);
    const r = ingestSnapshot({ prev: null, next: s1, activeBaselineVersionSeq: 7, seqFrom: 1,
      approvalRecordedAt: '2026-09-01T00:00:00.000Z'});
    expect(r.entries[0]!.activeBaselineVersionSeq).toBe(7);
  });

  it('refuses an adapterKind mismatch with an operator-alert error (AD-6)', () => {
    const s1 = snap('2026-09-01T09:00:00.000Z', [obs('t1', 10)]);
    const s2 = {
      ...snap('2026-09-08T09:00:00.000Z', [obs('t1', 12)]),
      adapterKind: 'backlog' as const,
    };
    expect(() =>
      ingestSnapshot({ prev: s1, next: s2, activeBaselineVersionSeq: 1, seqFrom: 1,
      approvalRecordedAt: '2026-09-01T00:00:00.000Z'}),
    ).toThrow(AdapterKindMismatchError);
    try {
      ingestSnapshot({ prev: s1, next: s2, activeBaselineVersionSeq: 1, seqFrom: 1,
      approvalRecordedAt: '2026-09-01T00:00:00.000Z'});
    } catch (e) {
      expect(e).toMatchObject({
        kind: 'operator-alert',
        code: 'adapter_kind_mismatch',
        previousKind: 'fixture',
        nextKind: 'backlog',
      });
    }
  });

  it('does not refuse when prev omits adapterKind (older in-memory shapes)', () => {
    const s1 = { ...snap('2026-09-01T09:00:00.000Z', [obs('t1', 10)]) };
    delete (s1 as { adapterKind?: string }).adapterKind;
    const s2 = snap('2026-09-08T09:00:00.000Z', [obs('t1', 12)]);
    expect(() =>
      ingestSnapshot({ prev: s1, next: s2, activeBaselineVersionSeq: 1, seqFrom: 1,
      approvalRecordedAt: '2026-09-01T00:00:00.000Z'}),
    ).not.toThrow();
  });

  it('produces no entry for null hours and does not false-zero on value→null (AR-15)', () => {
    const s1 = snap('2026-09-01T09:00:00.000Z', [obs('t1', 10), obs('t2', null)]);
    const s2 = snap('2026-09-08T09:00:00.000Z', [obs('t1', null), obs('t2', null)]);
    const r1 = ingestSnapshot({
      prev: null,
      next: s1,
      activeBaselineVersionSeq: 1,
      seqFrom: 1,
      approvalRecordedAt: '2026-09-01T00:00:00.000Z',
    });
    expect(r1.entries.map((e) => e.ticketId)).toEqual(['t1']);
    expect(r1.hoursCleared).toEqual([]);

    const r2 = ingestSnapshot({
      prev: s1,
      next: s2,
      activeBaselineVersionSeq: 1,
      seqFrom: r1.nextSeq,
      approvalRecordedAt: '2026-09-01T00:00:00.000Z',
    });
    expect(r2.entries).toEqual([]);
    expect(r2.hoursCleared).toEqual([{ ticketId: 't1', key: 't1' }]);
    // Cleared Ticket keeps prior ledger history; invariant skips null observed.
    expect(checkLedgerInvariant([...r1.entries, ...r2.entries], s2).ok).toBe(true);
  });

  it('records null→numeric as a delta of the full amount when prior Σ is empty', () => {
    const s1 = snap('2026-09-01T09:00:00.000Z', [obs('t1', null)]);
    const s2 = snap('2026-09-08T09:00:00.000Z', [obs('t1', 6)]);
    const r1 = ingestSnapshot({
      prev: null,
      next: s1,
      activeBaselineVersionSeq: 1,
      seqFrom: 1,
      approvalRecordedAt: '2026-09-01T00:00:00.000Z',
    });
    expect(r1.entries).toEqual([]);
    const r2 = ingestSnapshot({
      prev: s1,
      next: s2,
      activeBaselineVersionSeq: 1,
      seqFrom: r1.nextSeq,
      approvalRecordedAt: '2026-09-01T00:00:00.000Z',
    });
    expect(r2.entries.map((e) => [e.ticketId, e.kind, e.deltaMh])).toEqual([
      ['t1', 'delta', hoursToMh(6)],
    ]);
    expect(checkLedgerInvariant([...r1.entries, ...r2.entries], s2).ok).toBe(true);
  });

  it('adjusts null→numeric against prior Σ after hours_cleared so invariant holds', () => {
    const s1 = snap('2026-09-01T09:00:00.000Z', [obs('t1', 10)]);
    const s2 = snap('2026-09-08T09:00:00.000Z', [obs('t1', null)]);
    const s3 = snap('2026-09-15T09:00:00.000Z', [obs('t1', 6)]);
    const r1 = ingestSnapshot({
      prev: null,
      next: s1,
      activeBaselineVersionSeq: 1,
      seqFrom: 1,
      approvalRecordedAt: '2026-09-01T00:00:00.000Z',
    });
    const r2 = ingestSnapshot({
      prev: s1,
      next: s2,
      activeBaselineVersionSeq: 1,
      seqFrom: r1.nextSeq,
      approvalRecordedAt: '2026-09-01T00:00:00.000Z',
    });
    expect(r2.hoursCleared).toEqual([{ ticketId: 't1', key: 't1' }]);
    const prior = new Map([['t1', hoursToMh(10)]]);
    const r3 = ingestSnapshot({
      prev: s2,
      next: s3,
      activeBaselineVersionSeq: 1,
      seqFrom: r2.nextSeq,
      approvalRecordedAt: '2026-09-01T00:00:00.000Z',
      priorLedgerMhByTicket: prior,
    });
    expect(r3.entries.map((e) => [e.ticketId, e.deltaMh])).toEqual([['t1', hoursToMh(-4)]]);
    expect(checkLedgerInvariant([...r1.entries, ...r2.entries, ...r3.entries], s3).ok).toBe(true);
  });

  it('books mid-flight Opening Balance after scope change when createdAt ≤ prev.observedAt (story 5.6)', () => {
    const s1 = snap('2026-09-01T09:00:00.000Z', [obs('t1', 10)]);
    const s2 = snap('2026-09-08T09:00:00.000Z', [
      obs('t1', 10),
      obs('t-old', 40, { createdAt: '2026-06-01T00:00:00.000Z' }),
      obs('t-new', 6, { createdAt: '2026-09-07T12:00:00.000Z' }),
    ]);
    const r1 = ingestSnapshot({
      prev: null,
      next: s1,
      activeBaselineVersionSeq: 1,
      seqFrom: 1,
      approvalRecordedAt: '2026-09-01T00:00:00.000Z',
    });
    const r2 = ingestSnapshot({
      prev: s1,
      next: s2,
      activeBaselineVersionSeq: 1,
      seqFrom: r1.nextSeq,
      approvalRecordedAt: '2026-09-01T00:00:00.000Z',
      scopeChangedSincePrev: true,
    });
    expect(r2.entries.map((e) => [e.ticketId, e.kind, e.deltaMh])).toEqual([
      ['t-old', 'opening_balance', hoursToMh(40)],
      ['t-new', 'delta', hoursToMh(6)],
    ]);
    expect(checkLedgerInvariant([...r1.entries, ...r2.entries], s2).ok).toBe(true);
  });

  it('does not Opening-Balance a first sighting without a recorded scope change', () => {
    const s1 = snap('2026-09-01T09:00:00.000Z', [obs('t1', 10)]);
    const s2 = snap('2026-09-08T09:00:00.000Z', [
      obs('t1', 10),
      obs('t-old', 40, { createdAt: '2026-06-01T00:00:00.000Z' }),
    ]);
    const r1 = ingestSnapshot({
      prev: null,
      next: s1,
      activeBaselineVersionSeq: 1,
      seqFrom: 1,
      approvalRecordedAt: '2026-09-01T00:00:00.000Z',
    });
    const r2 = ingestSnapshot({
      prev: s1,
      next: s2,
      activeBaselineVersionSeq: 1,
      seqFrom: r1.nextSeq,
      approvalRecordedAt: '2026-09-01T00:00:00.000Z',
      scopeChangedSincePrev: false,
    });
    expect(r2.entries.map((e) => [e.ticketId, e.kind, e.deltaMh])).toEqual([
      ['t-old', 'delta', hoursToMh(40)],
    ]);
  });

  it('advances durable left_scope only after two consecutive complete absences', () => {
    expect(advanceLeftScopeState({ leftScope: false, absentCompleteStreak: 0 }, true)).toEqual({
      leftScope: false,
      absentCompleteStreak: 0,
    });
    expect(advanceLeftScopeState({ leftScope: false, absentCompleteStreak: 0 }, false)).toEqual({
      leftScope: false,
      absentCompleteStreak: 1,
    });
    expect(advanceLeftScopeState({ leftScope: false, absentCompleteStreak: 1 }, false)).toEqual({
      leftScope: true,
      absentCompleteStreak: 2,
    });
    expect(advanceLeftScopeState({ leftScope: true, absentCompleteStreak: 2 }, false)).toEqual({
      leftScope: true,
      absentCompleteStreak: 2,
    });
    expect(advanceLeftScopeState({ leftScope: true, absentCompleteStreak: 2 }, true)).toEqual({
      leftScope: false,
      absentCompleteStreak: 0,
    });
  });

  it('keeps Ticket identity on trackerIssueId when the display key changes', () => {
    const s1 = snap('2026-09-01T09:00:00.000Z', [obs('id-1', 10, { key: 'OLD-1' })]);
    const s2 = snap('2026-09-08T09:00:00.000Z', [obs('id-1', 14, { key: 'NEW-1' })]);
    const approval = '2026-09-01T00:00:00.000Z';
    const r1 = ingestSnapshot({
      prev: null,
      next: s1,
      activeBaselineVersionSeq: 1,
      seqFrom: 1,
      approvalRecordedAt: approval,
    });
    const r2 = ingestSnapshot({
      prev: s1,
      next: s2,
      activeBaselineVersionSeq: 1,
      seqFrom: r1.nextSeq,
      approvalRecordedAt: approval,
    });
    expect(r1.entries.map((e) => e.ticketId)).toEqual(['id-1']);
    expect(r2.entries.map((e) => [e.ticketId, e.kind, e.deltaMh])).toEqual([
      ['id-1', 'delta', hoursToMh(4)],
    ]);
    expect(checkLedgerInvariant([...r1.entries, ...r2.entries], s2).ok).toBe(true);
  });

  it('partitions overlap claims so non-owner Tickets never enter the owned ledger set', () => {
    const tickets = [obs('owned', 1), obs('claimed', 2), obs('fresh', 3)];
    const owners = new Map([
      ['owned', 'con-a'],
      ['claimed', 'con-a'],
    ]);
    const { owned, overlaps } = partitionOwnedTickets(tickets, owners, 'con-b');
    expect(owned.map((t) => t.trackerIssueId)).toEqual(['fresh']);
    expect(overlaps.map((o) => [o.ticket.trackerIssueId, o.ownerConnectorId])).toEqual([
      ['owned', 'con-a'],
      ['claimed', 'con-a'],
    ]);
  });

  it('returns after leave as a delta from prior Σ, never OB (story 5.6 leave-and-return)', () => {
    const s1 = snap('2026-09-01T09:00:00.000Z', [obs('t1', 10), obs('t2', 20)]);
    const s2 = snap('2026-09-08T09:00:00.000Z', [obs('t1', 12)]);
    const s3 = snap('2026-09-15T09:00:00.000Z', [obs('t1', 12)]);
    const s4 = snap('2026-09-22T09:00:00.000Z', [obs('t1', 12), obs('t2', 22)]);
    const approval = '2026-09-01T00:00:00.000Z';
    const r1 = ingestSnapshot({
      prev: null,
      next: s1,
      activeBaselineVersionSeq: 1,
      seqFrom: 1,
      approvalRecordedAt: approval,
    });
    const r2 = ingestSnapshot({
      prev: s1,
      next: s2,
      activeBaselineVersionSeq: 1,
      seqFrom: r1.nextSeq,
      approvalRecordedAt: approval,
    });
    expect(r2.leftScope).toEqual([{ ticketId: 't2', key: 't2' }]);
    const r3 = ingestSnapshot({
      prev: s2,
      next: s3,
      activeBaselineVersionSeq: 1,
      seqFrom: r2.nextSeq,
      approvalRecordedAt: approval,
    });
    expect(r3.leftScope).toEqual([]);
    const prior = new Map([
      ['t1', hoursToMh(12)],
      ['t2', hoursToMh(20)],
    ]);
    const r4 = ingestSnapshot({
      prev: s3,
      next: s4,
      activeBaselineVersionSeq: 1,
      seqFrom: r3.nextSeq,
      approvalRecordedAt: approval,
      priorLedgerMhByTicket: prior,
      scopeChangedSincePrev: true,
    });
    // prior Σ keeps return off OB even when a scope change is recorded.
    expect(r4.entries.map((e) => [e.ticketId, e.kind, e.deltaMh])).toEqual([
      ['t2', 'delta', hoursToMh(2)],
    ]);
    expect(
      checkLedgerInvariant([...r1.entries, ...r2.entries, ...r3.entries, ...r4.entries], s4).ok,
    ).toBe(true);

    // Common return path: no scope change — still delta from prior Σ, never OB.
    const r4b = ingestSnapshot({
      prev: s3,
      next: s4,
      activeBaselineVersionSeq: 1,
      seqFrom: r3.nextSeq,
      approvalRecordedAt: approval,
      priorLedgerMhByTicket: prior,
      scopeChangedSincePrev: false,
    });
    expect(r4b.entries.map((e) => [e.ticketId, e.kind, e.deltaMh])).toEqual([
      ['t2', 'delta', hoursToMh(2)],
    ]);
  });
});

describe('mapping rules (FR-22)', () => {
  const rules = [
    { id: 'r1', priority: 1, name: 'support', wpId: 'WP-CATCH', match: { field: 'category' as const, value: 'Support' } },
    { id: 'r2', priority: 2, name: 'bugs', wpId: 'WP-2', match: { field: 'issueType' as const, value: 'Bug' } },
  ];

  it('matches in strict priority order', () => {
    const t = obs('t1', 1, { attributes: [{ kind: 'category', id: 'Support' }], issueTypeId: 'Bug' });
    expect(evaluateRules(rules, t)?.wpId).toBe('WP-CATCH');
    expect(evaluateRules([rules[1]!, rules[0]!], t)?.wpId).toBe('WP-CATCH'); // sorted by priority, not order
  });

  it('matches milestone attributes (AD-6)', () => {
    const milestoneRules = [
      {
        id: 'rm',
        priority: 1,
        name: 'sprint',
        wpId: 'WP-S1',
        match: { field: 'milestone' as const, value: 'Phase2-Sprint1' },
      },
    ];
    const t = obs('t1', 1, {
      attributes: [{ kind: 'milestone', id: 'Phase2-Sprint1' }],
    });
    expect(evaluateRules(milestoneRules, t)?.wpId).toBe('WP-S1');
  });

  it('never overrides a manual Mapping', () => {
    const t = obs('t1', 1, { attributes: [{ kind: 'category', id: 'Support' }] });
    const head = mappingHead([
      { seq: 1, ticketId: 't1', wpId: 'WP-9', source: 'manual', at: 'x', actor: 'pm' },
    ]);
    expect(applyRules(rules, [t], head, 2, 'x')).toEqual([]);
  });

  it('appends an event only when the rule result changes', () => {
    const t = obs('t1', 1, { attributes: [{ kind: 'category', id: 'Support' }] });
    const first = applyRules(rules, [t], new Map(), 1, 'x');
    expect(first).toHaveLength(1);
    expect(applyRules(rules, [t], mappingHead(first), 2, 'x')).toEqual([]);
  });

  it('re-evaluates a release head (story 5.9 — not pinned Unmapped)', () => {
    const t = obs('t1', 1, { attributes: [{ kind: 'category', id: 'Support' }] });
    const head = mappingHead([
      { seq: 1, ticketId: 't1', wpId: 'WP-9', source: 'manual', at: 'x', actor: 'pm' },
      { seq: 2, ticketId: 't1', wpId: null, source: 'release', at: 'x', actor: 'pm' },
    ]);
    const next = applyRules(rules, [t], head, 3, 'x');
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ ticketId: 't1', wpId: 'WP-CATCH', source: 'rule' });
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
        { wpId: 'WP-B', start: '2026-06-01', finish: '2026-12-01', baselineMh: hoursToMh(200), isMilestone: false, isCatchAll: false },
        { wpId: 'WP-C', start: '2026-06-01', finish: '2026-12-01', baselineMh: hoursToMh(10), isMilestone: false, isCatchAll: true },
      ],
    },
  ];

  const entry = (
    seq: number,
    ticketId: string,
    h: number,
    windowEnd: string,
    kind: LedgerEntry['kind'] = 'delta',
    connectorId: string | null = 'con-a',
  ): LedgerEntry => ({
    seq,
    ticketId,
    kind,
    deltaMh: hoursToMh(h),
    windowStart: null,
    windowEnd,
    assigneeAccountId: 'acct-1',
    activeBaselineVersionSeq: 1,
    connectorId,
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

  /** FR-20 Period honesty: four collapsed buckets === period.totalMh (OB excluded). */
  const periodFourBucketSum = (p: {
    mappedBaselinedMh: bigint;
    mappedNonBaselinedMh: bigint;
    catchAllMh: bigint;
    catchAllOverflowMh: bigint;
    unmappedMh: bigint;
  }) =>
    p.mappedBaselinedMh +
    p.mappedNonBaselinedMh +
    (p.catchAllMh + p.catchAllOverflowMh) +
    p.unmappedMh;

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

  it('proves Period four-bucket sum equals period.totalMh on a fixture that includes OB (story 5.13)', () => {
    // All four Period buckets + OB on two Connectors — OB must not enter Period.
    const r = run([
      entry(1, 'tb', 50, OUT, 'opening_balance', 'con-a'),
      entry(2, 'tn', 30, OUT, 'opening_balance', 'con-b'),
      entry(3, 'tb', 30, IN), // mapped baselined
      entry(4, 'tn', 12, IN), // mapped non-baselined
      entry(5, 'tc', 25, IN), // Catch-all: 10 within + 15 overflow
      entry(6, 'tu', 8, IN), // unmapped
    ]);
    const p = r.period;
    expect(p.mappedBaselinedMh).toBe(hoursToMh(30));
    expect(p.mappedNonBaselinedMh).toBe(hoursToMh(12));
    expect(p.catchAllMh).toBe(hoursToMh(10));
    expect(p.catchAllOverflowMh).toBe(hoursToMh(15));
    expect(p.unmappedMh).toBe(hoursToMh(8));
    expect(periodFourBucketSum(p)).toBe(p.totalMh);
    expect(p.totalMh).toBe(hoursToMh(30 + 12 + 10 + 15 + 8));
    expect(r.openingBalanceMh).toBe(hoursToMh(80));
    // OB is outside Period — cumulative carries OB + Period hours.
    expect(r.cumulative.totalMh).toBe(hoursToMh(80 + 30 + 12 + 10 + 15 + 8));
  });

  it('excludes Opening Balances from period metrics but counts them in cumulative AC', () => {
    const r = run([
      entry(1, 'tb', 100, OUT, 'opening_balance'),
      entry(2, 'tb', 20, IN),
    ]);
    expect(r.openingBalanceMh).toBe(hoursToMh(100));
    expect(r.cumulative.totalMh).toBe(hoursToMh(120));
    expect(r.period.totalMh).toBe(hoursToMh(20));
    expect(periodFourBucketSum(r.period)).toBe(r.period.totalMh);
  });

  it('groups Opening Balances per Connector and refuses a row with no connector id (story 5.13)', () => {
    const r = run([
      entry(1, 'tb', 40, OUT, 'opening_balance', 'con-a'),
      entry(2, 'tn', 25, OUT, 'opening_balance', 'con-b'),
      entry(3, 'tb', 10, IN),
    ]);
    expect(r.openingBalanceMh).toBe(hoursToMh(65));
    expect(r.openingBalanceMhByConnector.get('con-a')).toBe(hoursToMh(40));
    expect(r.openingBalanceMhByConnector.get('con-b')).toBe(hoursToMh(25));
    expect(r.openingBalanceMhByConnector.size).toBe(2);

    expect(() =>
      run([{ ...entry(1, 'tb', 10, OUT, 'opening_balance'), connectorId: null }]),
    ).toThrow(/no connector id/);
  });

  it('returns an empty per-Connector OB map when there are no opening_balance rows (story 5.13)', () => {
    const r = run([entry(1, 'tb', 20, IN)]);
    expect(r.openingBalanceMh).toBe(0n);
    expect(r.openingBalanceMhByConnector.size).toBe(0);
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

  it('attributes all ledger hours to the WP mapped now on remap; ledger entries unchanged (FR-21)', () => {
    const entries = [entry(1, 'tb', 30, IN), entry(2, 'tb', 5, IN)];
    const ledgerSnapshot = entries.map((e) => ({ ...e }));
    const remapped = [
      ...events,
      { seq: 4, ticketId: 'tb', wpId: 'WP-N', source: 'manual' as const, at: 'x', actor: 'pm' },
    ];
    const after = run(entries, remapped);
    expect(after.acByWp.get('WP-B')).toBeUndefined();
    expect(after.acByWp.get('WP-N')).toBe(hoursToMh(35));
    expect(after.cumulative.mappedNonBaselinedMh).toBe(hoursToMh(35));
    // Ledger itself is never rewritten.
    expect(entries).toEqual(ledgerSnapshot);
  });

  it('treats release as Unmapped for attribution until rules remapped (story 5.9)', () => {
    const entries = [entry(1, 'tb', 30, IN)];
    const released = [
      ...events,
      { seq: 4, ticketId: 'tb', wpId: null, source: 'release' as const, at: 'x', actor: 'pm' },
    ];
    const after = run(entries, released);
    expect(after.cumulative.unmappedMh).toBe(hoursToMh(30));
    expect(after.cumulative.unplannedMh).toBe(hoursToMh(30));
    expect(after.acByWp.get('WP-B')).toBeUndefined();
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
            isCatchAll: false,
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

describe('periodUnplannedTicketCount (Story 5.7 / FR-27)', () => {
  const period = periodOf('2026-09-16T09:00:00.000Z', 540, 4);
  const head = new Map([
    ['mapped', { wpId: 'WP-1', source: 'manual' as const, seq: 1 }],
  ]);

  it('counts Tickets first observed or Resolved in Period with Unplanned Mapping', () => {
    const result = periodUnplannedTicketCount({
      tickets: [
        {
          trackerIssueId: 'new-unplanned',
          firstObservedAt: '2026-09-15T09:00:00.000Z',
          statusId: 'Open',
          resolvedAt: null,
        },
        {
          trackerIssueId: 'mapped',
          firstObservedAt: '2026-09-15T09:00:00.000Z',
          statusId: 'Open',
          resolvedAt: null,
        },
        {
          trackerIssueId: 'resolved-unplanned',
          firstObservedAt: '2026-01-01T00:00:00.000Z',
          statusId: 'Closed',
          resolvedAt: '2026-09-14T09:00:00.000Z',
        },
        {
          trackerIssueId: 'old-open',
          firstObservedAt: '2026-01-01T00:00:00.000Z',
          statusId: 'Open',
          resolvedAt: null,
        },
      ],
      period,
      head,
      resolvedStatusIds: new Set(['Closed']),
      tzOffsetMinutes: 540,
    });
    expect([...result.periodTicketIds].sort()).toEqual(['mapped', 'new-unplanned', 'resolved-unplanned']);
    expect([...result.unplannedTicketIds].sort()).toEqual(['new-unplanned', 'resolved-unplanned']);
    expect(result.unplannedCount).toEqual({ kind: 'value', value: 2, unit: 'count', coverage: null });
  });

  it('does not treat Resolved tickets with null resolvedAt as Resolved-in-Period', () => {
    const result = periodUnplannedTicketCount({
      tickets: [
        {
          trackerIssueId: 'closed-no-date',
          firstObservedAt: '2026-01-01T00:00:00.000Z',
          statusId: 'Closed',
          resolvedAt: null,
        },
      ],
      period,
      head: new Map(),
      resolvedStatusIds: new Set(['Closed']),
      tzOffsetMinutes: 540,
    });
    expect(result.periodTicketIds).toEqual([]);
    expect(result.unplannedTicketIds).toEqual([]);
  });
});

describe('story 5.8 Tracker Account links (FR-13)', () => {
  it('suggests by email CI before display-name CI against Resource.name', () => {
    const suggestions = suggestTrackerAccountLinks({
      accounts: [
        {
          id: 'ta-1',
          accountId: 'a1',
          displayName: 'Alice',
          email: 'alice@example.com',
        },
        { id: 'ta-2', accountId: 'a2', displayName: 'Bob', email: null },
        { id: 'ta-3', accountId: 'a3', displayName: 'Carol', email: null },
      ],
      resources: [
        { id: 'r-alice', name: 'alice@example.com' },
        { id: 'r-bob', name: 'Bob' },
        { id: 'r-other', name: 'Other' },
      ],
    });
    expect(suggestions.find((s) => s.accountId === 'a1')).toMatchObject({
      matchKind: 'email',
      suggestedResourceIds: ['r-alice'],
    });
    expect(suggestions.find((s) => s.accountId === 'a2')).toMatchObject({
      matchKind: 'name',
      suggestedResourceIds: ['r-bob'],
    });
    expect(suggestions.find((s) => s.accountId === 'a3')).toMatchObject({
      matchKind: 'none',
      suggestedResourceIds: [],
    });
  });

  it('marks already-linked accounts without re-suggesting', () => {
    const suggestions = suggestTrackerAccountLinks({
      accounts: [{ id: 'ta-1', accountId: 'a1', displayName: 'Bob', email: null }],
      resources: [{ id: 'r-bob', name: 'Bob' }],
      linkedByAccountId: new Map([['a1', 'r-bob']]),
    });
    expect(suggestions[0]).toMatchObject({
      matchKind: 'linked',
      linkedResourceId: 'r-bob',
      suggestedResourceIds: [],
    });
  });

  it('rebuilds trackerAccountIds from link heads and honours seqMax pin', () => {
    const byResource = trackerAccountIdsFromLinkHeads({
      events: [
        { seq: 1, trackerAccountId: 'ta-1', resourceId: 'r1' },
        { seq: 2, trackerAccountId: 'ta-1', resourceId: null },
        { seq: 3, trackerAccountId: 'ta-1', resourceId: 'r2' },
      ],
      accountIdByInternalId: new Map([['ta-1', 'acct-1']]),
      resourceIds: ['r1', 'r2'],
      seqMax: 2,
    });
    expect(byResource.get('r1')).toEqual([]);
    expect(byResource.get('r2')).toEqual([]);
    const live = trackerAccountIdsFromLinkHeads({
      events: [
        { seq: 1, trackerAccountId: 'ta-1', resourceId: 'r1' },
        { seq: 2, trackerAccountId: 'ta-1', resourceId: null },
        { seq: 3, trackerAccountId: 'ta-1', resourceId: 'r2' },
      ],
      accountIdByInternalId: new Map([['ta-1', 'acct-1']]),
      resourceIds: ['r1', 'r2'],
    });
    expect(live.get('r2')).toEqual(['acct-1']);
    expect(live.get('r1')).toEqual([]);
  });

  it('costs Unattributed at Project default and emits Department Unattributed line', () => {
    const linked: Resource = {
      id: 'r1',
      name: 'Alice',
      departmentId: 'd-eng',
      trackerAccountIds: ['acct-1'],
      rates: [{ seq: 1, effectiveFrom: '2026-01-01', yenPerHour: 8000n }],
    };
    const mk = (
      seq: number,
      assigneeAccountId: string | null,
    ): LedgerEntry => ({
      seq,
      ticketId: `t${seq}`,
      kind: 'delta',
      deltaMh: hoursToMh(1),
      windowStart: null,
      windowEnd: '2026-06-02T00:00:00.000Z',
      assigneeAccountId,
      activeBaselineVersionSeq: null,
    });
    const entries = [mk(1, 'acct-1'), mk(2, null), mk(3, 'acct-unlinked')];
    const rollup = departmentEffortRollup({
      entries,
      resources: [linked],
      project,
    });
    expect(rollup.totalMh).toBe(hoursToMh(3));
    expect(rollup.totalJpy).toBe(8000n + 4000n + 4000n);
    const unattributed = rollup.lines.find((l) => l.departmentId === null);
    expect(unattributed?.mh).toBe(hoursToMh(2));
    expect(unattributed?.jpy).toBe(8000n);
    const eng = rollup.lines.find((l) => l.departmentId === 'd-eng');
    expect(eng?.mh).toBe(hoursToMh(1));
    expect(eng?.jpy).toBe(8000n);
    const deptSumMh = rollup.lines.reduce((s, l) => s + l.mh, 0n);
    const deptSumJpy = rollup.lines.reduce((s, l) => s + l.jpy, 0n);
    expect(deptSumMh).toBe(rollup.totalMh);
    expect(deptSumJpy).toBe(rollup.totalJpy);
  });

  it('late link is retroactive live; resources without the account stay Unattributed', () => {
    const period = periodOf('2026-09-16T09:00:00.000Z', 540, 4);
    const baseResource: Resource = {
      id: 'r1',
      name: 'Alice',
      departmentId: 'd',
      trackerAccountIds: [],
      rates: [{ seq: 1, effectiveFrom: '2026-01-01', yenPerHour: 9000n }],
    };
    const entries: LedgerEntry[] = [
      {
        seq: 1,
        ticketId: 't-late',
        kind: 'delta',
        deltaMh: hoursToMh(1),
        windowStart: null,
        windowEnd: '2026-09-15T09:00:00.000Z',
        assigneeAccountId: 'acct-late',
        activeBaselineVersionSeq: null,
      },
    ];
    const before = attribute({
      entries,
      head: new Map(),
      wps: [],
      baselineVersions: [],
      resources: [baseResource],
      project,
      period,
    });
    expect(before.cumulative.totalJpy).toBe(4000n);
    const after = attribute({
      entries,
      head: new Map(),
      wps: [],
      baselineVersions: [],
      resources: [{ ...baseResource, trackerAccountIds: ['acct-late'] }],
      project,
      period,
    });
    expect(after.cumulative.totalJpy).toBe(9000n);
  });
});

describe('attribution Catch-all overflow (FR-24, AR-18 / story 5.12)', () => {
  const period = periodOf('2026-09-16T09:00:00.000Z', 540, 4);
  const resources: Resource[] = [
    {
      id: 'r1',
      name: 'R',
      departmentId: 'd',
      trackerAccountIds: ['acct-1'],
      rates: [{ seq: 1, effectiveFrom: '2026-01-01', yenPerHour: 5000n }],
    },
  ];
  const catchWp = wp({ id: 'WP-C', isCatchAll: true });
  const baselineVersions = [
    {
      seq: 1,
      id: 'bl-1',
      reason: 'x',
      recordedAt: '2026-06-01T00:00:00.000Z',
      actor: 'user:pm',
      wps: [
        {
          wpId: 'WP-C',
          start: '2026-06-01',
          finish: '2026-12-01',
          baselineMh: hoursToMh(10),
          isMilestone: false,
          isCatchAll: true,
        },
      ],
    },
  ];
  const head = mappingHead([
    { seq: 1, ticketId: 'tc', wpId: 'WP-C', source: 'rule' as const, at: 'x', actor: 'sys' },
  ]);
  const flags = [
    { seq: 1, wpId: 'WP-C', isCatchAll: true, actor: 'pm', at: 'x' },
  ];
  const entry = (
    seq: number,
    h: number,
    windowEnd: string,
    ticketId = 'tc',
  ): LedgerEntry => ({
    seq,
    ticketId,
    kind: 'delta',
    deltaMh: hoursToMh(h),
    windowStart: null,
    windowEnd,
    assigneeAccountId: 'acct-1',
    activeBaselineVersionSeq: 1,
  });

  const run = (entries: LedgerEntry[], opts?: { flagSeqMax?: number; noBaseline?: boolean }) =>
    attribute({
      entries,
      head,
      wps: [catchWp],
      baselineVersions: opts?.noBaseline
        ? [
            {
              ...baselineVersions[0]!,
              wps: [{ ...baselineVersions[0]!.wps[0]!, baselineMh: 0n }],
            },
          ]
        : baselineVersions,
      resources,
      project,
      period,
      wpFlagEvents: flags,
      wpFlagSeqMax: opts?.flagSeqMax ?? 1,
    });

  it('golden: crossing entry prorates within + overflow at the same Rate (cap 10h)', () => {
    // +8 → within 8; +5 → within 2 + overflow 3
    const r = run([
      entry(1, 8, '2026-09-10T09:00:00.000Z'),
      entry(2, 5, '2026-09-11T09:00:00.000Z'),
    ]);
    expect(r.cumulative.catchAllMh).toBe(hoursToMh(10));
    expect(r.cumulative.catchAllOverflowMh).toBe(hoursToMh(3));
    expect(r.cumulative.unplannedMh).toBe(hoursToMh(3));
    expect(r.acByWp.get('WP-C')).toBe(hoursToMh(10));
    expect(r.overflowMhByTicket.get('tc')).toBe(hoursToMh(3));
    // Both parts of the crossing entry costed at 5000 ¥/h
    expect(r.cumulative.totalJpy).toBe(13n * 5000n);
  });

  it('golden: negative delta straddling the cap LIFO-clears overflow then within', () => {
    // Cap 10: +8 within; +5 → +2 within +3 over; −4 LIFO → clears 3 over then −1 within
    const r = run([
      entry(1, 8, '2026-09-10T09:00:00.000Z'),
      entry(2, 5, '2026-09-11T09:00:00.000Z'),
      entry(3, -4, '2026-09-12T09:00:00.000Z'),
    ]);
    expect(r.cumulative.catchAllMh).toBe(hoursToMh(9));
    expect(r.cumulative.catchAllOverflowMh).toBe(0n);
    expect(r.cumulative.unplannedMh).toBe(0n);
    expect(r.overflowMhByTicket.get('tc') ?? 0n).toBe(0n);
  });

  it('orders by (window_end, seq), not seq alone', () => {
    // Higher seq but earlier window_end must process first.
    const r = run([
      entry(2, 8, '2026-09-10T09:00:00.000Z'),
      entry(1, 5, '2026-09-11T09:00:00.000Z'),
    ]);
    expect(r.cumulative.catchAllMh).toBe(hoursToMh(10));
    expect(r.cumulative.catchAllOverflowMh).toBe(hoursToMh(3));
  });

  it('treats Catch-all without Baseline hours as all Unplanned', () => {
    const r = run([entry(1, 12, '2026-09-15T09:00:00.000Z')], { noBaseline: true });
    expect(r.cumulative.catchAllMh).toBe(0n);
    expect(r.cumulative.catchAllOverflowMh).toBe(hoursToMh(12));
    expect(r.cumulative.unplannedMh).toBe(hoursToMh(12));
  });

  it('judges Catch-all at wp_flag_seq_max, not the live WP column', () => {
    // Live WP still isCatchAll, but flag cleared at seq 2 — pin ≥ 2 → non-Catch-all buckets.
    const cleared = [
      ...flags,
      { seq: 2, wpId: 'WP-C', isCatchAll: false, actor: 'pm', at: 'y' },
    ];
    const entries = [entry(1, 12, '2026-09-15T09:00:00.000Z')];
    const stillCatchAll = attribute({
      entries,
      head,
      wps: [catchWp],
      baselineVersions,
      resources,
      project,
      period,
      wpFlagEvents: cleared,
      wpFlagSeqMax: 1,
    });
    expect(stillCatchAll.cumulative.catchAllMh).toBe(hoursToMh(10));
    expect(stillCatchAll.cumulative.catchAllOverflowMh).toBe(hoursToMh(2));

    const clearedAtPin = attribute({
      entries,
      head,
      wps: [catchWp],
      baselineVersions,
      resources,
      project,
      period,
      wpFlagEvents: cleared,
      wpFlagSeqMax: 2,
    });
    // Non-Catch-all with Baseline hours → mapped baselined (not Catch-all buckets).
    expect(clearedAtPin.cumulative.catchAllMh).toBe(0n);
    expect(clearedAtPin.cumulative.catchAllOverflowMh).toBe(0n);
    expect(clearedAtPin.cumulative.mappedBaselinedMh).toBe(hoursToMh(12));
  });

  it('golden: multi-Ticket LIFO clear updates overflowMhByTicket for the other Ticket', () => {
    // Cap 10: tc fills to cap + 3 overflow; td adds 4 overflow; te −5 LIFO clears td's 4 then 1 of tc.
    const multiHead = mappingHead([
      { seq: 1, ticketId: 'tc', wpId: 'WP-C', source: 'rule' as const, at: 'x', actor: 'sys' },
      { seq: 2, ticketId: 'td', wpId: 'WP-C', source: 'rule' as const, at: 'x', actor: 'sys' },
      { seq: 3, ticketId: 'te', wpId: 'WP-C', source: 'rule' as const, at: 'x', actor: 'sys' },
    ]);
    const r = attribute({
      entries: [
        entry(1, 13, '2026-09-10T09:00:00.000Z', 'tc'), // within 10 + over 3
        entry(2, 4, '2026-09-11T09:00:00.000Z', 'td'), // over 4
        entry(3, -5, '2026-09-12T09:00:00.000Z', 'te'), // LIFO: −4 td, −1 tc
      ],
      head: multiHead,
      wps: [catchWp],
      baselineVersions,
      resources,
      project,
      period,
      wpFlagEvents: flags,
      wpFlagSeqMax: 1,
    });
    expect(r.overflowMhByTicket.get('td') ?? 0n).toBe(0n);
    expect(r.overflowMhByTicket.get('tc')).toBe(hoursToMh(2));
    expect(r.cumulative.catchAllOverflowMh).toBe(hoursToMh(2));
  });

  it('golden: overflow slices at different Rates cost LIFO unplannedJpy at each slice Rate', () => {
    // Cap 10. First overflow at 5000 ¥/h; second at 9000 ¥/h; negative clears 9000 first.
    const dualRates: Resource[] = [
      {
        id: 'r-lo',
        name: 'Lo',
        departmentId: 'd',
        trackerAccountIds: ['acct-lo'],
        rates: [{ seq: 1, effectiveFrom: '2026-01-01', yenPerHour: 5000n }],
      },
      {
        id: 'r-hi',
        name: 'Hi',
        departmentId: 'd',
        trackerAccountIds: ['acct-hi'],
        rates: [{ seq: 1, effectiveFrom: '2026-01-01', yenPerHour: 9000n }],
      },
    ];
    const priced = (seq: number, h: number, windowEnd: string, accountId: string): LedgerEntry => ({
      ...entry(seq, h, windowEnd),
      assigneeAccountId: accountId,
    });
    const r = attribute({
      entries: [
        priced(1, 12, '2026-09-10T09:00:00.000Z', 'acct-lo'), // within 10 + over 2 @ 5000
        priced(2, 3, '2026-09-12T09:00:00.000Z', 'acct-hi'), // over 3 @ 9000
        priced(3, -4, '2026-09-13T09:00:00.000Z', 'acct-lo'), // LIFO −3 @ 9000, −1 @ 5000
      ],
      head,
      wps: [catchWp],
      baselineVersions,
      resources: dualRates,
      project,
      period,
      wpFlagEvents: flags,
      wpFlagSeqMax: 1,
    });
    // Remaining overflow: 1h @ 5000 from the first slice.
    expect(r.cumulative.catchAllOverflowMh).toBe(hoursToMh(1));
    // unplannedJpy = +2*5000 + 3*9000 − 3*9000 − 1*5000 = 5000
    expect(r.cumulative.unplannedJpy).toBe(5000n);
  });

  it('clamps a negative delta that exceeds cumulative so catchAllMh cannot go negative', () => {
    const r = run([
      entry(1, 5, '2026-09-10T09:00:00.000Z'),
      entry(2, -20, '2026-09-11T09:00:00.000Z'),
    ]);
    expect(r.cumulative.catchAllMh).toBe(0n);
    expect(r.cumulative.catchAllOverflowMh).toBe(0n);
    expect(r.acByWp.get('WP-C') ?? 0n).toBe(0n);
  });
});
