import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixtureReplayOn, type FixtureCursorPort } from './fixture-replay';

function memoryCursor(): FixtureCursorPort & { store: Map<string, number> } {
  const store = new Map<string, number>();
  return {
    store,
    async get(connectorId) {
      return store.get(connectorId) ?? 0;
    },
    async set(connectorId, nextPageIndex) {
      store.set(connectorId, nextPageIndex);
    },
  };
}

function writeScenario(
  root: string,
  scenario: string,
  pages: Record<string, unknown>[],
): void {
  const dir = join(root, 'fixtures', 'backlog', scenario);
  mkdirSync(dir, { recursive: true });
  pages.forEach((page, i) => {
    writeFileSync(
      join(dir, `${String(i + 1).padStart(4, '0')}.json`),
      `${JSON.stringify(page, null, 1)}\n`,
    );
  });
}

const baseTicket = {
  trackerIssueId: 'bk-1',
  key: 'EC2-1',
  title: 'Synthetic ticket',
  statusId: 'Open',
  estimateMh: 1000,
  actualMh: 500,
  assigneeAccountId: 'bk-1001',
  createdAt: '2026-06-01T01:00:00.000Z',
  parentIssueId: null,
  issueTypeId: 'Task',
  trackerProjectId: 'EC2',
  attributes: [{ kind: 'milestone', id: 'Phase2-Sprint1' }],
};

describe('fixture-replay (story 5.1)', () => {
  it('reads pages via FixtureCursorPort and reports adapterKind fixture', async () => {
    const root = mkdtempSync(join(tmpdir(), 'momo-fixture-'));
    writeScenario(root, 'hours-mini', [
      {
        scenario: 'hours-mini',
        page: 1,
        observedAtOffsetHours: -24,
        recordedObservedAt: '2026-09-15T09:00:00.000Z',
        hoursFieldPresent: true,
        tickets: [baseTicket],
        accounts: [{ accountId: 'bk-1001', displayName: 'Linh' }],
      },
      {
        scenario: 'hours-mini',
        page: 2,
        observedAtOffsetHours: 0,
        recordedObservedAt: '2026-09-16T09:00:00.000Z',
        hoursFieldPresent: true,
        tickets: [{ ...baseTicket, actualMh: 800, statusId: 'Closed' }],
        accounts: [{ accountId: 'bk-1001', displayName: 'Linh' }],
      },
    ]);
    const cursor = memoryCursor();
    const adapter = fixtureReplayOn({ cursor, fixturesRoot: root });
    const first = await adapter.readScope(
      {
        connectorId: 'con-1',
        site: 'hours-mini',
        timeAnchorIso: '2026-09-16T09:00:00.000Z',
      },
      {},
    );
    expect(first.adapterKind).toBe('fixture');
    expect(first.complete).toBe(false);
    expect(first.hoursFieldPresent).toBe(true);
    expect(first.tickets).toHaveLength(1);
    expect(first.tickets[0]!.attributes).toEqual([{ kind: 'milestone', id: 'Phase2-Sprint1' }]);
    expect(first.accounts[0]!.accountId).toBe('bk-1001');
    expect(await cursor.get('con-1')).toBe(1);

    const second = await adapter.readScope(
      {
        connectorId: 'con-1',
        site: 'hours-mini',
        timeAnchorIso: '2026-09-16T09:00:00.000Z',
      },
      {},
    );
    expect(second.complete).toBe(true);
    expect(second.tickets[0]!.actualMh).toBe(800n);
    expect(await cursor.get('con-1')).toBe(2);
  });

  it('isolates cursors per connector', async () => {
    const root = mkdtempSync(join(tmpdir(), 'momo-fixture-'));
    writeScenario(root, 'no-hours', [
      {
        scenario: 'no-hours',
        page: 1,
        observedAtOffsetHours: 0,
        recordedObservedAt: '2026-09-16T09:00:00.000Z',
        hoursFieldPresent: false,
        tickets: [{ ...baseTicket, actualMh: null, estimateMh: null }],
      },
    ]);
    const cursor = memoryCursor();
    const adapter = fixtureReplayOn({ cursor, fixturesRoot: root });
    await adapter.readScope(
      { connectorId: 'a', site: 'no-hours', timeAnchorIso: '2026-09-16T09:00:00.000Z' },
      {},
    );
    expect(await cursor.get('a')).toBe(1);
    expect(await cursor.get('b')).toBe(0);
    const b = await adapter.readScope(
      { connectorId: 'b', site: 'no-hours', timeAnchorIso: '2026-09-16T09:00:00.000Z' },
      {},
    );
    expect(b.hoursFieldPresent).toBe(false);
    expect(b.tickets[0]!.actualMh).toBeNull();
  });
});
