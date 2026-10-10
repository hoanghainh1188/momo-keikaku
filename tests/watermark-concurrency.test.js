import { performance } from 'node:perf_hooks';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyRules, mappingHead } from '@momo/domain';
import { appendProjectDefaultRate, appendResourceRate, deleteMappingRule, mapTicket, mapTickets, renameDepartment, } from '../packages/app/src/use-cases';
import { closeAllPools, schema as s } from '../packages/db/src/client';
import { assertProbeTenantsDisjoint, buildProbeTenant, createProbeTenant, removeProbeTenant, } from '../packages/db/src/probe-tenants';
import { loadProjectBundle } from '../packages/db/src/repo';
import { inTenantTransaction } from '../packages/db/src/tenant-transaction';
import { WATERMARK_NAMESPACE, lockWatermark, lockWatermarkShared, watermarkKey, } from '../packages/db/src/watermark-lock';
import { withTenant } from '../packages/db/src/with-tenant';
import { adminContextFor } from './request-context';
import { connectWriteHarness, idPort, owner, restrictedWriteDeps, rowCounts, targetOf, TEST_NOW, } from './write-harness';
/**
 * THE WATERMARK LOCK, AGAINST POSTGRES (story 1.2 watermark slice; AD-20, AR-37).
 *
 * Every row of the spec's I/O matrix, on REAL connections of the restricted role's pool —
 * `inTenantTransaction` and `withTenant` check out one client per transaction — against two probe
 * Tenants of this suite's own (vitest runs files in parallel, so its seq bands are its own too):
 *
 *   * same Project: the second append WAITS (seen in `pg_locks`, not guessed from a timer), both
 *     commit, and `seq` order equals commit order — for `mapping_event` specifically, the lock
 *     precedes the INSERT that obtains its `seq`;
 *   * every lock site waits on its key: map Disposition, manual Mapping and Project default Rate
 *     (Project key), Resource Rate and an audit-only org write (Tenant key);
 *   * different Projects — in two Tenants and in one — do not wait on each other;
 *   * a SHARED holder (the future `ComputationInputs` capture) makes an append wait;
 *   * a rolled-back append releases the lock, and its error propagates unchanged;
 *   * a Project default Rate waiting on the lock does not deadlock a Mapping append's FK check
 *     (`findProject` is `FOR NO KEY UPDATE`);
 *   * twenty parallel map Dispositions across both Projects land in full with no
 *     `mapping_event_pkey` 23505 — the flake `momo_next_mapping_event_seq()` produced (2 in 17).
 */
const reachable = await connectWriteHarness({
    ownerUrl: process.env.DATABASE_URL,
    appUrl: process.env.APP_DATABASE_URL,
    requireDb: process.env.REQUIRE_DB === '1',
});
const PROBE_A = buildProbeTenant('xtprobe-wma', 952_000_000);
const PROBE_B = buildProbeTenant('xtprobe-wmb', 953_000_000);
assertProbeTenantsDisjoint([PROBE_A, PROBE_B]);
const IDS = idPort('xtwm-id');
const deps = () => restrictedWriteDeps(IDS);
const app = () => deps().handle;
const asAdmin = (probe) => adminContextFor(probe.tenantId);
/** How long `waiterOn` polls before declaring the contender lost; generous, never the pass path. */
const WAIT_DEADLINE_MS = 15_000;
/** A deferred the test resolves by hand. */
function gate() {
    let open;
    const opened = new Promise((resolve) => {
        open = resolve;
    });
    return { opened, open };
}
function mapCommand(probe) {
    const target = targetOf(probe, probe.tenantId);
    return {
        kind: 'map',
        projectId: probe.projectId,
        wpId: target.wpId,
        ticketIds: target.ticketIds,
    };
}
const projectScope = (probe) => ({
    kind: 'project',
    projectId: probe.projectId,
});
/** A map Disposition on the probe's Project, stamped with its own actor so its rows are findable. */
function appendAs(probe, actor, hold) {
    return inTenantTransaction(app(), probe.tenantId, async (scope) => {
        await scope.projectWrite.recordMapDisposition({ actor, at: TEST_NOW }, mapCommand(probe));
        if (hold) {
            hold.locked();
            await hold.until;
        }
    });
}
/**
 * A transaction that takes `scope`'s exclusive watermark lock, signals, and holds it until
 * `release()`; then runs `beforeCommit` (if any) on its `tx` and commits.
 */
function holdLock(probe, scope, beforeCommit) {
    const locked = gate();
    const held = gate();
    const done = withTenant(app(), probe.tenantId, async (tx) => {
        await lockWatermark({ tx, tenantId: probe.tenantId }, scope);
        locked.open();
        await held.opened;
        if (beforeCommit)
            await beforeCommit(tx);
    });
    return { locked: locked.opened, release: held.open, done };
}
/** The `mapping_event.seq` values `actor` landed in the probe's Tenant, ascending. */
async function seqsOf(probe, actor) {
    const rows = await withTenant(owner(), probe.tenantId, (tx) => tx
        .select({ seq: s.mappingEvent.seq })
        .from(s.mappingEvent)
        .where(and(eq(s.mappingEvent.actor, actor), eq(s.mappingEvent.tenantId, probe.tenantId))));
    return rows.map((r) => r.seq).sort((a, b) => a - b);
}
/**
 * How many `mapping_event` and `disposition_event` rows the probe's Tenant holds. Filtered by
 * `tenant_id` explicitly: a superuser owner bypasses row-level security.
 */
async function eventCounts(probe) {
    return withTenant(owner(), probe.tenantId, async (tx) => {
        const [m] = await tx
            .select({ n: sql `count(*)` })
            .from(s.mappingEvent)
            .where(eq(s.mappingEvent.tenantId, probe.tenantId));
        const [d] = await tx
            .select({ n: sql `count(*)` })
            .from(s.dispositionEvent)
            .where(eq(s.dispositionEvent.tenantId, probe.tenantId));
        return { mappings: Number(m.n), dispositions: Number(d.n) };
    });
}
/**
 * Resolves once some session is WAITING (not granted) on the two-argument advisory lock for
 * `scope` in the probe's Tenant. Throws if `contender` — the write expected to wait — settles
 * first (it went through without waiting), or if nothing waits within `WAIT_DEADLINE_MS`.
 * `pg_locks` stores the two int4 keys in `classid` and `objid` (as unsigned oids), `objsubid = 2`.
 */
async function waiterOn(probe, scope, contender) {
    let settled = false;
    void contender.then(() => (settled = true), () => (settled = true));
    const namespace = WATERMARK_NAMESPACE[scope.kind];
    const scopeId = scope.kind === 'project' ? scope.projectId : probe.tenantId;
    const objid = watermarkKey(probe.tenantId, scopeId) >>> 0;
    const deadline = performance.now() + WAIT_DEADLINE_MS;
    for (;;) {
        const res = await owner().execute(sql `SELECT count(*)::text AS waiting FROM pg_catalog.pg_locks
           WHERE locktype = 'advisory' AND NOT granted AND objsubid = 2
             AND classid = ${namespace}::oid AND objid = ${objid}::oid`);
        if (Number(res.rows[0]?.waiting ?? 0) > 0)
            return;
        if (settled)
            throw new Error(`the contending write on ${scope.kind} ${scopeId} never waited`);
        if (performance.now() > deadline) {
            throw new Error(`nothing waited on ${scope.kind} ${scopeId} within ${WAIT_DEADLINE_MS} ms`);
        }
        await new Promise((resolve) => setImmediate(resolve));
    }
}
/**
 * Holds `scope`'s lock, starts `contend`, proves it waits on that key, then releases. Resolves to
 * the contender's outcome. The holder is released in `finally`, so a failed proof never leaves it
 * open.
 */
async function expectWaits(probe, scope, contend) {
    const holder = holdLock(probe, scope);
    await holder.locked;
    const contender = contend();
    try {
        await waiterOn(probe, scope, contender);
    }
    finally {
        holder.release();
    }
    await holder.done;
    return contender;
}
describe.skipIf(!reachable)('the watermark lock serialises appends per scope', () => {
    beforeAll(async () => {
        await createProbeTenant(owner(), PROBE_A);
        await createProbeTenant(owner(), PROBE_B);
    }, 120_000);
    afterAll(async () => {
        const left = [];
        for (const probe of [PROBE_A, PROBE_B]) {
            await removeProbeTenant(owner(), probe);
            left.push(...Object.entries(await rowCounts(probe.tenantId))
                .filter(([, n]) => n > 0)
                .map(([table]) => `${probe.tenantId}.${table}`));
        }
        expect(left, 'the watermark suite left probe rows behind').toEqual([]);
    }, 120_000);
    it('same Project: the second append waits, both commit, and seq order is commit order', async () => {
        const held = gate();
        const locked = gate();
        const committed = [];
        const first = appendAs(PROBE_A, 'user:wm-same-1', {
            locked: locked.open,
            until: held.opened,
        }).then(() => committed.push('first'));
        await locked.opened;
        const second = appendAs(PROBE_A, 'user:wm-same-2').then(() => committed.push('second'));
        try {
            await waiterOn(PROBE_A, projectScope(PROBE_A), second);
            expect(committed, 'the second append committed while the first held the lock').toEqual([]);
        }
        finally {
            held.open();
        }
        await Promise.all([first, second]);
        expect(committed).toEqual(['first', 'second']);
        const firstSeqs = await seqsOf(PROBE_A, 'user:wm-same-1');
        const secondSeqs = await seqsOf(PROBE_A, 'user:wm-same-2');
        expect(firstSeqs.length).toBeGreaterThan(0);
        expect(secondSeqs.length).toBeGreaterThan(0);
        expect(Math.max(...firstSeqs)).toBeLessThan(Math.min(...secondSeqs));
    }, 60_000);
    it('mapping_event: the lock precedes the INSERT that obtains its seq', async () => {
        // The holder takes the lock and inserts nothing yet. Were the Mapping append's `seq` obtained
        // before its lock (only the Disposition's lock guarding the transaction), the contender would
        // hold a LOWER seq than the row the holder inserts later, while committing after it.
        const holder = holdLock(PROBE_A, projectScope(PROBE_A), async (tx) => {
            const { ticketIds } = mapCommand(PROBE_A);
            await tx.insert(s.mappingEvent).values({
                id: 'wm-order-holder',
                tenantId: PROBE_A.tenantId,
                projectId: PROBE_A.projectId,
                ticketId: ticketIds[0],
                wpId: null,
                source: 'manual',
                ruleId: null,
                at: TEST_NOW,
                actor: 'user:wm-order-holder',
            });
        });
        await holder.locked;
        const contender = appendAs(PROBE_A, 'user:wm-order-contender');
        try {
            await waiterOn(PROBE_A, projectScope(PROBE_A), contender);
            expect(await seqsOf(PROBE_A, 'user:wm-order-contender')).toEqual([]);
        }
        finally {
            holder.release();
        }
        await holder.done;
        await contender;
        const [holderSeq] = await seqsOf(PROBE_A, 'user:wm-order-holder');
        const contenderSeqs = await seqsOf(PROBE_A, 'user:wm-order-contender');
        expect(contenderSeqs.length).toBeGreaterThan(0);
        expect(holderSeq).toBeLessThan(Math.min(...contenderSeqs));
    }, 60_000);
    it('a manual Mapping waits on the Project key', async () => {
        const { wpId, ticketIds } = mapCommand(PROBE_A);
        const result = await expectWaits(PROBE_A, projectScope(PROBE_A), () => mapTicket(deps(), asAdmin(PROBE_A), {
            projectId: PROBE_A.projectId,
            ticketId: ticketIds[0],
            wpId,
        }));
        expect(result).toEqual({ ok: true, value: undefined });
    }, 60_000);
    it('a Project default Rate waits on the Project key', async () => {
        const result = await expectWaits(PROBE_A, projectScope(PROBE_A), () => appendProjectDefaultRate(deps(), asAdmin(PROBE_A), {
            projectId: PROBE_A.projectId,
            effectiveFrom: '2026-10-01',
            yenPerHour: 9100,
        }));
        expect(result).toEqual({ ok: true, value: undefined });
    }, 60_000);
    it('a Resource Rate waits on the Tenant key', async () => {
        const result = await expectWaits(PROBE_A, { kind: 'tenant' }, () => appendResourceRate(deps(), asAdmin(PROBE_A), {
            resourceId: PROBE_A.state.fixture.resources[0].id,
            effectiveFrom: '2026-10-01',
            yenPerHour: 7300,
        }));
        expect(result).toEqual({ ok: true, value: undefined });
    }, 60_000);
    it('an audit-only write (a Department rename) takes the Tenant key as its fallback', async () => {
        const result = await expectWaits(PROBE_A, { kind: 'tenant' }, () => renameDepartment(deps(), asAdmin(PROBE_A), {
            departmentId: PROBE_A.state.fixture.department.id,
            name: 'Watermark Department',
        }));
        expect(result).toEqual({ ok: true, value: undefined });
    }, 60_000);
    it('a Project default Rate waiting on the lock does not deadlock a Mapping append (no 40P01)', async () => {
        // The holder takes the Project key first; the default-Rate append then locks the Project row
        // (`findProject`) and waits on the key. The holder's Mapping insert needs FOR KEY SHARE on
        // that row for its foreign key: under `FOR UPDATE` the two wait on each other and Postgres
        // aborts one with 40P01; under `FOR NO KEY UPDATE` both commit.
        const holder = holdLock(PROBE_A, projectScope(PROBE_A), async (tx) => {
            const { ticketIds } = mapCommand(PROBE_A);
            await tx.insert(s.mappingEvent).values({
                id: 'wm-deadlock-holder',
                tenantId: PROBE_A.tenantId,
                projectId: PROBE_A.projectId,
                ticketId: ticketIds[0],
                wpId: null,
                source: 'manual',
                ruleId: null,
                at: TEST_NOW,
                actor: 'user:wm-deadlock-holder',
            });
        });
        await holder.locked;
        const rate = appendProjectDefaultRate(deps(), asAdmin(PROBE_A), {
            projectId: PROBE_A.projectId,
            effectiveFrom: '2026-10-02',
            yenPerHour: 9200,
        });
        try {
            await waiterOn(PROBE_A, projectScope(PROBE_A), rate);
        }
        finally {
            holder.release();
        }
        const [holderOutcome, rateOutcome] = await Promise.allSettled([holder.done, rate]);
        expect(holderOutcome.status).toBe('fulfilled');
        expect(rateOutcome).toEqual({ status: 'fulfilled', value: { ok: true, value: undefined } });
        expect(await seqsOf(PROBE_A, 'user:wm-deadlock-holder')).toHaveLength(1);
    }, 60_000);
    it('different Projects in two Tenants: an append does not wait on another Project’s holder', async () => {
        const held = gate();
        const locked = gate();
        const first = appendAs(PROBE_A, 'user:wm-diff-1', { locked: locked.open, until: held.opened });
        await locked.opened;
        try {
            // Completes while A's transaction still holds A's key; were it to wait, this await would
            // never resolve and the test would fail on its timeout.
            await appendAs(PROBE_B, 'user:wm-diff-2');
            expect(await seqsOf(PROBE_B, 'user:wm-diff-2')).not.toEqual([]);
        }
        finally {
            held.open();
        }
        await first;
    }, 60_000);
    it('different Projects in one Tenant: neither key waits on the other', async () => {
        const holder = holdLock(PROBE_A, projectScope(PROBE_A));
        await holder.locked;
        try {
            // A second Project id of the same Tenant: a different key, granted while A's is held.
            await withTenant(app(), PROBE_A.tenantId, (tx) => lockWatermark({ tx, tenantId: PROBE_A.tenantId }, { kind: 'project', projectId: `${PROBE_A.projectId}-second` }));
        }
        finally {
            holder.release();
        }
        await holder.done;
    }, 60_000);
    it('a shared holder makes an append wait until it commits', async () => {
        const held = gate();
        const locked = gate();
        const committed = [];
        const reader = withTenant(app(), PROBE_A.tenantId, async (tx) => {
            await lockWatermarkShared({ tx, tenantId: PROBE_A.tenantId }, projectScope(PROBE_A));
            locked.open();
            await held.opened;
        }).then(() => committed.push('reader'));
        await locked.opened;
        const writer = appendAs(PROBE_A, 'user:wm-shared').then(() => committed.push('writer'));
        try {
            await waiterOn(PROBE_A, projectScope(PROBE_A), writer);
            expect(committed).toEqual([]);
        }
        finally {
            held.open();
        }
        await Promise.all([reader, writer]);
        expect(committed).toEqual(['reader', 'writer']);
    }, 60_000);
    it('loadProjectBundle captures under shared lock (story 6.1 / AR-37)', async () => {
        const holder = holdLock(PROBE_A, projectScope(PROBE_A));
        await holder.locked;
        const load = loadProjectBundle(app(), PROBE_A.tenantId, PROBE_A.projectId).then((bundle) => {
            expect(bundle.input.formulaVersion).toBeTruthy();
            expect(bundle.input.trackerSnapshotIdByConnector).toBeInstanceOf(Map);
            const pinMap = bundle.input.trackerSnapshotIdByConnector;
            // Demo probe always has Connectors; pin map size must match what capture loaded.
            const probeConnectorCount = bundle.input.connectorsForCoverage?.length ?? 0;
            if (probeConnectorCount > 0) {
                expect(pinMap.size).toBe(probeConnectorCount);
            }
            const ledgerSeqMax = bundle.input.ledgerSeqMax ?? null;
            if (bundle.input.ledger.length === 0) {
                expect(ledgerSeqMax).toBeNull();
            }
            else {
                expect(typeof ledgerSeqMax).toBe('number');
                expect(ledgerSeqMax).toBe(Math.max(...bundle.input.ledger.map((e) => e.seq)));
            }
            return bundle;
        });
        try {
            await waiterOn(PROBE_A, projectScope(PROBE_A), load);
        }
        finally {
            holder.release();
        }
        await Promise.all([holder.done, load]);
    }, 60_000);
    it('a rolled-back append releases the lock, and its error propagates unchanged', async () => {
        const held = gate();
        const locked = gate();
        const boom = new Error('watermark rollback probe');
        const failing = inTenantTransaction(app(), PROBE_A.tenantId, async (scope) => {
            await scope.projectWrite.recordMapDisposition({ actor: 'user:wm-rolled-back', at: TEST_NOW }, mapCommand(PROBE_A));
            locked.open();
            await held.opened;
            throw boom;
        });
        const settled = failing.then(() => 'resolved', (error) => error);
        await locked.opened;
        const next = appendAs(PROBE_A, 'user:wm-after-rollback');
        try {
            await waiterOn(PROBE_A, projectScope(PROBE_A), next);
        }
        finally {
            held.open();
        }
        expect(await settled).toBe(boom);
        await next;
        expect(await seqsOf(PROBE_A, 'user:wm-rolled-back')).toEqual([]);
        expect(await seqsOf(PROBE_A, 'user:wm-after-rollback')).not.toEqual([]);
    }, 60_000);
    it('refuses a Project key after the Tenant key (lock order)', async () => {
        await withTenant(app(), PROBE_A.tenantId, async (tx) => {
            const bound = { tx, tenantId: PROBE_A.tenantId };
            await lockWatermark(bound, { kind: 'tenant' });
            await expect(lockWatermark(bound, projectScope(PROBE_A))).rejects.toThrow(/watermark lock order/);
        });
    }, 60_000);
    it('twenty parallel map Dispositions across two Projects: no 23505, every row lands', async () => {
        const before = await Promise.all([PROBE_A, PROBE_B].map(eventCounts));
        const results = await Promise.all(Array.from({ length: 20 }, (_, i) => {
            const probe = i % 2 === 0 ? PROBE_A : PROBE_B;
            const { projectId, wpId, ticketIds } = mapCommand(probe);
            return mapTickets(deps(), asAdmin(probe), { projectId, wpId, ticketIds: [...ticketIds] });
        }));
        expect(results.filter((r) => !r.ok)).toEqual([]);
        const after = await Promise.all([PROBE_A, PROBE_B].map(eventCounts));
        [PROBE_A, PROBE_B].forEach((probe, i) => {
            // Ten Dispositions per Project, each mapping that probe's two Tickets.
            const ticketCount = mapCommand(probe).ticketIds.length;
            expect(after[i].dispositions - before[i].dispositions).toBe(10);
            expect(after[i].mappings - before[i].mappings).toBe(10 * ticketCount);
        });
    }, 120_000);
});
/**
 * STORY 5.10 — MANUAL WINS (AR-18, AR-37). A manual Mapping that commits while a rule evaluation
 * is in flight is never overridden: the evaluation takes the Project lock BEFORE it reads the
 * heads, so it waits for the manual append, then sees it and skips that Ticket. Driven twice —
 * through the ingest writer (rules re-evaluated on a snapshot) and through a rule save
 * (`deleteMappingRule`'s same-transaction re-evaluation).
 *
 * The Ticket is one a rule holds; the ingest's snapshot moves it into the OTHER rule's category,
 * and the rule save deletes the rule holding it — so either evaluation, reading a stale head,
 * WOULD append a rule event over the manual one. The pure precondition below proves that, so the
 * test cannot pass by the evaluation simply having nothing to do.
 */
describe.skipIf(!reachable)('story 5.10: a manual Mapping committed during rule evaluation wins', () => {
    const probe = PROBE_A;
    const [first, second] = [...probe.state.fixture.mappingRules].sort((a, b) => a.priority - b.priority);
    const lastSnapshot = probe.state.snapshots[probe.state.snapshots.length - 1];
    const reserved = new Set(targetOf(probe, probe.tenantId).ticketIds);
    const seedHead = mappingHead(probe.state.mappingEvents);
    /** Tickets of the latest snapshot the FIRST rule holds, outside the other tests' two. */
    const heldByFirst = lastSnapshot.tickets.filter((t) => {
        const h = seedHead.get(t.trackerIssueId);
        return !reserved.has(t.trackerIssueId) && h?.source === 'rule' && h.ruleId === first.id && h.wpId !== null;
    });
    const manualWp = probe.state.wps.find((w) => w.isLeaf && !w.isMilestone && !w.isCatchAll && w.id !== first.wpId && w.id !== second.wpId);
    // The suite above removes its probes in its own afterAll; this block writes A afresh.
    beforeAll(async () => {
        await createProbeTenant(owner(), probe);
    }, 120_000);
    afterAll(async () => {
        await removeProbeTenant(owner(), probe);
        const left = Object.entries(await rowCounts(probe.tenantId)).filter(([, n]) => n > 0);
        expect(left, 'the story 5.10 block left probe rows behind').toEqual([]);
    }, 120_000);
    /** Latest Mapping events of one Ticket, newest last. */
    async function eventsOf(ticketId) {
        const rows = await withTenant(owner(), probe.tenantId, (tx) => tx
            .select({ seq: s.mappingEvent.seq, source: s.mappingEvent.source, wpId: s.mappingEvent.wpId, actor: s.mappingEvent.actor })
            .from(s.mappingEvent)
            .where(and(eq(s.mappingEvent.tenantId, probe.tenantId), eq(s.mappingEvent.ticketId, ticketId))));
        return rows.sort((a, b) => a.seq - b.seq);
    }
    /** Holds a manual Mapping of `ticketId` open (lock held) until released. */
    function holdManual(ticketId, actor) {
        const locked = gate();
        const held = gate();
        const done = inTenantTransaction(app(), probe.tenantId, async (scope) => {
            await scope.projectWrite.recordManualMapping({ actor, at: TEST_NOW }, { projectId: probe.projectId, ticketId, wpId: manualWp.id });
            locked.open();
            await held.opened;
        });
        return { locked: locked.opened, release: held.open, done };
    }
    it('the precondition: there are rule-held Tickets to fight over', () => {
        expect(first && second, 'the fixture has two Mapping Rules').toBeTruthy();
        expect(heldByFirst.length, 'the first rule holds no Ticket in the latest snapshot').toBeGreaterThan(1);
        expect(manualWp).toBeDefined();
    });
    it('ingest: the snapshot that would move the Ticket by rule skips it once the manual Mapping commits', async () => {
        const target = heldByFirst[0];
        const moved = {
            ...target,
            attributes: [
                ...target.attributes.filter((a) => a.kind !== 'category'),
                { kind: 'category', id: second.match.value },
            ],
        };
        // Precondition: against the seed's heads, this snapshot WOULD append a rule event for it.
        const wouldMove = applyRules([first, second], [moved], seedHead, 1, 'x');
        expect(wouldMove.map((e) => [e.ticketId, e.wpId])).toEqual([[target.trackerIssueId, second.wpId]]);
        const read = {
            complete: true,
            observedAt: new Date(Date.parse(lastSnapshot.observedAt) + 3_600_000).toISOString(),
            tickets: lastSnapshot.tickets.map((t) => (t.trackerIssueId === target.trackerIssueId ? moved : t)),
            accounts: [],
            hoursFieldPresent: lastSnapshot.hoursFieldPresent,
            rateLimit: null,
            adapterKind: 'fixture',
        };
        // The seed writes `ticket.tracker_site` and `connector.site` differently ('…backlog.jp' vs
        // 'ec-phase2' — recorded in deferred-work.md), so an ingest onto a seeded Project would key its
        // Ticket identity upsert on another site and collide. Align the probe's Connector first.
        const connectorId = targetOf(probe, probe.tenantId).connectorId;
        await withTenant(owner(), probe.tenantId, async (tx) => {
            const [seeded] = await tx
                .select({ site: s.ticket.trackerSite })
                .from(s.ticket)
                .where(and(eq(s.ticket.tenantId, probe.tenantId), eq(s.ticket.trackerIssueId, target.trackerIssueId)));
            await tx
                .update(s.connector)
                .set({ site: seeded.site })
                .where(and(eq(s.connector.tenantId, probe.tenantId), eq(s.connector.id, connectorId)));
        });
        const ingestIds = idPort('xtwm-ingest');
        const manual = holdManual(target.trackerIssueId, 'user:wm-manual-vs-ingest');
        await manual.locked;
        const ingest = inTenantTransaction(app(), probe.tenantId, (scope) => scope.ingestWrite.writeIngestSnapshot({
            projectId: probe.projectId,
            connectorId,
            read,
            snapshotId: ingestIds.next(),
            nextId: () => ingestIds.next(),
            actor: 'system:wm-ingest',
            at: TEST_NOW,
        }));
        try {
            await waiterOn(probe, projectScope(probe), ingest);
        }
        finally {
            manual.release();
        }
        await manual.done;
        expect((await ingest).kind).toBe('written');
        const events = await eventsOf(target.trackerIssueId);
        const last = events[events.length - 1];
        expect(last, 'the manual Mapping is the Ticket\'s head after the ingest').toMatchObject({
            source: 'manual',
            wpId: manualWp.id,
            actor: 'user:wm-manual-vs-ingest',
        });
    }, 60_000);
    it('rule save: deleting the rule that held the Ticket leaves the manual Mapping alone', async () => {
        const target = heldByFirst[1];
        const manual = holdManual(target.trackerIssueId, 'user:wm-manual-vs-rule');
        await manual.locked;
        const save = deleteMappingRule(deps(), asAdmin(probe), {
            projectId: probe.projectId,
            ruleId: first.id,
        });
        try {
            await waiterOn(probe, projectScope(probe), save);
        }
        finally {
            manual.release();
        }
        await manual.done;
        const result = await save;
        expect(result.ok).toBe(true);
        const events = await eventsOf(target.trackerIssueId);
        expect(events[events.length - 1]).toMatchObject({
            source: 'manual',
            wpId: manualWp.id,
            actor: 'user:wm-manual-vs-rule',
        });
        // …while the other Tickets the deleted rule held DID move (to Unmapped, or the other rule).
        expect(result.ok && result.value.moved).toBeGreaterThan(0);
    }, 60_000);
});
// One pool teardown for the file, after both blocks: closing it drops the seed-suite lock's session
// (`connectWriteHarness`), so it must not happen between them.
afterAll(async () => {
    await closeAllPools();
});
