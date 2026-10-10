/**
 * Story 6.3: formula popover helpers — interpretations, Period Δ, WP drill-down.
 * Pure over EVM outputs; no I/O.
 */
import { addDays, type IsoDate } from './calendar';
import type { EvmResult, WpMeasure } from './evm';
import { compareRatio } from './health';
import { ratio, reduce, type Mh, type MhMetric, type Ratio, type RatioMetric } from './units';

export type ReviewMetricId =
  | 'pv'
  | 'ev'
  | 'ac'
  | 'cv'
  | 'sv'
  | 'cpi_all_in'
  | 'cpi_planned'
  | 'tcpi'
  | 'bac'
  | 'spi'
  | 'eac'
  | 'etc'
  | 'vac';

export function priorAsOfForPeriod(periodStart: IsoDate): IsoDate {
  return addDays(periodStart, -1);
}

export function isAcDerivedMetric(id: ReviewMetricId): boolean {
  return (
    id === 'ac' ||
    id === 'cv' ||
    id === 'cpi_all_in' ||
    id === 'cpi_planned' ||
    id === 'tcpi' ||
    id === 'etc'
  );
}

/** i18n key under `review.formula.interpret.*` */
export type MetricInterpretationKey =
  | 'unavailable'
  | 'cv_under'
  | 'cv_over'
  | 'cv_on'
  | 'sv_ahead'
  | 'sv_behind'
  | 'sv_on'
  | 'cpi_under'
  | 'cpi_over'
  | 'cpi_on'
  | 'spi_ahead'
  | 'spi_behind'
  | 'spi_on'
  | 'tcpi_efficient'
  | 'tcpi_must_beat'
  | 'tcpi_on'
  | 'bac_exhausted'
  | 'neutral';

export function interpretationKeyForMetric(id: ReviewMetricId, evm: EvmResult): MetricInterpretationKey {
  if (id === 'tcpi' && evm.bacExhausted) return 'bac_exhausted';

  switch (id) {
    case 'cv':
      return mhInterpretation(evm.cvMh, 'cv_under', 'cv_over', 'cv_on');
    case 'sv':
      return mhInterpretation(evm.svMh, 'sv_ahead', 'sv_behind', 'sv_on');
    case 'cpi_all_in':
    case 'cpi_planned':
      return ratioInterpretation(
        id === 'cpi_all_in' ? evm.cpiAllIn : evm.cpiPlannedScope,
        'cpi_under',
        'cpi_over',
        'cpi_on',
      );
    case 'spi':
      return ratioInterpretation(evm.spi, 'spi_ahead', 'spi_behind', 'spi_on');
    case 'tcpi':
      return tcpiInterpretation(evm.tcpi);
    default:
      return 'neutral';
  }
}

function mhInterpretation(
  m: MhMetric,
  positiveKey: MetricInterpretationKey,
  negativeKey: MetricInterpretationKey,
  zeroKey: MetricInterpretationKey,
): MetricInterpretationKey {
  if (m.kind === 'unavailable') return 'unavailable';
  if (m.value > 0n) return positiveKey;
  if (m.value < 0n) return negativeKey;
  return zeroKey;
}

function ratioInterpretation(
  m: RatioMetric,
  aboveKey: MetricInterpretationKey,
  belowKey: MetricInterpretationKey,
  onKey: MetricInterpretationKey,
): MetricInterpretationKey {
  if (m.kind === 'unavailable') return 'unavailable';
  const cmp = compareRatio(m.value, ratio(1n, 1n));
  if (cmp > 0) return aboveKey;
  if (cmp < 0) return belowKey;
  return onKey;
}

function tcpiInterpretation(m: RatioMetric): MetricInterpretationKey {
  if (m.kind === 'unavailable') return m.reasonCode === 'bac_exhausted' ? 'bac_exhausted' : 'unavailable';
  const cmp = compareRatio(m.value, ratio(1n, 1n));
  if (cmp > 0) return 'tcpi_must_beat';
  if (cmp < 0) return 'tcpi_efficient';
  return 'tcpi_on';
}

export interface FormulaDrillWpRow {
  wpId: string;
  wbsCode: string;
  name: string;
  contributionMh: Mh;
  ticketKeys: string[];
}

export function drillDownRowsForMetric(
  id: ReviewMetricId,
  evm: EvmResult,
  ticketKeysByWp: ReadonlyMap<string, readonly string[]>,
): FormulaDrillWpRow[] {
  const includeTickets = isAcDerivedMetric(id);
  const rows = evm.perWp
    .map((wp) => {
      const contributionMh = wpContributionMh(id, wp, evm);
      const ticketKeys = includeTickets ? [...(ticketKeysByWp.get(wp.wpId) ?? [])] : [];
      return {
        wpId: wp.wpId,
        wbsCode: wp.wbsCode,
        name: wp.name,
        contributionMh,
        ticketKeys,
      };
    })
    .filter((r) => r.contributionMh !== 0n || r.ticketKeys.length > 0);
  rows.sort((a, b) => a.wbsCode.localeCompare(b.wbsCode));
  return rows;
}

function wpContributionMh(id: ReviewMetricId, wp: WpMeasure, evm: EvmResult): Mh {
  switch (id) {
    case 'pv':
      return wp.pvMh;
    case 'ev':
      return wp.evMh;
    case 'ac':
      return wp.acMh;
    case 'bac':
      return wp.baselineMh;
    case 'cv':
      return wp.evMh - wp.acMh;
    case 'sv':
      return wp.evMh - wp.pvMh;
    case 'cpi_all_in':
    case 'cpi_planned':
    case 'tcpi':
    case 'spi':
      return wp.evMh;
    case 'eac':
    case 'etc':
    case 'vac':
      return wp.evMh;
    default:
      return wp.evMh;
  }
}

/** Exact rational difference current − prior for ratio metrics; mh for hour metrics. */
export function periodDeltaRational(
  id: ReviewMetricId,
  current: EvmResult,
  prior: EvmResult | null,
): { kind: 'mh'; delta: Mh } | { kind: 'ratio'; delta: Ratio } | { kind: 'unavailable' } {
  if (prior === null) return { kind: 'unavailable' };

  const mhDelta = (cur: MhMetric, prev: MhMetric): { kind: 'mh'; delta: Mh } | { kind: 'unavailable' } => {
    if (cur.kind === 'unavailable' || prev.kind === 'unavailable') return { kind: 'unavailable' };
    return { kind: 'mh', delta: cur.value - prev.value };
  };

  const ratioDelta = (
    cur: RatioMetric,
    prev: RatioMetric,
  ): { kind: 'ratio'; delta: Ratio } | { kind: 'unavailable' } => {
    if (cur.kind === 'unavailable' || prev.kind === 'unavailable') return { kind: 'unavailable' };
    const { num, den } = reduce(
      ratio(
        cur.value.num * prev.value.den - prev.value.num * cur.value.den,
        cur.value.den * prev.value.den,
      ),
    );
    return { kind: 'ratio', delta: { num, den } };
  };

  switch (id) {
    case 'pv':
      return mhDelta(current.pvMh, prior.pvMh);
    case 'ev':
      return mhDelta(current.evMh, prior.evMh);
    case 'ac':
      return mhDelta(current.acMh, prior.acMh);
    case 'cv':
      return mhDelta(current.cvMh, prior.cvMh);
    case 'sv':
      return mhDelta(current.svMh, prior.svMh);
    case 'cpi_all_in':
      return ratioDelta(current.cpiAllIn, prior.cpiAllIn);
    case 'cpi_planned':
      return ratioDelta(current.cpiPlannedScope, prior.cpiPlannedScope);
    case 'spi':
      return ratioDelta(current.spi, prior.spi);
    case 'tcpi':
      if (current.bacExhausted || prior.bacExhausted) return { kind: 'unavailable' };
      return ratioDelta(current.tcpi, prior.tcpi);
    case 'bac':
      return { kind: 'mh', delta: current.bacMh - prior.bacMh };
    case 'eac':
      return mhDelta(current.eacMh, prior.eacMh);
    case 'etc':
      return mhDelta(current.etcMh, prior.etcMh);
    case 'vac':
      return mhDelta(current.vacMh, prior.vacMh);
    default:
      return { kind: 'unavailable' };
  }
}
