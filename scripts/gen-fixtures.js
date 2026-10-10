/**
 * Deterministic generator for the demo dataset.
 *
 * Writes:
 *   fixtures/demo/project.json            — Tenant/Department/Program/Project, Resources, Plan, Baseline, Mapping Rules, seed Mappings
 *   fixtures/backlog/ec-phase2/000N.json  — six weekly Backlog-shaped Tracker Snapshots
 *
 * The snapshots carry `observedAtOffsetHours` relative to a time anchor rather than
 * absolute recorded times, so the fixture-replay adapter can rebase them onto the
 * demo anchor (architecture review G-5, fix (a)). Run: pnpm tsx scripts/gen-fixtures.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mulberry32 } from '../packages/db/src/fixture-prng.js';
const ROOT = new URL('..', import.meta.url).pathname;
// ---------------------------------------------------------------- deterministic RNG
const rnd = mulberry32(20260920);
const jitter = (spread) => 1 + (rnd() - 0.5) * 2 * spread;
const H = 1000;
const hm = (h) => Math.round(h * H);
// ---------------------------------------------------------------- calendar helpers
const day = 86_400_000;
const d = (s) => new Date(`${s}T00:00:00.000Z`).getTime();
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const addDays = (s, n) => iso(d(s) + n * day);
// ---------------------------------------------------------------- tuning knobs
/** planned-scope inefficiency: actual = estimate x this (drives CPI planned scope) */
const PLANNED_EFFICIENCY = 1.035;
/** schedule drag: work windows stretch by this, so resolution lags PV (drives SPI) */
const SCHEDULE_DRAG = 1.2;
/** cumulative Unplanned Work as a share of planned-scope actuals */
const UNPLANNED_RATIO = 0.058;
const PROJECT_START = '2026-06-01';
const PROJECT_FINISH = '2026-11-27';
/** stretches the phase offsets below so the Baseline really runs June -> late November */
const SCHEDULE_SCALE = 1.42;
const RESOURCES = [
    { id: 'res-linh', name: 'Nguyen Thi Linh', accountId: 'bk-1001', yenPerHour: 6500, role: 'PM / BrSE' },
    { id: 'res-minh', name: 'Tran Quang Minh', accountId: 'bk-1002', yenPerHour: 4600, role: 'Tech lead' },
    { id: 'res-trang', name: 'Le Thu Trang', accountId: 'bk-1003', yenPerHour: 3900, role: 'Engineer' },
    { id: 'res-duc', name: 'Pham Minh Duc', accountId: 'bk-1004', yenPerHour: 3700, role: 'Engineer' },
    { id: 'res-huy', name: 'Vo Gia Huy', accountId: 'bk-1005', yenPerHour: 3400, role: 'Engineer' },
    { id: 'res-nga', name: 'Do Hong Nga', accountId: 'bk-1006', yenPerHour: 3200, role: 'QA' },
];
/** FR-13: one Tracker Account deliberately unlinked, so Unattributed hours appear. */
const UNLINKED_ACCOUNT = 'bk-1099';
const PHASES = [
    {
        code: '1',
        name: 'Requirements & Design',
        leaves: [
            { code: '1.1', name: 'Requirements workshops with client', hours: 64, startOffsetWd: 0, weeks: 2 },
            { code: '1.2', name: 'Functional specification (JA)', hours: 96, startOffsetWd: 5, weeks: 3 },
            { code: '1.3', name: 'Screen design & wireframes', hours: 80, startOffsetWd: 10, weeks: 3 },
            { code: '1.4', name: 'Data model & migration plan', hours: 56, startOffsetWd: 10, weeks: 2 },
            { code: '1.5', name: 'Design review sign-off', hours: 24, startOffsetWd: 18, weeks: 1 },
        ],
    },
    {
        code: '2',
        name: 'Catalogue & Search',
        leaves: [
            { code: '2.1', name: 'Product master API', hours: 120, startOffsetWd: 20, weeks: 3 },
            { code: '2.2', name: 'Category tree revamp', hours: 88, startOffsetWd: 22, weeks: 3 },
            { code: '2.3', name: 'Search indexing pipeline', hours: 136, startOffsetWd: 25, weeks: 4 },
            { code: '2.4', name: 'Faceted search UI', hours: 104, startOffsetWd: 30, weeks: 3 },
            { code: '2.5', name: 'Product detail page', hours: 96, startOffsetWd: 32, weeks: 3 },
            { code: '2.6', name: 'Image CDN integration', hours: 48, startOffsetWd: 35, weeks: 2 },
            { code: '2.7', name: 'Catalogue unit tests', hours: 56, startOffsetWd: 38, weeks: 2 },
        ],
    },
    {
        code: '3',
        name: 'Cart & Checkout',
        leaves: [
            { code: '3.1', name: 'Cart service refactor', hours: 112, startOffsetWd: 40, weeks: 3 },
            { code: '3.2', name: 'Checkout flow (guest)', hours: 128, startOffsetWd: 43, weeks: 4 },
            { code: '3.3', name: 'Checkout flow (member)', hours: 96, startOffsetWd: 46, weeks: 3 },
            { code: '3.4', name: 'Address & delivery slots', hours: 72, startOffsetWd: 48, weeks: 3 },
            { code: '3.5', name: 'Tax & consumption tax rules', hours: 56, startOffsetWd: 50, weeks: 2 },
            { code: '3.6', name: 'Order confirmation mail (JA)', hours: 40, startOffsetWd: 52, weeks: 2 },
            { code: '3.7', name: 'Checkout integration tests', hours: 64, startOffsetWd: 55, weeks: 2 },
        ],
    },
    {
        code: '4',
        name: 'Payment & Coupon',
        leaves: [
            { code: '4.1', name: 'GMO payment gateway', hours: 120, startOffsetWd: 52, weeks: 4 },
            { code: '4.2', name: 'Convenience-store payment', hours: 80, startOffsetWd: 56, weeks: 3 },
            { code: '4.3', name: 'Refund & cancellation', hours: 72, startOffsetWd: 58, weeks: 3 },
            { code: '4.4', name: 'Point programme integration', hours: 88, startOffsetWd: 60, weeks: 3 },
            { code: '4.5', name: 'Payment reconciliation batch', hours: 64, startOffsetWd: 63, weeks: 2 },
            { code: '4.6', name: 'Payment security review', hours: 40, startOffsetWd: 66, weeks: 2 },
        ],
    },
    {
        code: '5',
        name: 'Integration & Migration',
        leaves: [
            { code: '5.1', name: 'ERP order interface', hours: 104, startOffsetWd: 60, weeks: 4 },
            { code: '5.2', name: 'Inventory sync batch', hours: 80, startOffsetWd: 64, weeks: 3 },
            { code: '5.3', name: 'Legacy data migration scripts', hours: 96, startOffsetWd: 66, weeks: 3 },
            { code: '5.4', name: 'Migration rehearsal', hours: 56, startOffsetWd: 70, weeks: 2 },
            { code: '5.5', name: 'Interface specification (JA)', hours: 40, startOffsetWd: 62, weeks: 2 },
        ],
    },
    {
        code: '6',
        name: 'QA & UAT',
        leaves: [
            { code: '6.1', name: 'Test plan & cases', hours: 72, startOffsetWd: 58, weeks: 3 },
            { code: '6.2', name: 'System test cycle 1', hours: 128, startOffsetWd: 68, weeks: 3 },
            { code: '6.3', name: 'System test cycle 2', hours: 96, startOffsetWd: 74, weeks: 3 },
            { code: '6.4', name: 'Client UAT support', hours: 80, startOffsetWd: 80, weeks: 3 },
            { code: '6.5', name: 'Performance test', hours: 56, startOffsetWd: 78, weeks: 2 },
        ],
    },
    {
        code: '7',
        name: 'Release & Support',
        leaves: [
            { code: '7.1', name: 'Release preparation & runbook', hours: 48, startOffsetWd: 84, weeks: 2 },
            { code: '7.2', name: 'Go-live', hours: 0, startOffsetWd: 90, weeks: 0, isMilestone: true },
            { code: '7.3', name: 'Support & miscellaneous (catch-all)', hours: 80, startOffsetWd: 20, weeks: 14, isCatchAll: true },
        ],
    },
];
/** Extra milestones inside the plan, so FR-31's milestone-slip rule has something to bite on. */
const MILESTONES = [
    { code: 'M1', name: 'Design sign-off', offsetWd: 19, doneOffsetWd: 21 },
    { code: 'M2', name: 'Catalogue feature complete', offsetWd: 42, doneOffsetWd: 46 },
    { code: 'M3', name: 'Checkout feature complete', offsetWd: 50, doneOffsetWd: null }, // slipped
];
const wps = [];
const wpIdOf = (code) => `wp-${code.replace(/\./g, '-')}`;
const offsetToDate = (wd) => addDays(PROJECT_START, Math.round((wd * SCHEDULE_SCALE / 5) * 7));
for (const phase of PHASES) {
    wps.push({
        id: wpIdOf(phase.code),
        wbsCode: phase.code,
        name: phase.name,
        parentId: null,
        isLeaf: false,
        isMilestone: false,
        isCatchAll: false,
        start: null,
        finish: null,
        plannedMh: 0,
        baselineMh: 0,
        actualStart: null,
        actualFinish: null,
        assignedResourceIds: [],
    });
    for (const leaf of phase.leaves) {
        const start = offsetToDate(leaf.startOffsetWd);
        const finish = leaf.weeks === 0 ? start : addDays(start, leaf.weeks * 7 - 3);
        const res = RESOURCES[1 + Math.floor(rnd() * (RESOURCES.length - 1))];
        wps.push({
            id: wpIdOf(leaf.code),
            wbsCode: leaf.code,
            name: leaf.name,
            parentId: wpIdOf(phase.code),
            isLeaf: true,
            isMilestone: leaf.isMilestone ?? false,
            isCatchAll: leaf.isCatchAll ?? false,
            start,
            finish,
            plannedMh: hm(leaf.hours),
            baselineMh: hm(leaf.hours),
            actualStart: null,
            actualFinish: null,
            assignedResourceIds: [res.id],
        });
    }
}
for (const ms of MILESTONES) {
    const date = offsetToDate(ms.offsetWd);
    wps.push({
        id: wpIdOf(ms.code),
        wbsCode: `8.${ms.code}`,
        name: ms.name,
        parentId: null,
        isLeaf: true,
        isMilestone: true,
        isCatchAll: false,
        start: date,
        finish: date,
        plannedMh: 0,
        baselineMh: 0,
        actualStart: null,
        // A milestone reached: its done date is its actual finish.
        actualFinish: ms.doneOffsetWd === null ? null : offsetToDate(ms.doneOffsetWd),
        assignedResourceIds: [],
    });
}
// A couple of Current-Plan edits that diverge from the Baseline (FR-28 Divergence).
const slip = (code, days) => {
    const w = wps.find((x) => x.wbsCode === code);
    w.finish = addDays(w.finish, days);
    w.plannedMh = Math.round(w.plannedMh * 1.15);
};
slip('3.2', 10);
slip('4.1', 7);
slip('2.3', 5);
const tickets = [];
let ticketNo = 1000;
const nextKey = () => `EC2-${++ticketNo}`;
const pickAccount = () => {
    const r = rnd();
    if (r < 0.06)
        return UNLINKED_ACCOUNT; // FR-13 Unattributed hours
    if (r < 0.1)
        return null; // Ticket with no assignee
    return RESOURCES[1 + Math.floor(rnd() * (RESOURCES.length - 1))].accountId;
};
const leafWps = wps.filter((w) => w.isLeaf && !w.isMilestone && w.baselineMh > 0);
const TASK_TITLES = [
    'Implement', 'Refactor', 'Write tests for', 'Review', 'Fix spec gap in', 'Document',
];
for (const wp of leafWps) {
    const isCatchAll = wp.isCatchAll;
    const n = isCatchAll ? 16 : 3 + Math.floor(rnd() * 4);
    // Planned WPs: Ticket estimates sum to the WP's Baseline hours.
    // Catch-all WP: miscellaneous work arrives regardless of the LOE budget, so its
    // Tickets deliberately sum well past the Baseline hours (FR-24 overflow).
    const estimatePool = isCatchAll ? Math.round(wp.baselineMh * 2.6) : wp.baselineMh;
    const weights = Array.from({ length: n }, () => 0.6 + rnd());
    const wsum = weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < n; i += 1) {
        const est = Math.round((estimatePool * weights[i]) / wsum);
        const spanDays = Math.max(3, Math.round(((d(wp.finish) - d(wp.start)) / day) * SCHEDULE_DRAG / Math.max(1, n)));
        const startOffset = Math.round(((d(wp.finish) - d(wp.start)) / day) * (i / n) * SCHEDULE_DRAG);
        const workStart = addDays(wp.start, startOffset);
        tickets.push({
            trackerIssueId: `bk-issue-${ticketNo + 1}`,
            key: nextKey(),
            title: `${TASK_TITLES[i % TASK_TITLES.length]} ${wp.name.toLowerCase()} (${i + 1}/${n})`,
            issueTypeId: 'Task',
            categoryIds: isCatchAll ? ['Support'] : [wp.wbsCode.split('.')[0] === '6' ? 'QA' : 'Development'],
            milestoneIds: [`Phase2-Sprint${1 + Math.floor(startOffset / 14)}`],
            estimateMh: est,
            finalActualMh: Math.round(est * PLANNED_EFFICIENCY * jitter(0.25)),
            workStart,
            workFinish: addDays(workStart, spanDays),
            assigneeAccountId: pickAccount(),
            wpId: wp.id,
            // Catch-all work arrives through a live Mapping Rule (FR-22); the rest was
            // mapped by hand during UJ-2.
            mappingSource: isCatchAll ? 'rule' : 'manual',
        });
    }
}
// ---- work outside the plan (the UJ-3 story)
const plannedActualTotal = tickets.reduce((a, t) => a + t.finalActualMh, 0);
const unplannedBudget = Math.round(plannedActualTotal * UNPLANNED_RATIO);
const UNPLANNED = [
    {
        n: 11,
        category: 'Bug',
        issueType: 'Bug',
        share: 0.48,
        estimated: false,
        titles: [
            'Coupon banner shows wrong discount on PDP',
            'Cart total mismatches when coupon + point used',
            'Checkout 500 when address has half-width kana',
            'Search facet count wrong after re-index',
            'Order mail missing 税込 line',
            'Session drops on payment return from GMO',
            'Category tree duplicates on save',
            'Stock shows 0 for pre-order items',
            'PDP image not refreshed after CDN purge',
            'Guest checkout loses delivery slot',
            'Point balance not rolled back on refund',
        ],
    },
    {
        n: 6,
        category: 'Feature-Request',
        issueType: 'Task',
        share: 0.3,
        estimated: true,
        titles: [
            'Coupon rule: stackable campaign coupons',
            'Coupon rule: per-member usage limit',
            'Coupon rule: category exclusion list',
            'Coupon admin screen changes',
            'Coupon rule migration for legacy codes',
            'Coupon rule regression tests',
        ],
    },
    {
        n: 5,
        category: 'Infrastructure',
        issueType: 'Task',
        share: 0.22,
        estimated: false,
        titles: [
            'Client staging DB reset lost test data',
            'Staging deploy blocked by expired certificate',
            'Re-run failed nightly batch on client env',
            'VPN access issues for client staging',
            'Rebuild staging search index after outage',
        ],
    },
];
const ANCHOR_WORK_END = offsetToDate(76); // most unplanned work lands in recent weeks
for (const spec of UNPLANNED) {
    const budget = Math.round(unplannedBudget * spec.share);
    const weights = Array.from({ length: spec.n }, () => 0.6 + rnd());
    const wsum = weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < spec.n; i += 1) {
        const mh = Math.round((budget * weights[i]) / wsum);
        // spread evenly across the window the Connector has observed, so the period
        // share and the cumulative share of Unplanned Work are comparable
        const startOffset = 5 + Math.round(rnd() * 46);
        const workStart = offsetToDate(startOffset);
        tickets.push({
            trackerIssueId: `bk-issue-${ticketNo + 1}`,
            key: nextKey(),
            title: spec.titles[i],
            issueTypeId: spec.issueType,
            categoryIds: [spec.category],
            milestoneIds: [],
            estimateMh: spec.estimated ? Math.round(mh * 0.85) : null,
            finalActualMh: mh,
            workStart,
            workFinish: addDays(workStart, 4 + Math.round(rnd() * 14)),
            assigneeAccountId: pickAccount(),
            wpId: null,
            mappingSource: null,
        });
        if (workStart > ANCHOR_WORK_END) {
            /* keep within the observed window */
        }
    }
}
// ---------------------------------------------------------------- snapshots
const SNAPSHOT_COUNT = 6;
/** offsets in hours from the demo anchor; the last snapshot is 2h before it */
const snapshotOffsets = Array.from({ length: SNAPSHOT_COUNT }, (_, i) => -((SNAPSHOT_COUNT - 1 - i) * 7 * 24 + 2));
/** Anchor date used only to place fixture work on the calendar. */
const ANCHOR_DATE = '2026-09-16';
const snapshotDates = snapshotOffsets.map((h) => iso(d(ANCHOR_DATE) + h * 3600_000));
mkdirSync(join(ROOT, 'fixtures/backlog/ec-phase2'), { recursive: true });
mkdirSync(join(ROOT, 'fixtures/demo'), { recursive: true });
for (let i = 0; i < SNAPSHOT_COUNT; i += 1) {
    const asOf = snapshotDates[i];
    const out = tickets
        .filter((t) => t.workStart <= asOf)
        .map((t) => {
        const spanMs = Math.max(day, d(t.workFinish) - d(t.workStart));
        const frac = Math.max(0, Math.min(1, (d(asOf) - d(t.workStart)) / spanMs));
        const actual = Math.round(t.finalActualMh * frac);
        const attributes = [
            ...t.categoryIds.map((id) => ({ kind: 'category', id })),
            ...t.milestoneIds.map((id) => ({ kind: 'milestone', id })),
        ];
        return {
            trackerIssueId: t.trackerIssueId,
            key: t.key,
            title: t.title,
            statusId: frac >= 1 ? 'Closed' : frac > 0.05 ? 'In Progress' : 'Open',
            estimateMh: t.estimateMh,
            actualMh: actual,
            assigneeAccountId: t.assigneeAccountId,
            issueTypeId: t.issueTypeId,
            parentIssueId: null,
            trackerProjectId: 'EC2',
            attributes,
            createdAt: `${t.workStart}T01:00:00.000Z`,
        };
    });
    const accounts = (() => {
        const seen = new Map();
        for (const t of out) {
            if (!t.assigneeAccountId || seen.has(t.assigneeAccountId))
                continue;
            const res = RESOURCES.find((r) => r.accountId === t.assigneeAccountId);
            seen.set(t.assigneeAccountId, {
                accountId: t.assigneeAccountId,
                displayName: res?.name ?? t.assigneeAccountId,
            });
        }
        if (!seen.has(UNLINKED_ACCOUNT)) {
            // Keep the unlinked account discoverable when any ticket names it.
        }
        return [...seen.values()].sort((a, b) => a.accountId.localeCompare(b.accountId));
    })();
    writeFileSync(join(ROOT, `fixtures/backlog/ec-phase2/000${i + 1}.json`), `${JSON.stringify({
        scenario: 'ec-phase2',
        page: i + 1,
        observedAtOffsetHours: snapshotOffsets[i],
        recordedObservedAt: `${asOf}T09:00:00.000Z`,
        hoursFieldPresent: true,
        complete: true,
        tickets: out,
        accounts,
    }, null, 1)}\n`);
}
// ---------------------------------------------------------------- project fixture
const seedMappings = tickets
    .filter((t) => t.mappingSource === 'manual' && t.wpId)
    .map((t) => ({ ticketId: t.trackerIssueId, wpId: t.wpId, source: 'manual' }));
const project = {
    anchor: '2026-09-16T09:00:00.000Z',
    tenant: { id: 'ten-momo', name: 'Momo Digital KK' },
    department: { id: 'dep-delivery', name: 'Delivery' },
    // Story 1.3 slice 2: the demo Tenant's org carries one Program, and the Project sits in it.
    program: { id: 'prg-ec-platform', name: 'EC platform' },
    project: {
        id: 'prj-ec2',
        name: 'EC phase 2',
        clientName: '大阪リテール株式会社 (Osaka Retail Co., Ltd.)',
        contractType: '準委任',
        tzOffsetMinutes: 540,
        teireiWeekday: 4, // Thursday
        defaultRateYenPerHour: 4000,
        eacMethod: 'typical',
        calendar: { jp: true, vn: true },
        baselineStart: PROJECT_START,
        baselineFinish: PROJECT_FINISH,
    },
    resources: RESOURCES,
    unlinkedAccount: UNLINKED_ACCOUNT,
    // The WP rows carry no planned dates (story 2.2); the Baseline below keeps them.
    wps: wps.map(({ start: _start, finish: _finish, ...row }) => row),
    baseline: {
        id: 'bl-1',
        seq: 1,
        reason: 'Initial Baseline agreed with client at design sign-off',
        recordedAt: '2026-06-05T02:00:00.000Z',
        wps: wps
            .filter((w) => w.isLeaf && (w.baselineMh > 0 || w.isMilestone))
            .map((w) => ({
            wpId: w.id,
            start: w.isMilestone ? w.start : w.start,
            finish: w.isMilestone ? w.start : w.finish,
            baselineMh: w.baselineMh,
            isMilestone: w.isMilestone,
            isCatchAll: w.isCatchAll,
        })),
    },
    mappingRules: [
        {
            id: 'rule-support',
            priority: 1,
            name: 'Backlog category “Support” → 7.3 Support & miscellaneous',
            wpId: wpIdOf('7.3'),
            match: { field: 'category', value: 'Support' },
        },
        {
            id: 'rule-qa',
            priority: 2,
            name: 'Backlog category “QA” → 6.2 System test cycle 1',
            wpId: wpIdOf('6.2'),
            match: { field: 'category', value: 'QA' },
        },
    ],
    seedMappings,
};
writeFileSync(join(ROOT, 'fixtures/demo/project.json'), `${JSON.stringify(project, null, 1)}\n`);
console.log(`wrote ${SNAPSHOT_COUNT} snapshots, ${tickets.length} tickets, ${wps.length} WPs, ${seedMappings.length} seed Mappings`);
