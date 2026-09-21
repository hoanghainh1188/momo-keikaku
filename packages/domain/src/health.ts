import type { EvmResult } from './evm';
import { ratioText, share, thresholdText } from './present';
import type { ProjectConfig } from './types';
import { ONE, type Ratio, type RatioMetric } from './units';

/** FR-31: three Health Indicators plus an overall status. */
export type HealthColour = 'green' | 'amber' | 'red' | 'unavailable';

export interface HealthIndicator {
  key: 'schedule' | 'effort_cost' | 'unplanned';
  colour: HealthColour;
  /** the figure that drove the colour, already formatted by the caller */
  driver: string;
  /** FR-31 transparency: the rule behind the colour, shown next to it */
  rule: string;
}

export interface HealthInput {
  evm: EvmResult;
  thresholds: ProjectConfig['thresholds'];
  /** FR-31: the Reporting Period's Unplanned share, excluding Opening Balances */
  unplannedSharePeriod: Ratio | null;
  unplannedShareCumulative: Ratio | null;
  /** FR-31: Schedule is at least amber when a Milestone is past its Baseline date and not done */
  slippedMilestones: { wbsCode: string; name: string; baselineDate: string }[];
  measurementBasis: 'hours' | 'count';
}

/**
 * AD-4: THE ONLY PLACE A RATIO MEETS A THRESHOLD. Exact, by cross-multiplication —
 * `spi ≥ 95/100` is `spi.num × 100 ≥ spi.den × 95` — so a value sitting exactly on a boundary
 * lands on the side the rule says, where a float could land on either. Neither side is
 * reduced first, and a negative denominator is handled rather than assumed away.
 *
 * Returns -1, 0 or 1 as `a` is below, equal to or above `b`.
 */
export function compareRatio(a: Ratio, b: { num: bigint; den: bigint }): -1 | 0 | 1 {
  const difference = a.num * b.den - b.num * a.den;
  const signedDen = a.den * b.den;
  const d = signedDen < 0n ? -difference : difference;
  return d < 0n ? -1 : d > 0n ? 1 : 0;
}

/** The Review's "behind plan" wording: SPI strictly below 1, compared exactly. */
export const isBehindPlan = (spi: RatioMetric): boolean =>
  spi.kind === 'value' && compareRatio(spi.value, ONE) < 0;

const ratioColour = (v: Ratio, t: ProjectConfig['thresholds']): HealthColour =>
  compareRatio(v, t.ratioGreen) >= 0 ? 'green' : compareRatio(v, t.ratioAmber) >= 0 ? 'amber' : 'red';

const worse = (a: HealthColour, b: HealthColour): HealthColour => {
  const rank: Record<HealthColour, number> = { green: 0, unavailable: 1, amber: 2, red: 3 };
  return rank[a] >= rank[b] ? a : b;
};

export function computeHealth(input: HealthInput): {
  indicators: HealthIndicator[];
  overall: HealthColour;
  overallNote: string | null;
} {
  const { evm, thresholds: t } = input;

  // --- Schedule: SPI + milestones
  let schedule: HealthIndicator;
  if (evm.spi.kind === 'value') {
    let colour = ratioColour(evm.spi.value, t);
    let rule = `${colour === 'green' ? 'Green' : colour === 'amber' ? 'Amber' : 'Red'} because SPI ${fmt(evm.spi)} ${ruleText(evm.spi.value, t)}`;
    if (input.slippedMilestones.length > 0 && colour === 'green') {
      colour = 'amber';
      rule = `Amber because ${input.slippedMilestones.length} milestone(s) past the Baseline date and not done`;
    }
    schedule = { key: 'schedule', colour, driver: `SPI ${fmt(evm.spi)}`, rule };
  } else {
    schedule = {
      key: 'schedule',
      colour: input.slippedMilestones.length > 0 ? 'amber' : 'unavailable',
      driver: '—',
      rule: `SPI unavailable (${evm.spi.reasonCode})`,
    };
  }

  // --- Effort/Cost: all-in CPI + TCPI. TCPI crossing is red whatever the CPI.
  let effort: HealthIndicator;
  if (evm.cpiAllIn.kind === 'value') {
    let colour = ratioColour(evm.cpiAllIn.value, t);
    let rule = `${cap(colour)} because CPI (all-in) ${fmt(evm.cpiAllIn)} ${ruleText(evm.cpiAllIn.value, t)}`;
    const tcpiCrossed =
      evm.bacExhausted || (evm.tcpi.kind === 'value' && compareRatio(evm.tcpi.value, t.tcpiRed) > 0);
    if (tcpiCrossed) {
      colour = 'red';
      rule = evm.bacExhausted
        ? 'Red because BAC is exhausted (BAC − AC ≤ 0)'
        : `Red because TCPI ${fmt(evm.tcpi)} > ${thresholdText(t.tcpiRed)} — the remaining work must beat the planned efficiency`;
    }
    effort = { key: 'effort_cost', colour, driver: `CPI ${fmt(evm.cpiAllIn)}`, rule };
  } else {
    effort = {
      key: 'effort_cost',
      colour: 'unavailable',
      driver: '—',
      rule:
        input.measurementBasis === 'count'
          ? 'Unavailable — tracker provides no hours (Ticket-Count Mode)'
          : `Unavailable (${evm.cpiAllIn.reasonCode})`,
    };
  }

  // --- Unplanned Work: the Reporting Period's share
  let unplanned: HealthIndicator;
  if (input.unplannedSharePeriod === null) {
    unplanned = {
      key: 'unplanned',
      colour: 'unavailable',
      driver: '—',
      rule: 'Unavailable — no actual work in this Reporting Period',
    };
  } else {
    const s = input.unplannedSharePeriod;
    const colour: HealthColour =
      compareRatio(s, t.unplannedGreenBelow) < 0
        ? 'green'
        : compareRatio(s, t.unplannedAmberMax) <= 0
          ? 'amber'
          : 'red';
    const pct = share;
    unplanned = {
      key: 'unplanned',
      colour,
      driver: pct(s),
      rule:
        colour === 'green'
          ? `Green because ${pct(s)} < ${pct(t.unplannedGreenBelow)} of this period's hours`
          : colour === 'amber'
            ? `Amber because ${pct(t.unplannedGreenBelow)} ≤ ${pct(s)} ≤ ${pct(t.unplannedAmberMax)}`
            : `Red because ${pct(s)} > ${pct(t.unplannedAmberMax)}`,
    };
  }

  const indicators = [schedule, effort, unplanned];
  const overall = indicators.map((i) => i.colour).reduce(worse, 'green');
  const unavailableOnes = indicators.filter((i) => i.colour === 'unavailable');
  return {
    indicators,
    overall,
    overallNote:
      unavailableOnes.length > 0
        ? `${unavailableOnes.map((i) => label(i.key)).join(', ')} unavailable`
        : null,
  };
}

const label = (k: HealthIndicator['key']) =>
  k === 'schedule' ? 'Schedule' : k === 'effort_cost' ? 'Effort/Cost' : 'Unplanned Work';
const cap = (c: HealthColour) => c.charAt(0).toUpperCase() + c.slice(1);
const fmt = (m: RatioMetric) => (m.kind === 'value' ? ratioText(m.value) : '—');
const ruleText = (v: Ratio, t: ProjectConfig['thresholds']) =>
  compareRatio(v, t.ratioGreen) >= 0
    ? `≥ ${thresholdText(t.ratioGreen)}`
    : compareRatio(v, t.ratioAmber) >= 0
      ? `is between ${thresholdText(t.ratioAmber)} and ${thresholdText(t.ratioGreen)}`
      : `< ${thresholdText(t.ratioAmber)}`;
