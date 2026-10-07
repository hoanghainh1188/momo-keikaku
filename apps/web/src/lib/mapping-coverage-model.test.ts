/**
 * Story 5.11 — matrix rows: Toggle basis, Show as table, Segment activate (paging).
 */
import { describe, expect, it } from 'vitest';
import { ratio } from '@momo/domain';
import {
  adjacentSegmentKeys,
  BUCKET_PAGE_SIZE,
  ledgerTableRows,
  segmentsFor,
  ticketsInBucket,
  type CoverageConnectorView,
  type CoverageTicket,
} from './mapping-coverage-model';

const r = (n: bigint, d: bigint) => ratio(n, d);

function hoursRow(overrides: Partial<CoverageConnectorView> = {}): CoverageConnectorView {
  return {
    connectorId: 'c1',
    label: 'Backlog',
    measurementBasis: 'hours',
    ticketShare: {
      counts: { mapped: 2, catchAll: 1, unmapped: 1, total: 4 },
      segments: [
        { key: 'mapped', label: 'Mapped', count: 2, share: r(2n, 4n) },
        { key: 'catch-all', label: 'Catch-all', count: 1, share: r(1n, 4n) },
        { key: 'unmapped', label: 'Unmapped', count: 1, share: r(1n, 4n) },
      ],
    },
    hourShare: {
      kind: 'value',
      mappedExcludingCatchAll: r(5n, 10n),
      totalMh: 10_000n,
      segments: [
        { key: 'mapped-baselined', label: 'Baselined', mh: 3_000n, share: r(3n, 10n) },
        { key: 'mapped-non-baselined', label: 'Non-baselined', mh: 2_000n, share: r(2n, 10n) },
        { key: 'catch-all', label: 'Catch-all', mh: 1_000n, share: r(1n, 10n) },
        { key: 'catch-all-overflow', label: 'Overflow', mh: 1_000n, share: r(1n, 10n) },
        { key: 'unmapped', label: 'Unmapped', mh: 3_000n, share: r(3n, 10n) },
      ],
    },
    ...overrides,
  };
}

function ticket(partial: Partial<CoverageTicket> & Pick<CoverageTicket, 'trackerIssueId'>): CoverageTicket {
  return {
    key: partial.trackerIssueId,
    title: 't',
    categoryIds: [],
    statusId: 's',
    mh: 0n,
    wpId: null,
    wpLabel: null,
    source: 'none',
    ownerConnectorId: 'c1',
    ticketShareBucket: 'mapped',
    hourShareBucket: 'mapped-baselined',
    inCatchAllOverflow: false,
    ...partial,
  };
}

describe('segmentsFor (Toggle basis)', () => {
  it('Ticket mode exposes the three FR-23 buckets', () => {
    const { segments, unavailableReason } = segmentsFor(hoursRow(), 'tickets');
    expect(unavailableReason).toBeNull();
    expect(segments.map((s) => s.key)).toEqual(['mapped', 'catch-all', 'unmapped']);
    expect(segments).toHaveLength(3);
  });

  it('Hours mode exposes the five FR-20 segments', () => {
    const { segments, unavailableReason, totalMh } = segmentsFor(hoursRow(), 'hours');
    expect(unavailableReason).toBeNull();
    expect(segments.map((s) => s.key)).toEqual([
      'mapped-baselined',
      'mapped-non-baselined',
      'catch-all',
      'catch-all-overflow',
      'unmapped',
    ]);
    expect(totalMh).toBe(10_000n);
  });

  it('Hours mode on a count-basis Connector returns unavailable, never empty-as-zero hours', () => {
    const row = hoursRow({
      measurementBasis: 'count',
      hourShare: { kind: 'unavailable', reasonCode: 'tracker_provides_no_hours' },
    });
    const { segments, unavailableReason } = segmentsFor(row, 'hours');
    expect(segments).toEqual([]);
    expect(unavailableReason).toBe('tracker_provides_no_hours');
    // Ticket toggle still works on the same row.
    expect(segmentsFor(row, 'tickets').segments).toHaveLength(3);
  });
});

describe('ledgerTableRows / adjacentSegmentKeys (Show as table)', () => {
  it('table rows carry the same keys and shares as the bar segments (hours)', () => {
    const { segments } = segmentsFor(hoursRow(), 'hours');
    const rows = ledgerTableRows(segments, 'hours');
    expect(rows.map((r) => r.key)).toEqual(segments.map((s) => s.key));
    expect(rows.map((r) => r.share)).toEqual(segments.map((s) => s.share));
    expect(rows.map((r) => r.quantity)).toEqual(segments.map((s) => s.mh));
    expect(adjacentSegmentKeys(segments)).toEqual(rows.map((r) => r.key));
  });

  it('table rows carry the same keys, counts and shares as the bar segments (tickets)', () => {
    const { segments } = segmentsFor(hoursRow(), 'tickets');
    const rows = ledgerTableRows(segments, 'tickets');
    expect(rows.map((r) => r.key)).toEqual(['mapped', 'catch-all', 'unmapped']);
    expect(rows.map((r) => r.quantity)).toEqual([2, 1, 1]);
    expect(adjacentSegmentKeys(segments)).toEqual(rows.map((r) => r.key));
  });
});

describe('ticketsInBucket (Segment activate)', () => {
  const many = Array.from({ length: BUCKET_PAGE_SIZE + 3 }, (_, i) =>
    ticket({
      trackerIssueId: `T-${i}`,
      ticketShareBucket: 'unmapped',
      hourShareBucket: 'unmapped',
    }),
  );

  it('pages all Tickets in the bucket, not only a top-N slice', () => {
    const page0 = ticketsInBucket(many, {
      connectorId: 'c1',
      basis: 'tickets',
      segmentKey: 'unmapped',
      page: 0,
    });
    expect(page0.total).toBe(BUCKET_PAGE_SIZE + 3);
    expect(page0.tickets).toHaveLength(BUCKET_PAGE_SIZE);

    const page1 = ticketsInBucket(many, {
      connectorId: 'c1',
      basis: 'tickets',
      segmentKey: 'unmapped',
      page: 1,
    });
    expect(page1.tickets).toHaveLength(3);
  });
});
