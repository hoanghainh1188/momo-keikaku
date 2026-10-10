import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixtureReplayOn } from './fixture-replay';
function memoryCursor() {
    const store = new Map();
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
function writeScenario(root, scenario, pages) {
    const dir = join(root, 'fixtures', 'backlog', scenario);
    mkdirSync(dir, { recursive: true });
    pages.forEach((page, i) => {
        writeFileSync(join(dir, `${String(i + 1).padStart(4, '0')}.json`), `${JSON.stringify(page, null, 1)}\n`);
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
        const first = await adapter.readScope({
            connectorId: 'con-1',
            site: 'hours-mini',
            timeAnchorIso: '2026-09-16T09:00:00.000Z',
        }, {});
        expect(first.adapterKind).toBe('fixture');
        expect(first.complete).toBe(false);
        expect(first.hoursFieldPresent).toBe(true);
        expect(first.observedAt).toBe('2026-09-15T09:00:00.000Z');
        expect(first.tickets).toHaveLength(1);
        expect(first.tickets[0].attributes).toEqual([{ kind: 'milestone', id: 'Phase2-Sprint1' }]);
        expect(first.accounts[0].accountId).toBe('bk-1001');
        expect(await cursor.get('con-1')).toBe(1);
        const second = await adapter.readScope({
            connectorId: 'con-1',
            site: 'hours-mini',
            timeAnchorIso: '2026-09-16T09:00:00.000Z',
        }, {});
        expect(second.complete).toBe(true);
        expect(second.tickets[0].actualMh).toBe(800n);
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
        await adapter.readScope({ connectorId: 'a', site: 'no-hours', timeAnchorIso: '2026-09-16T09:00:00.000Z' }, {});
        expect(await cursor.get('a')).toBe(1);
        expect(await cursor.get('b')).toBe(0);
        const b = await adapter.readScope({ connectorId: 'b', site: 'no-hours', timeAnchorIso: '2026-09-16T09:00:00.000Z' }, {});
        expect(b.hoursFieldPresent).toBe(false);
        expect(b.tickets[0].actualMh).toBeNull();
        expect(b.accounts).toEqual([{ accountId: 'bk-1001', displayName: 'bk-1001' }]);
    });
    it('replays committed page-shift / leave-and-return / scope-change scenarios', async () => {
        const cursor = memoryCursor();
        const adapter = fixtureReplayOn({ cursor });
        const anchor = '2026-09-16T09:00:00.000Z';
        const pageShift = await adapter.readScope({ connectorId: 'ps', site: 'page-shift', timeAnchorIso: anchor }, {});
        expect(pageShift.complete).toBe(false);
        expect(pageShift.tickets.map((t) => t.trackerIssueId).sort()).toEqual(['bk-ps-1', 'bk-ps-2']);
        const pageShift2 = await adapter.readScope({ connectorId: 'ps', site: 'page-shift', timeAnchorIso: anchor }, {});
        expect(pageShift2.tickets.map((t) => t.trackerIssueId).sort()).toEqual([
            'bk-ps-1',
            'bk-ps-3',
        ]);
        const leave1 = await adapter.readScope({ connectorId: 'lr', site: 'leave-and-return', timeAnchorIso: anchor }, {});
        const leave2 = await adapter.readScope({ connectorId: 'lr', site: 'leave-and-return', timeAnchorIso: anchor }, {});
        const leave3 = await adapter.readScope({ connectorId: 'lr', site: 'leave-and-return', timeAnchorIso: anchor }, {});
        const leave4 = await adapter.readScope({ connectorId: 'lr', site: 'leave-and-return', timeAnchorIso: anchor }, {});
        expect(leave1.tickets.map((t) => t.trackerIssueId).sort()).toEqual(['bk-lr-gone', 'bk-lr-keep']);
        expect(leave2.tickets.map((t) => t.trackerIssueId)).toEqual(['bk-lr-keep']);
        // Story 5.6: two consecutive complete absences before return (durable left_scope).
        expect(leave3.tickets.map((t) => t.trackerIssueId)).toEqual(['bk-lr-keep']);
        expect(leave4.tickets.map((t) => t.trackerIssueId).sort()).toEqual(['bk-lr-gone', 'bk-lr-keep']);
        const scope1 = await adapter.readScope({ connectorId: 'sc', site: 'scope-change', timeAnchorIso: anchor }, {});
        const scope2 = await adapter.readScope({ connectorId: 'sc', site: 'scope-change', timeAnchorIso: anchor }, {});
        expect(scope1.tickets.map((t) => t.trackerIssueId).sort()).toEqual(['bk-sc-a', 'bk-sc-b']);
        expect(scope2.tickets.map((t) => t.trackerIssueId)).toEqual(['bk-sc-c']);
        expect(await cursor.get('sc')).toBe(2);
    });
});
