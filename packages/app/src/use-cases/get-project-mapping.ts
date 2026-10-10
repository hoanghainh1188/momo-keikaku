import { PROJECT_REACH, type RoleDeclaration } from '../authz/authorize';
import {
  compareBigint,
  hourBucketForTicket,
  mappingHead,
  ticketShareBucketFor,
  type CoverageResult,
  type HourShareSegment,
  type MappingEvent,
  type Mh,
  type ReviewResult,
  type TicketShareBucket,
} from '@momo/domain';
import type { Result } from '../result';
import type { ProjectReadDeps, ProjectReview } from '../ports/project-read';
import type { RequestContext } from '../authz/request-context';
import { runProjectRead, type ProjectInput } from './project-input';

/** How many Tickets the Mapping surface lists: the ones carrying the most hours. */
export const MAPPING_TICKET_LIMIT = 60;

/** Page size when a Scope Ledger segment filters the Tickets list (story 5.11). */
export const MAPPING_BUCKET_PAGE_SIZE = 50;

/** A leaf, non-milestone Work Package a Ticket can be mapped to. */
export interface MappingWorkPackage {
  readonly id: string;
  readonly wbsCode: string;
  readonly name: string;
  /** `${wbsCode} ${name}`, as every Mapping surface names a Work Package. */
  readonly label: string;
}

/** A Mapping Rule, with its target Work Package already named. */
export interface MappingRuleRow {
  readonly id: string;
  readonly priority: number;
  readonly name: string;
  readonly match: { readonly field: string; readonly value: string };
  /**
   * The condition value as the PM reads and types it (story 5.10): for `parent`, the parent
   * Ticket's KEY (the stored value is its tracker issue id); otherwise the stored value.
   */
  readonly displayValue: string;
  readonly wpId: string;
  /** The target's label, or its id when it is not a leaf, non-milestone Work Package. */
  readonly wpLabel: string;
  readonly currentlyMapped: number;
}

/** A Ticket of the pinned Tracker Snapshot, joined to its hours and its current Mapping. */
export interface MappingTicketRow {
  readonly trackerIssueId: string;
  readonly key: string;
  readonly title: string;
  readonly categoryIds: readonly string[];
  readonly statusId: string;
  readonly mh: Mh;
  /** The Work Package of the current Mapping; null when the Ticket is Unmapped. */
  readonly wpId: string | null;
  /** That Work Package's label (its id when it is not a listed one); null when Unmapped. */
  readonly wpLabel: string | null;
  /** Where the current Mapping came from; `none` for a Ticket that was never mapped. */
  readonly source: MappingEvent['source'] | 'none';
  /** Owning Connector (story 5.11). */
  readonly ownerConnectorId: string;
  /** Ticket-share bucket for segment filter (story 5.11). */
  readonly ticketShareBucket: TicketShareBucket;
  /**
   * Hours-bar membership for segment filter. Catch-all overflow shares Catch-all Tickets;
   * `inCatchAllOverflow` marks Tickets that also contributed overflow hours.
   */
  readonly hourShareBucket: HourShareSegment;
  readonly inCatchAllOverflow: boolean;
}

/** Optional Scope Ledger segment filter (story 5.11). */
export interface MappingTicketFilter {
  readonly connectorId: string | 'project-total';
  readonly basis: 'hours' | 'tickets';
  readonly segmentKey: string;
  readonly page: number;
}

/** Everything the Mapping surface renders (FR-21–FR-24), joined and ordered. */
export interface ProjectMapping {
  /** Review Unplanned Scope Ledger (FR-20 hours) — kept for compatibility. */
  readonly scopeLedger: ReviewResult['scopeLedger'];
  readonly openingBalanceMh: Mh;
  /** All attributed hours, cumulative — the Scope Ledger bar's whole. */
  readonly totalMh: Mh;
  /** Project-wide coverage (`mappedHourShare` excludes Catch-all; SM-5-aligned). */
  readonly coverage: ReviewResult['coverage'];
  /** Story 5.11: per-Connector + Project total + SM-5. */
  readonly coverageByConnector: CoverageResult;
  readonly leafWps: readonly MappingWorkPackage[];
  /** In the order the Project's rules are read (priority order). */
  readonly rules: readonly MappingRuleRow[];
  /** The `MAPPING_TICKET_LIMIT` Tickets carrying the most hours, most first; ties keep snapshot order. */
  readonly tickets: readonly MappingTicketRow[];
  /**
   * Every in-scope Ticket with bucket tags — client segment filter pages over this
   * (top-60 remains the unfiltered default in `tickets`).
   */
  readonly allTickets: readonly MappingTicketRow[];
}

function activeBaselineWpIds(bundle: ProjectReview['bundle']): Set<string> {
  const seq = bundle.input.activeBaselineSeq;
  if (seq === null) return new Set();
  const bl = bundle.input.baselineVersions.find((b) => b.seq === seq);
  if (!bl) return new Set();
  return new Set(bl.wps.filter((w) => w.baselineMh > 0n).map((w) => w.wpId));
}

function catchAllOverflowTicketIds(review: ReviewResult): Set<string> {
  // Story 5.12: honest per-Ticket overflow from attribution (closes 5.11 deferral).
  const ids = new Set<string>();
  for (const [ticketId, mh] of review.attribution.overflowMhByTicket) {
    if (mh > 0n) ids.add(ticketId);
  }
  return ids;
}

function toTicketRows({ bundle, review }: ProjectReview): MappingTicketRow[] {
  const head = mappingHead(bundle.input.mappingEvents);
  const leafWps = bundle.wps
    .filter((w) => w.isLeaf && !w.isMilestone)
    .map((w) => ({ id: w.id, wbsCode: w.wbsCode, name: w.name, label: `${w.wbsCode} ${w.name}` }));
  const labelOf = new Map(leafWps.map((w) => [w.id, w.label]));
  const baselineWpIds = activeBaselineWpIds(bundle);
  const overflowIds = catchAllOverflowTicketIds(review);
  const ownerByTicket = bundle.input.ownerConnectorByTicket ?? new Map<string, string>();
  const leftScope = bundle.input.leftScopeTicketIds ?? new Set<string>();

  return bundle.input.pinnedSnapshot.tickets
    .filter((t) => !leftScope.has(t.trackerIssueId))
    .map((t) => {
      const mapping = head.get(t.trackerIssueId);
      const wpId = mapping?.wpId ?? null;
      const hourShareBucket = hourBucketForTicket(
        t.trackerIssueId,
        head,
        new Map(bundle.wps.map((w) => [w.id, w])),
        baselineWpIds,
        bundle.input.wpFlagEvents,
        bundle.input.wpFlagSeqMax,
      );
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
        source: mapping?.source ?? ('none' as const),
        ownerConnectorId,
        ticketShareBucket: ticketShareBucketFor(
          t.trackerIssueId,
          head,
          bundle.wps,
          bundle.input.wpFlagEvents,
          bundle.input.wpFlagSeqMax,
        ),
        hourShareBucket,
        inCatchAllOverflow: overflowIds.has(t.trackerIssueId),
      };
    })
    .sort((a, b) => compareBigint(b.mh, a.mh));
}

/** Pure: filter + page Tickets for a Scope Ledger segment (story 5.11). */
export function ticketsInBucket(
  allTickets: readonly MappingTicketRow[],
  filter: MappingTicketFilter,
): { readonly tickets: readonly MappingTicketRow[]; readonly total: number } {
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
export function toProjectMapping({ bundle, review }: ProjectReview): ProjectMapping {
  const leafWps = bundle.wps
    .filter((w) => w.isLeaf && !w.isMilestone)
    .map((w) => ({ id: w.id, wbsCode: w.wbsCode, name: w.name, label: `${w.wbsCode} ${w.name}` }));
  const labelOf = new Map(leafWps.map((w) => [w.id, w.label]));

  const rules = bundle.rules.map((rule) => ({
    id: rule.id,
    priority: rule.priority,
    name: rule.name,
    match: { field: rule.match.field, value: rule.match.value },
    displayValue:
      rule.match.field === 'parent' ? (rule.parentKey ?? rule.match.value) : rule.match.value,
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
export async function getProjectMapping<Handle>(
  deps: ProjectReadDeps<Handle>,
  ctx: RequestContext,
  input: ProjectInput,
): Promise<Result<ProjectMapping>> {
  return runProjectRead(ctx, input, async (tenantId, projectId) =>
    toProjectMapping(await deps.projectRead.loadReview(deps.handle, tenantId, projectId)),
  );
}

/** Role declaration for this use case (colocated — see `role-declarations.ts`). */
export const GET_PROJECT_MAPPING_ROLES = {
  getProjectMapping: PROJECT_REACH,
} as const satisfies Readonly<Record<string, RoleDeclaration>>;
