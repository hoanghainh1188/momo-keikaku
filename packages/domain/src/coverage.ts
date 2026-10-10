import {
  attribute,
  isCatchAllAtPin,
  type AttributionInput,
  type Buckets,
} from './attribution';
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
  WpFlagEvent,
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

/**
 * Segment `label` is the stable key (same as `key`) — UI translates via next-intl
 * (`mapping.ledger.hour_segments.*` / `ticket_segments.*`). Never hard-code locale copy here.
 */

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
  /**
   * Epic-5-retro F5: Catch-all overflow milli-hours per Ticket from the same project-wide
   * `attribute()` pass that feeds the Coverage bar. Mapping's overflow filter must use this
   * — not Review attribution (which still includes Opening Balances).
   */
  overflowMhByTicket: ReadonlyMap<string, Mh>;
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
  /** Story 5.12: flag-at-seq for Catch-all membership (thin consumption). */
  wpFlagEvents?: readonly WpFlagEvent[];
  wpFlagSeqMax?: number | null;
}

function ticketBucket(
  ticketId: string,
  head: ReadonlyMap<string, MappingHeadEntry>,
  wpById: ReadonlyMap<string, WorkPackage>,
  flagEvents?: readonly WpFlagEvent[],
  wpFlagSeqMax?: number | null,
): TicketShareBucket {
  const m = head.get(ticketId);
  if (!m?.wpId) return 'unmapped';
  const wp = wpById.get(m.wpId);
  if (!wp) return 'unmapped';
  if (isCatchAllAtPin(m.wpId, wp, flagEvents, wpFlagSeqMax)) return 'catch-all';
  return 'mapped';
}

/**
 * Hour-bar ticket membership for segment filter. Catch-all hours land in `catch-all`;
 * overflow Ticket membership is separate (`inCatchAllOverflow` from attribution).
 */
export function hourBucketForTicket(
  ticketId: string,
  head: ReadonlyMap<string, MappingHeadEntry>,
  wpById: ReadonlyMap<string, WorkPackage>,
  activeBaselineWpIds: ReadonlySet<string>,
  flagEvents?: readonly WpFlagEvent[],
  wpFlagSeqMax?: number | null,
): HourShareSegment {
  const m = head.get(ticketId);
  if (!m?.wpId) return 'unmapped';
  const wp = wpById.get(m.wpId);
  if (!wp) return 'unmapped';
  if (isCatchAllAtPin(m.wpId, wp, flagEvents, wpFlagSeqMax)) return 'catch-all';
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
        label: key,
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
  const segments: HourShareSegmentRow[] = HOUR_SHARE_SEGMENTS.map((key) => {
    const mh =
      key === 'mapped-baselined'
        ? c.mappedBaselinedMh
        : key === 'mapped-non-baselined'
          ? c.mappedNonBaselinedMh
          : key === 'catch-all'
            ? c.catchAllMh
            : key === 'catch-all-overflow'
              ? c.catchAllOverflowMh
              : c.unmappedMh;
    return { key, label: key, mh, share: ratio(mh, scopeTotal) };
  });
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
 *
 * Epic-5-retro F5: Catch-all LOE/LIFO runs once project-wide, then hour buckets are sliced
 * per owning Connector — never sum independent per-Connector caps.
 */
export function computeCoverage(input: CoverageInput): CoverageResult {
  const wpById = new Map(input.wps.map((w) => [w.id, w]));
  const leftScope = input.leftScopeTicketIds ?? new Set<string>();

  const inScopeTickets = input.tickets.filter((t) => !leftScope.has(t.trackerIssueId));

  // Opening Balances stay out of hour shares (Q6).
  const ledgerNoOb = input.ledger.filter((e) => e.kind !== 'opening_balance');

  const hoursConnectorIds = new Set(
    input.connectors.filter((c) => c.measurementBasis === 'hours').map((c) => c.id),
  );
  const anyHoursConnector = hoursConnectorIds.size > 0;
  const hoursTicketIds = new Set(
    inScopeTickets
      .filter((t) => hoursConnectorIds.has(input.ownerConnectorByTicket.get(t.trackerIssueId) ?? ''))
      .map((t) => t.trackerIssueId),
  );
  const hoursEntries = ledgerNoOb.filter((e) => hoursTicketIds.has(e.ticketId));

  const projectAttr =
    anyHoursConnector && hoursEntries.length > 0
      ? attribute({
          entries: hoursEntries,
          head: input.head,
          wps: input.wps,
          baselineVersions: input.baselineVersions,
          resources: input.resources,
          project: input.project,
          period: input.period,
          wpFlagEvents: input.wpFlagEvents,
          wpFlagSeqMax: input.wpFlagSeqMax,
          ownerConnectorByTicket: input.ownerConnectorByTicket,
        })
      : null;

  const connectorRows: ConnectorCoverage[] = [];

  for (const c of input.connectors) {
    const owned = inScopeTickets.filter(
      (t) => input.ownerConnectorByTicket.get(t.trackerIssueId) === c.id,
    );
    const ticketRows = owned.map((t) => ({
      id: t.trackerIssueId,
      bucket: ticketBucket(
        t.trackerIssueId,
        input.head,
        wpById,
        input.wpFlagEvents,
        input.wpFlagSeqMax,
      ),
    }));
    const ticketShare = ticketShareFigure(ticketRows);

    let hourShare: HourShareFigure;
    if (c.measurementBasis === 'count') {
      hourShare = { kind: 'unavailable', reasonCode: 'tracker_provides_no_hours' };
    } else if (!projectAttr) {
      hourShare = emptyBucketsHourShare('hours');
    } else {
      const sliced = projectAttr.cumulativeByConnector.get(c.id);
      hourShare = sliced
        ? hourShareFromBuckets(sliced, 'hours')
        : emptyBucketsHourShare('hours');
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
    bucket: ticketBucket(
      t.trackerIssueId,
      input.head,
      wpById,
      input.wpFlagEvents,
      input.wpFlagSeqMax,
    ),
  }));
  const totalTicketShare = ticketShareFigure(allTicketRows);

  const totalHourShare: HourShareFigure = !anyHoursConnector
    ? { kind: 'unavailable', reasonCode: 'tracker_provides_no_hours' }
    : projectAttr
      ? hourShareFromBuckets(projectAttr.cumulative, 'hours')
      : emptyBucketsHourShare('hours');

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
    overflowMhByTicket: projectAttr?.overflowMhByTicket ?? new Map(),
  };
}

/** Classify a Ticket for Mapping segment filter (ticket-share basis). */
export function ticketShareBucketFor(
  ticketId: string,
  head: ReadonlyMap<string, MappingHeadEntry>,
  wps: readonly WorkPackage[],
  flagEvents?: readonly WpFlagEvent[],
  wpFlagSeqMax?: number | null,
): TicketShareBucket {
  return ticketBucket(
    ticketId,
    head,
    new Map(wps.map((w) => [w.id, w])),
    flagEvents,
    wpFlagSeqMax,
  );
}
