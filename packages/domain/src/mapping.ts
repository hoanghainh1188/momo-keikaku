import type { MappingEvent, MappingRule, TicketObservation } from './types';
import type { Mh } from './units';

const NO_HOURS: Mh = 0n;

/**
 * AD-9: the current Mapping of a Ticket is its latest mapping_event at or below a
 * high-water mark. Attribution is computed from this, never stored.
 *
 * `ruleId` is the rule that produced a `rule` head (story 5.10): the rule that fired for a
 * mapped head, or the rule the Ticket LEFT for a `rule` head with `wpId = null`.
 */
export interface MappingHeadEntry {
  wpId: string | null;
  source: MappingEvent['source'];
  seq: number;
  ruleId?: string | null;
}

export function mappingHead(
  events: MappingEvent[],
  mappingSeqMax = Number.POSITIVE_INFINITY,
): Map<string, MappingHeadEntry> {
  const head = new Map<string, MappingHeadEntry>();
  for (const e of events) {
    if (e.seq > mappingSeqMax) continue;
    const cur = head.get(e.ticketId);
    if (!cur || e.seq > cur.seq) {
      head.set(e.ticketId, { wpId: e.wpId, source: e.source, seq: e.seq, ruleId: e.ruleId ?? null });
    }
  }
  return head;
}

function attributeIds(obs: TicketObservation, kind: 'milestone' | 'category'): string[] {
  return obs.attributes.filter((a) => a.kind === kind).map((a) => a.id);
}

/**
 * Story 5.10 / Harry Q2: an anchored, case-sensitive glob with `*` (any run, empty included) and
 * `?` (exactly one character) and nothing else — every other character is literal. Iterative
 * with single-star backtracking, so a hostile pattern costs O(pattern × text), never exponential.
 */
export function globMatches(pattern: string, text: string): boolean {
  let p = 0;
  let t = 0;
  let starP = -1;
  let starT = 0;
  while (t < text.length) {
    const pc = pattern[p];
    if (pc === '*') {
      starP = p;
      starT = t;
      p += 1;
    } else if (pc !== undefined && (pc === '?' || pc === text[t])) {
      p += 1;
      t += 1;
    } else if (starP >= 0) {
      p = starP + 1;
      starT += 1;
      t = starT;
    } else {
      return false;
    }
  }
  while (pattern[p] === '*') p += 1;
  return p === pattern.length;
}

function ruleMatches(rule: MappingRule, obs: TicketObservation): boolean {
  switch (rule.match.field) {
    case 'milestone':
      return attributeIds(obs, 'milestone').includes(rule.match.value);
    case 'category':
      return attributeIds(obs, 'category').includes(rule.match.value);
    case 'issueType':
      return obs.issueTypeId === rule.match.value;
    case 'parent':
      return obs.parentIssueId !== null && obs.parentIssueId === rule.match.value;
    case 'keyPattern':
      return globMatches(rule.match.value, obs.key);
  }
}

/** The rule that fired, and where it sends the Ticket. */
export interface RuleMatch {
  wpId: string;
  ruleId: string;
}

/**
 * FR-22: strict priority order, first match wins. Pure. Reads `attributes` (AD-6). Returns the
 * firing rule as well as its target (story 5.10), so the event can record which rule moved it.
 * Ties on priority (which the schema refuses for live rules) fall back to id order, so the
 * result never depends on the order the caller happened to pass.
 */
export function evaluateRules(rules: readonly MappingRule[], obs: TicketObservation): RuleMatch | null {
  const ordered = [...rules].sort((a, b) => a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const r of ordered) {
    if (ruleMatches(r, obs)) return { wpId: r.wpId, ruleId: r.id };
  }
  return null;
}

/** The thin `wpId | null` form of `evaluateRules` (FR-22's `evaluateRules(rules, observation) → wpId | null`). */
export function evaluateRuleTarget(rules: readonly MappingRule[], obs: TicketObservation): string | null {
  return evaluateRules(rules, obs)?.wpId ?? null;
}

/**
 * FR-22 "manual wins": rules are only applied to Tickets whose head is not manual
 * (Dispositions count as manual). `release` clears the head for rules and is re-evaluable
 * (story 5.9 / A4). Returns the events that should be appended — only for Tickets whose
 * result changes: a different WP, or the same WP now held by a different rule.
 *
 * Story 5.10: each event carries `ruleId` — the rule that fired, or, when no rule matches any
 * more and the Ticket leaves a rule Mapping for Unmapped, the rule it left (the prior head's).
 */
export function applyRules(
  rules: readonly MappingRule[],
  tickets: readonly TicketObservation[],
  head: ReadonlyMap<string, MappingHeadEntry>,
  seqFrom: number,
  at: string,
): MappingEvent[] {
  let seq = seqFrom;
  const out: MappingEvent[] = [];
  for (const t of tickets) {
    const cur = head.get(t.trackerIssueId);
    if (cur && (cur.source === 'manual' || cur.source === 'disposition')) continue;
    const match = evaluateRules(rules, t);
    const wpId = match?.wpId ?? null;
    // The result is the PAIR (wpId, ruleId): a different rule now holding the Ticket at the same
    // WP is still a change "by that rule" (NFR-A1), so the head never names a stale rule. An
    // unchanged null result (already unmapped) appends nothing.
    if ((cur?.wpId ?? null) === wpId && (wpId === null || (cur?.ruleId ?? null) === match!.ruleId)) {
      continue;
    }
    out.push({
      seq: seq++,
      ticketId: t.trackerIssueId,
      wpId,
      source: 'rule',
      ruleId: match ? match.ruleId : (cur?.ruleId ?? null),
      at,
      actor: 'system:rules',
    });
  }
  return out;
}

/** Tickets and hours flowing into, or out of, one Work Package. */
export interface RulePreviewFlow {
  wpId: string;
  tickets: number;
  mh: Mh;
}

/** One Ticket the proposed rules would move. */
export interface RulePreviewMove {
  ticketId: string;
  key: string;
  fromWpId: string | null;
  toWpId: string | null;
  mh: Mh;
}

/**
 * UX-DR22's move preview: "+14 Tickets / +32h would move to WP 2.3; 2 Tickets leave WP 2.1".
 * `arrivals` are per target WP, `departures` per WP left, `toUnmapped` the Tickets the change
 * would leave with no rule Mapping. Every list is sorted, so the same inputs read the same.
 */
export interface RuleChangePreview {
  arrivals: RulePreviewFlow[];
  departures: RulePreviewFlow[];
  toUnmapped: { tickets: number; mh: Mh };
  moves: RulePreviewMove[];
}

function addFlow(flows: Map<string, RulePreviewFlow>, wpId: string, mh: Mh): void {
  const cur = flows.get(wpId) ?? { wpId, tickets: 0, mh: NO_HOURS };
  flows.set(wpId, { wpId, tickets: cur.tickets + 1, mh: cur.mh + mh });
}

const byWp = (a: RulePreviewFlow, b: RulePreviewFlow) => (a.wpId < b.wpId ? -1 : a.wpId > b.wpId ? 1 : 0);

/**
 * Story 5.10 / UX-DR22: what saving `proposed` would move, read-only and pure. It is exactly
 * `applyRules(proposed, …)` against the current heads — the same evaluation the save runs — so
 * the preview cannot promise a move the save does not make. The current rules are already
 * expressed in the heads (every save and every ingest keeps them in step), so they are not a
 * separate input. Hours are the Ticket's cumulative ledger hours from hours Connectors only;
 * a Ticket-Count Connector's Tickets count, but contribute no hours (`hoursByTicket` omits them).
 */
export function previewRuleChange(
  proposed: readonly MappingRule[],
  tickets: readonly TicketObservation[],
  head: ReadonlyMap<string, MappingHeadEntry>,
  hoursByTicket: ReadonlyMap<string, Mh>,
): RuleChangePreview {
  const keyOf = new Map(tickets.map((t) => [t.trackerIssueId, t.key]));
  const events = applyRules(proposed, tickets, head, 0, '');
  const arrivals = new Map<string, RulePreviewFlow>();
  const departures = new Map<string, RulePreviewFlow>();
  let unmappedTickets = 0;
  let unmappedMh: Mh = NO_HOURS;
  const moves: RulePreviewMove[] = [];
  for (const e of events) {
    const fromWpId = head.get(e.ticketId)?.wpId ?? null;
    // A same-WP rule switch is recorded, but moves no Ticket and no hours.
    if (fromWpId === e.wpId) continue;
    const mh = hoursByTicket.get(e.ticketId) ?? NO_HOURS;
    if (e.wpId !== null) addFlow(arrivals, e.wpId, mh);
    else {
      unmappedTickets += 1;
      unmappedMh += mh;
    }
    if (fromWpId !== null) addFlow(departures, fromWpId, mh);
    moves.push({ ticketId: e.ticketId, key: keyOf.get(e.ticketId) ?? e.ticketId, fromWpId, toWpId: e.wpId, mh });
  }
  moves.sort((a, b) => (a.ticketId < b.ticketId ? -1 : a.ticketId > b.ticketId ? 1 : 0));
  return {
    arrivals: [...arrivals.values()].sort(byWp),
    departures: [...departures.values()].sort(byWp),
    toUnmapped: { tickets: unmappedTickets, mh: unmappedMh },
    moves,
  };
}
