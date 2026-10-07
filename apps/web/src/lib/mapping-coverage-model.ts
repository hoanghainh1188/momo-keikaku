/**
 * Pure Mapping › Coverage helpers (story 5.11) — basis toggle, segment filter paging,
 * and table rows that mirror the Scope Ledger Bar figures (UX-DR18 / UX-DR26).
 */
import type { Mh, Ratio } from '@momo/domain/present';

/** Page size when a Scope Ledger segment filters the Tickets list. */
export const BUCKET_PAGE_SIZE = 50;

export type CoverageTicket = {
  readonly trackerIssueId: string;
  readonly key: string;
  readonly title: string;
  readonly categoryIds: readonly string[];
  readonly statusId: string;
  readonly mh: bigint;
  readonly wpId: string | null;
  readonly wpLabel: string | null;
  readonly source: string;
  readonly ownerConnectorId: string;
  readonly ticketShareBucket: string;
  readonly hourShareBucket: string;
  readonly inCatchAllOverflow: boolean;
};

export type CoverageConnectorView = {
  connectorId: string;
  label: string;
  measurementBasis: 'hours' | 'count';
  ticketShare: {
    counts: { mapped: number; catchAll: number; unmapped: number; total: number };
    segments: { key: string; label: string; count: number; share: Ratio }[];
  };
  hourShare:
    | {
        kind: 'value';
        segments: { key: string; label: string; mh: Mh; share: Ratio }[];
        mappedExcludingCatchAll: Ratio;
        totalMh: Mh;
      }
    | { kind: 'unavailable'; reasonCode: string };
};

export type ScopeLedgerSegment = {
  key: string;
  label: string;
  mh?: Mh;
  count?: number;
  share: Ratio;
};

/** Rows the "Show as table" toggle renders — same figures as the bar segments. */
export type LedgerTableRow = {
  key: string;
  label: string;
  /** Ticket mode: count. Hours mode: milli-hours (`Mh`). */
  quantity: number | Mh;
  share: Ratio;
};

export function ticketsInBucket(
  allTickets: readonly CoverageTicket[],
  filter: {
    connectorId: string;
    basis: 'hours' | 'tickets';
    segmentKey: string;
    page: number;
  },
): { tickets: CoverageTicket[]; total: number } {
  const filtered = allTickets.filter((t) => {
    if (filter.connectorId !== 'project-total' && t.ownerConnectorId !== filter.connectorId) {
      return false;
    }
    if (filter.basis === 'tickets') {
      return t.ticketShareBucket === filter.segmentKey;
    }
    if (filter.segmentKey === 'catch-all-overflow') {
      return t.inCatchAllOverflow;
    }
    return t.hourShareBucket === filter.segmentKey;
  });
  const page = Math.max(0, filter.page);
  const start = page * BUCKET_PAGE_SIZE;
  return {
    tickets: filtered.slice(start, start + BUCKET_PAGE_SIZE),
    total: filtered.length,
  };
}

/** Hours ↔ Ticket-share toggle: Ticket mode = 3 FR-23 buckets; hours = FR-20 or unavailable. */
export function segmentsFor(
  row: CoverageConnectorView,
  basis: 'hours' | 'tickets',
): {
  segments: ScopeLedgerSegment[];
  unavailableReason: string | null;
  totalMh: Mh;
} {
  if (basis === 'tickets') {
    return {
      segments: row.ticketShare.segments.map((s) => ({
        key: s.key,
        label: s.label,
        count: s.count,
        mh: 0n,
        share: s.share,
      })),
      unavailableReason: null,
      totalMh: 0n,
    };
  }
  if (row.hourShare.kind === 'unavailable') {
    return {
      segments: [],
      unavailableReason: row.hourShare.reasonCode,
      totalMh: 0n,
    };
  }
  return {
    segments: row.hourShare.segments.map((s) => ({
      key: s.key,
      label: s.label,
      mh: s.mh,
      share: s.share,
    })),
    unavailableReason: null,
    totalMh: row.hourShare.totalMh,
  };
}

/**
 * Table body for "Show as table": one row per segment with the same key / share / quantity
 * the bar uses (hours string left to the presenter; here mh/count stay numeric).
 */
export function ledgerTableRows(
  segments: readonly ScopeLedgerSegment[],
  basis: 'hours' | 'tickets',
): LedgerTableRow[] {
  return segments.map((s) => ({
    key: s.key,
    label: s.label,
    quantity: basis === 'tickets' ? (s.count ?? 0) : (s.mh ?? 0n),
    share: s.share,
  }));
}

/** Adjacent-text payload: same segment set the bar and table read (i18n applied in the component). */
export function adjacentSegmentKeys(segments: readonly ScopeLedgerSegment[]): string[] {
  return segments.map((s) => s.key);
}
