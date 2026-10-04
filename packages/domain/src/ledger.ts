import type { AdapterKind, LedgerEntry, SnapshotRead, TicketObservation } from './types';
import type { Mh } from './units';

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
  /**
   * Client approval instant (story 5.2 / FR-17). Required; `null` refuses ingest.
   */
  approvalRecordedAt: Date | string | null;
}

export interface IngestResult {
  entries: LedgerEntry[];
  /** FR-42: Tickets that were in the previous snapshot and are no longer in scope. */
  leftScope: { ticketId: string; key: string }[];
  /** AD-8: basis detected from the data, never from a plan name. */
  measurementBasis: 'hours' | 'count';
  nextSeq: number;
}

/**
 * FR-17 / story 5.2: ingest refuses a Connector with no client approval.
 * Callers record the refusal as a failed attempt with a PM-visible reason.
 */
export class ApprovalRequiredError extends Error {
  readonly code = 'approval_required' as const;

  constructor() {
    super('Connector has no client approval; ingest refused');
    this.name = 'ApprovalRequiredError';
  }
}

/**
 * Domain gate for FR-17: `approval_recorded_at` must be present before ingest.
 * Pass the column value (null when missing).
 */
export function requireConnectorApproval(
  approvalRecordedAt: Date | string | null | undefined,
): asserts approvalRecordedAt is Date | string {
  if (approvalRecordedAt == null) {
    throw new ApprovalRequiredError();
  }
}

/**
 * AD-6 / AR-14: operator-alert shape when a Connector's adapter kind changes between snapshots.
 * Callers surface this to the operator channel; it is not a PM-visible soft failure.
 */
export class AdapterKindMismatchError extends Error {
  readonly kind = 'operator-alert' as const;
  readonly code = 'adapter_kind_mismatch' as const;
  readonly previousKind: AdapterKind | undefined;
  readonly nextKind: AdapterKind | undefined;

  constructor(previousKind: AdapterKind | undefined, nextKind: AdapterKind | undefined) {
    super(
      `adapter kind changed from ${previousKind ?? '(none)'} to ${nextKind ?? '(none)'}; ingest refused`,
    );
    this.name = 'AdapterKindMismatchError';
    this.previousKind = previousKind;
    this.nextKind = nextKind;
  }
}

export function ingestSnapshot(input: IngestInput): IngestResult {
  const { prev, next, activeBaselineVersionSeq } = input;

  // FR-17: missing client approval always refuses (story 5.2).
  requireConnectorApproval(input.approvalRecordedAt ?? null);

  // AD-6: refuse a kind change against the previous snapshot (operator alert).
  // Skip when either side omits adapterKind (older in-memory shapes); both must be set.
  if (
    prev !== null &&
    prev.adapterKind != null &&
    next.adapterKind != null &&
    prev.adapterKind !== next.adapterKind
  ) {
    throw new AdapterKindMismatchError(prev.adapterKind, next.adapterKind);
  }

  let seq = input.seqFrom;
  const entries: LedgerEntry[] = [];

  const prevByTicket = new Map<string, TicketObservation>();
  if (prev) for (const t of prev.tickets) prevByTicket.set(t.trackerIssueId, t);

  const isFirstSnapshot = prev === null;

  for (const t of next.tickets) {
    const before = prevByTicket.get(t.trackerIssueId);
    const prevMh = before?.actualMh ?? 0n;
    const nowMh = t.actualMh ?? 0n;

    if (!before) {
      // FR-42 first sighting.
      if (nowMh === 0n) continue;
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
    if (delta === 0n) continue;
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
): { ok: boolean; violations: { ticketId: string; ledger: Mh; observed: Mh }[] } {
  const byTicket = new Map<string, Mh>();
  for (const e of entries) byTicket.set(e.ticketId, (byTicket.get(e.ticketId) ?? 0n) + e.deltaMh);
  const violations: { ticketId: string; ledger: Mh; observed: Mh }[] = [];
  for (const t of lastSnapshot.tickets) {
    const ledger = byTicket.get(t.trackerIssueId) ?? 0n;
    const observed = t.actualMh ?? 0n;
    if (ledger !== observed) violations.push({ ticketId: t.trackerIssueId, ledger, observed });
  }
  return { ok: violations.length === 0, violations };
}
