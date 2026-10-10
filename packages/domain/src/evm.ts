import {
  addDays,
  isWorkingDay,
  workingDaysBetween,
  type HolidayCalendar,
  type IsoDate,
} from './calendar';
import { compareRatio } from './health';
import {
  DEFAULT_RESOLVED_STATUS_IDS,
  isResolvedStatus,
  type BaselineVersion,
  type TicketObservation,
  type WorkPackage,
} from './types';
import {
  allocateLargestRemainder,
  divRoundHalfEven,
  maxBigint,
  mhValue,
  ONE,
  ratio,
  ratioValue,
  sum,
  unavailable,
  ZERO,
  type Mh,
  type MhMetric,
  type MetricCoverage,
  type Ratio,
  type RatioMetric,
} from './units';

/**
 * FR-30: EVM in effort hours. Pure. Every figure is compute(inputs, formulaVersion).
 *
 * AD-4: every quantity is exact — `bigint` milli-hours and unreduced `Ratio`s. PV is allocated by
 * largest remainder over day×resource cells (story 6.2); EV and EAC are ONE `divRoundHalfEven`
 * from their exact quotient. Nothing here rounds for display.
 *
 * Story 5.7 / FR-27: PV/EV/SV/AC are metrics (value+coverage or unavailable). AC-family is
 * unavailable in Ticket-Count Mode; mixed Projects pass hours-only AC with a coverage caption.
 */
/** Story 6.1 golden key — half-even PV; kept executable after the 6.2 largest-remainder bump. */
export const LEGACY_FORMULA_VERSION = 'evm-2026-09-20';
/** Current EVM formula key (story 6.2: largest-remainder PV + EV-fall). */
export const FORMULA_VERSION = 'evm-2026-10-10';

/** Anonymous resource bucket when a WP has no `assignedResourceIds` (day-only LR). */
const ANONYMOUS_RESOURCE_ID = '';

export type PctBasis = 'estimate' | 'count' | 'no-evidence' | 'loe';

export interface WpMeasure {
  wpId: string;
  wbsCode: string;
  name: string;
  baselineMh: Mh;
  pvMh: Mh;
  pctComplete: Ratio; // 0..1, exact
  pctBasis: PctBasis;
  lowEvidence: boolean;
  evMh: Mh;
  acMh: Mh;
  mappedTickets: number;
  resolvedTickets: number;
  /** True when `priorEvByWp` supplied a prior for this WP and current EV is strictly lower. */
  evFell: boolean;
}

export interface EvmInput {
  asOf: IsoDate;
  calendar: HolidayCalendar;
  baseline: BaselineVersion;
  wps: WorkPackage[];
  /** current Mapping: ticketId -> wpId */
  mappedTicketsByWp: Map<string, TicketObservation[]>;
  acByWp: Map<string, Mh>;
  /** FR-30: the Project *Unplanned* line — actual effort with PV = EV = 0 */
  unplannedAcMh: Mh;
  /**
   * total AC including the Unplanned line (cumulative, incl. Opening Balances).
   * Caller filters to hours-basis Connectors when the Project is mixed (Story 5.7).
   */
  totalAcMh: Mh;
  /** AC of the baselined WPs only, for CPI (planned scope) */
  plannedScopeAcMh: Mh;
  /**
   * Latched Connector basis at `basis_seq_max` (Story 5.7) — never snapshot `hoursFieldPresent`.
   * `'count'` → Ticket-Count Mode (AC-family unavailable). `'hours'` → AC from hours coverage.
   */
  measurementBasis: 'hours' | 'count';
  /**
   * When AC covers only hours Connectors in a mixed Project, the caption naming that coverage.
   * `null` when every Connector is hours (or the Project has a single hours Connector).
   */
  acCoverage?: MetricCoverage;
  /**
   * AD-6: Connector Resolved status ids at `connector_setting_seq_max`. Defaults to
   * `DEFAULT_RESOLVED_STATUS_IDS` (`Closed`) only as the seed fallback.
   */
  resolvedStatusIds?: ReadonlySet<string>;
  /**
   * Story 6.2 / Q1-A: prior per-WP EV (mh) from the last open Review / prior as-of when the
   * loader has one. Absent or missing a WP → that WP is never flagged. Never invent priors.
   */
  priorEvByWp?: ReadonlyMap<string, Mh>;
  /** Registered `formulaVersion`; defaults to {@link FORMULA_VERSION}. */
  formulaVersion?: string;
}

export interface EvmResult {
  formulaVersion: string;
  perWp: WpMeasure[];
  bacMh: Mh;
  /** Story 5.7: totals are metrics — value+coverage or unavailable (never a bare 0 for "unknown"). */
  pvMh: MhMetric;
  evMh: MhMetric;
  acMh: MhMetric;
  svMh: MhMetric;
  spi: RatioMetric;
  cvMh: MhMetric;
  cpiAllIn: RatioMetric;
  cpiPlannedScope: RatioMetric;
  eacMh: MhMetric;
  etcMh: MhMetric;
  vacMh: MhMetric;
  tcpi: RatioMetric;
  bacExhausted: boolean;
}

/** Inclusive working days in `[start, finish]` under `cal`. */
function workingDaysInclusive(start: IsoDate, finish: IsoDate, cal: HolidayCalendar): IsoDate[] {
  const days: IsoDate[] = [];
  for (let d = start; d <= finish; d = addDays(d, 1)) {
    if (isWorkingDay(d, cal)) days.push(d);
  }
  return days;
}

/**
 * Story 6.1 / legacy: PV = Baseline hours × elapsed/total via half-even (no resource axis).
 * Kept so `evm-2026-09-20` goldens stay byte-stable.
 */
export function plannedValueLegacy(
  baselineMh: Mh,
  start: IsoDate,
  finish: IsoDate,
  asOf: IsoDate,
  cal: HolidayCalendar,
): Mh {
  const total = workingDaysBetween(start, finish, cal);
  if (total === 0) return asOf >= finish ? baselineMh : 0n;
  if (asOf < start) return 0n;
  if (asOf >= finish) return baselineMh;
  const elapsed = workingDaysBetween(start, asOf, cal);
  return divRoundHalfEven(baselineMh * BigInt(elapsed), BigInt(total));
}

/**
 * FR-30 / AD-4 / Q2-A: PV = sum of largest-remainder day×resource cells with `date ≤ asOf`.
 * Resources = live `assignedResourceIds` (sorted); empty → one anonymous bucket (day-only LR).
 */
export function plannedValueLargestRemainder(
  baselineMh: Mh,
  start: IsoDate,
  finish: IsoDate,
  asOf: IsoDate,
  cal: HolidayCalendar,
  assignedResourceIds: readonly string[],
): Mh {
  const days = workingDaysInclusive(start, finish, cal);
  if (days.length === 0) return asOf >= finish ? baselineMh : 0n;
  if (asOf < start) return 0n;
  if (asOf >= finish) return baselineMh;

  const resources =
    assignedResourceIds.length === 0
      ? [ANONYMOUS_RESOURCE_ID]
      : [...new Set(assignedResourceIds)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const cells = days.flatMap((date) => resources.map((resourceId) => ({ date, resourceId })));
  const amounts = allocateLargestRemainder(baselineMh, cells);
  let pv = 0n;
  for (let i = 0; i < cells.length; i += 1) {
    if (cells[i]!.date <= asOf) pv += amounts[i]!;
  }
  return pv;
}

/**
 * FR-30: PV for the active `formulaVersion`. Legacy half-even for `evm-2026-09-20`;
 * largest-remainder day×resource otherwise.
 */
export function plannedValue(
  baselineMh: Mh,
  start: IsoDate,
  finish: IsoDate,
  asOf: IsoDate,
  cal: HolidayCalendar,
  assignedResourceIds: readonly string[] = [],
  formulaVersion: string = FORMULA_VERSION,
): Mh {
  if (formulaVersion === LEGACY_FORMULA_VERSION) {
    return plannedValueLegacy(baselineMh, start, finish, asOf, cal);
  }
  return plannedValueLargestRemainder(
    baselineMh,
    start,
    finish,
    asOf,
    cal,
    assignedResourceIds,
  );
}

/** FR-30's 99% cap, as an exact constant. */
const PCT_CAP: Ratio = { num: 99n, den: 100n };

/** FR-30: Percent Complete is never derived from burned effort. */
export function percentComplete(
  tickets: TicketObservation[],
  baselineMh: Mh,
  completed: boolean,
  resolvedStatusIds: ReadonlySet<string> = DEFAULT_RESOLVED_STATUS_IDS,
): { pct: Ratio; basis: PctBasis; lowEvidence: boolean } {
  if (tickets.length === 0) return { pct: ZERO, basis: 'no-evidence', lowEvidence: true };
  const lowEvidence = tickets.length < 3;
  const allEstimated = tickets.every((t) => t.estimateMh !== null && t.estimateMh > 0n);
  const resolved = (t: TicketObservation) => isResolvedStatus(t.statusId, resolvedStatusIds);
  let pct: Ratio;
  let basis: PctBasis;
  if (allEstimated) {
    basis = 'estimate';
    const resolvedEst = sum(tickets.filter(resolved).map((t) => t.estimateMh ?? 0n));
    const totalEst = sum(tickets.map((t) => t.estimateMh ?? 0n));
    const denom = maxBigint(baselineMh, totalEst);
    pct = denom === 0n ? ZERO : ratio(resolvedEst, denom);
  } else {
    basis = 'count';
    pct = ratio(BigInt(tickets.filter(resolved).length), BigInt(tickets.length));
  }
  // FR-30: capped at 99% until the PM marks the WP complete.
  if (!completed && compareRatio(pct, PCT_CAP) > 0) pct = PCT_CAP;
  if (compareRatio(pct, ZERO) < 0) pct = ZERO;
  if (compareRatio(pct, ONE) > 0) pct = ONE;
  return { pct, basis, lowEvidence };
}

/**
 * FR-30: "the PM marked the WP complete" is an actual finish on a WP that is not a milestone. A
 * milestone's actual finish is its done date, which lifts no cap.
 */
export const isMarkedComplete = (wp: WorkPackage): boolean =>
  !wp.isMilestone && wp.actualFinish !== null;

export function computeEvm(input: EvmInput): EvmResult {
  const resolvedStatusIds = input.resolvedStatusIds ?? DEFAULT_RESOLVED_STATUS_IDS;
  const formulaVersion = input.formulaVersion ?? FORMULA_VERSION;
  const wpById = new Map(input.wps.map((w) => [w.id, w]));
  const perWp: WpMeasure[] = [];

  for (const b of input.baseline.wps) {
    const wp = wpById.get(b.wpId);
    if (!wp) continue;
    const tickets = input.mappedTicketsByWp.get(b.wpId) ?? [];
    const pv = plannedValue(
      b.baselineMh,
      b.start,
      b.finish,
      input.asOf,
      input.calendar,
      wp.assignedResourceIds,
      formulaVersion,
    );
    // Glossary: a Catch-all WP with Baseline hours is measured as Level of Effort,
    // so EV equals PV. Its hours beyond the Baseline are Unplanned Work (FR-24).
    // Story 5.12: LOE gate reads baseline_wp.is_catch_all — never the live WP cache (AR-22).
    const { pct, basis, lowEvidence } =
      b.isCatchAll && b.baselineMh > 0n
        ? {
            pct: ratio(pv, b.baselineMh),
            basis: 'loe' as const,
            lowEvidence: false,
          }
        : percentComplete(tickets, b.baselineMh, isMarkedComplete(wp), resolvedStatusIds);
    const evMh = divRoundHalfEven(b.baselineMh * pct.num, pct.den);
    const prior = input.priorEvByWp?.get(b.wpId);
    perWp.push({
      wpId: b.wpId,
      wbsCode: wp.wbsCode,
      name: wp.name,
      baselineMh: b.baselineMh,
      pvMh: pv,
      pctComplete: pct,
      pctBasis: basis,
      lowEvidence,
      evMh,
      acMh: input.acByWp.get(b.wpId) ?? 0n,
      mappedTickets: tickets.length,
      resolvedTickets: tickets.filter((t) => isResolvedStatus(t.statusId, resolvedStatusIds)).length,
      evFell: prior !== undefined && evMh < prior,
    });
  }

  const bacMh = sum(perWp.map((w) => w.baselineMh));
  const pvRaw = sum(perWp.map((w) => w.pvMh));
  const evRaw = sum(perWp.map((w) => w.evMh));
  const acRaw = input.totalAcMh;
  const svRaw = evRaw - pvRaw;

  // FR-27 / AD-8: in Ticket-Count Mode every AC-based metric is unavailable, never 0.
  const noHours = input.measurementBasis === 'count';
  const NO_HOURS = 'tracker_provides_no_hours';
  const acCoverage = input.acCoverage ?? null;

  const ratioOrUnavailable = (
    num: Mh,
    den: Mh,
    reason: string,
    coverage: MetricCoverage = null,
  ): RatioMetric => (den === 0n ? unavailable(reason) : ratioValue(ratio(num, den), coverage));

  const pvMh = mhValue(pvRaw);
  const evMh = mhValue(evRaw);
  const svMh = mhValue(svRaw);
  const acMh: MhMetric = noHours ? unavailable(NO_HOURS) : mhValue(acRaw, acCoverage);

  const spi = ratioOrUnavailable(evRaw, pvRaw, 'no_planned_value_yet');
  const cpiAllIn: RatioMetric = noHours
    ? unavailable(NO_HOURS)
    : ratioOrUnavailable(evRaw, acRaw, 'no_actuals_yet', acCoverage);
  const cpiPlanned: RatioMetric = noHours
    ? unavailable(NO_HOURS)
    : ratioOrUnavailable(evRaw, input.plannedScopeAcMh, 'no_actuals_yet', acCoverage);
  const cvMh: MhMetric = noHours ? unavailable(NO_HOURS) : mhValue(evRaw - acRaw, acCoverage);

  // FR-30: EAC Typical = BAC / CPI (all-in) = BAC × AC / EV, exactly. R0's only method.
  const eacMh: MhMetric =
    cpiAllIn.kind === 'value' && compareRatio(cpiAllIn.value, ZERO) > 0
      ? mhValue(divRoundHalfEven(bacMh * cpiAllIn.value.den, cpiAllIn.value.num), acCoverage)
      : unavailable(noHours ? NO_HOURS : 'no_cpi_yet');
  const etcMh: MhMetric =
    eacMh.kind === 'value' ? mhValue(eacMh.value - acRaw, acCoverage) : unavailable(eacMh.reasonCode);
  const vacMh: MhMetric =
    eacMh.kind === 'value' ? mhValue(bacMh - eacMh.value, acCoverage) : unavailable(eacMh.reasonCode);

  const bacExhausted = !noHours && bacMh - acRaw <= 0n;
  const tcpi: RatioMetric = noHours
    ? unavailable(NO_HOURS)
    : bacExhausted
      ? unavailable('bac_exhausted')
      : ratioValue(ratio(bacMh - evRaw, bacMh - acRaw), acCoverage);

  return {
    formulaVersion,
    perWp,
    bacMh,
    pvMh,
    evMh,
    acMh,
    svMh,
    spi,
    cvMh,
    cpiAllIn,
    cpiPlannedScope: cpiPlanned,
    eacMh,
    etcMh,
    vacMh,
    tcpi,
    bacExhausted,
  };
}
