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
} from './types';
import { costOf, countValue, minBigint, type CountMetric, type Jpy, type Mh } from './units';

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
  entries: LedgerEntry[];
  head: Map<string, MappingHeadEntry>;
  wps: WorkPackage[];
  baselineVersions: BaselineVersion[];
  resources: Resource[];
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
}

export interface AttributionResult {
  cumulative: Buckets;
  period: Buckets;
  /** cumulative AC per WP, excluding Catch-all overflow (which lives on the Unplanned line) */
  acByWp: Map<string, Mh>;
  /** FR-42: reported separately, never in period metrics */
  openingBalanceMh: Mh;
  /** cumulative hours per Ticket (for drill-down) */
  hoursByTicket: Map<string, Mh>;
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
  resources: Resource[],
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
  /** running cumulative hours per Catch-all WP, to split at its Baseline hours */
  const catchAllRunning = new Map<string, Mh>();
  let openingBalanceMh: Mh = 0n;

  const ordered = [...entries].sort((a, b) => a.seq - b.seq);

  for (const e of ordered) {
    const onDate = projectDate(e.windowEnd, project.tzOffsetMinutes);
    const yen = rateFor(resources, e.assigneeAccountId, onDate, project, pins, projectDefaultRates);
    const money = costOf(e.deltaMh, yen);

    hoursByTicket.set(e.ticketId, (hoursByTicket.get(e.ticketId) ?? 0n) + e.deltaMh);

    if (e.kind === 'opening_balance') {
      openingBalanceMh += e.deltaMh;
      // FR-42: Opening Balances count in cumulative AC but never in Period metrics.
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

    if (!wp) {
      push('unmappedMh', e.deltaMh, money, true);
      continue;
    }

    if (wp.isCatchAll) {
      // FR-24: LOE. AC counts only up to Baseline hours; the rest is Unplanned Work.
      const already = catchAllRunning.get(wp.id) ?? 0n;
      const after = already + e.deltaMh;
      catchAllRunning.set(wp.id, after);
      const cap = baselineMh;
      const withinBefore = minBigint(already, cap);
      const withinAfter = minBigint(after, cap);
      const within = withinAfter - withinBefore;
      const over = e.deltaMh - within;
      if (within !== 0n) {
        push('catchAllMh', within, costOf(within, yen), false);
        acByWp.set(wp.id, (acByWp.get(wp.id) ?? 0n) + within);
      }
      if (over !== 0n) push('catchAllOverflowMh', over, costOf(over, yen), true);
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

  return { cumulative, period: periodB, acByWp, openingBalanceMh, hoursByTicket };
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
