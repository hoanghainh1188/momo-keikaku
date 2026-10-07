import { attribute, type AttributionInput, type Buckets } from './attribution';
import type { MeasurementBasis } from './basis';
import { addDays, type IsoDate } from './calendar';
import type { MappingHeadEntry } from './mapping';
import type {
  BaselineVersion,
  LedgerEntry,
  ProjectConfig,
  Resource,
  TicketObservation,
  WorkPackage,
} from './types';
import {
  ratio,
  ratioValue,
  unavailable,
  ZERO,
  type Mh,
  type Ratio,
  type RatioMetric,
} from './units';

/** Ticket-share segment keys (FR-23 three buckets; Catch-all is not mapped). */
export type TicketShareBucket = 'mapped' | 'catch-all' | 'unmapped';

/** Hours-share segment keys — FR-20 five-segment anatomy. */
export type HourShareSegment =
  | 'mapped-baselined'
  | 'mapped-non-baselined'
  | 'catch-all'
  | 'catch-all-overflow'
  | 'unmapped';

export const TICKET_SHARE_BUCKETS: readonly TicketShareBucket[] = [
  'mapped',
  'catch-all',
  'unmapped',
] as const;

export const HOUR_SHARE_SEGMENTS: readonly HourShareSegment[] = [
  'mapped-baselined',
  'mapped-non-baselined',
  'catch-all',
  'catch-all-overflow',
  'unmapped',
] as const;

const HOUR_SEGMENT_LABELS: Record<HourShareSegment, string> = {
  'mapped-baselined': 'Mapped to baselined WPs',
  'mapped-non-baselined': 'Mapped to non-baselined WPs',
  'catch-all': 'Catch-all (within Baseline)',
  'catch-all-overflow': 'Catch-all overflow',
  unmapped: 'Unmapped Work',
};

const TICKET_BUCKET_LABELS: Record<TicketShareBucket, string> = {
  mapped: 'Mapped (excluding Catch-all)',
  'catch-all': 'Catch-all',
  unmapped: 'Unmapped',
};

/** SM-5 target: mapped-excluding-Catch-all hour share ≥ 80%. */
export const SM5_TARGET: Ratio = { num: 80n, den: 100n };

/** Calendar days from Project start before SM-5 hour share is available. */
export const SM5_MIN_AGE_DAYS = 14;

export interface TicketShareCounts {
  mapped: number;
  catchAll: number;
  unmapped: number;
  total: number;
}

export interface TicketShareFigure {
  counts: TicketShareCounts;
  mapped: Ratio;
  catchAll: Ratio;
  unmapped: Ratio;
  segments: { key: TicketShareBucket; label: string; count: number; share: Ratio }[];
}

export interface HourShareSegmentRow {
  key: HourShareSegment;
  label: string;
  mh: Mh;
  share: Ratio;
}

/**
 * Hours side of coverage. Count-basis Connectors (and a Project total with no hours
 * Connector) return `unavailable` — never a zero hour share (AD-8).
 */
export type HourShareFigure =
  | {
      kind: 'value';
      segments: HourShareSegmentRow[];
      /** Mapped baselined + mapped non-baselined, excluding Catch-all and Unmapped. */
      mappedExcludingCatchAll: Ratio;
      totalMh: Mh;
    }
  | { kind: 'unavailable'; reasonCode: string };

export interface ConnectorCoverage {
  connectorId: string;
  label: string;
  measurementBasis: MeasurementBasis;
  ticketShare: TicketShareFigure;
  hourShare: HourShareFigure;
}

export interface CoverageResult {
  /** One row per owning Connector, in input order. */
  connectors: ConnectorCoverage[];
  /** Project rollup: Ticket shares across all Connectors; hours from hours Connectors only. */
  projectTotal: ConnectorCoverage;
  /**
   * SM-5: mapped-excluding-Catch-all hour share vs ≥80% target.
   * `unavailable` before day 14 from Project start (never shown as 0).
   */
  sm5: RatioMetric;
}

export interface CoverageConnectorInput {
  id: string;
  label: string;
  measurementBasis: MeasurementBasis;
}

export interface CoverageInput {
  tickets: readonly TicketObservation[];
  head: ReadonlyMap<string, MappingHeadEntry>;
  wps: readonly WorkPackage[];
  /** ledger entries used for hour shares; Opening Balances are excluded here (stay out of shares). */
  ledger: readonly LedgerEntry[];
  baselineVersions: readonly BaselineVersion[];
  resources: readonly Resource[];
  project: ProjectConfig;
  period: AttributionInput['period'];
  connectors: readonly CoverageConnectorInput[];
  /** trackerIssueId → owning Connector id. */
  ownerConnectorByTicket: ReadonlyMap<string, string>;
  /** left_scope Tickets — excluded from shares (5.13 owns captions). */
  leftScopeTicketIds?: ReadonlySet<string>;
  /** Project start for SM-5; null/missing → unavailable. */
  projectStart: IsoDate | null;
  /** as-of date for SM-5 age (Project-local calendar date). */
  asOf: IsoDate;
}

function ticketBucket(
  ticketId: string,
  head: ReadonlyMap<string, MappingHeadEntry>,
  wpById: ReadonlyMap<string, WorkPackage>,
): TicketShareBucket {
  const m = head.get(ticketId);
  if (!m?.wpId) return 'unmapped';
  const wp = wpById.get(m.wpId);
  if (!wp || wp.isCatchAll) return 'catch-all';
  return 'mapped';
}

/**
 * Hour-bar ticket membership for segment filter. Catch-all overflow shares membership with
 * Catch-all (same Tickets); the hours split is on the bar, not a distinct Ticket set.
 */
export function hourBucketForTicket(
  ticketId: string,
  head: ReadonlyMap<string, MappingHeadEntry>,
  wpById: ReadonlyMap<string, WorkPackage>,
  activeBaselineWpIds: ReadonlySet<string>,
): HourShareSegment {
  const m = head.get(ticketId);
  if (!m?.wpId) return 'unmapped';
  const wp = wpById.get(m.wpId);
  if (!wp) return 'unmapped';
  if (wp.isCatchAll) return 'catch-all';
  if (activeBaselineWpIds.has(wp.id)) return 'mapped-baselined';
  return 'mapped-non-baselined';
}

function ticketShareFigure(tickets: readonly { id: string; bucket: TicketShareBucket }[]): TicketShareFigure {
  let mapped = 0;
  let catchAll = 0;
  let unmapped = 0;
  for (const t of tickets) {
    if (t.bucket === 'mapped') mapped += 1;
    else if (t.bucket === 'catch-all') catchAll += 1;
    else unmapped += 1;
  }
  const total = mapped + catchAll + unmapped;
  const den = total === 0 ? 1n : BigInt(total);
  const counts: TicketShareCounts = { mapped, catchAll, unmapped, total };
  return {
    counts,
    mapped: total === 0 ? ZERO : ratio(BigInt(mapped), den),
    catchAll: total === 0 ? ZERO : ratio(BigInt(catchAll), den),
    unmapped: total === 0 ? ZERO : ratio(BigInt(unmapped), den),
    segments: TICKET_SHARE_BUCKETS.map((key) => {
      const count = key === 'mapped' ? mapped : key === 'catch-all' ? catchAll : unmapped;
      return {
        key,
        label: TICKET_BUCKET_LABELS[key],
        count,
        share: total === 0 ? ZERO : ratio(BigInt(count), den),
      };
    }),
  };
}

function hourShareFromBuckets(c: Buckets, basis: MeasurementBasis): HourShareFigure {
  if (basis === 'count') {
    return { kind: 'unavailable', reasonCode: 'tracker_provides_no_hours' };
  }
  const totalMh = c.totalMh;
  const scopeTotal = totalMh === 0n ? 1n : totalMh;
  const segments: HourShareSegmentRow[] = [
    {
      key: 'mapped-baselined',
      label: HOUR_SEGMENT_LABELS['mapped-baselined'],
      mh: c.mappedBaselinedMh,
      share: ratio(c.mappedBaselinedMh, scopeTotal),
    },
    {
      key: 'mapped-non-baselined',
      label: HOUR_SEGMENT_LABELS['mapped-non-baselined'],
      mh: c.mappedNonBaselinedMh,
      share: ratio(c.mappedNonBaselinedMh, scopeTotal),
    },
    {
      key: 'catch-all',
      label: HOUR_SEGMENT_LABELS['catch-all'],
      mh: c.catchAllMh,
      share: ratio(c.catchAllMh, scopeTotal),
    },
    {
      key: 'catch-all-overflow',
      label: HOUR_SEGMENT_LABELS['catch-all-overflow'],
      mh: c.catchAllOverflowMh,
      share: ratio(c.catchAllOverflowMh, scopeTotal),
    },
    {
      key: 'unmapped',
      label: HOUR_SEGMENT_LABELS.unmapped,
      mh: c.unmappedMh,
      share: ratio(c.unmappedMh, scopeTotal),
    },
  ];
  const mappedExcl = c.mappedBaselinedMh + c.mappedNonBaselinedMh;
  return {
    kind: 'value',
    segments,
    mappedExcludingCatchAll: totalMh === 0n ? ZERO : ratio(mappedExcl, totalMh),
    totalMh,
  };
}

function emptyBucketsHourShare(basis: MeasurementBasis): HourShareFigure {
  return hourShareFromBuckets(
    {
      mappedBaselinedMh: 0n,
      mappedNonBaselinedMh: 0n,
      catchAllMh: 0n,
      catchAllOverflowMh: 0n,
      unmappedMh: 0n,
      totalMh: 0n,
      unplannedMh: 0n,
      unplannedJpy: 0n,
      totalJpy: 0n,
    },
    basis,
  );
}

function sumBuckets(parts: readonly Buckets[]): Buckets {
  const out: Buckets = {
    mappedBaselinedMh: 0n,
    mappedNonBaselinedMh: 0n,
    catchAllMh: 0n,
    catchAllOverflowMh: 0n,
    unmappedMh: 0n,
    totalMh: 0n,
    unplannedMh: 0n,
    unplannedJpy: 0n,
    totalJpy: 0n,
  };
  for (const b of parts) {
    out.mappedBaselinedMh += b.mappedBaselinedMh;
    out.mappedNonBaselinedMh += b.mappedNonBaselinedMh;
    out.catchAllMh += b.catchAllMh;
    out.catchAllOverflowMh += b.catchAllOverflowMh;
    out.unmappedMh += b.unmappedMh;
    out.totalMh += b.totalMh;
    out.unplannedMh += b.unplannedMh;
    out.unplannedJpy += b.unplannedJpy;
    out.totalJpy += b.totalJpy;
  }
  return out;
}

/**
 * Calendar-day age of the Project on `asOf`, measured from `projectStart`.
 * Day 0 is the start date; day 14 is start + 14 calendar days.
 */
export function projectAgeDays(projectStart: IsoDate, asOf: IsoDate): number {
  if (asOf < projectStart) return 0;
  let n = 0;
  for (let d = projectStart; d < asOf; d = addDays(d, 1)) n += 1;
  return n;
}

function sm5Metric(
  projectStart: IsoDate | null,
  asOf: IsoDate,
  hourShare: HourShareFigure,
): RatioMetric {
  if (projectStart === null) return unavailable('no_project_start');
  if (projectAgeDays(projectStart, asOf) < SM5_MIN_AGE_DAYS) {
    return unavailable('project_younger_than_14_days');
  }
  if (hourShare.kind === 'unavailable') return unavailable(hourShare.reasonCode);
  return ratioValue(hourShare.mappedExcludingCatchAll);
}

/**
 * FR-23 / SM-5: per-Connector and Project-total coverage.
 * Pure — no clock, no DB. Opening Balances and left-scope Tickets stay out of the shares.
 */
export function computeCoverage(input: CoverageInput): CoverageResult {
  const wpById = new Map(input.wps.map((w) => [w.id, w]));
  const leftScope = input.leftScopeTicketIds ?? new Set<string>();

  const inScopeTickets = input.tickets.filter((t) => !leftScope.has(t.trackerIssueId));

  // Opening Balances stay out of hour shares (Q6).
  const ledgerNoOb = input.ledger.filter((e) => e.kind !== 'opening_balance');

  const connectorRows: ConnectorCoverage[] = [];
  const hoursBucketsForTotal: Buckets[] = [];
  let anyHoursConnector = false;

  for (const c of input.connectors) {
    const owned = inScopeTickets.filter(
      (t) => input.ownerConnectorByTicket.get(t.trackerIssueId) === c.id,
    );
    const ownedIds = new Set(owned.map((t) => t.trackerIssueId));
    const ticketRows = owned.map((t) => ({
      id: t.trackerIssueId,
      bucket: ticketBucket(t.trackerIssueId, input.head, wpById),
    }));
    const ticketShare = ticketShareFigure(ticketRows);

    let hourShare: HourShareFigure;
    if (c.measurementBasis === 'count') {
      hourShare = { kind: 'unavailable', reasonCode: 'tracker_provides_no_hours' };
    } else {
      anyHoursConnector = true;
      const entries = ledgerNoOb.filter((e) => ownedIds.has(e.ticketId));
      if (entries.length === 0) {
        hourShare = emptyBucketsHourShare('hours');
      } else {
        const attr = attribute({
          entries,
          head: input.head,
          wps: input.wps,
          baselineVersions: input.baselineVersions,
          resources: input.resources,
          project: input.project,
          period: input.period,
        });
        hoursBucketsForTotal.push(attr.cumulative);
        hourShare = hourShareFromBuckets(attr.cumulative, 'hours');
      }
    }

    connectorRows.push({
      connectorId: c.id,
      label: c.label,
      measurementBasis: c.measurementBasis,
      ticketShare,
      hourShare,
    });
  }

  const allTicketRows = inScopeTickets.map((t) => ({
    id: t.trackerIssueId,
    bucket: ticketBucket(t.trackerIssueId, input.head, wpById),
  }));
  const totalTicketShare = ticketShareFigure(allTicketRows);

  const totalHourShare: HourShareFigure = !anyHoursConnector
    ? { kind: 'unavailable', reasonCode: 'tracker_provides_no_hours' }
    : hourShareFromBuckets(sumBuckets(hoursBucketsForTotal), 'hours');

  const projectTotal: ConnectorCoverage = {
    connectorId: 'project-total',
    label: 'Project total',
    measurementBasis: anyHoursConnector ? 'hours' : 'count',
    ticketShare: totalTicketShare,
    hourShare: totalHourShare,
  };

  return {
    connectors: connectorRows,
    projectTotal,
    sm5: sm5Metric(input.projectStart, input.asOf, totalHourShare),
  };
}

/** Classify a Ticket for Mapping segment filter (ticket-share basis). */
export function ticketShareBucketFor(
  ticketId: string,
  head: ReadonlyMap<string, MappingHeadEntry>,
  wps: readonly WorkPackage[],
): TicketShareBucket {
  return ticketBucket(ticketId, head, new Map(wps.map((w) => [w.id, w])));
}
