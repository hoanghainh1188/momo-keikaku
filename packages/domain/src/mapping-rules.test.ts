/**
 * Story 5.10 — Mapping Rules: the pure half of the I/O matrix (FR-22, AR-18, UX-DR22/23).
 */
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { partitionOwnedTickets } from './ledger';
import {
  applyRules,
  evaluateRules,
  evaluateRuleTarget,
  globMatches,
  mappingHead,
  previewRuleChange,
} from './mapping';
import type { MappingEvent, MappingRule, TicketObservation } from './types';
import { hoursToMh } from './units';

const obs = (id: string, over: Partial<TicketObservation> = {}): TicketObservation => ({
  trackerIssueId: id,
  key: id,
  title: id,
  statusId: 'Open',
  estimateMh: null,
  actualMh: null,
  assigneeAccountId: null,
  createdAt: '2026-06-01T00:00:00.000Z',
  parentIssueId: null,
  issueTypeId: 'Task',
  trackerProjectId: null,
  attributes: [],
  ...over,
});

const rule = (id: string, priority: number, wpId: string, match: MappingRule['match']): MappingRule => ({
  id,
  priority,
  name: id,
  wpId,
  match,
});

const ev = (seq: number, ticketId: string, over: Partial<MappingEvent>): MappingEvent => ({
  seq,
  ticketId,
  wpId: null,
  source: 'rule',
  at: 'x',
  actor: 'a',
  ...over,
});

describe('globMatches (Harry Q2: * and ? only, anchored, case-sensitive)', () => {
  it.each([
    ['EC2-*', 'EC2-101', true],
    ['EC2-*', 'XEC2-101', false],
    ['EC2-1?1', 'EC2-101', true],
    ['EC2-1?1', 'EC2-1001', false],
    ['*-10', 'EC2-10', true],
    ['*-10', 'EC2-101', false],
    ['ec2-*', 'EC2-1', false],
    ['EC2-[1]', 'EC2-1', false],
    ['EC2-[1]', 'EC2-[1]', true],
    ['a.b', 'axb', false],
    ['*', '', true],
    ['', '', true],
    ['', 'a', false],
    ['*a*b*', 'xxaxxbxx', true],
    ['*a*b*', 'xxbxxaxx', false],
  ])('%s vs %s → %s', (pattern, text, expected) => {
    expect(globMatches(pattern, text)).toBe(expected);
  });

  it('stays linear on a hostile pattern', () => {
    const started = performance.now();
    expect(globMatches('*a*a*a*a*a*a*a*a*b', 'a'.repeat(5000))).toBe(false);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});

describe('evaluateRules returns the firing rule (story 5.10)', () => {
  const rules = [
    rule('r-parent', 1, 'WP-P', { field: 'parent', value: 'iss-100' }),
    rule('r-key', 2, 'WP-K', { field: 'keyPattern', value: 'EC2-9*' }),
    rule('r-type', 3, 'WP-T', { field: 'issueType', value: 'Bug' }),
  ];

  it('matches the parent condition on parentIssueId', () => {
    expect(evaluateRules(rules, obs('t1', { parentIssueId: 'iss-100' }))).toEqual({
      wpId: 'WP-P',
      ruleId: 'r-parent',
    });
  });

  it('matches the key pattern, then falls through by priority', () => {
    expect(evaluateRules(rules, obs('t2', { key: 'EC2-901', issueTypeId: 'Bug' }))).toEqual({
      wpId: 'WP-K',
      ruleId: 'r-key',
    });
    expect(evaluateRules(rules, obs('t3', { key: 'EC2-1', issueTypeId: 'Bug' }))?.ruleId).toBe('r-type');
    expect(evaluateRuleTarget(rules, obs('t4'))).toBeNull();
  });

  it('a null parent never matches a parent rule', () => {
    expect(evaluateRules([rules[0]!], obs('t5'))).toBeNull();
  });
});

describe('applyRules — the I/O matrix', () => {
  const rules = [
    rule('r1', 1, 'WP-A', { field: 'category', value: 'Support' }),
    rule('r2', 2, 'WP-B', { field: 'issueType', value: 'Bug' }),
  ];
  const support = obs('t1', { attributes: [{ kind: 'category', id: 'Support' }] });

  it('ingest re-eval: a new Ticket matching P2 gets one rule event carrying P2', () => {
    const bug = obs('t2', { issueTypeId: 'Bug' });
    expect(applyRules(rules, [bug], new Map(), 7, 'at')).toEqual([
      { seq: 7, ticketId: 't2', wpId: 'WP-B', source: 'rule', ruleId: 'r2', at: 'at', actor: 'system:rules' },
    ]);
  });

  it('unchanged: a result equal to the head appends nothing', () => {
    const head = mappingHead([ev(1, 't1', { wpId: 'WP-A', ruleId: 'r1' })]);
    expect(applyRules(rules, [support], head, 2, 'x')).toEqual([]);
  });

  it('manual and disposition heads are never touched', () => {
    for (const source of ['manual', 'disposition'] as const) {
      const head = mappingHead([ev(1, 't1', { wpId: 'WP-Z', source })]);
      expect(applyRules(rules, [support], head, 2, 'x')).toEqual([]);
      expect(applyRules([], [support], head, 2, 'x')).toEqual([]);
    }
  });

  it('rule no longer matches: wpId null, ruleId is the rule it left', () => {
    const head = mappingHead([ev(1, 't1', { wpId: 'WP-A', ruleId: 'r1' })]);
    const out = applyRules([rules[1]!], [support], head, 2, 'x');
    expect(out).toEqual([
      { seq: 2, ticketId: 't1', wpId: null, source: 'rule', ruleId: 'r1', at: 'x', actor: 'system:rules' },
    ]);
    expect(mappingHead(out).get('t1')).toEqual({ wpId: null, source: 'rule', seq: 2, ruleId: 'r1' });
  });

  it('a release or missing head with no match stays put (no event)', () => {
    const released = mappingHead([ev(1, 't1', { wpId: null, source: 'release' })]);
    expect(applyRules([], [support], released, 2, 'x')).toEqual([]);
    expect(applyRules([], [support], new Map(), 2, 'x')).toEqual([]);
  });

  it('a different rule now holding the Ticket at the SAME WP appends one event naming it', () => {
    const sameWp = [
      rule('r0', 0, 'WP-A', { field: 'issueType', value: 'Task' }),
      ...rules,
    ];
    const head = mappingHead([ev(1, 't1', { wpId: 'WP-A', ruleId: 'r1' })]);
    expect(applyRules(sameWp, [support], head, 2, 'x')).toEqual([
      { seq: 2, ticketId: 't1', wpId: 'WP-A', source: 'rule', ruleId: 'r0', at: 'x', actor: 'system:rules' },
    ]);
  });

  it('the same rule at the same WP appends nothing', () => {
    const head = mappingHead([ev(1, 't1', { wpId: 'WP-A', ruleId: 'r1' })]);
    expect(applyRules(rules, [support], head, 2, 'x')).toEqual([]);
  });

  it('a rule-unmapped Ticket is remapped when a rule matches again', () => {
    const head = mappingHead([ev(1, 't1', { wpId: null, ruleId: 'r1' })]);
    expect(applyRules(rules, [support], head, 2, 'x')[0]).toMatchObject({ wpId: 'WP-A', ruleId: 'r1' });
  });

  it('ingest FR-22 fence: applyRules on owned partition never remaps overlap Tickets (epic-5-retro F3)', () => {
    // Claimer snap sees an owner Ticket whose attributes would match a rule. Evaluating the
    // full read would append a Mapping for the owner's Ticket; owned-only matches ingest.
    const ownerTicket = obs('owned-by-a', {
      issueTypeId: 'Bug',
      attributes: [{ kind: 'category', id: 'Support' }],
    });
    const claimerFresh = obs('fresh-on-b', { issueTypeId: 'Bug' });
    const read = [ownerTicket, claimerFresh];
    const { owned, overlaps } = partitionOwnedTickets(
      read,
      new Map([['owned-by-a', 'con-a']]),
      'con-b',
    );
    expect(overlaps.map((o) => o.ticket.trackerIssueId)).toEqual(['owned-by-a']);
    expect(owned.map((t) => t.trackerIssueId)).toEqual(['fresh-on-b']);

    const head = new Map();
    const onOwned = applyRules(rules, owned, head, 1, 'at');
    const onAll = applyRules(rules, read, head, 1, 'at');
    expect(onOwned.map((e) => e.ticketId)).toEqual(['fresh-on-b']);
    expect(onAll.map((e) => e.ticketId).sort()).toEqual(['fresh-on-b', 'owned-by-a']);
  });
});

describe('previewRuleChange (UX-DR22)', () => {
  const current = [
    rule('r1', 1, 'WP-21', { field: 'category', value: 'Support' }),
  ];
  const tickets = [
    obs('t1', { key: 'EC2-1', attributes: [{ kind: 'category', id: 'Support' }] }),
    obs('t2', { key: 'EC2-2', attributes: [{ kind: 'category', id: 'Support' }] }),
    obs('t3', { key: 'EC2-3', issueTypeId: 'Bug' }),
    obs('t4', { key: 'EC2-4', issueTypeId: 'Bug' }),
  ];
  const head = mappingHead([
    ev(1, 't1', { wpId: 'WP-21', ruleId: 'r1' }),
    ev(2, 't2', { wpId: 'WP-21', ruleId: 'r1' }),
    ev(3, 't4', { wpId: 'WP-9', source: 'manual' }),
  ]);
  const hours = new Map([
    ['t1', hoursToMh(3)],
    ['t2', hoursToMh(5)],
    ['t3', hoursToMh(2)],
  ]);

  it('counts arrivals, departures and hours, and never moves a manual head', () => {
    const proposed = [
      rule('r1', 1, 'WP-23', { field: 'category', value: 'Support' }),
      rule('new', 2, 'WP-23', { field: 'issueType', value: 'Bug' }),
    ];
    const p = previewRuleChange(proposed, tickets, head, hours);
    expect(p.arrivals).toEqual([{ wpId: 'WP-23', tickets: 3, mh: hoursToMh(10) }]);
    expect(p.departures).toEqual([{ wpId: 'WP-21', tickets: 2, mh: hoursToMh(8) }]);
    expect(p.toUnmapped).toEqual({ tickets: 0, mh: 0n });
    expect(p.moves.map((m) => m.ticketId)).toEqual(['t1', 't2', 't3']);
  });

  it('a delete previews the Tickets it leaves Unmapped', () => {
    const p = previewRuleChange([], tickets, head, hours);
    expect(p.toUnmapped).toEqual({ tickets: 2, mh: hoursToMh(8) });
    expect(p.arrivals).toEqual([]);
    expect(p.departures).toEqual([{ wpId: 'WP-21', tickets: 2, mh: hoursToMh(8) }]);
  });

  it('is exactly what applyRules would append', () => {
    const p = previewRuleChange(current, tickets, head, hours);
    expect(p.moves).toEqual([]);
    expect(applyRules(current, tickets, head, 1, 'x')).toEqual([]);
  });

  it('a same-WP rule switch is neither an arrival nor a departure', () => {
    const p = previewRuleChange(
      [rule('r0', 0, 'WP-21', { field: 'keyPattern', value: 'EC2-*' }), ...current],
      tickets,
      head,
      hours,
    );
    // t1/t2 switch rule at WP-21 (no move); only t3, unmapped before, arrives.
    expect(p.arrivals).toEqual([{ wpId: 'WP-21', tickets: 1, mh: hoursToMh(2) }]);
    expect(p.departures).toEqual([]);
    expect(p.moves.map((m) => m.ticketId)).toEqual(['t3']);
  });

  it('a Ticket-Count Ticket moves with no hours (absent from hoursByTicket)', () => {
    const p = previewRuleChange([rule('r', 1, 'WP-X', { field: 'issueType', value: 'Bug' })], [tickets[2]!], new Map(), new Map());
    expect(p.arrivals).toEqual([{ wpId: 'WP-X', tickets: 1, mh: 0n }]);
  });
});
