/**
 * `app/schedule.recalculateProject` — resolve inputs, call the pure engine, append the run
 * (story 2.9, AR-47). Nothing else is named `recalculate`.
 *
 * Called from `applyPlanChange` after the input write, inside the same tenant transaction under
 * the per-Project exclusive lock. Graph offences (`graph_invalid`) refuse and roll back.
 * `calendar_range` appends a halted run and stale-marks `wp_schedule` (Q2 → A).
 */
import {
  ENGINE_VERSION,
  decodeScheduleInputs,
  encode,
  encodeScheduleInputs,
  encodeScheduleOutputs,
  parseStoredInputs,
  recalculate,
  registeredEngineVersions,
  type ScheduleInputs,
  type ScheduleOutputs,
  type ScheduleRunCause,
  type ScheduleWp,
  type WpMoveCause,
} from '@momo/domain';
import type { Bound } from '../../../db/src/bound';
import { scheduleRepositoryOn } from '../../../db/src/repositories/schedule';
import { refuse } from '../use-cases/audited-write';
import {
  ANCESTOR_DESCENDANT_LINK,
  CROSS_PROJECT_LINK,
  DEPENDENCY_CYCLE,
  SUMMARY_ENDPOINT,
  type PlanInvariantRule,
} from './plan-invariants';

export interface RecalculateProjectArgs {
  readonly bound: Bound;
  readonly projectId: string;
  readonly cause: ScheduleRunCause;
  readonly actor: string;
  readonly at: Date;
  /** When the fence already resolved inputs (post-mutation); otherwise loaded from the DB. */
  readonly inputs?: ScheduleInputs;
  readonly prevInputs?: ScheduleInputs | null;
  readonly milestoneIds?: ReadonlySet<string>;
  readonly calendarVersionSeq?: number;
  readonly wpStatusSeqMax?: number;
  readonly pctOverrideSeqMax?: number;
}

export interface RecalculateProjectResult {
  readonly seq: number | null;
  readonly kind: 'scheduled' | 'halted' | 'cleared';
  readonly haltedReason: string | null;
  readonly outputs: ScheduleOutputs | null;
}

function ruleCodesFromGraphOffences(offences: {
  readonly cycles: readonly unknown[];
  readonly ancestorDescendant: readonly unknown[];
  readonly summaryEndpoints: readonly unknown[];
  readonly crossProject: readonly unknown[];
}): PlanInvariantRule[] {
  const codes: PlanInvariantRule[] = [];
  if (offences.cycles.length > 0) codes.push(DEPENDENCY_CYCLE);
  if (offences.ancestorDescendant.length > 0) codes.push(ANCESTOR_DESCENDANT_LINK);
  if (offences.summaryEndpoints.length > 0) codes.push(SUMMARY_ENDPOINT);
  if (offences.crossProject.length > 0) codes.push(CROSS_PROJECT_LINK);
  return codes;
}

function causesByWpId(outputs: ScheduleOutputs): Map<string, WpMoveCause | null> {
  return new Map(outputs.wps.map((row) => [row.wpId, row.cause]));
}

function wpScheduleRows(outputs: ScheduleOutputs) {
  return outputs.wps.map((row) => ({
    wpId: row.wpId,
    earlyStart: row.earlyStart,
    earlyFinish: row.earlyFinish,
    lateStart: row.lateStart,
    lateFinish: row.lateFinish,
    floatDays: row.floatDays,
    isCritical: row.isCritical,
    state: row.state,
    notSchedulableReason: row.notSchedulableReason,
  }));
}

/**
 * Resolve Project plan rows into domain `ScheduleInputs`. Throws when there is no Project start
 * (the "no project start yet" gate — app layer).
 */
export async function resolveScheduleInputs(
  bound: Bound,
  projectId: string,
  stamp: { readonly actor: string; readonly at: Date },
): Promise<{
  readonly inputs: ScheduleInputs;
  readonly prevInputs: ScheduleInputs | null;
  readonly calendarVersionSeq: number;
  readonly milestoneIds: ReadonlySet<string>;
  readonly wpStatusSeqMax: number;
  readonly pctOverrideSeqMax: number;
}> {
  const schedule = scheduleRepositoryOn(bound);
  const plan = await schedule.loadPlanRows(projectId);

  if (plan.project.projectStart === null) {
    refuse('invalid_input', { projectStart: ['required'] });
  }
  if (plan.project.dataDate === null) {
    // After 2.11, Data Date is written with Project start — never invent one on resolve.
    refuse('invalid_input', { dataDate: ['required'] });
  }

  // Synthetic calendar until 2.12 — weekends must be listed explicitly (domain applies none).
  let calendarVersionSeq = plan.calendar?.seq ?? null;
  let calendar = plan.calendar;
  if (calendar === null) {
    const rangeStart = plan.project.projectStart;
    const rangeEnd = '2030-12-31';
    const nonWorkingDays: string[] = [];
    for (let d = new Date(`${rangeStart}T00:00:00Z`); d <= new Date(`${rangeEnd}T00:00:00Z`); ) {
      const iso = d.toISOString().slice(0, 10);
      const dow = d.getUTCDay();
      if (dow === 0 || dow === 6) nonWorkingDays.push(iso);
      d.setUTCDate(d.getUTCDate() + 1);
    }
    calendarVersionSeq = await schedule.ensureCalendarVersion(
      projectId,
      { nonWorkingDays, rangeStart, rangeEnd },
      stamp,
    );
    calendar = {
      seq: calendarVersionSeq,
      nonWorkingDays,
      rangeStart,
      rangeEnd,
    };
  }

  const dataDate = plan.project.dataDate;
  const milestoneIds = new Set(plan.wps.filter((w) => w.isMilestone).map((w) => w.id));

  const wps: ScheduleWp[] = plan.wps.map((w) => {
    const status = plan.statusHeads.get(w.id);
    const pct = plan.pctHeads.get(w.id);
    return {
      id: w.id,
      wbsCode: w.wbsCode,
      projectId,
      parentId: w.parentId,
      durationDays: w.durationDays,
      plannedMh: w.plannedMh,
      actualStart: status?.actualStart ?? null,
      actualFinish: status?.actualFinish ?? null,
      recordedPct: pct !== undefined ? { num: pct.num, den: pct.den } : null,
      constraintType: w.constraintType as ScheduleWp['constraintType'],
      constraintDate: w.constraintDate,
    };
  });

  const inputs: ScheduleInputs = {
    projectId,
    wps,
    edges: plan.edges.map((e) => ({
      predecessorId: e.predecessorWpId,
      successorId: e.successorWpId,
      lagDays: e.lagDays,
    })),
    projectStart: plan.project.projectStart,
    dataDate,
    projectFinish: plan.project.projectFinish,
    calendar: {
      nonWorkingDays: calendar.nonWorkingDays,
      rangeStart: calendar.rangeStart,
      rangeEnd: calendar.rangeEnd,
    },
  };

  const latest = await schedule.latestRun(projectId);
  let prevInputs: ScheduleInputs | null = null;
  if (latest !== null && latest.inputs !== null) {
    try {
      prevInputs = decodeScheduleInputs(parseStoredInputs(latest.inputs));
    } catch {
      prevInputs = null;
    }
  }

  return {
    inputs,
    prevInputs,
    calendarVersionSeq: calendarVersionSeq!,
    milestoneIds,
    wpStatusSeqMax: plan.wpStatusSeqMax,
    pctOverrideSeqMax: plan.pctOverrideSeqMax,
  };
}

export async function recalculateProject(
  args: RecalculateProjectArgs,
): Promise<RecalculateProjectResult> {
  if (!registeredEngineVersions().includes(ENGINE_VERSION)) {
    throw new Error(`engine_version "${ENGINE_VERSION}" is not registered`);
  }

  const schedule = scheduleRepositoryOn(args.bound);
  const resolved =
    args.inputs !== undefined
      ? {
          inputs: args.inputs,
          prevInputs: args.prevInputs ?? null,
          calendarVersionSeq: args.calendarVersionSeq!,
          milestoneIds: args.milestoneIds ?? new Set<string>(),
          wpStatusSeqMax: args.wpStatusSeqMax ?? 0,
          pctOverrideSeqMax: args.pctOverrideSeqMax ?? 0,
        }
      : await resolveScheduleInputs(args.bound, args.projectId, {
          actor: args.actor,
          at: args.at,
        });

  const result = recalculate(resolved.inputs, resolved.prevInputs);

  if (result.kind === 'halted' && result.reason === 'graph_invalid') {
    refuse('invalid_input', {
      dependencies: ruleCodesFromGraphOffences(result.offences),
    });
  }

  if (result.kind === 'halted' && result.reason === 'calendar_range') {
    const storedInputs = encodeScheduleInputs(resolved.inputs, new Map(), {
      calendarVersionSeq: resolved.calendarVersionSeq,
      milestoneIds: resolved.milestoneIds,
      wpStatusSeqMax: resolved.wpStatusSeqMax,
      pctOverrideSeqMax: resolved.pctOverrideSeqMax,
    });
    const { seq } = await schedule.appendRun({
      projectId: args.projectId,
      holidayCalendarVersionSeq: resolved.calendarVersionSeq,
      cause: args.cause,
      actor: args.actor,
      at: args.at,
      inputs: encode(storedInputs),
      outputs: null,
      engineVersion: ENGINE_VERSION,
      anchor: null,
      computedFinish: null,
      haltedReason: 'calendar_range',
    });
    await schedule.markWpScheduleStale(args.projectId);
    return { seq, kind: 'halted', haltedReason: 'calendar_range', outputs: null };
  }

  if (result.kind !== 'scheduled') {
    // Exhaustiveness — graph_invalid already refused.
    refuse('invalid_input');
  }

  const outputs = result.outputs;
  const storedInputs = encodeScheduleInputs(resolved.inputs, causesByWpId(outputs), {
    calendarVersionSeq: resolved.calendarVersionSeq,
    milestoneIds: resolved.milestoneIds,
    wpStatusSeqMax: resolved.wpStatusSeqMax,
    pctOverrideSeqMax: resolved.pctOverrideSeqMax,
  });
  const orderedIds = storedInputs.wps.map((w) => w.id);
  const storedOutputs = encodeScheduleOutputs(outputs, orderedIds);

  const { seq } = await schedule.appendRun({
    projectId: args.projectId,
    holidayCalendarVersionSeq: resolved.calendarVersionSeq,
    cause: args.cause,
    actor: args.actor,
    at: args.at,
    inputs: encode(storedInputs),
    outputs: encode(storedOutputs),
    engineVersion: ENGINE_VERSION,
    anchor: outputs.anchor?.date ?? null,
    computedFinish: outputs.computedFinish,
    haltedReason: null,
  });
  await schedule.rebuildWpSchedule(args.projectId, seq, wpScheduleRows(outputs));
  return { seq, kind: 'scheduled', haltedReason: null, outputs };
}
