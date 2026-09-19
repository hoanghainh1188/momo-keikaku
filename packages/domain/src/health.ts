import type { EvmResult } from './evm';
import type { ProjectConfig } from './types';
import type { Metric } from './units';

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
  unplannedSharePeriod: number | null;
  unplannedShareCumulative: number | null;
  /** FR-31: Schedule is at least amber when a Milestone is past its Baseline date and not done */
  slippedMilestones: { wbsCode: string; name: string; baselineDate: string }[];
  measurementBasis: 'hours' | 'count';
}

const ratioColour = (v: number, t: ProjectConfig['thresholds']): HealthColour =>
  v >= t.ratioGreen ? 'green' : v >= t.ratioAmber ? 'amber' : 'red';

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
      evm.bacExhausted || (evm.tcpi.kind === 'value' && evm.tcpi.value > t.tcpiRed);
    if (tcpiCrossed) {
      colour = 'red';
      rule = evm.bacExhausted
        ? 'Red because BAC is exhausted (BAC − AC ≤ 0)'
        : `Red because TCPI ${fmt(evm.tcpi)} > ${t.tcpiRed} — the remaining work must beat the planned efficiency`;
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
      s < t.unplannedGreenBelow ? 'green' : s <= t.unplannedAmberMax ? 'amber' : 'red';
    const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
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
const fmt = (m: Metric) => (m.kind === 'value' ? m.value.toFixed(2) : '—');
const ruleText = (v: number, t: ProjectConfig['thresholds']) =>
  v >= t.ratioGreen
    ? `≥ ${t.ratioGreen}`
    : v >= t.ratioAmber
      ? `is between ${t.ratioAmber} and ${t.ratioGreen}`
      : `< ${t.ratioAmber}`;
