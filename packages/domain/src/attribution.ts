import { periodContains, projectDate, type ReportingPeriod } from './calendar';
import type { MappingHeadEntry } from './mapping';
import { isResolvedStatus } from './types';
import type {
  BaselineVersion,
  LedgerEntry,
  ProjectConfig,
  RateEntry,
  RatePins,
  Resource,
  WorkPackage,
  WpFlagEvent,
} from './types';
import { costOf, countValue, minBigint, type CountMetric, type Jpy, type Mh } from './units';

/**
 * Story 5.12: Catch-all at the flag head ≤ `wpFlagSeqMax`. When events are omitted (legacy
 * unit fixtures), fall back to the live WP cache so existing tests keep working.
 */
export function isCatchAllAtPin(
  wpId: string,
  wp: WorkPackage | undefined,
  flagEvents: readonly WpFlagEvent[] | undefined,
  wpFlagSeqMax: number | null | undefined,
): boolean {
  if (flagEvents === undefined) return wp?.isCatchAll ?? false;
  let head = false;
  for (const e of flagEvents) {
    if (wpFlagSeqMax !== undefined && wpFlagSeqMax !== null && e.seq > wpFlagSeqMax) continue;
    if (e.wpId === wpId) head = e.isCatchAll;
  }
  return head;
}

/** One overflow slice on the LIFO stack — hours costed at the entry Rate that produced them. */
interface OverflowSlice {
  mh: Mh;
  yenPerHour: Jpy;
  ticketId: string;
}

interface CatchAllState {
  /** Cumulative hours on this Catch-all WP (within + overflow). */
  already: Mh;
  overflowStack: OverflowSlice[];
}

/**
 * AD-9: attribution is computed here at query time from the ledger and the Mapping
 * history, and is never stored. FR-20's four buckets are mutually exclusive and sum
 * to total ledger hours (excluding Opening Balances).
 */
export interface Buckets {
  /** hours mapped to baselined WPs that are not Catch-all */
  mappedBaselinedMh: Mh;
  /** hours mapped to non-baselined WPs that are not Catch-all (e.g. created by *Plan*) */
  mappedNonBaselinedMh: Mh;
  /** hours mapped to Catch-all WPs, within their Baseline hours (Level of Effort) */
  catchAllMh: Mh;
  /** hours on Catch-all WPs beyond their Baseline hours */
  catchAllOverflowMh: Mh;
  /** hours on Unmapped Tickets */
  unmappedMh: Mh;
  totalMh: Mh;
  /** FR-20 Unplanned Work = unmapped + non-baselined + catch-all overflow */
  unplannedMh: Mh;
  unplannedJpy: Jpy;
  totalJpy: Jpy;
}

const emptyBuckets = (): Buckets => ({
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

export interface AttributionInput {
  entries: readonly LedgerEntry[];
  head: ReadonlyMap<string, MappingHeadEntry>;
  wps: readonly WorkPackage[];
  baselineVersions: readonly BaselineVersion[];
  resources: readonly Resource[];
  project: ProjectConfig;
  period: ReportingPeriod;
  /**
   * Optional seq pins (story 1.6). Omit for the live view. With a pin, only Rates at or below
   * it count — a Published Snapshot will supply these (Epic 5).
   */
  pins?: RatePins;
  /**
   * Project default Rate history for a pinned lookup. Live unpinned valuation still uses
   * `project.defaultRateYenPerHour` (the column cache); history is needed only when
   * `pins.projectDefaultRateSeqMax` is set.
   */
  projectDefaultRates?: RateEntry[];
  /**
   * Story 5.12: Catch-all flag events. When provided, membership is judged at
   * `wpFlagSeqMax` (live column ignored for compute).
   */
  wpFlagEvents?: readonly WpFlagEvent[];
  /** Pin ceiling for `wp_flag_event` (ComputationInputs). */
  wpFlagSeqMax?: number | null;
  /**
   * Story 5.13: ticket → owning Connector when `LedgerEntry.connectorId` is absent
   * (unit fixtures). OB grouping refuses a row that still has no Connector id.
   */
  ownerConnectorByTicket?: ReadonlyMap<string, string>;
}

export interface AttributionResult {
  cumulative: Buckets;
  period: Buckets;
  /** cumulative AC per WP, excluding Catch-all overflow (which lives on the Unplanned line) */
  acByWp: Map<string, Mh>;
  /** FR-42: reported separately, never in period metrics */
  openingBalanceMh: Mh;
  /**
   * Story 5.13 / FR-20 / UX-DR23: Opening Balances grouped by owning Connector.
   * Empty when there are no `opening_balance` rows. Never folded into Period buckets.
   */
  openingBalanceMhByConnector: Map<string, Mh>;
  /** cumulative hours per Ticket (for drill-down) */
  hoursByTicket: Map<string, Mh>;
  /**
   * Story 5.12: net Catch-all overflow milli-hours per Ticket. Coverage's catch-all-overflow
   * Ticket set is every Ticket with a positive value here (honest; no invented distinct set).
   */
  overflowMhByTicket: Map<string, Mh>;
}

/**
 * Latest applicable Rate by `effective_from ≤ onDate` among rows with `seq ≤ seqMax` (omit
 * `seqMax` = no ceiling). Shared by Resource Rates and Project default Rate history (FR-12).
 */
export function rateOnDate(
  rates: readonly RateEntry[],
  onDate: string,
  seqMax?: number,
): Jpy | undefined {
  const applicable = rates
    .filter((x) => x.effectiveFrom <= onDate && (seqMax === undefined || x.seq <= seqMax))
    // Latest effective_from; on a tie, higher seq wins (FR-12 / AD-10 retroactive head).
    .sort((a, b) =>
      a.effectiveFrom !== b.effectiveFrom
        ? a.effectiveFrom < b.effectiveFrom
          ? 1
          : -1
        : b.seq - a.seq,
    )[0];
  return applicable?.yenPerHour;
}

function projectDefaultOnDate(
  project: ProjectConfig,
  onDate: string,
  history: readonly RateEntry[] | undefined,
  seqMax: number | undefined,
): Jpy {
  if (seqMax === undefined) return project.defaultRateYenPerHour;
  return rateOnDate(history ?? [], onDate, seqMax) ?? 0n;
}

function rateFor(
  resources: readonly Resource[],
  accountId: string | null,
  onDate: string,
  project: ProjectConfig,
  pins: RatePins | undefined,
  projectDefaultRates: readonly RateEntry[] | undefined,
): Jpy {
  const fallback = () =>
    projectDefaultOnDate(project, onDate, projectDefaultRates, pins?.projectDefaultRateSeqMax);
  if (!accountId) return fallback();
  const r = resources.find((x) => x.trackerAccountIds.includes(accountId));
  // FR-13: hours from an unlinked Tracker Account are Unattributed, at the
  // Project default Rate.
  if (!r) return fallback();
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
function splitCatchAllEntry(
  state: CatchAllState,
  deltaMh: Mh,
  yen: Jpy,
  cap: Mh,
  ticketId: string,
): {
  within: Mh;
  over: Mh;
  withinJpy: Jpy;
  overJpy: Jpy;
  overflowTicketDeltas: ReadonlyArray<{ ticketId: string; mh: Mh }>;
} {
  if (deltaMh >= 0n) {
    const already = state.already;
    const after = already + deltaMh;
    state.already = after;
    const withinBefore = minBigint(already, cap);
    const withinAfter = minBigint(after, cap);
    const within = withinAfter - withinBefore;
    const over = deltaMh - within;
    const overflowTicketDeltas: { ticketId: string; mh: Mh }[] = [];
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
  const overflowTicketDeltas: { ticketId: string; mh: Mh }[] = [];
  while (remaining > 0n && state.overflowStack.length > 0) {
    const top = state.overflowStack[state.overflowStack.length - 1]!;
    const take = minBigint(top.mh, remaining);
    overCleared += take;
    overJpyCleared += costOf(take, top.yenPerHour);
    overflowTicketDeltas.push({ ticketId: top.ticketId, mh: -take });
    top.mh -= take;
    remaining -= take;
    if (top.mh === 0n) state.overflowStack.pop();
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

export function attribute(input: AttributionInput): AttributionResult {
  const {
    entries,
    head,
    wps,
    baselineVersions,
    resources,
    project,
    period,
    pins,
    projectDefaultRates,
    wpFlagEvents,
    wpFlagSeqMax,
    ownerConnectorByTicket,
  } = input;

  const wpById = new Map(wps.map((w) => [w.id, w]));
  const baselineByVersion = new Map<number, Map<string, Mh>>();
  for (const bv of baselineVersions) {
    baselineByVersion.set(bv.seq, new Map(bv.wps.map((b) => [b.wpId, b.baselineMh])));
  }

  const cumulative = emptyBuckets();
  const periodB = emptyBuckets();
  const acByWp = new Map<string, Mh>();
  const hoursByTicket = new Map<string, Mh>();
  const overflowMhByTicket = new Map<string, Mh>();
  /** Catch-all running state per WP (water-level + LIFO overflow stack). */
  const catchAllState = new Map<string, CatchAllState>();
  let openingBalanceMh: Mh = 0n;
  const openingBalanceMhByConnector = new Map<string, Mh>();

  // AR-18: cumulative order is (window_end, seq), not seq alone.
  const ordered = [...entries].sort((a, b) =>
    a.windowEnd !== b.windowEnd
      ? a.windowEnd < b.windowEnd
        ? -1
        : 1
      : a.seq - b.seq,
  );

  for (const e of ordered) {
    const onDate = projectDate(e.windowEnd, project.tzOffsetMinutes);
    const yen = rateFor(resources, e.assigneeAccountId, onDate, project, pins, projectDefaultRates);
    const money = costOf(e.deltaMh, yen);

    hoursByTicket.set(e.ticketId, (hoursByTicket.get(e.ticketId) ?? 0n) + e.deltaMh);

    if (e.kind === 'opening_balance') {
      openingBalanceMh += e.deltaMh;
      // FR-42: Opening Balances count in cumulative AC but never in Period metrics.
      // Story 5.13 / UX-DR23: group per Connector — refuse a row with no owner.
      const connectorId = e.connectorId ?? ownerConnectorByTicket?.get(e.ticketId) ?? null;
      if (!connectorId) {
        throw new Error(
          `opening_balance ledger entry seq ${e.seq} (ticket ${e.ticketId}) has no connector id`,
        );
      }
      openingBalanceMhByConnector.set(
        connectorId,
        (openingBalanceMhByConnector.get(connectorId) ?? 0n) + e.deltaMh,
      );
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

    type BucketField =
      | 'mappedBaselinedMh'
      | 'mappedNonBaselinedMh'
      | 'catchAllMh'
      | 'catchAllOverflowMh'
      | 'unmappedMh';

    const push = (field: BucketField, mh: Mh, jpy: Jpy, unplanned: boolean) => {
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
      const { within, over, withinJpy, overJpy, overflowTicketDeltas } = splitCatchAllEntry(
        state,
        e.deltaMh,
        yen,
        baselineMh,
        e.ticketId,
      );
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
    } else {
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
  };
}

/**
 * Story 5.7 / FR-27: Ticket-Count Mode Unplanned — Tickets first observed in, or Resolved
 * within, the Period whose Mapping at `mapping_seq_max` is Unplanned (null / absent leaf WP).
 *
 * One function used by both the Health indicator and the Review so two modules cannot colour
 * it differently. Does not change FR-20 hour buckets.
 */
export interface PeriodUnplannedTicketInput {
  readonly tickets: readonly {
    readonly trackerIssueId: string;
    /** Instant the Connector first observed this Ticket (or tracker createdAt as proxy). */
    readonly firstObservedAt: string;
    readonly statusId: string;
    /** Instant the Ticket became Resolved, when known. Null excludes Resolved-in-Period. */
    readonly resolvedAt: string | null;
  }[];
  readonly period: ReportingPeriod;
  /** Mapping head at `mapping_seq_max` — Unplanned when no leaf WP. */
  readonly head: ReadonlyMap<string, MappingHeadEntry>;
  readonly resolvedStatusIds: ReadonlySet<string>;
  readonly tzOffsetMinutes: number;
}

export interface PeriodUnplannedTicketResult {
  /** Tickets first observed or Resolved in the Period. */
  readonly periodTicketIds: readonly string[];
  /** Subset whose Mapping is Unplanned (null / absent leaf). */
  readonly unplannedTicketIds: readonly string[];
  readonly unplannedCount: CountMetric;
  /** Unplanned ÷ period tickets; null when the Period has no qualifying Tickets. */
  readonly unplannedShare: { num: bigint; den: bigint } | null;
}

function isUnplannedMapping(
  head: ReadonlyMap<string, MappingHeadEntry>,
  ticketId: string,
): boolean {
  const m = head.get(ticketId);
  return !m?.wpId;
}

/**
 * Period Unplanned ticket count (Ticket-Count Mode). Health and Review call only this.
 */
export function periodUnplannedTicketCount(
  input: PeriodUnplannedTicketInput,
): PeriodUnplannedTicketResult {
  const periodTicketIds: string[] = [];
  const unplannedTicketIds: string[] = [];

  for (const t of input.tickets) {
    const firstInPeriod = periodContains(
      input.period,
      projectDate(t.firstObservedAt, input.tzOffsetMinutes),
    );
    const resolvedInPeriod =
      t.resolvedAt !== null &&
      isResolvedStatus(t.statusId, input.resolvedStatusIds) &&
      periodContains(input.period, projectDate(t.resolvedAt, input.tzOffsetMinutes));

    if (!firstInPeriod && !resolvedInPeriod) continue;
    periodTicketIds.push(t.trackerIssueId);
    if (isUnplannedMapping(input.head, t.trackerIssueId)) {
      unplannedTicketIds.push(t.trackerIssueId);
    }
  }

  const unplannedShare =
    periodTicketIds.length === 0
      ? null
      : { num: BigInt(unplannedTicketIds.length), den: BigInt(periodTicketIds.length) };

  return {
    periodTicketIds,
    unplannedTicketIds,
    unplannedCount: countValue(unplannedTicketIds.length),
    unplannedShare,
  };
}

/**
 * Story 5.8 / FR-13: Department effort/cost roll-up including an *Unattributed* line so
 * Department totals equal Project totals. Hours with no linked Resource (null assignee or
 * unlinked account) land on `unattributed` — never a fake Department id.
 */
export interface DepartmentEffortLine {
  /** Home Department id, or `null` for the Unattributed line. */
  readonly departmentId: string | null;
  readonly mh: Mh;
  readonly jpy: Jpy;
}

export interface DepartmentEffortRollup {
  readonly lines: readonly DepartmentEffortLine[];
  readonly totalMh: Mh;
  readonly totalJpy: Jpy;
}

export function departmentEffortRollup(input: {
  readonly entries: readonly LedgerEntry[];
  readonly resources: readonly Resource[];
  readonly project: ProjectConfig;
  readonly pins?: RatePins;
  readonly projectDefaultRates?: readonly RateEntry[];
}): DepartmentEffortRollup {
  const byDept = new Map<string | null, { mh: Mh; jpy: Jpy }>();
  let totalMh: Mh = 0n;
  let totalJpy: Jpy = 0n;

  for (const e of input.entries) {
    const onDate = projectDate(e.windowEnd, input.project.tzOffsetMinutes);
    const yen = rateFor(
      [...input.resources],
      e.assigneeAccountId,
      onDate,
      input.project,
      input.pins,
      input.projectDefaultRates,
    );
    const money = costOf(e.deltaMh, yen);
    const resource = e.assigneeAccountId
      ? input.resources.find((r) => r.trackerAccountIds.includes(e.assigneeAccountId!))
      : undefined;
    const key = resource?.departmentId ?? null;
    const prev = byDept.get(key) ?? { mh: 0n, jpy: 0n };
    byDept.set(key, { mh: prev.mh + e.deltaMh, jpy: prev.jpy + money });
    totalMh += e.deltaMh;
    totalJpy += money;
  }

  const lines: DepartmentEffortLine[] = [...byDept.entries()]
    .map(([departmentId, v]) => ({ departmentId, mh: v.mh, jpy: v.jpy }))
    .sort((a, b) => {
      if (a.departmentId === null) return 1;
      if (b.departmentId === null) return -1;
      return a.departmentId < b.departmentId ? -1 : a.departmentId > b.departmentId ? 1 : 0;
    });

  return { lines, totalMh, totalJpy };
}

/** One Tracker Account row as FR-13 suggestion input (observation display name + email). */
export interface TrackerAccountForSuggest {
  readonly id: string;
  /** Observation account id — what ledger `assignee_account_id` and the live array store. */
  readonly accountId: string;
  readonly displayName: string;
  readonly email: string | null;
}

export interface ResourceForSuggest {
  readonly id: string;
  readonly name: string;
}

export interface LinkSuggestion {
  readonly trackerAccountId: string;
  readonly accountId: string;
  readonly displayName: string;
  readonly email: string | null;
  /** Linked Resource id when a live head exists; null when unlinked. */
  readonly linkedResourceId: string | null;
  /** Suggested Resources (email CI match first, else name CI). Empty when none. */
  readonly suggestedResourceIds: readonly string[];
  readonly matchKind: 'email' | 'name' | 'none' | 'linked';
}

function ciEq(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Story 5.8: suggest Tracker Account → Resource links.
 * Email CI equality of `account.email` vs `resource.name` beats display-name CI vs name
 * (Resource has no email column). Multiple name matches → all listed; PM picks.
 */
export function suggestTrackerAccountLinks(input: {
  readonly accounts: readonly TrackerAccountForSuggest[];
  readonly resources: readonly ResourceForSuggest[];
  /** Live head: observation accountId → resourceId (omit unlinked). */
  readonly linkedByAccountId?: ReadonlyMap<string, string>;
}): readonly LinkSuggestion[] {
  const linked = input.linkedByAccountId ?? new Map<string, string>();
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
        matchKind: 'linked' as const,
      };
    }
    const emailHits =
      account.email !== null && account.email.length > 0
        ? input.resources.filter((r) => ciEq(account.email!, r.name)).map((r) => r.id)
        : [];
    if (emailHits.length > 0) {
      return {
        trackerAccountId: account.id,
        accountId: account.accountId,
        displayName: account.displayName,
        email: account.email,
        linkedResourceId: null,
        suggestedResourceIds: emailHits,
        matchKind: 'email' as const,
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
      matchKind: nameHits.length > 0 ? ('name' as const) : ('none' as const),
    };
  });
}

/**
 * Build each Resource's `trackerAccountIds` from link-event heads ≤ `seqMax`.
 * Events ordered by seq ascending; last event per internal tracker_account id wins.
 * `accountIdByInternalId` maps internal id → observation accountId for the live array.
 */
export function trackerAccountIdsFromLinkHeads(input: {
  readonly events: readonly {
    readonly seq: number;
    readonly trackerAccountId: string;
    readonly resourceId: string | null;
  }[];
  readonly accountIdByInternalId: ReadonlyMap<string, string>;
  readonly resourceIds: readonly string[];
  readonly seqMax?: number;
}): Map<string, string[]> {
  const heads = new Map<string, string | null>();
  for (const e of input.events) {
    if (input.seqMax !== undefined && e.seq > input.seqMax) continue;
    heads.set(e.trackerAccountId, e.resourceId);
  }
  const byResource = new Map<string, string[]>();
  for (const id of input.resourceIds) byResource.set(id, []);
  for (const [internalId, resourceId] of heads) {
    if (resourceId === null) continue;
    const accountId = input.accountIdByInternalId.get(internalId);
    if (!accountId) continue;
    const list = byResource.get(resourceId);
    if (list) list.push(accountId);
    else byResource.set(resourceId, [accountId]);
  }
  return byResource;
}
