import type { MappingEvent, MappingRule, TicketObservation } from './types';

/**
 * AD-9: the current Mapping of a Ticket is its latest mapping_event at or below a
 * high-water mark. Attribution is computed from this, never stored.
 */
export interface MappingHeadEntry {
  wpId: string | null;
  source: MappingEvent['source'];
  seq: number;
}

export function mappingHead(
  events: MappingEvent[],
  mappingSeqMax = Number.POSITIVE_INFINITY,
): Map<string, MappingHeadEntry> {
  const head = new Map<string, MappingHeadEntry>();
  for (const e of events) {
    if (e.seq > mappingSeqMax) continue;
    const cur = head.get(e.ticketId);
    if (!cur || e.seq > cur.seq) head.set(e.ticketId, { wpId: e.wpId, source: e.source, seq: e.seq });
  }
  return head;
}

function attributeIds(obs: TicketObservation, kind: 'milestone' | 'category'): string[] {
  return obs.attributes.filter((a) => a.kind === kind).map((a) => a.id);
}

/** FR-22: strict priority order, first match wins. Pure. Reads `attributes` (AD-6). */
export function evaluateRules(rules: MappingRule[], obs: TicketObservation): string | null {
  const ordered = [...rules].sort((a, b) => a.priority - b.priority);
  for (const r of ordered) {
    switch (r.match.field) {
      case 'milestone':
        if (attributeIds(obs, 'milestone').includes(r.match.value)) return r.wpId;
        break;
      case 'category':
        if (attributeIds(obs, 'category').includes(r.match.value)) return r.wpId;
        break;
      case 'issueType':
        if (obs.issueTypeId === r.match.value) return r.wpId;
        break;
      case 'keyPrefix':
        if (obs.key.startsWith(r.match.value)) return r.wpId;
        break;
    }
  }
  return null;
}

/**
 * FR-22 "manual wins": rules are only applied to Tickets whose head is not manual
 * (Dispositions count as manual). `release` clears the head for rules and is re-evaluable
 * (story 5.9 / A4). Returns the events that should be appended.
 */
export function applyRules(
  rules: MappingRule[],
  tickets: TicketObservation[],
  head: Map<string, MappingHeadEntry>,
  seqFrom: number,
  at: string,
): MappingEvent[] {
  let seq = seqFrom;
  const out: MappingEvent[] = [];
  for (const t of tickets) {
    const cur = head.get(t.trackerIssueId);
    if (cur && (cur.source === 'manual' || cur.source === 'disposition')) continue;
    const wpId = evaluateRules(rules, t);
    if ((cur?.wpId ?? null) === wpId) continue;
    if (wpId === null && !cur) continue;
    out.push({
      seq: seq++,
      ticketId: t.trackerIssueId,
      wpId,
      source: 'rule',
      at,
      actor: 'system:rules',
    });
  }
  return out;
}
