import { attribute, periodUnplannedTicketCount } from './attribution';
import { addDays } from './calendar';
import { computeCoverage, } from './coverage';
import { buildFormulaMetricDetails, ticketKeysByWpFromMapping, } from './formula-popover-detail';
import { computeEvm, FORMULA_VERSION } from './evm';
import { computeForecast } from './forecast';
import { compareRatio, computeHealth, isBehindPlan, resolveThresholds, } from './health';
import { mappingHead } from './mapping';
import { compareWp } from './schedule/order';
import { remainingDuration } from './schedule/recalculate';
import { DEFAULT_RESOLVED_STATUS_IDS, isResolvedStatus, } from './types';
import { compareBigint, costOf, divRoundHalfEven, mhAmountOrZero, ratio, ratioValue, unavailable, sum, ZERO, } from './units';
/**
 * Story 6.4 Comfort threshold: leaf WPs with |Observed − Recorded| strictly greater than this
 * many percentage points appear on the gap list. Fixed at 10 pts (no Project setting UI).
 */
export const OBSERVED_RECORDED_GAP_THRESHOLD_PTS = 10;
/** Exact Ratio for the Comfort threshold (10 percentage points = 10/100). */
const GAP_THRESHOLD = ratio(BigInt(OBSERVED_RECORDED_GAP_THRESHOLD_PTS), 100n);
export function computeReview(input) {
    const mappingSeqMax = input.mappingSeqMax;
    const mappingEventsForHead = mappingSeqMax === undefined || mappingSeqMax === null
        ? input.mappingEvents
        : input.mappingEvents.filter((e) => e.seq <= mappingSeqMax);
    const head = mappingHead(mappingEventsForHead);
    const baseline = activeBaseline(input);
    const resolvedStatusIds = input.resolvedStatusIds ?? DEFAULT_RESOLVED_STATUS_IDS;
    const attribution = attribute({
        entries: input.ledger,
        head,
        wps: input.wps,
        baselineVersions: input.baselineVersions,
        resources: input.resources,
        project: input.project,
        period: input.period,
        wpFlagEvents: input.wpFlagEvents,
        wpFlagSeqMax: input.wpFlagSeqMax,
        ownerConnectorByTicket: input.ownerConnectorByTicket,
    });
    const wpById = new Map(input.wps.map((w) => [w.id, w]));
    const leftScope = input.leftScopeTicketIds ?? new Set();
    const connectorLabel = (id) => input.connectorsForCoverage?.find((c) => c.id === id)?.label ?? id;
    // Story 5.7: latched basis at basis_seq_max — never snapshot hoursFieldPresent.
    const measurementBasis = input.measurementBasis ?? 'count';
    // FR-30: mapped Tickets per WP, from the pinned Tracker Snapshot.
    const mappedTicketsByWp = new Map();
    for (const t of input.pinnedSnapshot.tickets) {
        const m = head.get(t.trackerIssueId);
        if (!m?.wpId)
            continue;
        const arr = mappedTicketsByWp.get(m.wpId) ?? [];
        arr.push(t);
        mappedTicketsByWp.set(m.wpId, arr);
    }
    const plannedScopeAcMh = attribution.cumulative.mappedBaselinedMh + attribution.cumulative.catchAllMh;
    const evmInputBase = {
        calendar: input.calendar,
        baseline: baseline,
        wps: input.wps,
        mappedTicketsByWp,
        acByWp: attribution.acByWp,
        unplannedAcMh: attribution.cumulative.unplannedMh,
        totalAcMh: attribution.cumulative.totalMh,
        plannedScopeAcMh,
        measurementBasis,
        acCoverage: input.acCoverage ?? null,
        resolvedStatusIds,
        priorEvByWp: input.priorEvByWp,
        formulaVersion: input.formulaVersion ?? FORMULA_VERSION,
    };
    const evm = baseline === null
        ? null
        : computeEvm({
            ...evmInputBase,
            asOf: input.asOf,
        });
    const evmAtPeriodStart = baseline === null
        ? null
        : computeEvm({
            ...evmInputBase,
            asOf: addDays(input.period.start, -1),
        });
    const ticketKeysByWp = ticketKeysByWpFromMapping(input.pinnedSnapshot.tickets, head);
    const formulaMetrics = evm === null || evmAtPeriodStart === null
        ? null
        : buildFormulaMetricDetails(evm, evmAtPeriodStart, ticketKeysByWp);
    const milestones = baseline === null ? null : milestoneRows(baseline, input.wps, input.asOf);
    const unplannedTickets = periodUnplannedTicketCount({
        tickets: input.pinnedSnapshot.tickets.map((t) => ({
            trackerIssueId: t.trackerIssueId,
            firstObservedAt: input.firstObservedAtByTicket?.get(t.trackerIssueId) ?? t.createdAt,
            statusId: t.statusId,
            resolvedAt: input.resolvedAtByTicket?.get(t.trackerIssueId) ?? null,
        })),
        period: input.period,
        head,
        resolvedStatusIds,
        tzOffsetMinutes: input.project.tzOffsetMinutes,
    });
    const sharePeriodHours = attribution.period.totalMh > 0n
        ? ratio(attribution.period.unplannedMh, attribution.period.totalMh)
        : null;
    const sharePeriod = measurementBasis === 'count'
        ? unplannedTickets.unplannedShare === null
            ? null
            : ratio(unplannedTickets.unplannedShare.num, unplannedTickets.unplannedShare.den)
        : sharePeriodHours;
    const shareCumulative = attribution.cumulative.totalMh > 0n
        ? ratio(attribution.cumulative.unplannedMh, attribution.cumulative.totalMh)
        : null;
    const resolvedThresholds = resolveThresholds({
        // Prefer explicit pin override; else no Project override (Tenant / DEFAULT fall-through).
        // `project.thresholds` is not treated as an override — it was historically the hard-coded
        // DEFAULT_THRESHOLDS cache on the live ProjectConfig.
        projectOverride: input.projectHealthOverride ?? null,
        tenantDefaults: input.tenantHealthThresholds ?? null,
    });
    const scheduleFeed = buildScheduleFeed({
        scheduleHealth: input.scheduleHealth ?? null,
        baseline,
        wps: input.wps,
    });
    const healthCompute = computeHealth({
        evm,
        thresholds: resolvedThresholds.thresholds,
        unplannedSharePeriod: sharePeriod,
        unplannedShareCumulative: shareCumulative,
        slippedMilestones: (milestones ?? [])
            .filter((m) => m.slipped)
            .map((m) => ({ wbsCode: m.wbsCode, name: m.name, baselineDate: m.baselineDate })),
        measurementBasis,
        scheduleFeed,
    });
    const health = { ...healthCompute, resolvedThresholds };
    const forecast = baseline === null || evm === null
        ? null
        : computeForecast(evm, baseline, input.asOf, input.calendar, {
            computedFinish: input.scheduleHealth?.computedFinish ?? null,
            baselineProjectStart: input.baselineProjectStart ?? null,
        });
    // --- FR-28 / Story 5.13: every in-scope Ticket is mapped or listed unmapped
    // (null/absent/orphan head, including 0h). Left-scope stays out of this census.
    const dispositionByTicket = new Map();
    for (const d of [...input.dispositions].sort((a, b) => a.seq - b.seq))
        for (const t of d.ticketIds)
            dispositionByTicket.set(t, d.kind);
    const isMappedLeaf = (ticketId) => {
        const m = head.get(ticketId);
        return Boolean(m?.wpId && wpById.has(m.wpId));
    };
    const groups = new Map();
    for (const t of input.pinnedSnapshot.tickets) {
        if (leftScope.has(t.trackerIssueId))
            continue;
        if (isMappedLeaf(t.trackerIssueId))
            continue;
        const mh = attribution.hoursByTicket.get(t.trackerIssueId) ?? 0n;
        const categoryId = t.attributes.find((a) => a.kind === 'category')?.id;
        const attr = categoryId ?? t.issueTypeId;
        const g = groups.get(attr) ?? {
            key: attr,
            label: attr,
            attribute: categoryId ? 'category' : 'issue type',
            ticketCount: 0,
            mh: 0n,
            jpy: 0n,
            dispositioned: null,
            tickets: [],
        };
        g.ticketCount += 1;
        g.mh += mh;
        const ticketJpy = costOf(mh, input.project.defaultRateYenPerHour);
        g.jpy += ticketJpy;
        g.tickets.push({
            ticketId: t.trackerIssueId,
            key: t.key,
            title: t.title,
            mh,
            jpy: ticketJpy,
            resolved: isResolvedStatus(t.statusId, resolvedStatusIds),
            status: t.statusId,
        });
        groups.set(attr, g);
    }
    for (const g of groups.values()) {
        g.tickets.sort((a, b) => compareBigint(b.mh, a.mh));
        const kinds = new Set(g.tickets.map((t) => dispositionByTicket.get(t.ticketId)));
        g.dispositioned =
            kinds.size === 1 && !kinds.has(undefined) ? [...kinds][0] : null;
    }
    const unmappedGroups = [...groups.values()].sort((a, b) => compareBigint(b.mh, a.mh));
    // --- Story 5.10 / UX-DR23: "moved to Unmapped by rule '…'", persisting while unmapped (Q3).
    const ruleUnmapped = input.pinnedSnapshot.tickets
        .flatMap((t) => {
        const m = head.get(t.trackerIssueId);
        if (!m || m.source !== 'rule' || m.wpId !== null)
            return [];
        const ruleId = m.ruleId ?? null;
        return [
            {
                ticketId: t.trackerIssueId,
                key: t.key,
                title: t.title,
                ruleId,
                ruleName: ruleId === null ? null : (input.ruleNamesById?.get(ruleId) ?? null),
                mh: attribution.hoursByTicket.get(t.trackerIssueId) ?? 0n,
            },
        ];
    })
        .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const divergence = baseline === null || evm === null
        ? null
        : divergenceRows(baseline, evm, input.wps, attribution.acByWp);
    const recordedPctByWp = input.recordedPctByWp ?? new Map();
    const observedVsRecorded = baseline === null || evm === null
        ? null
        : observedVsRecordedGapRows({
            baseline,
            evm,
            wps: input.wps,
            recordedPctByWp,
            durationDaysByWp: input.durationDaysByWp ?? new Map(),
        });
    const pmAdjusted = pmAdjustedRows(input.wps, recordedPctByWp);
    // --- FR-23 coverage (Review captions; hour share from Coverage/SM-5 pass)
    const inScopePinned = input.pinnedSnapshot.tickets.filter((t) => !leftScope.has(t.trackerIssueId));
    const totalTickets = inScopePinned.length;
    const unmappedTickets = inScopePinned.filter((t) => !isMappedLeaf(t.trackerIssueId)).length;
    const connectorsForCoverage = input.connectorsForCoverage && input.connectorsForCoverage.length > 0
        ? [...input.connectorsForCoverage]
        : [
            {
                id: 'project',
                label: 'Project',
                measurementBasis,
            },
        ];
    const ownerConnectorByTicket = input.ownerConnectorByTicket ??
        new Map(input.pinnedSnapshot.tickets.map((t) => [t.trackerIssueId, connectorsForCoverage[0].id]));
    const perConnector = computeCoverage({
        tickets: input.pinnedSnapshot.tickets,
        head,
        wps: input.wps,
        ledger: input.ledger,
        baselineVersions: input.baselineVersions,
        resources: input.resources,
        project: input.project,
        period: input.period,
        connectors: connectorsForCoverage,
        ownerConnectorByTicket,
        leftScopeTicketIds: input.leftScopeTicketIds,
        projectStart: input.projectStart ?? null,
        asOf: input.asOf,
        wpFlagEvents: input.wpFlagEvents,
        wpFlagSeqMax: input.wpFlagSeqMax,
    });
    // Epic-5-retro F6 + Harry D1=B: same figure as SM-5 / Coverage (ledgerNoOb);
    // propagate `unavailable` — never coerce to Ratio ZERO / 0.0%.
    const coverageHourShare = perConnector.projectTotal.hourShare;
    const mappedHourShare = coverageHourShare.kind === 'unavailable'
        ? unavailable(coverageHourShare.reasonCode)
        : ratioValue(coverageHourShare.mappedExcludingCatchAll);
    const coverage = {
        mappedTicketShare: totalTickets === 0
            ? ZERO
            : ratio(BigInt(totalTickets - unmappedTickets), BigInt(totalTickets)),
        mappedHourShare,
        unmappedTickets,
        perConnector,
    };
    const c = attribution.cumulative;
    // SM-C1: Catch-all share of total hours — never 0 when unavailable.
    const catchAllShare = c.totalMh === 0n
        ? unavailable('no_hours')
        : ratioValue(ratio(c.catchAllMh + c.catchAllOverflowMh, c.totalMh));
    const scopeTotal = c.totalMh === 0n ? 1n : c.totalMh;
    // `label` is the stable key — ScopeLedgerBar translates via next-intl (story 5.11).
    const scopeLedger = [
        { key: 'mapped-baselined', label: 'mapped-baselined', mh: c.mappedBaselinedMh },
        { key: 'mapped-non-baselined', label: 'mapped-non-baselined', mh: c.mappedNonBaselinedMh },
        { key: 'catch-all', label: 'catch-all', mh: c.catchAllMh },
        { key: 'catch-all-overflow', label: 'catch-all-overflow', mh: c.catchAllOverflowMh },
        { key: 'unmapped', label: 'unmapped', mh: c.unmappedMh },
    ].map((s) => ({ ...s, share: ratio(s.mh, scopeTotal) }));
    const explainNotes = input.dispositions
        .filter((d) => d.kind === 'explain' && d.note)
        .map((d) => ({
        note: d.note,
        ticketCount: d.ticketIds.length,
        mh: sum(d.ticketIds.map((t) => attribution.hoursByTicket.get(t) ?? 0n)),
    }));
    // Story 5.13 / UX-DR23: per-Connector OB (omit zero / empty — never a misleading 0h claim).
    const openingBalanceByConnector = [
        ...attribution.openingBalanceMhByConnector.entries(),
    ]
        .filter(([, mh]) => mh !== 0n)
        .map(([connectorId, mh]) => ({
        connectorId,
        label: connectorLabel(connectorId),
        mh,
    }))
        .sort((a, b) => a.connectorId < b.connectorId ? -1 : a.connectorId > b.connectorId ? 1 : 0);
    // Story 5.13 / Q2→A: latest scope change per Connector (requires a predecessor).
    const leftScopeDetails = input.leftScopeTicketDetails ?? [];
    const eventsByConnector = new Map();
    for (const e of input.connectorScopeEvents ?? []) {
        const list = eventsByConnector.get(e.connectorId) ?? [];
        list.push(e);
        eventsByConnector.set(e.connectorId, list);
    }
    const latestScopeChanges = [];
    for (const [connectorId, events] of eventsByConnector) {
        const ordered = [...events].sort((a, b) => a.seq - b.seq);
        if (ordered.length < 2)
            continue;
        const previous = ordered[ordered.length - 2];
        const latest = ordered[ordered.length - 1];
        latestScopeChanges.push({
            connectorId,
            label: connectorLabel(connectorId),
            previousScope: previous.scope,
            newScope: latest.scope,
            at: latest.at,
            leftScopeTickets: leftScopeDetails
                .filter((t) => t.ownerConnectorId === connectorId)
                .map((t) => ({
                ticketId: t.trackerIssueId,
                key: t.key,
                hoursMh: t.hoursMh,
            }))
                .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
        });
    }
    latestScopeChanges.sort((a, b) => a.connectorId < b.connectorId ? -1 : a.connectorId > b.connectorId ? 1 : 0);
    return {
        formulaVersion: input.formulaVersion ?? FORMULA_VERSION,
        snapshot: {
            id: input.pinnedSnapshot.snapshotId,
            observedAt: input.pinnedSnapshot.observedAt,
            // Full pin length — left-scope Tickets stay in the snapshot chrome; coverage uses in-scope only.
            ticketCount: input.pinnedSnapshot.tickets.length,
        },
        measurementBasis,
        evm,
        evmAtPeriodStart,
        money: evm === null
            ? null
            : {
                pvJpy: costOf(mhAmountOrZero(evm.pvMh), input.project.defaultRateYenPerHour),
                evJpy: costOf(mhAmountOrZero(evm.evMh), input.project.defaultRateYenPerHour),
                bacJpy: costOf(evm.bacMh, input.project.defaultRateYenPerHour),
            },
        behindPlan: evm !== null && isBehindPlan(evm.spi),
        forecast,
        health,
        attribution,
        unplanned: {
            period: attribution.period,
            cumulative: attribution.cumulative,
            sharePeriod,
            shareCumulative,
            ticketCountPeriod: measurementBasis === 'count' ? unplannedTickets.unplannedTicketIds.length : null,
            components: [
                { key: 'unmapped', label: 'Unmapped Work', mh: c.unmappedMh, jpy: 0n },
                {
                    key: 'non-baselined',
                    label: 'Hours on non-baselined WPs',
                    mh: c.mappedNonBaselinedMh,
                    jpy: 0n,
                },
                {
                    key: 'catch-all-overflow',
                    label: 'Catch-all WP hours beyond Baseline',
                    mh: c.catchAllOverflowMh,
                    jpy: 0n,
                },
            ].map((component) => ({
                ...component,
                share: c.unplannedMh === 0n ? null : ratio(component.mh, c.unplannedMh),
            })),
        },
        scopeLedger,
        unmappedGroups,
        ruleUnmapped,
        milestones,
        divergence,
        observedVsRecorded,
        pmAdjusted,
        formulaMetrics,
        coverage,
        catchAllShare,
        dispositions: input.dispositions,
        explainNotes,
        openingBalanceMh: attribution.openingBalanceMh,
        openingBalanceByConnector,
        latestScopeChanges,
    };
}
/**
 * The active Baseline, or null when the Project has none. A seq naming no version is an
 * inconsistent input, not a missing Baseline, and still throws.
 */
function activeBaseline(input) {
    if (input.activeBaselineSeq === null)
        return null;
    const baseline = input.baselineVersions.find((b) => b.seq === input.activeBaselineSeq);
    if (!baseline)
        throw new Error(`no baseline version with seq ${input.activeBaselineSeq}`);
    return baseline;
}
/** Build the Schedule Health feed from pinned schedule outputs + Baseline milestones. */
function buildScheduleFeed(args) {
    const sh = args.scheduleHealth;
    if (sh == null)
        return null;
    const wpById = new Map(args.wps.map((w) => [w.id, w]));
    const baselineByWp = new Map((args.baseline?.wps ?? []).map((b) => [b.wpId, b]));
    const floats = sh.wps.map((w) => w.floatDays).filter((f) => f !== null);
    const minFloatDays = floats.length > 0 ? Math.min(...floats) : null;
    const mfoViolations = sh.violations
        .filter((v) => v.constraintType === 'must_finish_on')
        .map((v) => {
        const wp = wpById.get(v.wpId);
        const b = baselineByWp.get(v.wpId);
        const isMilestone = Boolean(wp?.isMilestone || b?.isMilestone);
        return {
            wpId: v.wpId,
            wbsCode: wp?.wbsCode ?? '',
            name: wp?.name ?? '',
            daysLate: v.daysLate,
            isMilestone,
        };
    });
    // Engine already sorts worst-first; keep stable if a partial feed arrives unsorted.
    mfoViolations.sort((a, b) => b.daysLate - a.daysLate || a.wbsCode.localeCompare(b.wbsCode));
    const derivedSlippedMilestones = [];
    for (const b of args.baseline?.wps ?? []) {
        if (!b.isMilestone)
            continue;
        const wp = wpById.get(b.wpId);
        if (wp?.actualFinish)
            continue; // done — calendar + derived slip do not apply
        const out = sh.wps.find((w) => w.wpId === b.wpId);
        if (!out?.earlyFinish)
            continue;
        if (out.earlyFinish > b.finish) {
            derivedSlippedMilestones.push({
                wbsCode: wp?.wbsCode ?? '',
                name: wp?.name ?? '',
                baselineDate: b.finish,
                derivedDate: out.earlyFinish,
            });
        }
    }
    return {
        minFloatDays,
        floatAnchorKind: sh.anchor?.kind ?? null,
        mfoViolations,
        derivedSlippedMilestones,
    };
}
/** FR-31: milestone slip, judged against the Baseline date; done is the actual finish. */
function milestoneRows(baseline, wps, asOf) {
    const wpById = new Map(wps.map((w) => [w.id, w]));
    // Sorted with the row's `wpId` in hand (AD-28's tie-break), which `MilestoneRow` does not carry.
    return baseline.wps
        .filter((b) => b.isMilestone)
        .map((b) => {
        const wp = wpById.get(b.wpId);
        const done = wp?.isMilestone ? wp.actualFinish : null;
        const row = {
            wbsCode: wp?.wbsCode ?? '',
            name: wp?.name ?? '',
            baselineDate: b.finish,
            doneDate: done,
            slipped: !done && asOf > b.finish,
        };
        return { key: { id: b.wpId, wbsCode: row.wbsCode }, row };
    })
        .sort((a, b) => compareWp(a.key, b.key))
        .map(({ row }) => row);
}
/** Divergence by WP: the Baseline against the Current Plan's effort and the actual dates. */
function divergenceRows(baseline, evm, wps, acByWp) {
    const baselineWpById = new Map(baseline.wps.map((b) => [b.wpId, b]));
    const perWpById = new Map(evm.perWp.map((w) => [w.wpId, w]));
    return wps
        .filter((w) => w.isLeaf)
        .map((w) => {
        const b = baselineWpById.get(w.id);
        const m = perWpById.get(w.id);
        const pctBasis = m?.pctBasis ?? 'no-evidence';
        return {
            wpId: w.id,
            wbsCode: w.wbsCode,
            name: w.name,
            baselineStart: b?.start ?? null,
            baselineFinish: b?.finish ?? null,
            actualStart: w.actualStart,
            actualFinish: w.actualFinish,
            baselineMh: b?.baselineMh ?? 0n,
            plannedMh: w.plannedMh,
            acMh: acByWp.get(w.id) ?? 0n,
            evMh: m?.evMh ?? 0n,
            pctComplete: m?.pctComplete ?? ZERO,
            pctBasis,
            lowEvidence: m?.lowEvidence ?? true,
            evFell: m?.evFell ?? false,
            estimateDrivenEv: pctBasis === 'estimate',
            // Story 5.12: show the Baseline pin when present; else the live cache (display only).
            isCatchAll: b?.isCatchAll ?? w.isCatchAll,
            nonBaselined: !b,
        };
    })
        .sort((a, b) => compareWp({ id: a.wpId, wbsCode: a.wbsCode }, { id: b.wpId, wbsCode: b.wbsCode }));
}
/** Exact |a − b| as an unreduced Ratio (both dens positive after construction). */
function absRatioDiff(a, b) {
    const left = a.num * b.den;
    const right = b.num * a.den;
    const den = a.den * b.den;
    const raw = left >= right ? left - right : right - left;
    const num = raw < 0n ? -raw : raw;
    const positiveDen = den < 0n ? -den : den;
    return ratio(num, positiveDen === 0n ? 1n : positiveDen);
}
/**
 * Story 6.4: leaf WPs whose |Observed − Recorded| exceeds the Comfort threshold (10 pts),
 * worst gap first. Recorded null schedules as 0%. EVRec = baselineMh × recordedPct (half-even).
 */
function observedVsRecordedGapRows(input) {
    const baselineWpById = new Map(input.baseline.wps.map((b) => [b.wpId, b]));
    const perWpById = new Map(input.evm.perWp.map((w) => [w.wpId, w]));
    const rows = [];
    for (const w of input.wps) {
        if (!w.isLeaf || w.isMilestone)
            continue;
        const m = perWpById.get(w.id);
        const b = baselineWpById.get(w.id);
        const observedPct = m?.pctComplete ?? ZERO;
        const pctBasis = m?.pctBasis ?? 'no-evidence';
        const head = input.recordedPctByWp.get(w.id);
        const recordedPct = head?.pct ?? null;
        const recordedForGap = recordedPct ?? ZERO;
        const gapAbs = absRatioDiff(observedPct, recordedForGap);
        if (compareRatio(gapAbs, GAP_THRESHOLD) <= 0)
            continue;
        const baselineMh = b?.baselineMh ?? 0n;
        const evObservedMh = m?.evMh ?? 0n;
        const evRecordedMh = recordedPct === null
            ? 0n
            : divRoundHalfEven(baselineMh * recordedPct.num, recordedPct.den);
        let recordedSource = 'none';
        if (head !== undefined) {
            recordedSource = head.source === 'pm_override' ? 'pm_override' : 'plan_edit';
            // Legacy rows with a head but null source still show as plan_edit (a written override).
            if (head.source === null)
                recordedSource = 'plan_edit';
        }
        const durationDays = input.durationDaysByWp.has(w.id)
            ? (input.durationDaysByWp.get(w.id) ?? null)
            : null;
        let remainingDaysBefore = null;
        let remainingDaysAfter = null;
        if (durationDays !== null && durationDays !== undefined) {
            // Consequence copy must never fail the Review (bad duration / pct → leave null).
            try {
                remainingDaysBefore = remainingDuration(durationDays, recordedPct);
                remainingDaysAfter = remainingDuration(durationDays, observedPct);
            }
            catch {
                remainingDaysBefore = null;
                remainingDaysAfter = null;
            }
        }
        rows.push({
            wpId: w.id,
            wbsCode: w.wbsCode,
            name: w.name,
            observedPct,
            pctBasis,
            evidenceCount: m?.mappedTickets ?? 0,
            recordedPct,
            recordedSource,
            recordedReason: head?.reason ?? null,
            gapAbs,
            evObservedMh,
            evRecordedMh,
            estimateDrivenEv: pctBasis === 'estimate',
            durationDays,
            remainingDaysBefore,
            remainingDaysAfter,
        });
    }
    rows.sort((a, b) => {
        const gapCmp = compareRatio(b.gapAbs, a.gapAbs);
        if (gapCmp !== 0)
            return gapCmp;
        return compareWp({ id: a.wpId, wbsCode: a.wbsCode }, { id: b.wpId, wbsCode: b.wbsCode });
    });
    return rows;
}
/** Leaf WPs with a non-empty pinned Recorded reason — PM-adjusted (story 6.4). */
function pmAdjustedRows(wps, recordedPctByWp) {
    const rows = [];
    for (const w of wps) {
        if (!w.isLeaf || w.isMilestone)
            continue;
        const head = recordedPctByWp.get(w.id);
        if (head === undefined)
            continue;
        const reason = head.reason?.trim() ?? '';
        if (reason.length === 0)
            continue;
        const source = head.source === 'pm_override' ? 'pm_override' : 'plan_edit';
        rows.push({
            wpId: w.id,
            wbsCode: w.wbsCode,
            name: w.name,
            recordedPct: head.pct,
            reason,
            source,
        });
    }
    rows.sort((a, b) => compareWp({ id: a.wpId, wbsCode: a.wbsCode }, { id: b.wpId, wbsCode: b.wbsCode }));
    return rows;
}
