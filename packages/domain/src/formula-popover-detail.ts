/**
 * Story 6.3: serializable formula popover payloads (computed in domain; web only translates keys).
 */
import {
  drillDownRowsForMetric,
  interpretationKeyForMetric,
  periodDeltaRational,
  type MetricInterpretationKey,
  type ReviewMetricId,
} from './metric-formula';
import type { EvmResult } from './evm';
import { hours, hoursDeltaSigned, present, ratioDeltaSigned } from './present';
export interface FormulaMetricDetail {
  id: ReviewMetricId;
  interpretationKey: MetricInterpretationKey;
  inputs: { labelKey: string; value: string }[];
  periodChange: string;
  drillDown: {
    wbsCode: string;
    name: string;
    contribution: string;
    tickets: string[];
  }[];
}

const METRIC_IDS: ReviewMetricId[] = [
  'pv',
  'ev',
  'ac',
  'cv',
  'sv',
  'cpi_all_in',
  'cpi_planned',
  'tcpi',
  'bac',
  'spi',
  'eac',
  'etc',
  'vac',
];

export function buildFormulaMetricDetails(
  evm: EvmResult,
  evmAtPeriodStart: EvmResult | null,
  ticketKeysByWp: ReadonlyMap<string, readonly string[]>,
): FormulaMetricDetail[] {
  return METRIC_IDS.map((id) => ({
    id,
    interpretationKey: interpretationKeyForMetric(id, evm),
    inputs: buildInputs(id, evm),
    periodChange: formatPeriodChange(id, evm, evmAtPeriodStart),
    drillDown: drillDownRowsForMetric(id, evm, ticketKeysByWp).map((row) => ({
      wbsCode: row.wbsCode,
      name: row.name,
      contribution: `${hours(row.contributionMh)}h`,
      tickets: [...row.ticketKeys],
    })),
  }));
}

function formatPeriodChange(
  id: ReviewMetricId,
  evm: EvmResult,
  prior: EvmResult | null,
): string {
  const delta = periodDeltaRational(id, evm, prior);
  if (delta.kind === 'unavailable') return '—';
  if (delta.kind === 'mh') return hoursDeltaSigned(delta.delta);
  const cur = ratioForMetric(id, evm);
  const prev = prior ? ratioForMetric(id, prior) : null;
  if (!cur || !prev) return '—';
  return ratioDeltaSigned(cur, prev);
}

function ratioForMetric(id: ReviewMetricId, evm: EvmResult) {
  switch (id) {
    case 'spi':
      return evm.spi.kind === 'value' ? evm.spi.value : null;
    case 'cpi_all_in':
      return evm.cpiAllIn.kind === 'value' ? evm.cpiAllIn.value : null;
    case 'cpi_planned':
      return evm.cpiPlannedScope.kind === 'value' ? evm.cpiPlannedScope.value : null;
    case 'tcpi':
      return evm.tcpi.kind === 'value' ? evm.tcpi.value : null;
    default:
      return null;
  }
}

function presentMetric(m: Parameters<typeof present>[0]): string {
  const p = present(m);
  return p.unit ? `${p.text}${p.unit}` : p.text;
}

function buildInputs(id: ReviewMetricId, evm: EvmResult): { labelKey: string; value: string }[] {
  const row = (labelKey: string, value: string) => ({ labelKey, value });
  switch (id) {
    case 'pv':
      return [row('bac', `${hours(evm.bacMh)}h`)];
    case 'ev':
      return [row('ev', presentMetric(evm.evMh))];
    case 'ac':
      return [row('ac', presentMetric(evm.acMh))];
    case 'cv':
      return [row('ev', presentMetric(evm.evMh)), row('ac', presentMetric(evm.acMh))];
    case 'sv':
      return [row('ev', presentMetric(evm.evMh)), row('pv', presentMetric(evm.pvMh))];
    case 'cpi_all_in':
      return [row('ev', presentMetric(evm.evMh)), row('ac', presentMetric(evm.acMh))];
    case 'cpi_planned':
      return [row('ev', presentMetric(evm.evMh)), row('ac_planned', presentMetric(evm.acMh))];
    case 'spi':
      return [row('ev', presentMetric(evm.evMh)), row('pv', presentMetric(evm.pvMh))];
    case 'tcpi':
      return [
        row('bac', `${hours(evm.bacMh)}h`),
        row('ev', presentMetric(evm.evMh)),
        row('ac', presentMetric(evm.acMh)),
      ];
    case 'bac':
      return [row('bac', `${hours(evm.bacMh)}h`)];
    case 'eac':
      return [
        row('bac', `${hours(evm.bacMh)}h`),
        row('cpi', presentMetric(evm.cpiAllIn)),
        row('method_typical', 'Typical'),
      ];
    case 'etc':
      return [row('eac', presentMetric(evm.eacMh)), row('ac', presentMetric(evm.acMh))];
    case 'vac':
      return [row('bac', `${hours(evm.bacMh)}h`), row('eac', presentMetric(evm.eacMh))];
    default:
      return [];
  }
}

export function ticketKeysByWpFromMapping(
  tickets: readonly { trackerIssueId: string; key: string }[],
  head: ReadonlyMap<string, { wpId: string | null }>,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const tk of tickets) {
    const wpId = head.get(tk.trackerIssueId)?.wpId;
    if (!wpId) continue;
    const arr = out.get(wpId) ?? [];
    arr.push(tk.key);
    out.set(wpId, arr);
  }
  return out;
}
