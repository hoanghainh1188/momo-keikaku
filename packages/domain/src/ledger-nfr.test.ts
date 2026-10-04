/**
 * NFR-P1 write-path proof (story 5.5): derive ledger entries for a 2,000-Ticket
 * snapshot within well under the 5-minute budget. The durable DB writer path is
 * REQUIRE_DB-only (`packages/db/src/repositories/ingest/ingest-nfr.test.ts`);
 * this always-on unit pins the pure domain half in CI without Postgres.
 */
import { describe, expect, it } from 'vitest';
import { ingestSnapshot } from './ledger';
import type { SnapshotRead, TicketObservation } from './types';
import { hoursToMh } from './units';

const TICKET_COUNT = 2_000;
const BUDGET_MS = 5 * 60 * 1000;

function obs(i: number, hours: number): TicketObservation {
  return {
    trackerIssueId: `T-${i}`,
    key: `T-${i}`,
    title: `Ticket ${i}`,
    statusId: 'Open',
    estimateMh: null,
    actualMh: hoursToMh(hours),
    assigneeAccountId: 'acct-1',
    createdAt: '2026-06-01T00:00:00.000Z',
    parentIssueId: null,
    issueTypeId: 'Task',
    trackerProjectId: null,
    attributes: [],
  };
}

function snap(observedAt: string, tickets: TicketObservation[]): SnapshotRead {
  return {
    observedAt,
    hoursFieldPresent: true,
    tickets,
    adapterKind: 'fixture',
    complete: true,
    accounts: [],
    rateLimit: null,
  };
}

describe('NFR-P1 ingestSnapshot derive (story 5.5)', () => {
  it(`derives Opening Balances for ${TICKET_COUNT} tickets under the 5-minute budget`, () => {
    const tickets = Array.from({ length: TICKET_COUNT }, (_, i) => obs(i, 1 + (i % 8)));
    const next = snap('2026-09-01T09:00:00.000Z', tickets);
    const started = performance.now();
    const result = ingestSnapshot({
      prev: null,
      next,
      activeBaselineVersionSeq: 1,
      seqFrom: 1,
      approvalRecordedAt: '2026-09-01T00:00:00.000Z',
    });
    const elapsed = performance.now() - started;
    expect(result.entries).toHaveLength(TICKET_COUNT);
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });
});
