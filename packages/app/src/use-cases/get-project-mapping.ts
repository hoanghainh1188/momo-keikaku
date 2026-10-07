import { PROJECT_REACH, type RoleDeclaration } from '../authz/authorize';
import { compareBigint, mappingHead, type MappingEvent, type Mh, type ReviewResult } from '@momo/domain';
import type { Result } from '../result';
import type { ProjectReadDeps, ProjectReview } from '../ports/project-read';
import type { RequestContext } from '../authz/request-context';
import { runProjectRead, type ProjectInput } from './project-input';

/** How many Tickets the Mapping surface lists: the ones carrying the most hours. */
export const MAPPING_TICKET_LIMIT = 60;

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
}

/** Everything the Mapping surface renders (FR-21–FR-24), joined and ordered. */
export interface ProjectMapping {
  readonly scopeLedger: ReviewResult['scopeLedger'];
  readonly openingBalanceMh: Mh;
  /** All attributed hours, cumulative — the Scope Ledger bar's whole. */
  readonly totalMh: Mh;
  readonly coverage: ReviewResult['coverage'];
  readonly leafWps: readonly MappingWorkPackage[];
  /** In the order the Project's rules are read (priority order). */
  readonly rules: readonly MappingRuleRow[];
  /** The `MAPPING_TICKET_LIMIT` Tickets carrying the most hours, most first; ties keep snapshot order. */
  readonly tickets: readonly MappingTicketRow[];
}

/** The join, pure: a Review in, the Mapping surface's rows out. */
export function toProjectMapping({ bundle, review }: ProjectReview): ProjectMapping {
  const head = mappingHead(bundle.input.mappingEvents);
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

  const tickets = bundle.input.pinnedSnapshot.tickets
    .map((t) => {
      const mapping = head.get(t.trackerIssueId);
      const wpId = mapping?.wpId ?? null;
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
      };
    })
    .sort((a, b) => compareBigint(b.mh, a.mh))
    .slice(0, MAPPING_TICKET_LIMIT);

  return {
    scopeLedger: review.scopeLedger,
    openingBalanceMh: review.openingBalanceMh,
    totalMh: review.attribution.cumulative.totalMh,
    coverage: review.coverage,
    leafWps,
    rules,
    tickets,
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
