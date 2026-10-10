import { describe, expect, it } from 'vitest';
import { checkLedgerInvariant, ingestSnapshot, mappingHead } from '@momo/domain';
import { assertLoadHistory, generateLoadFixture, loadFixtureFingerprint, LOAD_FIXTURE_SEED, LOAD_PROJECT_COUNT, LOAD_SEQ_BAND_PER_PROJECT, LOAD_TICKET_HISTORY, LOAD_TICKETS_PER_PROJECT, LOAD_WP_PER_PROJECT, loadProjectAsDemoState, loadWeek5Read, } from './load-generator';
const shape = generateLoadFixture();
describe('generateLoadFixture', () => {
    it('is deterministic for the fixed seed — Tickets, observations, Mappings and ledger included', () => {
        const a = generateLoadFixture(LOAD_FIXTURE_SEED);
        const b = generateLoadFixture(LOAD_FIXTURE_SEED);
        const fa = loadFixtureFingerprint(a);
        expect(fa).toBe(loadFixtureFingerprint(b));
        // The fingerprint really covers the Ticket half, not only the WP tree.
        expect(fa).toContain('obs:snap-load-1-w4:load-issue-1-2000:LOAD-1-2000:Load ticket 2000');
        expect(fa).toMatch(/\nmap:\d+:load-issue-1-\d+:wp-load-1-/);
        expect(fa).toMatch(/\nled:1:load-issue-1-1:opening_balance:/);
        expect(loadFixtureFingerprint(generateLoadFixture(LOAD_FIXTURE_SEED + 1))).not.toBe(fa);
    });
    it('emits 5 Projects × 500 Work Packages plus Resources', () => {
        expect(shape.projects).toHaveLength(LOAD_PROJECT_COUNT);
        expect(shape.resources.length).toBeGreaterThan(0);
        for (const project of shape.projects) {
            expect(project.wps).toHaveLength(LOAD_WP_PER_PROJECT);
            const leaves = project.wps.filter((w) => w.isLeaf);
            expect(leaves.every((w) => w.assignedResourceIds.length > 0)).toBe(true);
        }
    });
    it('keeps the same numbers under another id namespace', () => {
        const probe = generateLoadFixture(LOAD_FIXTURE_SEED, { namespace: 'xtload' });
        expect(probe.tenant.id).toBe('ten-xtload');
        expect(probe.projects[0].id).toBe('prj-xtload-1');
        expect(probe.projects[0].snapshots[0].snapshotId).toBe('snap-xtload-1-w1');
        const fp = loadFixtureFingerprint(probe).replaceAll('xtload', 'load');
        expect(fp).toBe(loadFixtureFingerprint(shape));
    });
});
describe('the Ticket half (story 5.15)', () => {
    it('replays 1,700 → 1,800 → 1,900 → 2,000 complete snapshots per Project, none leaving', () => {
        for (const project of shape.projects) {
            expect(project.snapshots.map((s) => s.tickets.length)).toEqual([...LOAD_TICKET_HISTORY]);
            expect(project.snapshots.every((s) => s.complete === true)).toBe(true);
            expect(project.snapshots.every((s) => s.adapterKind === 'fixture')).toBe(true);
            expect(project.snapshots.at(-1).tickets).toHaveLength(LOAD_TICKETS_PER_PROJECT);
            for (let w = 1; w < project.snapshots.length; w += 1) {
                const before = new Set(project.snapshots[w - 1].tickets.map((t) => t.trackerIssueId));
                const now = new Set(project.snapshots[w].tickets.map((t) => t.trackerIssueId));
                expect([...before].every((id) => now.has(id))).toBe(true);
            }
            const ids = project.snapshots.at(-1).tickets.map((t) => t.trackerIssueId);
            expect(new Set(ids).size).toBe(ids.length);
        }
    });
    it('throws when the history drifts', () => {
        const project = shape.projects[0];
        const short = project.snapshots.map((s, i) => i === 3 ? { ...s, tickets: s.tickets.slice(1) } : s);
        expect(() => assertLoadHistory(project.id, short)).toThrow(/history drifted/);
        const incomplete = project.snapshots.map((s, i) => (i === 0 ? { ...s, complete: false } : s));
        expect(() => assertLoadHistory(project.id, incomplete)).toThrow(/history drifted/);
        expect(() => assertLoadHistory(project.id, project.snapshots.slice(0, 3))).toThrow(/history drifted/);
    });
    it('uses synthetic keys, titles and bk-load-* accounts — every one a load Resource', () => {
        const accounts = new Set(shape.resources.map((r) => r.accountId));
        expect([...accounts].every((a) => /^bk-load-\d+$/.test(a))).toBe(true);
        shape.projects.forEach((project, i) => {
            for (const t of project.snapshots.at(-1).tickets) {
                expect(t.key).toMatch(new RegExp(`^LOAD-${i + 1}-\\d+$`));
                expect(t.title).toMatch(/^Load ticket \d+$/);
                expect(accounts.has(t.assigneeAccountId)).toBe(true);
            }
            for (const snap of project.snapshots) {
                expect(new Set((snap.accounts ?? []).map((a) => a.accountId))).toEqual(accounts);
            }
        });
    });
    it('books Opening Balances on week 1 and deltas after, and Σ per Ticket = last actual hours', () => {
        for (let i = 0; i < LOAD_PROJECT_COUNT; i += 1) {
            const state = loadProjectAsDemoState(shape, i);
            const [w1, ...later] = state.snapshots;
            const byWeek = (at) => state.ledger.filter((e) => e.windowEnd === at);
            expect(byWeek(w1.observedAt).every((e) => e.kind === 'opening_balance')).toBe(true);
            expect(byWeek(w1.observedAt)).toHaveLength(LOAD_TICKET_HISTORY[0]);
            for (const snap of later) {
                const entries = byWeek(snap.observedAt);
                expect(entries.length).toBeGreaterThan(100);
                expect(entries.every((e) => e.kind === 'delta')).toBe(true);
            }
            expect(checkLedgerInvariant(state.ledger, state.snapshots.at(-1)).ok).toBe(true);
            expect(state.leftScope).toHaveLength(0);
            expect(state.measurementBasis).toBe('hours');
        }
    });
    it('maps ~70% by hand, ~15% by two rules, ~5% to the Catch-all, the rest Unmapped', () => {
        const state = loadProjectAsDemoState(shape, 0);
        const catchAll = state.wps.find((w) => w.isCatchAll).id;
        const head = mappingHead(state.mappingEvents);
        const tally = { manual: 0, rule: 0, catchAll: 0, unmapped: 0 };
        for (const t of state.snapshots.at(-1).tickets) {
            const h = head.get(t.trackerIssueId);
            if (!h || h.wpId === null)
                tally.unmapped += 1;
            else if (h.wpId === catchAll)
                tally.catchAll += 1;
            else if (h.source === 'rule')
                tally.rule += 1;
            else
                tally.manual += 1;
        }
        const n = LOAD_TICKETS_PER_PROJECT;
        expect(tally).toEqual({ manual: 0.7 * n, rule: 0.15 * n, catchAll: 0.05 * n, unmapped: 0.1 * n });
        expect(state.mappingRules).toHaveLength(2);
        const ruleIds = new Set(state.mappingEvents.filter((m) => m.source === 'rule').map((m) => m.ruleId));
        expect(ruleIds).toEqual(new Set(state.mappingRules.map((r) => r.id)));
    });
    it('gives each Project Baseline seq projectIndex + 1', () => {
        expect(loadProjectAsDemoState(shape, 0).baselineVersions[0].seq).toBe(1);
        expect(loadProjectAsDemoState(shape, 4).baselineVersions[0].seq).toBe(5);
    });
    it('allocates each Project its own ledger / Mapping seq band', () => {
        const seqs = [0, 1, 2, 3, 4].map((i) => {
            const state = loadProjectAsDemoState(shape, i);
            const all = [...state.ledger.map((e) => e.seq), ...state.mappingEvents.map((m) => m.seq)];
            return { min: Math.min(...all), max: Math.max(...all) };
        });
        seqs.forEach(({ min, max }, i) => {
            expect(min).toBe(i * LOAD_SEQ_BAND_PER_PROJECT + 1);
            expect(max).toBeLessThan((i + 1) * LOAD_SEQ_BAND_PER_PROJECT);
        });
    });
    it('builds a week-5 read: same 2,000 Tickets, hours advanced, only deltas vs week 4', () => {
        const state = loadProjectAsDemoState(shape, 0);
        const week4 = state.snapshots.at(-1);
        const week5 = loadWeek5Read(shape, 0);
        expect(week5.complete).toBe(true);
        expect(week5.tickets.map((t) => t.trackerIssueId)).toEqual(week4.tickets.map((t) => t.trackerIssueId));
        expect(Date.parse(week5.observedAt) - Date.parse(week4.observedAt)).toBe(7 * 86_400_000);
        const before = new Map(week4.tickets.map((t) => [t.trackerIssueId, t.actualMh]));
        expect(week5.tickets.every((t) => t.actualMh >= before.get(t.trackerIssueId))).toBe(true);
        const advanced = week5.tickets.filter((t) => t.actualMh > before.get(t.trackerIssueId));
        expect(advanced.length).toBeGreaterThan(1_000);
        const derived = ingestSnapshot({
            prev: week4,
            next: week5,
            activeBaselineVersionSeq: null,
            seqFrom: 1,
            approvalRecordedAt: '2026-09-01T00:00:00.000Z',
        });
        expect(derived.entries).toHaveLength(advanced.length);
        expect(derived.entries.every((e) => e.kind === 'delta')).toBe(true);
        expect(checkLedgerInvariant([...state.ledger, ...derived.entries], week5).ok).toBe(true);
        expect(loadWeek5Read(shape, 0)).toEqual(week5);
    });
});
