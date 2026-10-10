import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { applyRules, buildCalendar, DEFAULT_THRESHOLDS, ingestSnapshot, mappingHead, periodOf, projectDate, } from '@momo/domain';
import { actorOf, DEMO_USERS } from './demo-identities';
/** Walk up from the working directory to the repo root (the folder holding `fixtures/`). */
function repoRoot() {
    let dir = process.cwd();
    for (let i = 0; i < 6; i += 1) {
        if (existsSync(join(dir, 'fixtures', 'demo', 'project.json')))
            return dir;
        dir = dirname(dir);
    }
    throw new Error('could not locate the repo root (no fixtures/demo/project.json found)');
}
const ROOT = repoRoot();
/**
 * An integer JSON number as `bigint`, refusing anything that is not a SAFE integer: a fraction,
 * and also a number past 2^53, which `JSON.parse` has already rounded to the nearest double.
 * Effort (milli-hours) and yen both come in through here, so nothing is rounded on the way in.
 */
export function integerFromJson(n) {
    if (!Number.isSafeInteger(n)) {
        throw new RangeError(`fixture value ${n} is not a safe integer, so it cannot be carried exactly`);
    }
    return BigInt(n);
}
export const mhFromJson = (n) => integerFromJson(n);
const optionalMhFromJson = (n) => (n === null ? null : mhFromJson(n));
const ticketFromJson = (t) => ({
    trackerIssueId: t.trackerIssueId,
    key: t.key,
    title: t.title,
    statusId: t.statusId,
    estimateMh: optionalMhFromJson(t.estimateMh),
    actualMh: optionalMhFromJson(t.actualMh),
    assigneeAccountId: t.assigneeAccountId,
    createdAt: t.createdAt,
    parentIssueId: t.parentIssueId ?? null,
    issueTypeId: t.issueTypeId,
    trackerProjectId: t.trackerProjectId ?? null,
    attributes: t.attributes ?? [],
});
export function loadFixtureProject() {
    return JSON.parse(readFileSync(join(ROOT, 'fixtures/demo/project.json'), 'utf8'));
}
/**
 * AD-6 fixture-replay adapter. Recorded times are REBASED onto the demo anchor
 * (architecture review G-5 fix (a)) so the demo's snapshot freshness and the
 * "current" Reporting Period behave as they did when the fixtures were recorded.
 */
export function loadFixtureSnapshots(anchorIso) {
    const dir = join(ROOT, 'fixtures/backlog/ec-phase2');
    const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
    const anchor = new Date(anchorIso).getTime();
    return files.map((f) => {
        const raw = JSON.parse(readFileSync(join(dir, f), 'utf8'));
        return {
            snapshotId: `snap-${raw.scenario}-${String(raw.page).padStart(4, '0')}`,
            observedAt: new Date(anchor + raw.observedAtOffsetHours * 3600_000).toISOString(),
            hoursFieldPresent: raw.hoursFieldPresent,
            complete: raw.complete ?? true,
            accounts: (raw.accounts ?? []).map((a) => ({
                accountId: a.accountId,
                displayName: a.displayName,
                ...(a.email !== undefined ? { email: a.email } : {}),
            })),
            rateLimit: null,
            adapterKind: 'fixture',
            tickets: raw.tickets.map(ticketFromJson),
        };
    });
}
/**
 * Latest rebated fixture `observedAt` for the demo snapshots — the fixture Clock's first
 * argument (story 1.8 / AD-15). Pure over the fixture files + anchor.
 */
export function latestFixtureObservedAt(anchorIso) {
    const snapshots = loadFixtureSnapshots(anchorIso);
    if (snapshots.length === 0)
        return new Date(anchorIso);
    let max = 0;
    for (const snap of snapshots) {
        const t = Date.parse(snap.observedAt);
        if (t > max)
            max = t;
    }
    return new Date(max);
}
/**
 * Replays the fixture Connector: ingest each snapshot in order, deriving ledger
 * entries and re-evaluating Mapping Rules inside the same step (AD-7 (e)).
 * Deterministic for a given anchor, so the UI and the golden tests agree exactly.
 */
export function buildDemoState(anchorIso) {
    const fixture = loadFixtureProject();
    const anchor = anchorIso ?? fixture.anchor;
    const snapshots = loadFixtureSnapshots(anchor);
    const project = {
        id: fixture.project.id,
        name: fixture.project.name,
        clientName: fixture.project.clientName,
        contractType: fixture.project.contractType,
        tzOffsetMinutes: fixture.project.tzOffsetMinutes,
        teireiWeekday: fixture.project.teireiWeekday,
        defaultRateYenPerHour: integerFromJson(fixture.project.defaultRateYenPerHour),
        eacMethod: 'typical',
        thresholds: DEFAULT_THRESHOLDS,
    };
    const calendar = buildCalendar('jp-vn-2026', {
        jp: fixture.project.calendar.jp,
        vn: fixture.project.calendar.vn,
    });
    const wps = fixture.wps.map((w) => ({
        id: w.id,
        wbsCode: w.wbsCode,
        name: w.name,
        parentId: w.parentId,
        isLeaf: w.isLeaf,
        isMilestone: w.isMilestone,
        isCatchAll: w.isCatchAll,
        plannedMh: mhFromJson(w.plannedMh),
        actualStart: w.actualStart,
        actualFinish: w.actualFinish,
        assignedResourceIds: w.assignedResourceIds,
    }));
    const baselineVersions = [
        {
            seq: fixture.baseline.seq,
            id: fixture.baseline.id,
            reason: fixture.baseline.reason,
            recordedAt: fixture.baseline.recordedAt,
            // Demo fixture JSON has no actor; stamp the demo PM (seed still writes no Baseline — 2-A).
            actor: actorOf(DEMO_USERS.linh.id),
            wps: fixture.baseline.wps.map((b) => ({ ...b, baselineMh: mhFromJson(b.baselineMh) })),
        },
    ];
    const resources = fixture.resources.map((r) => ({
        id: r.id,
        name: r.name,
        departmentId: fixture.department.id,
        trackerAccountIds: [r.accountId],
        // Demo Rates are sequential from 1; the seed's identity `seq` differs, but fixtures never
        // pin — live valuation ignores `seq` when no ceiling is set (story 1.6).
        rates: [{ seq: 1, effectiveFrom: '2026-01-01', yenPerHour: integerFromJson(r.yenPerHour) }],
    }));
    // --- UJ-2: the PM's manual Mappings, recorded before the first snapshot.
    let mapSeq = 1;
    const mappingEvents = fixture.seedMappings.map((m) => ({
        seq: mapSeq++,
        ticketId: m.ticketId,
        wpId: m.wpId,
        source: 'manual',
        at: fixture.baseline.recordedAt,
        // The demo PM, by the id the seed gives her (story 1.4): `user:<id>`, like every audited write.
        actor: actorOf(DEMO_USERS.linh.id),
    }));
    // --- replay the Connector
    // Do NOT stamp `connectorId` onto DemoState.ledger: probe relabelling walks this
    // graph, and seed invents the Connector id via `own('con-fixture-ec2')` (idPrefix),
    // which is a different string than a fixture-relabelled id. Stamping here broke
    // cross-tenant label completeness (story 5.13). In-memory Reviews that need OB
    // grouping call `stampDemoLedgerConnectorId` at the computeReview boundary.
    const replayed = replayConnector({
        snapshots,
        baselineVersions,
        mappingRules: fixture.mappingRules,
        seedMappingEvents: mappingEvents,
        ledgerSeqFrom: 1,
        mappingSeqFrom: mapSeq,
    });
    return {
        anchor,
        fixture,
        project,
        calendar,
        wps,
        baselineVersions,
        activeBaselineSeq: fixture.baseline.seq,
        resources,
        snapshots,
        ledger: replayed.ledger,
        mappingEvents: replayed.mappingEvents,
        mappingRules: fixture.mappingRules,
        leftScope: replayed.leftScope,
        measurementBasis: replayed.measurementBasis,
    };
}
/** Client approval instant the fixture Connector replays under (FR-17 / story 5.2). */
export const FIXTURE_APPROVAL_RECORDED_AT = '2026-09-01T00:00:00.000Z';
/**
 * Replays a fixture Connector through the domain path the product's writer uses: ingest each
 * snapshot in order (`ingestSnapshot`), then re-evaluate Mapping Rules against the head inside
 * the same step (AD-7 (e), FR-22). Pure and deterministic, so the demo and the load fixture
 * (story 5.15) derive their ledger and Mappings the same way.
 */
export function replayConnector(input) {
    let ledgerSeq = input.ledgerSeqFrom;
    let mapSeq = input.mappingSeqFrom;
    const mappingEvents = [...input.seedMappingEvents];
    const ledger = [];
    const leftScope = [];
    let prev = null;
    let basis = 'hours';
    for (const snap of input.snapshots) {
        // AD-7 / adversarial review H3: the active Baseline is the latest committed
        // version BY SEQUENCE, never by comparing fixture timestamps.
        const activeBaselineSeq = Math.max(...input.baselineVersions.map((b) => b.seq));
        const res = ingestSnapshot({
            prev,
            next: snap,
            activeBaselineVersionSeq: activeBaselineSeq,
            seqFrom: ledgerSeq,
            approvalRecordedAt: FIXTURE_APPROVAL_RECORDED_AT,
        });
        ledger.push(...res.entries);
        leftScope.push(...res.leftScope);
        ledgerSeq = res.nextSeq;
        basis = res.measurementBasis;
        // FR-22: rules are live — re-evaluate every Ticket without a manual Mapping.
        const head = mappingHead(mappingEvents);
        const events = applyRules(input.mappingRules, snap.tickets, head, mapSeq, snap.observedAt);
        mappingEvents.push(...events);
        mapSeq += events.length;
        prev = snap;
    }
    return { ledger, mappingEvents, leftScope, measurementBasis: basis };
}
/** Connector id seed writes for the demo fixture Tenant (not projectOnly probes). */
export const DEMO_CONNECTOR_ID = 'con-fixture-ec2';
/**
 * Story 5.13: stamp Connector id onto ledger entries for in-memory `attribute` /
 * `computeReview` only — never onto `buildDemoState()` itself (probe relabel safety).
 */
export function stampDemoLedgerConnectorId(ledger, connectorId = DEMO_CONNECTOR_ID) {
    return ledger.map((e) => ({ ...e, connectorId }));
}
/** The Reporting Period the Review lands on: the one containing the anchor. */
export function currentPeriod(state) {
    return periodOf(state.anchor, state.project.tzOffsetMinutes, state.project.teireiWeekday);
}
export function asOfDate(state) {
    return projectDate(state.anchor, state.project.tzOffsetMinutes);
}
