import { describe, expect, it } from 'vitest';
import type { RequestContext } from '../authz/request-context';
import type { ConnectorPublicRow, ConnectorWriteDeps, ConnectorWriteScope } from '../ports/connector-write';
import type { IngestSnapshotQueuePort } from '../ports/ingest-snapshot-queue';
import {
  HOURLY_INTERVAL_MS,
  OFF_WINDOW_INTERVAL_MS,
  SEARCH_BUDGET_SLOWDOWN_MESSAGE,
  dueWatermark,
  estimateSearchCalls,
  exceedsSearchBudget,
  getSnapshotPinState,
  isConnectorDue,
  listSnapshotAttempts,
  nextScheduledAt,
  rateLimitStartAfter,
  requestSnapshotRefresh,
  selectDueConnectors,
} from './connector-schedule';

const AT = new Date('2026-10-05T01:00:00.000Z'); // 10:00 JST Monday
const CTX: RequestContext = {
  tenantId: 'ten-a',
  userId: 'usr-pm',
  roles: ['pm'],
  projectIds: ['prj-1'],
  locale: 'en',
};

function connector(overrides?: Partial<ConnectorPublicRow>): ConnectorPublicRow {
  return {
    id: 'con-1',
    projectId: 'prj-1',
    adapter: 'backlog',
    site: 'example.backlog.jp',
    scope: 'EC2',
    spaceLabel: 'example.backlog.jp',
    approvalRecordedAt: AT,
    approvalName: 'A',
    lastErrorCode: null,
    lastErrorMessage: null,
    lastErrorAt: null,
    hasCredentials: true,
    searchLimit: 150,
    ...overrides,
  };
}

describe('schedule pure helpers (story 5.4)', () => {
  it('computes Search-budget overrun with ceil(N/100)+2 vs 25% of search_limit', () => {
    expect(estimateSearchCalls(1900)).toBe(21);
    expect(exceedsSearchBudget(1900, 80)).toBe(true);
    expect(exceedsSearchBudget(40, 150)).toBe(false);
  });

  it('takes max(snapshot, attempt) as the due watermark', () => {
    const snap = new Date('2026-10-05T00:00:00.000Z');
    const attempt = new Date('2026-10-05T02:00:00.000Z');
    expect(dueWatermark(snap, attempt)).toEqual(attempt);
    expect(dueWatermark(attempt, snap)).toEqual(attempt);
    expect(dueWatermark(null, snap)).toEqual(snap);
    expect(dueWatermark(null, null)).toBeNull();
  });

  it('enqueues hourly inside the window and every 6 h outside or on Search slowdown', () => {
    const last = new Date(AT.getTime() - HOURLY_INTERVAL_MS);
    expect(
      isConnectorDue({
        now: AT,
        lastActivityAt: last,
        inBusinessWindow: true,
        searchBudgetSlowdown: false,
      }),
    ).toBe(true);
    expect(
      isConnectorDue({
        now: AT,
        lastActivityAt: new Date(AT.getTime() - HOURLY_INTERVAL_MS + 1),
        inBusinessWindow: true,
        searchBudgetSlowdown: false,
      }),
    ).toBe(false);
    expect(
      isConnectorDue({
        now: AT,
        lastActivityAt: new Date(AT.getTime() - OFF_WINDOW_INTERVAL_MS + 1),
        inBusinessWindow: false,
        searchBudgetSlowdown: false,
      }),
    ).toBe(false);
    expect(
      isConnectorDue({
        now: AT,
        lastActivityAt: last,
        inBusinessWindow: true,
        searchBudgetSlowdown: true,
      }),
    ).toBe(false);
  });

  it('paces when remaining is exhausted and resetAt is in the future', () => {
    const resetAt = new Date(AT.getTime() + 60_000).toISOString();
    expect(rateLimitStartAfter({ remaining: 0, resetAt }, AT)?.toISOString()).toBe(resetAt);
    expect(rateLimitStartAfter({ remaining: 5, resetAt }, AT)).toBeNull();
    expect(rateLimitStartAfter({ remaining: 0, resetAt: AT.toISOString() }, AT)).toBeNull();
  });

  it('selects due Connectors and flags Search-budget slowdown', () => {
    const due = selectDueConnectors(
      [
        {
          connector: connector({ searchLimit: 80 }),
          lastActivityAt: new Date(AT.getTime() - OFF_WINDOW_INTERVAL_MS),
          latestTicketCount: 1900,
        },
      ],
      { now: AT },
    );
    expect(due).toHaveLength(1);
    expect(due[0]!.searchBudgetSlowdown).toBe(true);
  });

  it('nextScheduledAt is lastActivity + interval when still waiting', () => {
    const last = new Date(AT.getTime() - 10 * 60_000);
    const next = nextScheduledAt({
      now: AT,
      lastActivityAt: last,
      inBusinessWindow: true,
      searchBudgetSlowdown: false,
    });
    expect(next.getTime()).toBe(last.getTime() + HOURLY_INTERVAL_MS);
  });
});

describe('requestSnapshotRefresh / pin / attempts (story 5.4)', () => {
  function depsWith(queue: IngestSnapshotQueuePort) {
    const attempts = [
      {
        seq: 1,
        connectorId: 'con-1',
        reasonCode: 'read_incomplete',
        message: 'incomplete',
        attemptedAt: AT,
      },
    ];
    const connectorWrite = {
      projectAnchor: async () => AT,
      findConnector: async () => connector(),
      findConnectorForProject: async () => connector(),
      listConnectors: async () => [connector()],
      insertConnector: async () => {},
      rotateCredentials: async () => {},
      updateScope: async () => {},
      appendScopeEvent: async () => 1,
      latestScopeSeq: async () => 1,
      appendSnapshotAttempt: async () => {},
      listSnapshotAttempts: async () => attempts,
      latestAttemptAt: async () => AT,
      latestSnapshot: async () => ({
        id: 'snap-2',
        connectorId: 'con-1',
        observedAt: new Date(AT.getTime() - 30 * 60_000),
        ticketCount: 40,
      }),
      latestSnapshotForProject: async () => ({
        id: 'snap-2',
        connectorId: 'con-1',
        observedAt: new Date(AT.getTime() - 30 * 60_000),
        ticketCount: 40,
      }),
      setLastError: async () => {},
      countMappingEventsForProject: async () => 0,
      loadEncryptedCredentials: async () => null,
    };
    const deps: ConnectorWriteDeps<{ marker: string }> & { queue: IngestSnapshotQueuePort } = {
      handle: { marker: 'h' },
      clock: { now: () => AT },
      ids: { next: () => 'id' },
      crypto: {
        keyId: 'k',
        encrypt: () => ({
          ciphertext: Buffer.from('c'),
          nonce: Buffer.from('n-----------'),
          keyId: 'k',
        }),
      },
      queue,
      transaction: async (_h, _t, work) => {
        const scope: ConnectorWriteScope = {
          connectorWrite,
          audit: { append: async () => {} },
        };
        return work(scope);
      },
    };
    return deps;
  }

  it('enqueues Refresh with singleton identity and refuses a viewer', async () => {
    const sent: unknown[] = [];
    const deps = depsWith({
      enqueue: async (input) => {
        sent.push(input);
      },
    });
    const result = await requestSnapshotRefresh(deps, CTX, { projectId: 'prj-1' });
    expect(result).toEqual({ ok: true, value: { connectorId: 'con-1' } });
    expect(sent).toEqual([{ tenantId: 'ten-a', projectId: 'prj-1', connectorId: 'con-1' }]);

    const viewer: RequestContext = { ...CTX, roles: ['client_viewer'] };
    const refused = await requestSnapshotRefresh(deps, viewer, { projectId: 'prj-1' });
    expect(refused.ok).toBe(false);
  });

  it('lists attempts and surfaces pin age, next run, slowdown, and Re-pin', async () => {
    const deps = depsWith({ enqueue: async () => {} });
    const attempts = await listSnapshotAttempts(deps, CTX, {
      projectId: 'prj-1',
      connectorId: 'con-1',
    });
    expect(attempts.ok && attempts.value[0]?.reasonCode).toBe('read_incomplete');

    const pin = await getSnapshotPinState(deps, CTX, {
      projectId: 'prj-1',
      reviewPinnedSnapshotId: 'snap-1',
    });
    expect(pin.ok).toBe(true);
    if (!pin.ok) return;
    expect(pin.value.snapshotAgeMinutes).toBe(30);
    expect(pin.value.newerThanReviewPin).toBe(true);
    expect(pin.value.slowdownMessage).toBeNull();
    expect(pin.value.connectors[0]?.spaceLabel).toBe('example.backlog.jp');
  });

  it('exposes Search-budget slowdown copy on the pin when over budget', async () => {
    const base = depsWith({ enqueue: async () => {} });
    const deps: typeof base = {
      ...base,
      transaction: async (handle, tenantId, work) =>
        base.transaction(handle, tenantId, async (scope) => {
          const over = connector({ searchLimit: 80 });
          return work({
            ...scope,
            connectorWrite: {
              ...scope.connectorWrite,
              listConnectors: async () => [over],
              findConnector: async () => over,
              latestSnapshot: async () => ({
                id: 'snap-big',
                connectorId: 'con-1',
                observedAt: AT,
                ticketCount: 1900,
              }),
              latestSnapshotForProject: async () => ({
                id: 'snap-big',
                connectorId: 'con-1',
                observedAt: AT,
                ticketCount: 1900,
              }),
            },
          });
        }),
    };
    const pin = await getSnapshotPinState(deps, CTX, { projectId: 'prj-1' });
    expect(pin.ok && pin.value.searchBudgetSlowdown).toBe(true);
    expect(pin.ok && pin.value.slowdownMessage).toBe(SEARCH_BUDGET_SLOWDOWN_MESSAGE);
  });
});
