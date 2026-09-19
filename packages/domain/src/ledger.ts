import type { LedgerEntry, SnapshotRead, TicketObservation } from './types';

/**
 * FR-25 / FR-42 / AD-7: derive Actuals Ledger entries from the difference between
 * two consecutive Tracker Snapshots. This is the ONLY place deltas are derived.
 * Pure: the caller supplies the active Baseline sequence and the next seq.
 */
export interface IngestInput {
  prev: SnapshotRead | null;
  next: SnapshotRead;
  /** AD-7: the Baseline version active at ingest, by seq (adversarial review H3). */
  activeBaselineVersionSeq: number | null;
  /** next free ledger seq */
  seqFrom: number;
}

export interface IngestResult {
  entries: LedgerEntry[];
  /** FR-42: Tickets that were in the previous snapshot and are no longer in scope. */
  leftScope: { ticketId: string; key: string }[];
  /** AD-8: basis detected from the data, never from a plan name. */
  measurementBasis: 'hours' | 'count';
  nextSeq: number;
}

export function ingestSnapshot(input: IngestInput): IngestResult {
  const { prev, next, activeBaselineVersionSeq } = input;
  let seq = input.seqFrom;
  const entries: LedgerEntry[] = [];

  const prevByTicket = new Map<string, TicketObservation>();
  if (prev) for (const t of prev.tickets) prevByTicket.set(t.trackerIssueId, t);

  const isFirstSnapshot = prev === null;

  for (const t of next.tickets) {
    const before = prevByTicket.get(t.trackerIssueId);
    const prevMh = before?.actualMh ?? 0;
    const nowMh = t.actualMh ?? 0;

    if (!before) {
      // FR-42 first sighting.
      if (nowMh === 0) continue;
      const kind = isFirstSnapshot ? 'opening_balance' : 'delta';
      entries.push({
        seq: seq++,
        ticketId: t.trackerIssueId,
        kind,
        deltaMh: nowMh,
        windowStart: prev?.observedAt ?? null,
        windowEnd: next.observedAt,
        assigneeAccountId: t.assigneeAccountId,
        activeBaselineVersionSeq,
      });
      continue;
    }

    const delta = nowMh - prevMh;
    if (delta === 0) continue;
    // FR-25: negative deltas are recorded, never discarded.
    entries.push({
      seq: seq++,
      ticketId: t.trackerIssueId,
      kind: 'delta',
      deltaMh: delta,
      windowStart: prev!.observedAt,
      windowEnd: next.observedAt,
      assigneeAccountId: t.assigneeAccountId,
      activeBaselineVersionSeq,
    });
  }

  const nextIds = new Set(next.tickets.map((t) => t.trackerIssueId));
  const leftScope = (prev?.tickets ?? [])
    .filter((t) => !nextIds.has(t.trackerIssueId))
    .map((t) => ({ ticketId: t.trackerIssueId, key: t.key }));

  return {
    entries,
    leftScope,
    measurementBasis: next.tickets.some((t) => t.actualMh !== null) ? 'hours' : 'count',
    nextSeq: seq,
  };
}

/**
 * FR-42 invariant: for every in-scope Ticket, the sum of its ledger entries equals
 * its last observed actual hours.
 */
export function checkLedgerInvariant(
  entries: LedgerEntry[],
  lastSnapshot: SnapshotRead,
): { ok: boolean; violations: { ticketId: string; ledger: number; observed: number }[] } {
  const byTicket = new Map<string, number>();
  for (const e of entries) byTicket.set(e.ticketId, (byTicket.get(e.ticketId) ?? 0) + e.deltaMh);
  const violations: { ticketId: string; ledger: number; observed: number }[] = [];
  for (const t of lastSnapshot.tickets) {
    const ledger = byTicket.get(t.trackerIssueId) ?? 0;
    const observed = t.actualMh ?? 0;
    if (ledger !== observed) violations.push({ ticketId: t.trackerIssueId, ledger, observed });
  }
  return { ok: violations.length === 0, violations };
}
