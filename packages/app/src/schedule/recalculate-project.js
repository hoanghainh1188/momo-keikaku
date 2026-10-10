/**
 * `app/schedule.recalculateProject` — resolve inputs, call the pure engine, append the run
 * (story 2.9, AR-47). Nothing else is named `recalculate`.
 *
 * Called from `applyPlanChange` after the input write, inside the same tenant transaction under
 * the per-Project exclusive lock. Graph offences (`graph_invalid`) refuse and roll back.
 * `calendar_range` appends a halted run and stale-marks `wp_schedule` (Q2 → A).
 */
import { ENGINE_VERSION, decodeScheduleInputs, encode, encodeScheduleInputs, encodeScheduleOutputs, parseStoredInputs, recalculate, registeredEngineVersions, } from '@momo/domain';
import { scheduleRepositoryOn } from '../../../db/src/repositories/schedule';
import { refuse } from '../use-cases/audited-write';
import { ANCESTOR_DESCENDANT_LINK, CROSS_PROJECT_LINK, DEPENDENCY_CYCLE, SUMMARY_ENDPOINT, } from './plan-invariants';
function ruleCodesFromGraphOffences(offences) {
    const codes = [];
    if (offences.cycles.length > 0)
        codes.push(DEPENDENCY_CYCLE);
    if (offences.ancestorDescendant.length > 0)
        codes.push(ANCESTOR_DESCENDANT_LINK);
    if (offences.summaryEndpoints.length > 0)
        codes.push(SUMMARY_ENDPOINT);
    if (offences.crossProject.length > 0)
        codes.push(CROSS_PROJECT_LINK);
    return codes;
}
function causesByWpId(outputs) {
    return new Map(outputs.wps.map((row) => [row.wpId, row.cause]));
}
function wpScheduleRows(outputs) {
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
export async function resolveScheduleInputs(bound, projectId, _stamp) {
    const schedule = scheduleRepositoryOn(bound);
    const plan = await schedule.loadPlanRows(projectId);
    if (plan.project.projectStart === null) {
        refuse('invalid_input', { projectStart: ['required'] });
    }
    if (plan.project.dataDate === null) {
        // After 2.11, Data Date is written with Project start — never invent one on resolve.
        refuse('invalid_input', { dataDate: ['required'] });
    }
    // Synthetic weekends-only bootstrap retired (story 2.12). Resolve refuses when no version.
    const calendarVersionSeq = plan.calendar?.seq ?? null;
    const calendar = plan.calendar;
    if (calendar === null || calendarVersionSeq === null) {
        refuse('invalid_input', { calendar: ['required'] });
    }
    const dataDate = plan.project.dataDate;
    const milestoneIds = new Set(plan.wps.filter((w) => w.isMilestone).map((w) => w.id));
    const wps = plan.wps.map((w) => {
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
            constraintType: w.constraintType,
            constraintDate: w.constraintDate,
        };
    });
    const inputs = {
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
    let prevInputs = null;
    if (latest !== null && latest.inputs !== null) {
        try {
            prevInputs = decodeScheduleInputs(parseStoredInputs(latest.inputs));
        }
        catch {
            prevInputs = null;
        }
    }
    return {
        inputs,
        prevInputs,
        calendarVersionSeq,
        milestoneIds,
        wpStatusSeqMax: plan.wpStatusSeqMax,
        pctOverrideSeqMax: plan.pctOverrideSeqMax,
    };
}
export async function recalculateProject(args) {
    if (!registeredEngineVersions().includes(ENGINE_VERSION)) {
        throw new Error(`engine_version "${ENGINE_VERSION}" is not registered`);
    }
    const schedule = scheduleRepositoryOn(args.bound);
    const resolved = args.inputs !== undefined
        ? {
            inputs: args.inputs,
            prevInputs: args.prevInputs ?? null,
            calendarVersionSeq: args.calendarVersionSeq,
            milestoneIds: args.milestoneIds ?? new Set(),
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
