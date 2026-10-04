/**
 * Shared Set / Re-baseline append core (Epic 4 retro F3 / item-22).
 *
 * Private to the Baseline writer surface — parameterized by gate evaluator, reason, and audit
 * action. Public audited entrypoints stay in `set-baseline.ts` / `re-baseline.ts` with their
 * schemas and role/audit declarations.
 */
import type { Bound } from '../../../db/src/bound';
import { lockWatermark } from '../../../db/src/watermark-lock';
import {
  baselineRepositoryOn,
  type AppendBaselineWpRow,
  type BaselineLeafProjection,
} from '../../../db/src/repositories/baseline';
import { scheduleRepositoryOn } from '../../../db/src/repositories/schedule';
import { audit, type AuditAction, type AuditScope } from '../audit';
import type { WriteStamp } from '../ports/audited-write';
import type { IdGenerator } from '../ports/ids';
import type { SchedulingBound } from '../ports/schedule-write';
import { refuse } from '../use-cases/audited-write';
import type {
  BaselineGateInput,
  BaselineGateOk,
  BaselineGateRefuse,
} from './gates';

function asBound(bound: SchedulingBound): Bound {
  return bound as Bound;
}

export type AppendBaselineVersionResult = {
  readonly baselineVersionSeq: number;
  readonly baselineVersionId: string;
  readonly scheduleRunSeq: number;
  readonly leafCount: number;
  readonly reason: string;
};

/** Gate evaluator shared by early + under-lock passes. */
export type BaselineWriterGate = (
  input: BaselineGateInput,
) => BaselineGateOk | BaselineGateRefuse<string>;

export type AppendBaselineVersionArgs = {
  readonly bound: SchedulingBound;
  readonly scope: AuditScope;
  readonly stamp: WriteStamp;
  readonly ids: IdGenerator;
  readonly projectId: string;
  readonly reason: string;
  readonly auditAction: Extract<AuditAction, 'baseline.set' | 'baseline.rebaseline'>;
  readonly evaluateGates: BaselineWriterGate;
};

/**
 * Map leaf projections + pinned run dates into append-only `baseline_wp` rows.
 * Refuses when a leaf has no dates in the gate result (incomplete_plan).
 */
export function buildBaselineWpRows(
  leaves: readonly BaselineLeafProjection[],
  leafDates: ReadonlyMap<string, { readonly start: string; readonly finish: string }>,
  nextId: () => string,
): AppendBaselineWpRow[] {
  return leaves.map((leaf) => {
    const dates = leafDates.get(leaf.wpId);
    if (dates === undefined) {
      refuse('invalid_input', {
        baseline: ['incomplete_plan'],
        blockingWpIds: [leaf.wpId],
      });
    }
    return {
      id: nextId(),
      wpId: leaf.wpId,
      start: dates.start,
      finish: dates.finish,
      baselineMh: leaf.plannedMh,
      isMilestone: leaf.isMilestone,
      isCatchAll: leaf.isCatchAll,
    };
  });
}

/**
 * Dual-gate (early + under Project lock) → append version + leaf rows → audit.
 * Callers supply reason policy, gate choice, and audit action name.
 */
export async function appendBaselineVersionWithLeaves(
  args: AppendBaselineVersionArgs,
): Promise<AppendBaselineVersionResult> {
  const bound = asBound(args.bound);
  const baseline = baselineRepositoryOn(bound);
  const schedule = scheduleRepositoryOn(bound);

  const loadGateInput = async (): Promise<BaselineGateInput> => {
    const [projectStart, existingBaselineSeq, latestRun, successfulRun, leaves] =
      await Promise.all([
        baseline.projectStart(args.projectId),
        baseline.latestVersionSeq(args.projectId),
        schedule.latestRun(args.projectId),
        schedule.latestSuccessfulRun(args.projectId),
        baseline.loadLeafProjections(args.projectId),
      ]);
    return { projectStart, existingBaselineSeq, latestRun, successfulRun, leaves };
  };

  // Long reads before the exclusive lock (AD-20) — early refuse without holding it.
  const early = await loadGateInput();
  const earlyGate = args.evaluateGates(early);
  if (!earlyGate.ok) {
    refuse('invalid_input', earlyGate.details);
  }

  // AD-20: exclusive Project lock, then re-read + re-gate (closes concurrent TOCTOU).
  await lockWatermark(bound, { kind: 'project', projectId: args.projectId });

  const locked = await loadGateInput();
  const gate = args.evaluateGates(locked);
  if (!gate.ok) {
    refuse('invalid_input', gate.details);
  }
  const { scheduleRunSeq, leafDates } = gate;

  const versionId = args.ids.next();
  const wpRows = buildBaselineWpRows(locked.leaves, leafDates, () => args.ids.next());

  const { seq } = await baseline.appendVersionWithWps(
    {
      projectId: args.projectId,
      id: versionId,
      scheduleRunSeq,
      reason: args.reason,
      actor: args.stamp.actor,
      at: args.stamp.at,
    },
    wpRows,
  );

  await audit.record(args.scope, args.stamp, args.auditAction, args.projectId, {
    baselineVersionSeq: seq,
    baselineVersionId: versionId,
    scheduleRunSeq,
    leafCount: wpRows.length,
    reason: args.reason,
  });

  return {
    baselineVersionSeq: seq,
    baselineVersionId: versionId,
    scheduleRunSeq,
    leafCount: wpRows.length,
    reason: args.reason,
  };
}
