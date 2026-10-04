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
  /**
   * Cumulative Σ delta_mh per Ticket already on the ledger (writer supplies). Used when
   * hours reappear after null/`hours_cleared` or after left_scope so the adjusting delta
   * keeps the invariant (story 5.6 / FR-42).
   */
  priorLedgerMhByTicket?: ReadonlyMap<string, Mh>;
  /**
   * Story 5.6: true when this snapshot's Connector `scope_seq` is greater than `prev.scope_seq`
   * — the first complete read after a recorded `connector_scope_event`.
   */
  scopeChangedSincePrev?: boolean;
}

export interface IngestResult {
  entries: LedgerEntry[];
  /**
   * FR-42 / AR-15: Tickets absent from this complete read that were in `prev`.
   * Absence candidates for the writer — durable `left_scope` needs two consecutive complete
   * absences (story 5.6); the domain does not mark durability.
   */
  leftScope: { ticketId: string; key: string }[];
  /**
   * AR-15: Tickets whose `actualMh` transitioned value→null. Writer sets `hours_cleared` on
   * their observations; no ledger entry is produced.
   */
  hoursCleared: { ticketId: string; key: string }[];
  /** AD-8: basis detected from the data, never from a plan name. */
  measurementBasis: 'hours' | 'count';
  nextSeq: number;
}

/** True when `createdAt` is at or before `prev.observedAt` (mid-flight OB clock). */
function createdAtOnOrBeforePrev(createdAt: string, prevObservedAt: string): boolean {
  const createdMs = Date.parse(createdAt);
  const prevMs = Date.parse(prevObservedAt);
  if (!Number.isFinite(createdMs) || !Number.isFinite(prevMs)) return false;
  return createdMs <= prevMs;
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
  if (typeof approvalRecordedAt === 'string' && approvalRecordedAt.trim() === '') {
    throw new ApprovalRequiredError();
  }
  if (approvalRecordedAt instanceof Date && Number.isNaN(approvalRecordedAt.getTime())) {
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

/**
 * AR-15 / AR-36: post-commit ledger invariant failed. Callers alert the operator and
 * must not leave a partial write committed.
 */
export class LedgerInvariantError extends Error {
  readonly kind = 'operator-alert' as const;
  readonly code = 'ledger_invariant_broken' as const;
  readonly violations: { ticketId: string; ledger: Mh; observed: Mh }[];

  constructor(violations: { ticketId: string; ledger: Mh; observed: Mh }[]) {
    super(
      `ledger invariant broken for ${violations.length} ticket(s); Σ delta_mh ≠ last observed actualMh`,
    );
    this.name = 'LedgerInvariantError';
    this.violations = violations;
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
  const hoursCleared: { ticketId: string; key: string }[] = [];

  const prevByTicket = new Map<string, TicketObservation>();
  if (prev) for (const t of prev.tickets) prevByTicket.set(t.trackerIssueId, t);

  const isFirstSnapshot = prev === null;

  for (const t of next.tickets) {
    const before = prevByTicket.get(t.trackerIssueId);
    const nowMh = t.actualMh;

    if (!before) {
      // FR-42 first sighting — null hours never move the ledger (AR-15).
      if (nowMh === null) continue;
      if (nowMh === 0n) continue;
      const priorSum = input.priorLedgerMhByTicket?.get(t.trackerIssueId) ?? 0n;
      // Story 5.6: OB only on Connector first snapshot, or first sighting after a recorded
      // scope change when the Ticket already existed (createdAt ≤ prev.observedAt) and this
      // Connector has no prior ledger history. Return-after-leave (prior Σ > 0) is always a
      // delta from last observed — never restart from 0 as OB.
      const midFlightOb =
        !isFirstSnapshot &&
        priorSum === 0n &&
        input.scopeChangedSincePrev === true &&
        prev !== null &&
        createdAtOnOrBeforePrev(t.createdAt, prev.observedAt);
      if (isFirstSnapshot || midFlightOb) {
        entries.push({
          seq: seq++,
          ticketId: t.trackerIssueId,
          kind: 'opening_balance',
          deltaMh: nowMh,
          windowStart: prev?.observedAt ?? null,
          windowEnd: next.observedAt,
          assigneeAccountId: t.assigneeAccountId,
          activeBaselineVersionSeq,
        });
        continue;
      }
      // New since prev, or return after absence/left_scope: delta vs prior Σ (0 when new).
      const delta = nowMh - priorSum;
      if (delta === 0n) continue;
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
      continue;
    }

    const prevMh = before.actualMh;

    // AR-15: value→null clears hours on the observation; no negative zeroing entry.
    if (prevMh !== null && nowMh === null) {
      hoursCleared.push({ ticketId: t.trackerIssueId, key: t.key });
      continue;
    }

    // Null→null: nothing. Null→numeric: only move the ledger by the gap vs prior Σ
    // (full amount when the Ticket had no prior entries). Value→null already cleared;
    // restoring hours must not double-count retained history (AR-15 invariant).
    if (prevMh === null && nowMh === null) continue;
    if (prevMh === null && nowMh !== null) {
      if (nowMh === 0n) continue;
      const priorSum = input.priorLedgerMhByTicket?.get(t.trackerIssueId) ?? 0n;
      const delta = nowMh - priorSum;
      if (delta === 0n) continue;
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
      continue;
    }

    // Numeric→numeric only from here.
    const delta = nowMh! - prevMh!;
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
    hoursCleared,
    measurementBasis: next.tickets.some((t) => t.actualMh !== null) ? 'hours' : 'count',
    nextSeq: seq,
  };
}

/**
 * FR-42 / AR-15 invariant: for every in-scope Ticket with a numeric last observation, the
 * sum of its ledger entries equals that `actualMh`. Null observed is "no hours demand" —
 * skipped so a cleared Ticket does not force a false zeroing.
 */
export function checkLedgerInvariant(
  entries: LedgerEntry[],
  lastSnapshot: SnapshotRead,
): { ok: boolean; violations: { ticketId: string; ledger: Mh; observed: Mh }[] } {
  const byTicket = new Map<string, Mh>();
  for (const e of entries) byTicket.set(e.ticketId, (byTicket.get(e.ticketId) ?? 0n) + e.deltaMh);
  const violations: { ticketId: string; ledger: Mh; observed: Mh }[] = [];
  for (const t of lastSnapshot.tickets) {
    if (t.actualMh === null) continue;
    const ledger = byTicket.get(t.trackerIssueId) ?? 0n;
    const observed = t.actualMh;
    if (ledger !== observed) violations.push({ ticketId: t.trackerIssueId, ledger, observed });
  }
  return { ok: violations.length === 0, violations };
}
