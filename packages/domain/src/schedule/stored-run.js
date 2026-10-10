/**
 * AD-26 stored-run encoding (story 2.9): `inputs.wps` in `compareWp` order; every other WP
 * reference is that array's integer index; stored outputs omit `remainingDays` (Q1 → B).
 *
 * Domain `ScheduleOutputs` keep `remainingDays` and id-keyed refs. This module is the boundary
 * between the pure engine and `schedule_run.inputs` / `outputs` jsonb.
 */
import { z } from 'zod';
import { decode, encode, stringify, bigintJson, ratioJson } from '../present/codec';
import { canonicalWps } from './order';
import { WP_MOVE_CAUSES } from './cause';
function requireIndex(indexOf, id, label) {
    const index = indexOf.get(id);
    if (index === undefined) {
        throw new RangeError(`stored-run: ${label} "${id}" is not in inputs.wps`);
    }
    return index;
}
function leafness(wps, id) {
    return !wps.some((wp) => wp.parentId === id);
}
/**
 * Encode fully resolved domain inputs (+ causes) into the AD-26 stored shape.
 * `inputs.wps` is rewritten into `compareWp` order; every parent / edge end becomes an index.
 * `causesByWpId` maps Project-owned WP ids → cause (from `outputs.wps`).
 */
export function encodeScheduleInputs(inputs, causesByWpId, options) {
    const { wps, indexOf } = canonicalWps(inputs.wps);
    const milestones = options.milestoneIds ?? new Set();
    const storedWps = wps.map((wp) => ({
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
            type: 'FS',
        }))
            .sort((a, b) => a.predecessorId - b.predecessorId ||
            a.successorId - b.successorId ||
            a.lagDays - b.lagDays),
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
export function encodeScheduleOutputs(outputs, orderedWpIds) {
    const indexOf = new Map(orderedWpIds.map((id, i) => [id, i]));
    const byId = new Map(outputs.wps.map((row) => [row.wpId, row]));
    const storedWps = orderedWpIds.map((id) => {
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
            drivingPredecessors: row.drivingPredecessors.map((pred) => requireIndex(indexOf, pred, 'drivingPredecessor')),
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
        violations: outputs.violations.map((v) => ({
            wpId: requireIndex(indexOf, v.wpId, 'violation'),
            constraintType: v.constraintType,
            askedDate: v.askedDate,
            derivedDate: v.derivedDate,
            daysLate: v.daysLate,
            chain: v.chain.map((id) => requireIndex(indexOf, id, 'violation.chain')),
        })),
        anchor: outputs.anchor,
        computedFinish: outputs.computedFinish,
        criticalPath: outputs.criticalPath.map((id) => requireIndex(indexOf, id, 'criticalPath')),
    };
}
/** Decode stored inputs back to domain `ScheduleInputs` (ids restored). */
export function decodeScheduleInputs(stored) {
    const wps = stored.wps.map((wp) => ({
        id: wp.id,
        wbsCode: wp.wbsCode,
        projectId: stored.projectId,
        parentId: wp.parentId === null ? null : stored.wps[wp.parentId].id,
        durationDays: wp.durationDays,
        plannedMh: wp.plannedMh,
        actualStart: wp.actualStart,
        actualFinish: wp.actualFinish,
        recordedPct: wp.recordedPct,
        constraintType: wp.constraintType,
        constraintDate: wp.constraintDate,
    }));
    const edges = stored.edges.map((edge) => ({
        predecessorId: stored.wps[edge.predecessorId].id,
        successorId: stored.wps[edge.successorId].id,
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
export function decodeScheduleOutputs(stored, orderedWpIds) {
    const idOf = (index) => {
        const id = orderedWpIds[index];
        if (id === undefined)
            throw new RangeError(`stored-run: WP index ${index} out of range`);
        return id;
    };
    const wps = stored.wps.map((row, index) => ({
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
    const notSchedulable = stored.notSchedulable.map((n) => ({
        wpId: idOf(n.wpId),
        reason: n.reason,
    }));
    const violations = stored.violations.map((v) => ({
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
export function stripRemainingDays(outputs) {
    return {
        ...outputs,
        wps: outputs.wps.map((row) => ({ ...row, remainingDays: null })),
    };
}
/** Canonical JSON for a stored run payload (AD-4). */
export function storedRunJson(value) {
    return encode(value);
}
export function storedRunText(value) {
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
    edges: z.array(z.object({
        predecessorId: z.number().int().nonnegative(),
        successorId: z.number().int().nonnegative(),
        lagDays: z.number().int(),
        type: z.literal('FS'),
    })),
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
    wps: z.array(z.object({
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
    })),
    outOfSequence: z.array(z.object({
        predecessorId: z.number().int().nonnegative(),
        successorId: z.number().int().nonnegative(),
    })),
    notSchedulable: z.array(z.object({
        wpId: z.number().int().nonnegative(),
        reason: z.literal('no_duration'),
    })),
    violations: z.array(z.object({
        wpId: z.number().int().nonnegative(),
        constraintType: z.enum(['must_start_on', 'must_finish_on']),
        askedDate: z.string(),
        derivedDate: z.string(),
        daysLate: z.number().int(),
        chain: z.array(z.number().int().nonnegative()),
    })),
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
export function parseStoredInputs(json) {
    return decode(json, storedInputsJson);
}
/** Read stored outputs jsonb through the codec schema. */
export function parseStoredOutputs(json) {
    return decode(json, storedOutputsJson);
}
