import type { ReviewResult } from './review';
import { earnedProgress, hours, ratioText, share } from './present';

/**
 * FR-34 / AD-12: the client projection. It returns a SEPARATE type with no money,
 * Rate, person, Tracker Account or Ticket-content fields, so the omission is checked
 * at compile time. R0 renders this as a preview only (publishing persistence is R1).
 */
export interface VisibilityPolicy {
  showUnplannedBreakdown: boolean;
  showEvmDetail: boolean;
  showForecast: boolean;
  showRisks: boolean;
}

export const DEFAULT_VISIBILITY: VisibilityPolicy = {
  showUnplannedBreakdown: false,
  showEvmDetail: false,
  showForecast: false,
  showRisks: false,
};

export interface ClientOutputs {
  projectName: string;
  periodLabel: string;
  asOf: string;
  overall: 'green' | 'amber' | 'red' | 'unavailable';
  indicators: { key: string; label: string; colour: string; driver: string; rule: string }[];
  unplanned: {
    sharePeriod: string | null;
    hours: string;
    statement: string;
    notes: string[];
    breakdown: { label: string; hours: string }[] | null;
  };
  milestones: { name: string; baselineDate: string; currentDate: string | null; doneDate: string | null; slipped: boolean }[];
  schedule: { wbsCode: string; name: string; baselineStart: string | null; baselineFinish: string | null; currentStart: string | null; currentFinish: string | null; progress: { fraction: number; label: string } }[];
  evm: { label: string; value: string; unit: string | null }[] | null;
}

const LABELS: Record<string, string> = {
  schedule: 'Schedule',
  effort_cost: 'Effort',
  unplanned: 'Unplanned Work',
};

export function clientProjection(
  review: ReviewResult,
  projectName: string,
  policy: VisibilityPolicy = DEFAULT_VISIBILITY,
): ClientOutputs {
  return {
    projectName,
    periodLabel: review.snapshot.observedAt,
    asOf: review.snapshot.observedAt,
    overall: review.health.overall,
    indicators: review.health.indicators.map((i) => ({
      key: i.key,
      label: LABELS[i.key] ?? i.key,
      colour: i.colour,
      // Effort is shown without money: the driver for Effort/Cost is a ratio, which is safe.
      driver: i.driver,
      rule: i.rule,
    })),
    unplanned: {
      sharePeriod: review.unplanned.sharePeriod === null ? null : share(review.unplanned.sharePeriod),
      hours: hours(review.unplanned.period.unplannedMh),
      statement:
        'Unplanned Work carries effort but no earned value: it is work done outside the baselined plan.',
      notes: review.explainNotes.map((n) => n.note),
      breakdown: policy.showUnplannedBreakdown
        ? review.unplanned.components.map((c) => ({ label: c.label, hours: hours(c.mh) }))
        : null,
    },
    milestones: review.milestones.map((m) => ({
      name: m.name,
      baselineDate: m.baselineDate,
      currentDate: m.currentDate,
      doneDate: m.doneDate,
      slipped: m.slipped,
    })),
    // FR-34: the schedule as a Gantt to WBS level 2.
    schedule: review.divergence
      .filter((d) => d.wbsCode.split('.').length <= 2)
      .map((d) => ({
        wbsCode: d.wbsCode,
        name: d.name,
        baselineStart: d.baselineStart,
        baselineFinish: d.baselineFinish,
        currentStart: d.currentStart,
        currentFinish: d.currentFinish,
        // Presented, never the exact Ratio: its num/den are Baseline and earned milli-hours,
        // which are not the client's to see. The label is the whole percentage; the fraction is
        // layout geometry only.
        progress: earnedProgress(d.pctComplete),
      })),
    evm: policy.showEvmDetail
      ? [
          { label: 'SPI', value: review.evm.spi.kind === 'value' ? ratioText(review.evm.spi.value) : '—', unit: null },
          { label: 'Earned value', value: hours(review.evm.evMh), unit: 'h' },
        ]
      : null,
  };
}
