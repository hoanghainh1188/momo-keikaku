import { PROJECT_REACH } from '../authz/authorize';
import { compareBigint, hourBucketForTicket, mappingHead, ticketShareBucketFor, } from '@momo/domain';
import { runProjectRead } from './project-input';
/** How many Tickets the Mapping surface lists: the ones carrying the most hours. */
export const MAPPING_TICKET_LIMIT = 60;
/** Page size when a Scope Ledger segment filters the Tickets list (story 5.11). */
export const MAPPING_BUCKET_PAGE_SIZE = 50;
function activeBaselineWpIds(bundle) {
    const seq = bundle.input.activeBaselineSeq;
    if (seq === null)
        return new Set();
    const bl = bundle.input.baselineVersions.find((b) => b.seq === seq);
    if (!bl)
        return new Set();
    return new Set(bl.wps.filter((w) => w.baselineMh > 0n).map((w) => w.wpId));
}
function catchAllOverflowTicketIds(coverage) {
    // Epic-5-retro F5: same project-wide attribute pass as the Coverage bar (ledgerNoOb).
    const ids = new Set();
    for (const [ticketId, mh] of coverage.overflowMhByTicket) {
        if (mh > 0n)
            ids.add(ticketId);
    }
    return ids;
}
function toTicketRows({ bundle, review }) {
    const head = mappingHead(bundle.input.mappingEvents);
    const leafWps = bundle.wps
        .filter((w) => w.isLeaf && !w.isMilestone)
        .map((w) => ({ id: w.id, wbsCode: w.wbsCode, name: w.name, label: `${w.wbsCode} ${w.name}` }));
    const labelOf = new Map(leafWps.map((w) => [w.id, w.label]));
    const baselineWpIds = activeBaselineWpIds(bundle);
    const overflowIds = catchAllOverflowTicketIds(review.coverage.perConnector);
    const ownerByTicket = bundle.input.ownerConnectorByTicket ?? new Map();
    const leftScope = bundle.input.leftScopeTicketIds ?? new Set();
    return bundle.input.pinnedSnapshot.tickets
        .filter((t) => !leftScope.has(t.trackerIssueId))
        .map((t) => {
        const mapping = head.get(t.trackerIssueId);
        const wpId = mapping?.wpId ?? null;
        const hourShareBucket = hourBucketForTicket(t.trackerIssueId, head, new Map(bundle.wps.map((w) => [w.id, w])), baselineWpIds, bundle.input.wpFlagEvents, bundle.input.wpFlagSeqMax);
        // Align with computeCoverage: never invent an owner. Missing map entry → '' so a
        // Connector filter cannot list Tickets that coverage did not count there.
        const ownerConnectorId = ownerByTicket.get(t.trackerIssueId) ?? '';
        return {
            trackerIssueId: t.trackerIssueId,
            key: t.key,
            title: t.title,
            categoryIds: t.attributes.filter((a) => a.kind === 'category').map((a) => a.id),
            statusId: t.statusId,
            mh: review.attribution.hoursByTicket.get(t.trackerIssueId) ?? 0n,
            wpId,
            wpLabel: wpId ? (labelOf.get(wpId) ?? wpId) : null,
            source: mapping?.source ?? 'none',
            ownerConnectorId,
            ticketShareBucket: ticketShareBucketFor(t.trackerIssueId, head, bundle.wps, bundle.input.wpFlagEvents, bundle.input.wpFlagSeqMax),
            hourShareBucket,
            inCatchAllOverflow: overflowIds.has(t.trackerIssueId),
        };
    })
        .sort((a, b) => compareBigint(b.mh, a.mh));
}
/** Pure: filter + page Tickets for a Scope Ledger segment (story 5.11). */
export function ticketsInBucket(allTickets, filter) {
    const filtered = allTickets.filter((t) => {
        if (filter.connectorId !== 'project-total' && t.ownerConnectorId !== filter.connectorId) {
            return false;
        }
        if (filter.basis === 'tickets') {
            return t.ticketShareBucket === filter.segmentKey;
        }
        if (filter.segmentKey === 'catch-all-overflow') {
            return t.inCatchAllOverflow;
        }
        return t.hourShareBucket === filter.segmentKey;
    });
    const page = Math.max(0, filter.page);
    const start = page * MAPPING_BUCKET_PAGE_SIZE;
    return {
        tickets: filtered.slice(start, start + MAPPING_BUCKET_PAGE_SIZE),
        total: filtered.length,
    };
}
/** The join, pure: a Review in, the Mapping surface's rows out. */
export function toProjectMapping({ bundle, review }) {
    const leafWps = bundle.wps
        .filter((w) => w.isLeaf && !w.isMilestone)
        .map((w) => ({ id: w.id, wbsCode: w.wbsCode, name: w.name, label: `${w.wbsCode} ${w.name}` }));
    const labelOf = new Map(leafWps.map((w) => [w.id, w.label]));
    const rules = bundle.rules.map((rule) => ({
        id: rule.id,
        priority: rule.priority,
        name: rule.name,
        match: { field: rule.match.field, value: rule.match.value },
        displayValue: rule.match.field === 'parent' ? (rule.parentKey ?? rule.match.value) : rule.match.value,
        wpId: rule.wpId,
        wpLabel: labelOf.get(rule.wpId) ?? rule.wpId,
        currentlyMapped: rule.currentlyMapped,
    }));
    const allTickets = toTicketRows({ bundle, review });
    const tickets = allTickets.slice(0, MAPPING_TICKET_LIMIT);
    return {
        scopeLedger: review.scopeLedger,
        openingBalanceMh: review.openingBalanceMh,
        totalMh: review.attribution.cumulative.totalMh,
        coverage: review.coverage,
        coverageByConnector: review.coverage.perConnector,
        leafWps,
        rules,
        tickets,
        allTickets,
    };
}
/**
 * The Mapping surface of a Project: Coverage, the Mapping Rules and the Tickets carrying the
 * most hours, each already joined to its Work Package's label and ordered as rendered.
 *
 * Same contract as `getProjectReview`, whose load it shares: `not_found` for a Project that
 * does not exist or is another Tenant's, `invalid_input` for an empty or absent `projectId`,
 * and every other failure propagates.
 */
export async function getProjectMapping(deps, ctx, input) {
    return runProjectRead(ctx, input, async (tenantId, projectId) => toProjectMapping(await deps.projectRead.loadReview(deps.handle, tenantId, projectId)));
}
/** Role declaration for this use case (colocated — see `role-declarations.ts`). */
export const GET_PROJECT_MAPPING_ROLES = {
    getProjectMapping: PROJECT_REACH,
};
