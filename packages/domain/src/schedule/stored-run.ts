/**
 * AD-26 stored-run encoding (story 2.9): `inputs.wps` in `compareWp` order; every other WP
 * reference is that array's integer index; stored outputs omit `remainingDays` (Q1 → B).
 *
 * Domain `ScheduleOutputs` keep `remainingDays` and id-keyed refs. This module is the boundary
 * between the pure engine and `schedule_run.inputs` / `outputs` jsonb.
 */
import { z } from 'zod';
import type { CalendarVersion, IsoDate } from '../calendar';
import { decode, encode, stringify, bigintJson, ratioJson, type Json } from '../present/codec';
import { canonicalWps } from './order';
import type { WpMoveCause } from './cause';
import { WP_MOVE_CAUSES } from './cause';
import type {
  ConstraintType,
  ConstraintViolation,
  NotSchedulable,
  ScheduleAnchor,
  ScheduleEdge,
  ScheduleInputs,
  ScheduleOutputs,
  ScheduleState,
  ScheduleWp,
  WpScheduleOutput,
} from './recalculate';

// --- stored shapes --------------------------------------------------------------------------

export interface StoredScheduleWp {
  readonly id: string;
  readonly wbsCode: string;
  /** Index into `wps`, or null for a root. */
  readonly parentId: number | null;
  readonly isLeaf: boolean;
  readonly isMilestone: boolean;
  readonly plannedMh: bigint;
  readonly durationDays: number | null;
  readonly constraintType: ConstraintType;
  readonly constraintDate: IsoDate | null;
  readonly actualStart: IsoDate | null;
  readonly actualFinish: IsoDate | null;
  readonly recordedPct: { readonly num: bigint; readonly den: bigint } | null;
}

export interface StoredScheduleEdge {
  readonly predecessorId: number;
  readonly successorId: number;
  readonly lagDays: number;
  readonly type: 'FS';
}

export interface StoredScheduleInputs {
  readonly projectId: string;
  readonly wps: readonly StoredScheduleWp[];
  readonly edges: readonly StoredScheduleEdge[];
  readonly projectStart: IsoDate;
  readonly dataDate: IsoDate;
  readonly projectFinish: IsoDate | null;
  readonly calendar: CalendarVersion & { readonly versionSeq: number };
  /** Watermarks as assertions (AR-48) — never a second filter. */
  readonly watermarks: {
    readonly wpStatusSeqMax: number;
    readonly pctOverrideSeqMax: number;
  };
  /** Compact FR-28 causes parallel to `wps`; retained when outputs are dropped (AR-11). */
  readonly causes: readonly (WpMoveCause | null)[];
}

/** Stored outputs: no `remainingDays`; WP refs are indices into `inputs.wps`. */
export interface StoredWpScheduleOutput {
  readonly state: ScheduleState | null;
  readonly earlyStart: IsoDate | null;
  readonly earlyFinish: IsoDate | null;
  readonly lateStart: IsoDate | null;
  readonly lateFinish: IsoDate | null;
  readonly floatDays: number | null;
  readonly isCritical: boolean;
  readonly notSchedulableReason: 'no_duration' | null;
  readonly plannedMh: bigint;
  readonly drivingPredecessors: readonly number[];
  readonly cause: WpMoveCause | null;
}

export interface StoredConstraintViolation {
  readonly wpId: number;
  readonly constraintType: 'must_start_on' | 'must_finish_on';
  readonly askedDate: IsoDate;
  readonly derivedDate: IsoDate;
  readonly daysLate: number;
  readonly chain: readonly number[];
}

export interface StoredScheduleOutputs {
  /** Parallel to `inputs.wps` (same order); position is the WP's index. */
  readonly wps: readonly StoredWpScheduleOutput[];
  readonly outOfSequence: readonly { readonly predecessorId: number; readonly successorId: number }[];
  readonly notSchedulable: readonly { readonly wpId: number; readonly reason: 'no_duration' }[];
  readonly violations: readonly StoredConstraintViolation[];
  readonly anchor: ScheduleAnchor | null;
  readonly computedFinish: IsoDate | null;
  readonly criticalPath: readonly number[];
}

export interface EncodeRunOptions {
  readonly calendarVersionSeq: number;
  readonly wpStatusSeqMax?: number;
  readonly pctOverrideSeqMax?: number;
  /** WP ids that are milestones (ScheduleWp does not carry the flag). */
  readonly milestoneIds?: ReadonlySet<string>;
}

function requireIndex(indexOf: ReadonlyMap<string, number>, id: string, label: string): number {
  const index = indexOf.get(id);
  if (index === undefined) {
    throw new RangeError(`stored-run: ${label} "${id}" is not in inputs.wps`);
  }
  return index;
}

function leafness(wps: readonly ScheduleWp[], id: string): boolean {
  return !wps.some((wp) => wp.parentId === id);
}

/**
 * Encode fully resolved domain inputs (+ causes) into the AD-26 stored shape.
 * `inputs.wps` is rewritten into `compareWp` order; every parent / edge end becomes an index.
 * `causesByWpId` maps Project-owned WP ids → cause (from `outputs.wps`).
 */
export function encodeScheduleInputs(
  inputs: ScheduleInputs,
  causesByWpId: ReadonlyMap<string, WpMoveCause | null>,
  options: EncodeRunOptions,
): StoredScheduleInputs {
  const { wps, indexOf } = canonicalWps(inputs.wps);
  const milestones = options.milestoneIds ?? new Set<string>();

  const storedWps: StoredScheduleWp[] = wps.map((wp) => ({
    id: wp.id,
    wbsCode: wp.wbsCode ?? '',
    parentId: wp.parentId === null || wp.parentId === undefined
      ? null
      : requireIndex(indexOf, wp.parentId, 'parent'),
    isLeaf: leafness(inputs.wps, wp.id),
    isMilestone: milestones.has(wp.id),
    plannedMh: wp.plannedMh,
    durationDays: wp.durationDays,
    constraintType: wp.constraintType,
    constraintDate: wp.constraintDate,
    actualStart: wp.actualStart,
    actualFinish: wp.actualFinish,
    recordedPct: wp.recordedPct,
  }));

  return {
    projectId: inputs.projectId,
    wps: storedWps,
    edges: [...inputs.edges]
      .map((edge) => ({
        predecessorId: requireIndex(indexOf, edge.predecessorId, 'predecessor'),
        successorId: requireIndex(indexOf, edge.successorId, 'successor'),
        lagDays: edge.lagDays,
        type: 'FS' as const,
      }))
      .sort(
        (a, b) =>
          a.predecessorId - b.predecessorId ||
          a.successorId - b.successorId ||
          a.lagDays - b.lagDays,
      ),
    projectStart: inputs.projectStart,
    dataDate: inputs.dataDate,
    projectFinish: inputs.projectFinish,
    calendar: {
      nonWorkingDays: inputs.calendar.nonWorkingDays,
      rangeStart: inputs.calendar.rangeStart,
      rangeEnd: inputs.calendar.rangeEnd,
      versionSeq: options.calendarVersionSeq,
    },
    watermarks: {
      wpStatusSeqMax: options.wpStatusSeqMax ?? 0,
      pctOverrideSeqMax: options.pctOverrideSeqMax ?? 0,
    },
    causes: wps.map((wp) => causesByWpId.get(wp.id) ?? null),
  };
}

/**
 * Encode domain outputs into the stored shape: strip `remainingDays`, index-encode every WP ref.
 * `orderedWpIds` is `inputs.wps` id list in stored order (after `encodeScheduleInputs`).
 */
export function encodeScheduleOutputs(
  outputs: ScheduleOutputs,
  orderedWpIds: readonly string[],
): StoredScheduleOutputs {
  const indexOf = new Map(orderedWpIds.map((id, i) => [id, i] as const));
  const byId = new Map(outputs.wps.map((row) => [row.wpId, row]));

  const storedWps: StoredWpScheduleOutput[] = orderedWpIds.map((id) => {
    const row = byId.get(id);
    if (row === undefined) {
      // Foreign WP named by an edge but not owned by the Project — no output row.
      return {
        state: null,
        earlyStart: null,
        earlyFinish: null,
        lateStart: null,
        lateFinish: null,
        floatDays: null,
        isCritical: false,
        notSchedulableReason: null,
        plannedMh: 0n,
        drivingPredecessors: [],
        cause: null,
      };
    }
    return {
      state: row.state,
      earlyStart: row.earlyStart,
      earlyFinish: row.earlyFinish,
      lateStart: row.lateStart,
      lateFinish: row.lateFinish,
      floatDays: row.floatDays,
      isCritical: row.isCritical,
      notSchedulableReason: row.notSchedulableReason,
      plannedMh: row.plannedMh,
      drivingPredecessors: row.drivingPredecessors.map((pred) =>
        requireIndex(indexOf, pred, 'drivingPredecessor'),
      ),
      cause: row.cause,
    };
  });

  return {
    wps: storedWps,
    outOfSequence: outputs.outOfSequence.map((e) => ({
      predecessorId: requireIndex(indexOf, e.predecessorId, 'oos.predecessor'),
      successorId: requireIndex(indexOf, e.successorId, 'oos.successor'),
    })),
    notSchedulable: outputs.notSchedulable.map((n) => ({
      wpId: requireIndex(indexOf, n.wpId, 'notSchedulable'),
      reason: n.reason,
    })),
    violations: outputs.violations.map(
      (v): StoredConstraintViolation => ({
        wpId: requireIndex(indexOf, v.wpId, 'violation'),
        constraintType: v.constraintType,
        askedDate: v.askedDate,
        derivedDate: v.derivedDate,
        daysLate: v.daysLate,
        chain: v.chain.map((id) => requireIndex(indexOf, id, 'violation.chain')),
      }),
    ),
    anchor: outputs.anchor,
    computedFinish: outputs.computedFinish,
    criticalPath: outputs.criticalPath.map((id) => requireIndex(indexOf, id, 'criticalPath')),
  };
}

/** Decode stored inputs back to domain `ScheduleInputs` (ids restored). */
export function decodeScheduleInputs(stored: StoredScheduleInputs): ScheduleInputs {
  const wps: ScheduleWp[] = stored.wps.map((wp) => ({
    id: wp.id,
    wbsCode: wp.wbsCode,
    projectId: stored.projectId,
    parentId: wp.parentId === null ? null : stored.wps[wp.parentId]!.id,
    durationDays: wp.durationDays,
    plannedMh: wp.plannedMh,
    actualStart: wp.actualStart,
    actualFinish: wp.actualFinish,
    recordedPct: wp.recordedPct,
    constraintType: wp.constraintType,
    constraintDate: wp.constraintDate,
  }));
  const edges: ScheduleEdge[] = stored.edges.map((edge) => ({
    predecessorId: stored.wps[edge.predecessorId]!.id,
    successorId: stored.wps[edge.successorId]!.id,
    lagDays: edge.lagDays,
  }));
  return {
    projectId: stored.projectId,
    wps,
    edges,
    projectStart: stored.projectStart,
    dataDate: stored.dataDate,
    projectFinish: stored.projectFinish,
    calendar: {
      nonWorkingDays: stored.calendar.nonWorkingDays,
      rangeStart: stored.calendar.rangeStart,
      rangeEnd: stored.calendar.rangeEnd,
    },
  };
}

/** Decode stored outputs back to domain shape (ids restored; `remainingDays` absent → null). */
export function decodeScheduleOutputs(
  stored: StoredScheduleOutputs,
  orderedWpIds: readonly string[],
): ScheduleOutputs {
  const idOf = (index: number): string => {
    const id = orderedWpIds[index];
    if (id === undefined) throw new RangeError(`stored-run: WP index ${index} out of range`);
    return id;
  };

  const wps: WpScheduleOutput[] = stored.wps.map((row, index) => ({
    wpId: idOf(index),
    state: row.state,
    earlyStart: row.earlyStart,
    earlyFinish: row.earlyFinish,
    remainingDays: null, // never stored (Q1 → B)
    notSchedulableReason: row.notSchedulableReason,
    plannedMh: row.plannedMh,
    lateStart: row.lateStart,
    lateFinish: row.lateFinish,
    floatDays: row.floatDays,
    isCritical: row.isCritical,
    drivingPredecessors: row.drivingPredecessors.map(idOf),
    cause: row.cause,
  }));

  const notSchedulable: NotSchedulable[] = stored.notSchedulable.map((n) => ({
    wpId: idOf(n.wpId),
    reason: n.reason,
  }));
  const violations: ConstraintViolation[] = stored.violations.map((v) => ({
    wpId: idOf(v.wpId),
    constraintType: v.constraintType,
    askedDate: v.askedDate,
    derivedDate: v.derivedDate,
    daysLate: v.daysLate,
    chain: v.chain.map(idOf),
  }));

  return {
    wps,
    outOfSequence: stored.outOfSequence.map((e) => ({
      predecessorId: idOf(e.predecessorId),
      successorId: idOf(e.successorId),
    })),
    notSchedulable,
    violations,
    anchor: stored.anchor,
    computedFinish: stored.computedFinish,
    criticalPath: stored.criticalPath.map(idOf),
  };
}

/** Domain outputs with `remainingDays` stripped — the shape a stored round-trip compares to. */
export function stripRemainingDays(outputs: ScheduleOutputs): ScheduleOutputs {
  return {
    ...outputs,
    wps: outputs.wps.map((row) => ({ ...row, remainingDays: null })),
  };
}

/** Canonical JSON for a stored run payload (AD-4). */
export function storedRunJson(value: unknown): Json {
  return encode(value);
}

export function storedRunText(value: unknown): string {
  return stringify(value);
}

const causeJson = z.enum(WP_MOVE_CAUSES).nullable();

const storedWpJson = z.object({
  id: z.string(),
  wbsCode: z.string(),
  parentId: z.number().int().nonnegative().nullable(),
  isLeaf: z.boolean(),
  isMilestone: z.boolean(),
  plannedMh: bigintJson,
  durationDays: z.number().int().nullable(),
  constraintType: z.enum(['asap', 'must_start_on', 'must_finish_on']),
  constraintDate: z.string().nullable(),
  actualStart: z.string().nullable(),
  actualFinish: z.string().nullable(),
  recordedPct: ratioJson.nullable(),
});

const storedInputsJson = z.object({
  projectId: z.string(),
  wps: z.array(storedWpJson),
  edges: z.array(
    z.object({
      predecessorId: z.number().int().nonnegative(),
      successorId: z.number().int().nonnegative(),
      lagDays: z.number().int(),
      type: z.literal('FS'),
    }),
  ),
  projectStart: z.string(),
  dataDate: z.string(),
  projectFinish: z.string().nullable(),
  calendar: z.object({
    nonWorkingDays: z.array(z.string()),
    rangeStart: z.string(),
    rangeEnd: z.string(),
    versionSeq: z.number().int(),
  }),
  watermarks: z.object({
    wpStatusSeqMax: z.number().int(),
    pctOverrideSeqMax: z.number().int(),
  }),
  causes: z.array(causeJson),
});

const storedOutputsJson = z.object({
  wps: z.array(
    z.object({
      state: z.enum(['complete', 'in_progress', 'remaining']).nullable(),
      earlyStart: z.string().nullable(),
      earlyFinish: z.string().nullable(),
      lateStart: z.string().nullable(),
      lateFinish: z.string().nullable(),
      floatDays: z.number().int().nullable(),
      isCritical: z.boolean(),
      notSchedulableReason: z.literal('no_duration').nullable(),
      plannedMh: bigintJson,
      drivingPredecessors: z.array(z.number().int().nonnegative()),
      cause: causeJson,
    }),
  ),
  outOfSequence: z.array(
    z.object({
      predecessorId: z.number().int().nonnegative(),
      successorId: z.number().int().nonnegative(),
    }),
  ),
  notSchedulable: z.array(
    z.object({
      wpId: z.number().int().nonnegative(),
      reason: z.literal('no_duration'),
    }),
  ),
  violations: z.array(
    z.object({
      wpId: z.number().int().nonnegative(),
      constraintType: z.enum(['must_start_on', 'must_finish_on']),
      askedDate: z.string(),
      derivedDate: z.string(),
      daysLate: z.number().int(),
      chain: z.array(z.number().int().nonnegative()),
    }),
  ),
  anchor: z
    .object({
      kind: z.enum(['project_finish', 'computed_finish']),
      date: z.string(),
    })
    .nullable(),
  computedFinish: z.string().nullable(),
  criticalPath: z.array(z.number().int().nonnegative()),
});

/** Read stored inputs jsonb through the codec schema. */
export function parseStoredInputs(json: unknown): StoredScheduleInputs {
  return decode(json, storedInputsJson);
}

/** Read stored outputs jsonb through the codec schema. */
export function parseStoredOutputs(json: unknown): StoredScheduleOutputs {
  return decode(json, storedOutputsJson);
}
