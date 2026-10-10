import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mappingHead } from '@momo/domain';
import { createMappingRule, deleteMappingRule, getProjectMapping, getProjectReview, previewMappingRuleChange, reorderMappingRules, updateMappingRule, } from '../packages/app/src/use-cases';
import { closeAllPools, schema as s } from '../packages/db/src/client';
import { inTenantTransaction } from '../packages/db/src/tenant-transaction';
import { assertProbeTenantsDisjoint, buildProbeTenant, createProbeTenant, removeProbeTenant, } from '../packages/db/src/probe-tenants';
import { loadProjectBundle, loadReview } from '../packages/db/src/repo';
import { loadRuleEvaluation } from '../packages/db/src/repo-mapping-rules';
import { withTenant } from '../packages/db/src/with-tenant';
import { pmContextFor } from './request-context';
import { allRows, connectWriteHarness, idPort, owner, restrictedWriteDeps, rowCounts, targetOf, TEST_NOW, } from './write-harness';
/**
 * STORY 5.10 — MAPPING RULES AGAINST POSTGRES, as the restricted role (FR-22, AR-18, UX-DR22/23).
 *
 * The cross-tenant harness drives one happy path per rule write and proves isolation; this file
 * walks the I/O matrix on real rows: duplicate priority, summary target and unknown parent are
 * refused with nothing landing; the preview is exactly what the save then does; a deleted rule's
 * Tickets are re-evaluated against the remaining rules and the Review flags the ones it left
 * Unmapped, by name; a reorder keeps priorities unique; and no rule path writes a date or a
 * schedule run.
 */
const reachable = await connectWriteHarness({
    ownerUrl: process.env.DATABASE_URL,
    appUrl: process.env.APP_DATABASE_URL,
    requireDb: process.env.REQUIRE_DB === '1',
});
const PROBE = buildProbeTenant('xtprobe-r510', 962_000_000);
assertProbeTenantsDisjoint([PROBE]);
const IDS = idPort('xtr510-id');
const deps = () => restrictedWriteDeps(IDS);
const readDeps = () => ({
    handle: deps().handle,
    projectRead: { loadProjectBundle, loadReview, loadRuleEvaluation },
});
const ctx = pmContextFor(PROBE.tenantId, PROBE.projectId);
const projectId = PROBE.projectId;
const [FIRST, SECOND] = [...PROBE.state.fixture.mappingRules].sort((a, b) => a.priority - b.priority);
const leaf = PROBE.state.wps.find((w) => w.isLeaf && !w.isMilestone && !w.isCatchAll && w.id !== FIRST.wpId && w.id !== SECOND.wpId);
const summary = PROBE.state.wps.find((w) => !w.isLeaf);
/** A second mappable leaf, distinct from `leaf` and both fixture targets. */
const leaf2 = PROBE.state.wps.find((w) => w.isLeaf && !w.isMilestone && !w.isCatchAll && ![leaf.id, FIRST.wpId, SECOND.wpId].includes(w.id));
const connectorId = targetOf(PROBE, PROBE.tenantId).connectorId;
/** Σ `actuals_ledger_entry.delta_mh` of these Tickets — the cumulative hours a move carries. */
async function ledgerMh(ticketIds) {
    if (ticketIds.length === 0)
        return 0n;
    const rows = await withTenant(owner(), PROBE.tenantId, (tx) => tx
        .select({ mh: s.actualsLedgerEntry.deltaMh })
        .from(s.actualsLedgerEntry)
        .where(and(eq(s.actualsLedgerEntry.tenantId, PROBE.tenantId), inArray(s.actualsLedgerEntry.ticketId, [...ticketIds]))));
    return rows.reduce((sum, r) => sum + r.mh, 0n);
}
/** Appends a measurement basis event for the probe's Connector (owner; test set-up only). */
async function latchBasis(basis) {
    await withTenant(owner(), PROBE.tenantId, (tx) => tx.insert(s.measurementBasisEvent).values({
        tenantId: PROBE.tenantId,
        connectorId,
        projectId,
        basis,
        actor: 'system:test-5-10',
        at: TEST_NOW,
    }));
}
/** Mapping events landed after `seq`. */
async function eventsAfter(seq) {
    return (await events()).filter((e) => e.seq > seq).sort((a, b) => a.seq - b.seq);
}
const maxSeq = async () => Math.max(...(await events()).map((e) => e.seq));
/** The tables a rule path must never touch: dates and schedule runs (FR-22 / AR-52). */
const PLAN_TABLES = ['work_package', 'wp_status_event', 'schedule_run', 'wp_schedule'];
async function planRows() {
    const rows = await allRows(PROBE.tenantId);
    return Object.fromEntries(PLAN_TABLES.map((t) => [t, rows[t]]));
}
async function liveRules() {
    return withTenant(owner(), PROBE.tenantId, async (tx) => (await tx
        .select()
        .from(s.mappingRule)
        .where(and(eq(s.mappingRule.tenantId, PROBE.tenantId), eq(s.mappingRule.projectId, projectId)))).filter((r) => r.deletedAt === null));
}
async function events() {
    return withTenant(owner(), PROBE.tenantId, (tx) => tx.select().from(s.mappingEvent).where(eq(s.mappingEvent.tenantId, PROBE.tenantId)));
}
describe.skipIf(!reachable)('story 5.10: Mapping Rules on real rows', () => {
    beforeAll(async () => {
        await createProbeTenant(owner(), PROBE);
    }, 120_000);
    afterAll(async () => {
        await removeProbeTenant(owner(), PROBE);
        const left = Object.entries(await rowCounts(PROBE.tenantId)).filter(([, n]) => n > 0);
        expect(left, 'the mapping-rules suite left probe rows behind').toEqual([]);
        await closeAllPools();
    }, 120_000);
    it('refuses a taken priority, a summary target and an unknown parent — landing nothing', async () => {
        const before = await allRows(PROBE.tenantId);
        const base = { projectId, name: 'Refused', wpId: leaf.id, matchField: 'issueType', matchValue: 'Bug' };
        expect(await createMappingRule(deps(), ctx, { ...base, priority: 1 })).toEqual({
            ok: false,
            error: expect.objectContaining({ code: 'invalid_input', details: { priority: ['priority_taken'] } }),
        });
        expect(await createMappingRule(deps(), ctx, { ...base, priority: 9, wpId: summary.id })).toEqual({
            ok: false,
            error: expect.objectContaining({ code: 'invalid_input', details: { wpId: ['not_leaf'] } }),
        });
        expect(await createMappingRule(deps(), ctx, { ...base, priority: 9, matchField: 'parent', matchValue: 'NO-SUCH-1' })).toEqual({
            ok: false,
            error: expect.objectContaining({ code: 'invalid_input', details: { matchValue: ['unknown_parent'] } }),
        });
        // The preview refuses exactly what the save would — so Save can never enable on it.
        expect(await previewMappingRuleChange(readDeps(), ctx, {
            projectId,
            change: { kind: 'create', ...base, priority: 2 },
        })).toEqual({
            ok: false,
            error: expect.objectContaining({ code: 'invalid_input', details: { priority: ['priority_taken'] } }),
        });
        expect(await allRows(PROBE.tenantId)).toEqual(before);
    });
    it('stores a parent rule as the parent Ticket\'s tracker issue id', async () => {
        const parent = PROBE.state.snapshots.at(-1).tickets[0];
        const created = await createMappingRule(deps(), ctx, {
            projectId,
            name: 'Children of the first Ticket',
            priority: 40,
            wpId: leaf.id,
            matchField: 'parent',
            matchValue: parent.key,
        });
        expect(created.ok).toBe(true);
        const rule = (await liveRules()).find((r) => r.priority === 40);
        expect(rule).toMatchObject({ matchField: 'parent', matchValue: parent.trackerIssueId });
        // Clean up so the rest of the matrix runs on the fixture's two rules.
        expect((await deleteMappingRule(deps(), ctx, { projectId, ruleId: rule.id })).ok).toBe(true);
    });
    it('update / create that MOVE Tickets: preview == save, hours are the ledger\'s, count mode has none', async () => {
        const plan = await planRows();
        const retarget = {
            projectId,
            ruleId: FIRST.id,
            name: FIRST.name,
            priority: 1,
            wpId: leaf.id,
            matchField: FIRST.match.field,
            matchValue: FIRST.match.value,
        };
        const preview = await previewMappingRuleChange(readDeps(), ctx, {
            projectId,
            change: { kind: 'update', ...retarget },
        });
        if (!preview.ok)
            throw new Error(JSON.stringify(preview));
        const movedIds = preview.value.moves.map((m) => m.ticketId);
        expect(movedIds.length).toBeGreaterThan(0);
        expect(preview.value.hoursAvailable).toBe(true);
        expect(preview.value.arrivals).toEqual([
            { wpId: leaf.id, tickets: movedIds.length, mh: await ledgerMh(movedIds) },
        ]);
        expect(preview.value.departures).toEqual([
            { wpId: FIRST.wpId, tickets: movedIds.length, mh: await ledgerMh(movedIds) },
        ]);
        // A Ticket-Count Connector contributes Tickets, never hours.
        await latchBasis('count');
        const counted = await previewMappingRuleChange(readDeps(), ctx, {
            projectId,
            change: { kind: 'update', ...retarget },
        });
        if (!counted.ok)
            throw new Error(JSON.stringify(counted));
        expect(counted.value.hoursAvailable).toBe(false);
        expect(counted.value.arrivals).toEqual([{ wpId: leaf.id, tickets: movedIds.length, mh: 0n }]);
        await latchBasis('hours');
        let from = await maxSeq();
        const saved = await updateMappingRule(deps(), ctx, retarget);
        expect(saved).toEqual({ ok: true, value: { id: FIRST.id, moved: movedIds.length } });
        const landed = await eventsAfter(from);
        expect(landed.map((e) => e.ticketId).sort()).toEqual([...movedIds].sort());
        for (const e of landed)
            expect(e).toMatchObject({ source: 'rule', wpId: leaf.id, ruleId: FIRST.id });
        // Fall-through by priority: a lower-priority catch-all takes only what FIRST and SECOND leave.
        const catchAll = {
            projectId,
            name: 'Everything else',
            priority: 3,
            wpId: leaf2.id,
            matchField: 'keyPattern',
            matchValue: '*',
        };
        const fall = await previewMappingRuleChange(readDeps(), ctx, {
            projectId,
            change: { kind: 'create', ...catchAll },
        });
        if (!fall.ok)
            throw new Error(JSON.stringify(fall));
        const fallIds = fall.value.moves.map((m) => m.ticketId);
        expect(fallIds.length).toBeGreaterThan(0);
        expect(fallIds.filter((id) => movedIds.includes(id)), 'a higher-priority rule lost its Tickets').toEqual([]);
        from = await maxSeq();
        const created = await createMappingRule(deps(), ctx, catchAll);
        if (!created.ok)
            throw new Error(JSON.stringify(created));
        expect(created.value.moved).toBe(fallIds.length);
        expect((await eventsAfter(from)).map((e) => e.ticketId).sort()).toEqual([...fallIds].sort());
        expect(fall.value.arrivals).toEqual([{ wpId: leaf2.id, tickets: fallIds.length, mh: await ledgerMh(fallIds) }]);
        // Restore: drop the catch-all (its Tickets leave for Unmapped) and put FIRST back.
        expect((await deleteMappingRule(deps(), ctx, { projectId, ruleId: created.value.id })).ok).toBe(true);
        expect((await updateMappingRule(deps(), ctx, { ...retarget, wpId: FIRST.wpId })).ok).toBe(true);
        expect(await planRows(), 'a rule path wrote a date or a schedule run').toEqual(plan);
    });
    it('a different rule taking the Ticket at the SAME WP appends one event naming the new rule', async () => {
        const twin = await createMappingRule(deps(), ctx, {
            projectId,
            name: 'Twin of the first rule',
            priority: 3,
            wpId: FIRST.wpId,
            matchField: FIRST.match.field,
            matchValue: FIRST.match.value,
        });
        if (!twin.ok)
            throw new Error(JSON.stringify(twin));
        expect(twin.value.moved).toBe(0); // priority 3 never outranks FIRST
        const ids = (await liveRules()).sort((a, b) => a.priority - b.priority).map((r) => r.id);
        let from = await maxSeq();
        const reordered = await reorderMappingRules(deps(), ctx, {
            projectId,
            orderedRuleIds: [twin.value.id, ...ids.filter((id) => id !== twin.value.id)],
        });
        if (!reordered.ok)
            throw new Error(JSON.stringify(reordered));
        const switched = await eventsAfter(from);
        expect(switched.length).toBeGreaterThan(0);
        expect(reordered.value.moved).toBe(switched.length);
        for (const e of switched)
            expect(e).toMatchObject({ source: 'rule', wpId: FIRST.wpId, ruleId: twin.value.id });
        // Deleting the twin hands each Ticket back to FIRST — again one event per Ticket, same WP.
        from = await maxSeq();
        const removed = await deleteMappingRule(deps(), ctx, { projectId, ruleId: twin.value.id });
        expect(removed).toEqual({ ok: true, value: { id: twin.value.id, moved: switched.length } });
        for (const e of await eventsAfter(from)) {
            expect(e).toMatchObject({ source: 'rule', wpId: FIRST.wpId, ruleId: FIRST.id });
        }
        // Back to FIRST at priority 1 and SECOND at 2 for the rest of the matrix.
        const live = (await liveRules()).sort((a, b) => a.priority - b.priority).map((r) => r.id);
        expect((await reorderMappingRules(deps(), ctx, { projectId, orderedRuleIds: [FIRST.id, SECOND.id].filter((id) => live.includes(id)) })).ok).toBe(true);
    });
    it('delete: the preview is what the save does; the Tickets leave by rule and Review flags them', async () => {
        const plan = await planRows();
        const preview = await previewMappingRuleChange(readDeps(), ctx, {
            projectId,
            change: { kind: 'delete', ruleId: FIRST.id },
        });
        if (!preview.ok)
            throw new Error(JSON.stringify(preview));
        expect(preview.value.departures.map((d) => d.wpId)).toEqual([FIRST.wpId]);
        expect(preview.value.moves.length).toBeGreaterThan(0);
        const seqBefore = Math.max(...(await events()).map((e) => e.seq));
        const deleted = await deleteMappingRule(deps(), ctx, { projectId, ruleId: FIRST.id });
        if (!deleted.ok)
            throw new Error(JSON.stringify(deleted));
        expect(deleted.value.moved).toBe(preview.value.moves.length);
        const landed = (await events()).filter((e) => e.seq > seqBefore);
        expect(landed.map((e) => e.ticketId).sort()).toEqual(preview.value.moves.map((m) => m.ticketId).sort());
        for (const e of landed) {
            expect(e).toMatchObject({ source: 'rule', wpId: null, ruleId: FIRST.id });
        }
        // Soft delete: the row stays, so the events still resolve their rule_id.
        const [row] = await withTenant(owner(), PROBE.tenantId, (tx) => tx.select().from(s.mappingRule).where(eq(s.mappingRule.id, FIRST.id)));
        expect(row.deletedAt).not.toBeNull();
        // UX-DR23 / Q3: the Review names the rule the Tickets left, and links to it.
        const review = await getProjectReview(readDeps(), ctx, { projectId });
        if (!review.ok)
            throw new Error(JSON.stringify(review));
        const pinned = new Set(review.value.bundle.input.pinnedSnapshot.tickets.map((t) => t.trackerIssueId));
        // (Earlier cases left other rules' Unmapped Tickets flagged too — Q3: until mapped again.)
        const flagged = review.value.review.ruleUnmapped.filter((r) => r.ruleId === FIRST.id);
        expect(flagged.map((r) => r.ticketId).sort()).toEqual(landed.map((e) => e.ticketId).filter((id) => pinned.has(id)).sort());
        for (const r of flagged)
            expect(r).toMatchObject({ ruleId: FIRST.id, ruleName: FIRST.name });
        // The deleted rule is gone from the list; the survivor counts the Tickets it holds NOW.
        const mapping = await getProjectMapping(readDeps(), ctx, { projectId });
        if (!mapping.ok)
            throw new Error(JSON.stringify(mapping));
        expect(mapping.value.rules.map((r) => r.id)).toEqual([SECOND.id]);
        const heads = mappingHead((await events()).map((e) => ({ ...e, at: e.at.toISOString(), source: e.source })));
        const held = [...heads.values()].filter((h) => h.source === 'rule' && h.ruleId === SECOND.id && h.wpId !== null);
        expect(mapping.value.rules[0].currentlyMapped).toBe(held.length);
        // A second save with nothing to change appends nothing (append only on change).
        const again = await updateMappingRule(deps(), ctx, {
            projectId,
            ruleId: SECOND.id,
            name: 'Renamed, nothing else',
            priority: 7,
            wpId: SECOND.wpId,
            matchField: SECOND.match.field,
            matchValue: SECOND.match.value,
        });
        expect(again).toEqual({ ok: true, value: { id: SECOND.id, moved: 0 } });
        expect(await planRows(), 'a rule path wrote a date or a schedule run').toEqual(plan);
    });
    it('ingest after a soft delete: no rule event names the deleted rule or targets its WP', async () => {
        // The seed writes ticket.tracker_site and connector.site differently (deferred-work.md);
        // align the Connector so the ingest keys Ticket identity on the seeded site.
        const last = PROBE.state.snapshots.at(-1);
        await withTenant(owner(), PROBE.tenantId, async (tx) => {
            const [seeded] = await tx
                .select({ site: s.ticket.trackerSite })
                .from(s.ticket)
                .where(and(eq(s.ticket.tenantId, PROBE.tenantId), eq(s.ticket.projectId, projectId)))
                .limit(1);
            await tx
                .update(s.connector)
                .set({ site: seeded.site })
                .where(and(eq(s.connector.tenantId, PROBE.tenantId), eq(s.connector.id, connectorId)));
        });
        const from = await maxSeq();
        const ingestIds = idPort('xtr510-ingest');
        const written = await inTenantTransaction(deps().handle, PROBE.tenantId, (scope) => scope.ingestWrite.writeIngestSnapshot({
            projectId,
            connectorId,
            read: {
                complete: true,
                observedAt: new Date(Date.parse(last.observedAt) + 3_600_000).toISOString(),
                tickets: last.tickets,
                accounts: [],
                hoursFieldPresent: last.hoursFieldPresent,
                adapterKind: 'fixture',
            },
            snapshotId: ingestIds.next(),
            nextId: () => ingestIds.next(),
            actor: 'system:test-5-10',
            at: TEST_NOW,
        }));
        expect(written.kind).toBe('written');
        const ruleEvents = (await eventsAfter(from)).filter((e) => e.source === 'rule');
        expect(ruleEvents.filter((e) => e.ruleId === FIRST.id && e.wpId !== null)).toEqual([]);
        expect(ruleEvents.filter((e) => e.wpId === FIRST.wpId)).toEqual([]);
    });
    it('reorder: priorities are renumbered 1..n and stay unique; an incomplete order is refused', async () => {
        const created = await createMappingRule(deps(), ctx, {
            projectId,
            name: 'Bugs',
            priority: 3,
            wpId: leaf.id,
            matchField: 'issueType',
            matchValue: 'Bug',
        });
        if (!created.ok)
            throw new Error(JSON.stringify(created));
        const ids = (await liveRules()).sort((a, b) => a.priority - b.priority).map((r) => r.id);
        expect(ids).toHaveLength(2);
        expect(await reorderMappingRules(deps(), ctx, { projectId, orderedRuleIds: [ids[0]] })).toEqual({
            ok: false,
            error: expect.objectContaining({ code: 'invalid_input', details: { orderedRuleIds: ['order_mismatch'] } }),
        });
        const reordered = await reorderMappingRules(deps(), ctx, {
            projectId,
            orderedRuleIds: [ids[1], ids[0]],
        });
        expect(reordered.ok).toBe(true);
        const after = (await liveRules()).sort((a, b) => a.priority - b.priority);
        expect(after.map((r) => [r.id, r.priority])).toEqual([
            [ids[1], 1],
            [ids[0], 2],
        ]);
    });
});
