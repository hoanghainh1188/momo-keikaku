/**
 * Shared refuse gates for first Set Baseline (story 4.1). Pure helpers over already-loaded
 * plan / run state — the writer and the UI eligibility read share this so disable and refuse
 * cannot disagree.
 */
import { parseStoredInputs, parseStoredOutputs } from '@momo/domain';
import type { BaselineLeafProjection } from '../../../db/src/repositories/baseline';

export type BaselineSetRefuseReason =
  | 'already_exists'
  | 'no_successful_run'
  | 'halted_or_missing_run'
  | 'no_project_start'
  | 'incomplete_plan';

export interface BaselineSetGateInput {
  readonly projectStart: string | null;
  readonly existingBaselineSeq: number | null;
  readonly latestRun:
    | {
        readonly seq: number;
        readonly haltedReason: string | null;
        readonly outputs: unknown;
        readonly inputs: unknown;
      }
    | null;
  /** When set, prefer this successful run over filtering `latestRun`. */
  readonly successfulRun:
    | {
        readonly seq: number;
        readonly outputs: unknown;
        readonly inputs: unknown;
      }
    | null;
  readonly leaves: readonly BaselineLeafProjection[];
}

export interface BaselineSetGateOk {
  readonly ok: true;
  readonly scheduleRunSeq: number;
  readonly notSchedulableWpIds: readonly string[];
  readonly leafDates: ReadonlyMap<string, { readonly start: string; readonly finish: string }>;
}

export interface BaselineSetGateRefuse {
  readonly ok: false;
  readonly reason: BaselineSetRefuseReason;
  readonly blockingWpIds: readonly string[];
  readonly notSchedulableCount: number;
  readonly details: Readonly<Record<string, readonly string[]>>;
}

export type BaselineSetGateResult = BaselineSetGateOk | BaselineSetGateRefuse;

/**
 * Evaluate whether a first Set Baseline may proceed. Dates come from the pinned successful
 * run's outputs (early_start / early_finish), matched by `wp_id` via inputs.wps order — never
 * from live `wp_schedule` alone, so the cost slice matches the run the version pins.
 */
export function evaluateBaselineSetGates(input: BaselineSetGateInput): BaselineSetGateResult {
  if (input.existingBaselineSeq !== null) {
    return refuse('already_exists', [], 0, {
      baseline: ['already_exists'],
      hint: ['use_rebaseline'],
    });
  }

  const latest = input.latestRun;
  if (latest === null) {
    return refuse('no_successful_run', [], 0, {
      baseline: ['no_successful_run'],
      scheduleRun: ['missing'],
    });
  }
  // Matrix: refuse when the latest run is halted / missing outputs — do not pin an older
  // successful run while the Current Plan's head is halted.
  if (latest.haltedReason !== null || latest.outputs === null) {
    return refuse('halted_or_missing_run', [], 0, {
      baseline: ['halted_or_missing_run'],
      scheduleRun: ['halted_or_missing_outputs'],
      scheduleRunSeq: [String(latest.seq)],
    });
  }

  // Latest is successful; prefer the explicit successfulRun when the caller loaded it
  // (must match latest.seq when head is successful).
  const pin = input.successfulRun ?? {
    seq: latest.seq,
    outputs: latest.outputs,
    inputs: latest.inputs,
  };
  if (pin.seq !== latest.seq) {
    return refuse('halted_or_missing_run', [], 0, {
      baseline: ['halted_or_missing_run'],
      scheduleRun: ['latest_not_successful'],
      scheduleRunSeq: [String(latest.seq)],
    });
  }

  if (input.projectStart === null) {
    const missingDuration = leavesMissingDuration(input.leaves);
    // Duration gaps are blockers only — not-schedulable count stays 0 here (no run parse yet).
    return refuse('no_project_start', missingDuration, 0, {
      baseline: ['no_project_start'],
      projectStart: ['required'],
      ...(missingDuration.length > 0 ? { blockingWpIds: missingDuration } : {}),
    });
  }

  const missingDuration = leavesMissingDuration(input.leaves);
  let storedInputs;
  let storedOutputs;
  try {
    storedInputs = parseStoredInputs(pin.inputs);
    storedOutputs = parseStoredOutputs(pin.outputs);
  } catch {
    return refuse('halted_or_missing_run', [], 0, {
      baseline: ['halted_or_missing_run'],
      scheduleRun: ['unreadable_outputs'],
      scheduleRunSeq: [String(pin.seq)],
    });
  }

  const orderedIds = storedInputs.wps.map((w) => w.id);
  const notSchedulableWpIds = storedOutputs.notSchedulable.flatMap((n) => {
    const id = orderedIds[n.wpId];
    return id === undefined ? [] : [id];
  });

  const leafDates = new Map<string, { readonly start: string; readonly finish: string }>();
  for (let i = 0; i < storedOutputs.wps.length; i += 1) {
    const wpId = orderedIds[i];
    const row = storedOutputs.wps[i];
    if (wpId === undefined || row === undefined) continue;
    if (row.earlyStart === null || row.earlyFinish === null) continue;
    leafDates.set(wpId, { start: row.earlyStart, finish: row.earlyFinish });
  }

  const leavesMissingDates = input.leaves
    .filter((leaf) => !leafDates.has(leaf.wpId))
    .map((leaf) => leaf.wpId);

  const blocking = unique([...missingDuration, ...notSchedulableWpIds, ...leavesMissingDates]);
  if (blocking.length > 0) {
    return refuse('incomplete_plan', blocking, notSchedulableWpIds.length, {
      baseline: ['incomplete_plan'],
      blockingWpIds: blocking,
      notSchedulableCount: [String(notSchedulableWpIds.length)],
    });
  }

  return {
    ok: true,
    scheduleRunSeq: pin.seq,
    notSchedulableWpIds,
    leafDates,
  };
}

function leavesMissingDuration(leaves: readonly BaselineLeafProjection[]): string[] {
  return leaves
    .filter((leaf) => {
      if (leaf.isMilestone) return leaf.durationDays !== 0;
      return leaf.durationDays === null;
    })
    .map((leaf) => leaf.wpId);
}

function refuse(
  reason: BaselineSetRefuseReason,
  blockingWpIds: readonly string[],
  notSchedulableCount: number,
  details: Readonly<Record<string, readonly string[]>>,
): BaselineSetGateRefuse {
  return { ok: false, reason, blockingWpIds, notSchedulableCount, details };
}

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}
