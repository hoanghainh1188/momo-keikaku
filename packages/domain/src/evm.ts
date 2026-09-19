import { workingDaysBetween, type HolidayCalendar, type IsoDate } from './calendar';
import type { BaselineVersion, TicketObservation, WorkPackage } from './types';
import { type Mh, type Metric, unavailable } from './units';

/**
 * FR-30: EVM in effort hours. Pure. Every figure is compute(inputs, formulaVersion).
 */
export const FORMULA_VERSION = 'evm-2026-09-20';

export type PctBasis = 'estimate' | 'count' | 'no-evidence' | 'loe';

export interface WpMeasure {
  wpId: string;
  wbsCode: string;
  name: string;
  baselineMh: Mh;
  pvMh: Mh;
  pctComplete: number; // 0..1
  pctBasis: PctBasis;
  lowEvidence: boolean;
  evMh: Mh;
  acMh: Mh;
  mappedTickets: number;
  resolvedTickets: number;
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
  /** total AC including the Unplanned line (cumulative, incl. Opening Balances) */
  totalAcMh: Mh;
  /** AC of the baselined WPs only, for CPI (planned scope) */
  plannedScopeAcMh: Mh;
  measurementBasis: 'hours' | 'count';
}

export interface EvmResult {
  formulaVersion: string;
  perWp: WpMeasure[];
  bacMh: Mh;
  pvMh: Mh;
  evMh: Mh;
  acMh: Mh;
  svMh: Mh;
  spi: Metric;
  cvMh: Metric;
  cpiAllIn: Metric;
  cpiPlannedScope: Metric;
  eacMh: Metric;
  etcMh: Metric;
  vacMh: Metric;
  tcpi: Metric;
  bacExhausted: boolean;
}

/** FR-30: PV = Baseline hours spread linearly over the WP's baseline working days. */
export function plannedValue(
  baselineMh: Mh,
  start: IsoDate,
  finish: IsoDate,
  asOf: IsoDate,
  cal: HolidayCalendar,
): Mh {
  const total = workingDaysBetween(start, finish, cal);
  if (total === 0) return asOf >= finish ? baselineMh : 0;
  if (asOf < start) return 0;
  if (asOf >= finish) return baselineMh;
  const elapsed = workingDaysBetween(start, asOf, cal);
  return Math.round((baselineMh * elapsed) / total);
}

/** FR-30: Percent Complete is never derived from burned effort. */
export function percentComplete(
  tickets: TicketObservation[],
  baselineMh: Mh,
  completed: boolean,
): { pct: number; basis: PctBasis; lowEvidence: boolean } {
  if (tickets.length === 0) return { pct: 0, basis: 'no-evidence', lowEvidence: true };
  const lowEvidence = tickets.length < 3;
  const allEstimated = tickets.every((t) => t.estimateMh !== null && t.estimateMh > 0);
  let pct: number;
  let basis: PctBasis;
  if (allEstimated) {
    basis = 'estimate';
    const resolvedEst = tickets
      .filter((t) => t.resolved)
      .reduce((a, t) => a + (t.estimateMh ?? 0), 0);
    const totalEst = tickets.reduce((a, t) => a + (t.estimateMh ?? 0), 0);
    const denom = Math.max(baselineMh, totalEst);
    pct = denom === 0 ? 0 : resolvedEst / denom;
  } else {
    basis = 'count';
    pct = tickets.filter((t) => t.resolved).length / tickets.length;
  }
  // FR-30: capped at 99% until the PM marks the WP complete.
  if (!completed) pct = Math.min(pct, 0.99);
  return { pct: Math.max(0, Math.min(1, pct)), basis, lowEvidence };
}

export function computeEvm(input: EvmInput): EvmResult {
  const wpById = new Map(input.wps.map((w) => [w.id, w]));
  const perWp: WpMeasure[] = [];

  for (const b of input.baseline.wps) {
    const wp = wpById.get(b.wpId);
    if (!wp) continue;
    const tickets = input.mappedTicketsByWp.get(b.wpId) ?? [];
    const pv = plannedValue(b.baselineMh, b.start, b.finish, input.asOf, input.calendar);
    // Glossary: a Catch-all WP with Baseline hours is measured as Level of Effort,
    // so EV equals PV. Its hours beyond the Baseline are Unplanned Work (FR-24).
    const { pct, basis, lowEvidence } =
      wp.isCatchAll && b.baselineMh > 0
        ? {
            pct: b.baselineMh === 0 ? 0 : pv / b.baselineMh,
            basis: 'loe' as const,
            lowEvidence: false,
          }
        : percentComplete(tickets, b.baselineMh, wp.completedAt !== null);
    perWp.push({
      wpId: b.wpId,
      wbsCode: wp.wbsCode,
      name: wp.name,
      baselineMh: b.baselineMh,
      pvMh: pv,
      pctComplete: pct,
      pctBasis: basis,
      lowEvidence,
      evMh: Math.round(b.baselineMh * pct),
      acMh: input.acByWp.get(b.wpId) ?? 0,
      mappedTickets: tickets.length,
      resolvedTickets: tickets.filter((t) => t.resolved).length,
    });
  }

  const bacMh = perWp.reduce((a, w) => a + w.baselineMh, 0);
  const pvMh = perWp.reduce((a, w) => a + w.pvMh, 0);
  const evMh = perWp.reduce((a, w) => a + w.evMh, 0);
  const acMh = input.totalAcMh;
  const svMh = evMh - pvMh;

  // FR-27 / AD-8: in Ticket-Count Mode every AC-based metric is unavailable, never 0.
  const noHours = input.measurementBasis === 'count';
  const NO_HOURS = 'tracker_provides_no_hours';

  const ratio = (num: number, den: number, reason: string): Metric =>
    den === 0
      ? unavailable(reason)
      : { kind: 'value', value: num / den, unit: 'ratio' };

  const spi: Metric = pvMh === 0 ? unavailable('no_planned_value_yet') : { kind: 'value', value: evMh / pvMh, unit: 'ratio' };
  const cpiAllIn: Metric = noHours ? unavailable(NO_HOURS) : ratio(evMh, acMh, 'no_actuals_yet');
  const cpiPlanned: Metric = noHours
    ? unavailable(NO_HOURS)
    : ratio(evMh, input.plannedScopeAcMh, 'no_actuals_yet');
  const cvMh: Metric = noHours ? unavailable(NO_HOURS) : { kind: 'value', value: evMh - acMh, unit: 'mh' };

  // FR-30: EAC Typical = BAC / CPI (all-in). R0's only method.
  const eacMh: Metric =
    cpiAllIn.kind === 'value' && cpiAllIn.value > 0
      ? { kind: 'value', value: Math.round(bacMh / cpiAllIn.value), unit: 'mh' }
      : unavailable(noHours ? NO_HOURS : 'no_cpi_yet');
  const etcMh: Metric =
    eacMh.kind === 'value' ? { kind: 'value', value: eacMh.value - acMh, unit: 'mh' } : unavailable(eacMh.reasonCode);
  const vacMh: Metric =
    eacMh.kind === 'value' ? { kind: 'value', value: bacMh - eacMh.value, unit: 'mh' } : unavailable(eacMh.reasonCode);

  const bacExhausted = !noHours && bacMh - acMh <= 0;
  const tcpi: Metric = noHours
    ? unavailable(NO_HOURS)
    : bacExhausted
      ? unavailable('bac_exhausted')
      : { kind: 'value', value: (bacMh - evMh) / (bacMh - acMh), unit: 'ratio' };

  return {
    formulaVersion: FORMULA_VERSION,
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
