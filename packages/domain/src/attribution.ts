import { periodContains, projectDate, type ReportingPeriod } from './calendar';
import type { MappingHeadEntry } from './mapping';
import type { BaselineVersion, LedgerEntry, ProjectConfig, Resource, WorkPackage } from './types';
import { costOf, minBigint, type Jpy, type Mh } from './units';

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

function rateFor(
  resources: Resource[],
  accountId: string | null,
  onDate: string,
  project: ProjectConfig,
): Jpy {
  if (!accountId) return project.defaultRateYenPerHour;
  const r = resources.find((x) => x.trackerAccountIds.includes(accountId));
  // FR-13: hours from an unlinked Tracker Account are Unattributed, at the
  // Project default Rate.
  if (!r) return project.defaultRateYenPerHour;
  const applicable = r.rates
    .filter((x) => x.effectiveFrom <= onDate)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];
  return applicable?.yenPerHour ?? project.defaultRateYenPerHour;
}

export function attribute(input: AttributionInput): AttributionResult {
  const { entries, head, wps, baselineVersions, resources, project, period } = input;

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
    const yen = rateFor(resources, e.assigneeAccountId, onDate, project);
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
