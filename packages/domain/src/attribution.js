import { periodContains, projectDate } from './calendar';
import { isResolvedStatus } from './types';
import { costOf, countValue, minBigint } from './units';
/**
 * Story 5.12: Catch-all at the flag head ≤ `wpFlagSeqMax`. When events are omitted (legacy
 * unit fixtures), fall back to the live WP cache so existing tests keep working.
 */
export function isCatchAllAtPin(wpId, wp, flagEvents, wpFlagSeqMax) {
    if (flagEvents === undefined)
        return wp?.isCatchAll ?? false;
    let head = false;
    for (const e of flagEvents) {
        if (wpFlagSeqMax !== undefined && wpFlagSeqMax !== null && e.seq > wpFlagSeqMax)
            continue;
        if (e.wpId === wpId)
            head = e.isCatchAll;
    }
    return head;
}
const emptyBuckets = () => ({
    mappedBaselinedMh: 0n,
    mappedNonBaselinedMh: 0n,
    catchAllMh: 0n,
    catchAllOverflowMh: 0n,
    unmappedMh: 0n,
    totalMh: 0n,
    unplannedMh: 0n,
    unplannedJpy: 0n,
    totalJpy: 0n,
});
/**
 * Latest applicable Rate by `effective_from ≤ onDate` among rows with `seq ≤ seqMax` (omit
 * `seqMax` = no ceiling). Shared by Resource Rates and Project default Rate history (FR-12).
 */
export function rateOnDate(rates, onDate, seqMax) {
    const applicable = rates
        .filter((x) => x.effectiveFrom <= onDate && (seqMax === undefined || x.seq <= seqMax))
        // Latest effective_from; on a tie, higher seq wins (FR-12 / AD-10 retroactive head).
        .sort((a, b) => a.effectiveFrom !== b.effectiveFrom
        ? a.effectiveFrom < b.effectiveFrom
            ? 1
            : -1
        : b.seq - a.seq)[0];
    return applicable?.yenPerHour;
}
function projectDefaultOnDate(project, onDate, history, seqMax) {
    if (seqMax === undefined)
        return project.defaultRateYenPerHour;
    return rateOnDate(history ?? [], onDate, seqMax) ?? 0n;
}
function rateFor(resources, accountId, onDate, project, pins, projectDefaultRates) {
    const fallback = () => projectDefaultOnDate(project, onDate, projectDefaultRates, pins?.projectDefaultRateSeqMax);
    if (!accountId)
        return fallback();
    const r = resources.find((x) => x.trackerAccountIds.includes(accountId));
    // FR-13: hours from an unlinked Tracker Account are Unattributed, at the
    // Project default Rate.
    if (!r)
        return fallback();
    return rateOnDate(r.rates, onDate, pins?.rateSeqMax) ?? fallback();
}
/**
 * FR-24 / AR-18: split a Catch-all entry against the water-level cap. Positive deltas prorate
 * the crossing entry at one Rate; negatives LIFO-unwind the overflow stack first (costed at
 * each slice's original Rate), then reduce within at the current entry Rate.
 *
 * `overflowTicketDeltas` is the per-Ticket overflow mh change for this entry (positive when
 * this Ticket contributed overflow; negative when LIFO cleared a Ticket's prior overflow).
 */
function splitCatchAllEntry(state, deltaMh, yen, cap, ticketId) {
    if (deltaMh >= 0n) {
        const already = state.already;
        const after = already + deltaMh;
        state.already = after;
        const withinBefore = minBigint(already, cap);
        const withinAfter = minBigint(after, cap);
        const within = withinAfter - withinBefore;
        const over = deltaMh - within;
        const overflowTicketDeltas = [];
        if (over > 0n) {
            state.overflowStack.push({ mh: over, yenPerHour: yen, ticketId });
            overflowTicketDeltas.push({ ticketId, mh: over });
        }
        return {
            within,
            over,
            withinJpy: costOf(within, yen),
            overJpy: costOf(over, yen),
            overflowTicketDeltas,
        };
    }
    // Negative: LIFO from overflow, then within. Clamp so cumulative cannot go negative.
    let remaining = -deltaMh;
    let overCleared = 0n;
    let overJpyCleared = 0n;
    const overflowTicketDeltas = [];
    while (remaining > 0n && state.overflowStack.length > 0) {
        const top = state.overflowStack[state.overflowStack.length - 1];
        const take = minBigint(top.mh, remaining);
        overCleared += take;
        overJpyCleared += costOf(take, top.yenPerHour);
        overflowTicketDeltas.push({ ticketId: top.ticketId, mh: -take });
        top.mh -= take;
        remaining -= take;
        if (top.mh === 0n)
            state.overflowStack.pop();
    }
    const withinAvailable = state.already - overCleared;
    const withinCleared = minBigint(remaining, withinAvailable < 0n ? 0n : withinAvailable);
    const withinJpyCleared = costOf(withinCleared, yen);
    state.already -= overCleared + withinCleared;
    return {
        within: -withinCleared,
        over: -overCleared,
        withinJpy: -withinJpyCleared,
        overJpy: -overJpyCleared,
        overflowTicketDeltas,
    };
}
export function attribute(input) {
    const { entries, head, wps, baselineVersions, resources, project, period, pins, projectDefaultRates, wpFlagEvents, wpFlagSeqMax, ownerConnectorByTicket, } = input;
    const wpById = new Map(wps.map((w) => [w.id, w]));
    const baselineByVersion = new Map();
    for (const bv of baselineVersions) {
        baselineByVersion.set(bv.seq, new Map(bv.wps.map((b) => [b.wpId, b.baselineMh])));
    }
    const cumulative = emptyBuckets();
    const periodB = emptyBuckets();
    const acByWp = new Map();
    const hoursByTicket = new Map();
    const overflowMhByTicket = new Map();
    const cumulativeByConnector = new Map();
    /** Catch-all running state per WP (water-level + LIFO overflow stack). */
    const catchAllState = new Map();
    let openingBalanceMh = 0n;
    const openingBalanceMhByConnector = new Map();
    // AR-18: cumulative order is (window_end, seq), not seq alone.
    const ordered = [...entries].sort((a, b) => a.windowEnd !== b.windowEnd
        ? a.windowEnd < b.windowEnd
            ? -1
            : 1
        : a.seq - b.seq);
    for (const e of ordered) {
        const onDate = projectDate(e.windowEnd, project.tzOffsetMinutes);
        const yen = rateFor(resources, e.assigneeAccountId, onDate, project, pins, projectDefaultRates);
        const money = costOf(e.deltaMh, yen);
        hoursByTicket.set(e.ticketId, (hoursByTicket.get(e.ticketId) ?? 0n) + e.deltaMh);
        // Owner for connector slices / OB grouping (ledger writer id, else ownership map).
        const ownerConnectorId = e.connectorId ?? ownerConnectorByTicket?.get(e.ticketId) ?? null;
        if (e.kind === 'opening_balance') {
            openingBalanceMh += e.deltaMh;
            // FR-42: Opening Balances count in cumulative AC but never in Period metrics.
            // Story 5.13 / UX-DR23: group per Connector — refuse a row with no owner.
            if (!ownerConnectorId) {
                throw new Error(`opening_balance ledger entry seq ${e.seq} (ticket ${e.ticketId}) has no connector id`);
            }
            openingBalanceMhByConnector.set(ownerConnectorId, (openingBalanceMhByConnector.get(ownerConnectorId) ?? 0n) + e.deltaMh);
        }
        const inPeriod = e.kind !== 'opening_balance' && periodContains(period, onDate);
        const mapped = head.get(e.ticketId);
        const wp = mapped?.wpId ? wpById.get(mapped.wpId) : undefined;
        // FR-30: baselined-ness is judged against the Baseline version active when the
        // entry was recorded, identified by seq (adversarial review H3).
        const baselineMap = e.activeBaselineVersionSeq
            ? baselineByVersion.get(e.activeBaselineVersionSeq)
            : undefined;
        const baselineMh = wp && baselineMap ? (baselineMap.get(wp.id) ?? 0n) : 0n;
        const push = (field, mh, jpy, unplanned) => {
            cumulative[field] += mh;
            cumulative.totalMh += mh;
            cumulative.totalJpy += jpy;
            if (unplanned) {
                cumulative.unplannedMh += mh;
                cumulative.unplannedJpy += jpy;
            }
            if (inPeriod) {
                periodB[field] += mh;
                periodB.totalMh += mh;
                periodB.totalJpy += jpy;
                if (unplanned) {
                    periodB.unplannedMh += mh;
                    periodB.unplannedJpy += jpy;
                }
            }
            // Non-OB hours only — OB stays on openingBalanceMhByConnector (F5 / FR-42).
            if (e.kind !== 'opening_balance' && ownerConnectorId) {
                let byCon = cumulativeByConnector.get(ownerConnectorId);
                if (!byCon) {
                    byCon = emptyBuckets();
                    cumulativeByConnector.set(ownerConnectorId, byCon);
                }
                byCon[field] += mh;
                byCon.totalMh += mh;
                byCon.totalJpy += jpy;
                if (unplanned) {
                    byCon.unplannedMh += mh;
                    byCon.unplannedJpy += jpy;
                }
            }
        };
        if (!wp || !mapped?.wpId) {
            push('unmappedMh', e.deltaMh, money, true);
            continue;
        }
        const catchAll = isCatchAllAtPin(mapped.wpId, wp, wpFlagEvents, wpFlagSeqMax);
        if (catchAll) {
            // FR-24: LOE. AC counts only up to Baseline hours; the rest is Unplanned Work.
            // Cap 0 (no Baseline hours) → all hours overflow/Unplanned.
            let state = catchAllState.get(wp.id);
            if (!state) {
                state = { already: 0n, overflowStack: [] };
                catchAllState.set(wp.id, state);
            }
            const { within, over, withinJpy, overJpy, overflowTicketDeltas } = splitCatchAllEntry(state, e.deltaMh, yen, baselineMh, e.ticketId);
            if (within !== 0n) {
                push('catchAllMh', within, withinJpy, false);
                acByWp.set(wp.id, (acByWp.get(wp.id) ?? 0n) + within);
            }
            if (over !== 0n) {
                push('catchAllOverflowMh', over, overJpy, true);
            }
            for (const d of overflowTicketDeltas) {
                overflowMhByTicket.set(d.ticketId, (overflowMhByTicket.get(d.ticketId) ?? 0n) + d.mh);
            }
            continue;
        }
        if (baselineMh > 0n) {
            push('mappedBaselinedMh', e.deltaMh, money, false);
            acByWp.set(wp.id, (acByWp.get(wp.id) ?? 0n) + e.deltaMh);
        }
        else {
            // FR-29 *Plan*: hours stay Unplanned Work until a Re-baseline includes the WP.
            push('mappedNonBaselinedMh', e.deltaMh, money, true);
            acByWp.set(wp.id, (acByWp.get(wp.id) ?? 0n) + e.deltaMh);
        }
    }
    return {
        cumulative,
        period: periodB,
        acByWp,
        openingBalanceMh,
        openingBalanceMhByConnector,
        hoursByTicket,
        overflowMhByTicket,
        cumulativeByConnector,
    };
}
function isUnplannedMapping(head, ticketId) {
    const m = head.get(ticketId);
    return !m?.wpId;
}
/**
 * Period Unplanned ticket count (Ticket-Count Mode). Health and Review call only this.
 */
export function periodUnplannedTicketCount(input) {
    const periodTicketIds = [];
    const unplannedTicketIds = [];
    for (const t of input.tickets) {
        const firstInPeriod = periodContains(input.period, projectDate(t.firstObservedAt, input.tzOffsetMinutes));
        const resolvedInPeriod = t.resolvedAt !== null &&
            isResolvedStatus(t.statusId, input.resolvedStatusIds) &&
            periodContains(input.period, projectDate(t.resolvedAt, input.tzOffsetMinutes));
        if (!firstInPeriod && !resolvedInPeriod)
            continue;
        periodTicketIds.push(t.trackerIssueId);
        if (isUnplannedMapping(input.head, t.trackerIssueId)) {
            unplannedTicketIds.push(t.trackerIssueId);
        }
    }
    const unplannedShare = periodTicketIds.length === 0
        ? null
        : { num: BigInt(unplannedTicketIds.length), den: BigInt(periodTicketIds.length) };
    return {
        periodTicketIds,
        unplannedTicketIds,
        unplannedCount: countValue(unplannedTicketIds.length),
        unplannedShare,
    };
}
export function departmentEffortRollup(input) {
    const byDept = new Map();
    let totalMh = 0n;
    let totalJpy = 0n;
    for (const e of input.entries) {
        const onDate = projectDate(e.windowEnd, input.project.tzOffsetMinutes);
        const yen = rateFor([...input.resources], e.assigneeAccountId, onDate, input.project, input.pins, input.projectDefaultRates);
        const money = costOf(e.deltaMh, yen);
        const resource = e.assigneeAccountId
            ? input.resources.find((r) => r.trackerAccountIds.includes(e.assigneeAccountId))
            : undefined;
        const key = resource?.departmentId ?? null;
        const prev = byDept.get(key) ?? { mh: 0n, jpy: 0n };
        byDept.set(key, { mh: prev.mh + e.deltaMh, jpy: prev.jpy + money });
        totalMh += e.deltaMh;
        totalJpy += money;
    }
    const lines = [...byDept.entries()]
        .map(([departmentId, v]) => ({ departmentId, mh: v.mh, jpy: v.jpy }))
        .sort((a, b) => {
        if (a.departmentId === null)
            return 1;
        if (b.departmentId === null)
            return -1;
        return a.departmentId < b.departmentId ? -1 : a.departmentId > b.departmentId ? 1 : 0;
    });
    return { lines, totalMh, totalJpy };
}
function ciEq(a, b) {
    return a.toLowerCase() === b.toLowerCase();
}
/**
 * Story 5.8: suggest Tracker Account → Resource links.
 * Email CI equality of `account.email` vs `resource.name` beats display-name CI vs name
 * (Resource has no email column). Multiple name matches → all listed; PM picks.
 */
export function suggestTrackerAccountLinks(input) {
    const linked = input.linkedByAccountId ?? new Map();
    return input.accounts.map((account) => {
        const linkedResourceId = linked.get(account.accountId) ?? null;
        if (linkedResourceId) {
            return {
                trackerAccountId: account.id,
                accountId: account.accountId,
                displayName: account.displayName,
                email: account.email,
                linkedResourceId,
                suggestedResourceIds: [],
                matchKind: 'linked',
            };
        }
        const emailHits = account.email !== null && account.email.length > 0
            ? input.resources.filter((r) => ciEq(account.email, r.name)).map((r) => r.id)
            : [];
        if (emailHits.length > 0) {
            return {
                trackerAccountId: account.id,
                accountId: account.accountId,
                displayName: account.displayName,
                email: account.email,
                linkedResourceId: null,
                suggestedResourceIds: emailHits,
                matchKind: 'email',
            };
        }
        const nameHits = input.resources
            .filter((r) => ciEq(account.displayName, r.name))
            .map((r) => r.id);
        return {
            trackerAccountId: account.id,
            accountId: account.accountId,
            displayName: account.displayName,
            email: account.email,
            linkedResourceId: null,
            suggestedResourceIds: nameHits,
            matchKind: nameHits.length > 0 ? 'name' : 'none',
        };
    });
}
/**
 * Build each Resource's `trackerAccountIds` from link-event heads ≤ `seqMax`.
 * Events ordered by seq ascending; last event per internal tracker_account id wins.
 * `accountIdByInternalId` maps internal id → observation accountId for the live array.
 */
export function trackerAccountIdsFromLinkHeads(input) {
    const heads = new Map();
    for (const e of input.events) {
        if (input.seqMax !== undefined && e.seq > input.seqMax)
            continue;
        heads.set(e.trackerAccountId, e.resourceId);
    }
    const byResource = new Map();
    for (const id of input.resourceIds)
        byResource.set(id, []);
    for (const [internalId, resourceId] of heads) {
        if (resourceId === null)
            continue;
        const accountId = input.accountIdByInternalId.get(internalId);
        if (!accountId)
            continue;
        const list = byResource.get(resourceId);
        if (list)
            list.push(accountId);
        else
            byResource.set(resourceId, [accountId]);
    }
    return byResource;
}
