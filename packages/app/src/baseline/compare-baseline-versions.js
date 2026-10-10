/**
 * Compare two Baseline versions as plans (story 4.4, FR-16).
 *
 * Authorise → resolve each version's `schedule_run_seq` pin → `runBySeq` ×2 → domain
 * `compareBaselinePlans`. Never Current Plan / `latestRun` / live `work_package` columns.
 * Read-only — no audit action.
 */
import { CodecError, compareBaselinePlans, parseStoredInputs, parseStoredOutputs, } from '@momo/domain';
import { z } from 'zod';
import { baselineRepositoryOn } from '../../../db/src/repositories/baseline';
import { scheduleRepositoryOn } from '../../../db/src/repositories/schedule';
import { authorize, PROJECT_REACH, PROJECT_REACH_ROLES, } from '../authz/authorize';
import { isProjectNotFound } from '../ports/project-read';
import { fail, ok } from '../result';
const noNul = (value) => !value.includes('\0');
const compareInputSchema = z.object({
    projectId: z.string().min(1).refine(noNul, 'NUL'),
    fromVersionSeq: z.number().int().positive(),
    toVersionSeq: z.number().int().positive(),
});
function asBound(bound) {
    return bound;
}
/**
 * Authorised plan-level compare of two Baseline versions' pinned runs.
 * `invalid_input` when seqs collide or a version/pin is incomplete; `not_found` without reach.
 */
export async function compareBaselineVersions(deps, ctx, input) {
    // Role check before parse (viewer → not_found with empty input; gate requires this order).
    const roles = authorize(ctx, { roles: PROJECT_REACH_ROLES });
    if (!roles.ok)
        return roles;
    const parsed = compareInputSchema.safeParse(input);
    if (!parsed.success) {
        return fail('invalid_input', { input: ['invalid'] });
    }
    const command = parsed.data;
    if (command.fromVersionSeq === command.toVersionSeq) {
        return fail('invalid_input', { versions: ['same_version'] });
    }
    const reach = authorize(ctx, {
        roles: PROJECT_REACH_ROLES,
        projectId: command.projectId,
    });
    if (!reach.ok)
        return reach;
    try {
        return await deps.transaction(deps.handle, ctx.tenantId, async (scope) => {
            const bound = asBound(scope.bound);
            const baseline = baselineRepositoryOn(bound);
            const schedule = scheduleRepositoryOn(bound);
            const fromPin = await baseline.scheduleRunSeqForVersion(command.projectId, command.fromVersionSeq);
            const toPin = await baseline.scheduleRunSeqForVersion(command.projectId, command.toVersionSeq);
            if (fromPin === null || toPin === null) {
                return fail('invalid_input', {
                    versions: [
                        fromPin === null ? `missing_version_${command.fromVersionSeq}` : null,
                        toPin === null ? `missing_version_${command.toVersionSeq}` : null,
                    ].filter((x) => x !== null),
                });
            }
            const fromRun = await schedule.runBySeq(command.projectId, fromPin);
            const toRun = await schedule.runBySeq(command.projectId, toPin);
            if (fromRun === null || toRun === null) {
                return fail('not_found');
            }
            if (fromRun.haltedReason !== null ||
                fromRun.outputs === null ||
                toRun.haltedReason !== null ||
                toRun.outputs === null) {
                return fail('invalid_input', { pin: ['incomplete_or_halted'] });
            }
            let fromInputs;
            let toInputs;
            let fromOutputs;
            let toOutputs;
            try {
                fromInputs = parseStoredInputs(fromRun.inputs);
                toInputs = parseStoredInputs(toRun.inputs);
                fromOutputs = parseStoredOutputs(fromRun.outputs);
                toOutputs = parseStoredOutputs(toRun.outputs);
            }
            catch (error) {
                if (error instanceof CodecError) {
                    return fail('invalid_input', { pin: ['undecodable'] });
                }
                throw error;
            }
            const compare = compareBaselinePlans({ inputs: fromInputs, outputs: fromOutputs }, { inputs: toInputs, outputs: toOutputs });
            return ok({
                projectId: command.projectId,
                fromVersionSeq: command.fromVersionSeq,
                toVersionSeq: command.toVersionSeq,
                fromScheduleRunSeq: fromPin,
                toScheduleRunSeq: toPin,
                compare,
            });
        });
    }
    catch (error) {
        if (isProjectNotFound(error, command.projectId))
            return fail('not_found');
        throw error;
    }
}
/** Role declaration for the compare reader (colocated — see `use-cases/role-declarations.ts`). */
export const COMPARE_BASELINE_VERSIONS_ROLES = {
    compareBaselineVersions: PROJECT_REACH,
};
/** Read-only — no NFR-A1 write action (see `UNAUDITED_BY_DECISION` in the audit gate). */
export const COMPARE_BASELINE_VERSIONS_AUDIT = {
    compareBaselineVersions: {
        unaudited: 'read-only Baseline plan compare; no rows written (story 4.4)',
    },
};
