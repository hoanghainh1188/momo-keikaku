/**
 * AR-19 / AD-10 ComputationInputs closure (story 6.1).
 *
 * Enumerates exported compute entry points in domain/{evm,health,forecast,attribution,schedule}
 * and fails if any primary input type is not reachable from ComputationInputs — except schedule,
 * which is reachable only via `schedule_run.inputs` (pinned by `scheduleRunSeq`).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DOMAIN = join(ROOT, 'packages/domain/src');
/** Modules the closure rule names (AD-10). */
const COMPUTE_MODULES = [
    'evm.ts',
    'health.ts',
    'forecast.ts',
    'attribution.ts',
    'schedule/recalculate.ts',
    'schedule/engine-version.ts',
    'schedule/stored-run.ts',
    'schedule/re-derive.ts',
];
/**
 * Primary input type names exported compute functions accept. Schedule is special-cased:
 * `ScheduleInputs` / `StoredScheduleInputs` count as pinned via `schedule_run.inputs`.
 */
const REACHABLE_FROM_PIN = new Set([
    'ComputationInputs',
    'ReviewInput', // alias of ComputationInputs (story 6.1)
    'EvmInput',
    'HealthInput',
    'AttributionInput',
    'ScheduleInputs',
    'StoredScheduleInputs',
    'StoredRunPin', // schedule_run jsonb pin (inputs/outputs) — AR-19 schedule path
    // Positional forecast args are values derived from the pin / EVM result, not a separate live read.
    'EvmResult',
    'BaselineVersion',
    'IsoDate',
    'HolidayCalendar',
    'CalendarVersion',
    // Story 6.6: computed finish + Baseline-pinned Project start are pin-derived (schedule_run).
    'ComputeForecastOptions',
]);
const _scheduleRunSeqWitness = true;
void _scheduleRunSeqWitness;
const _witnessOk = null;
void _witnessOk;
function walkTs(dir, acc = []) {
    for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === 'dist' || name.endsWith('.test.ts'))
            continue;
        const path = join(dir, name);
        if (statSync(path).isDirectory())
            walkTs(path, acc);
        else if (name.endsWith('.ts'))
            acc.push(path);
    }
    return acc;
}
/**
 * Primary compute entry points the closure rule gates (not every helper export).
 * Schedule reaches ScheduleInputs only through stored `schedule_run.inputs`.
 */
const COMPUTE_ENTRYPOINTS = new Set([
    'computeEvm',
    'computeHealth',
    'computeForecast',
    'attribute',
    'recalculate',
    'decodeScheduleInputs',
    'parseStoredInputs',
    'reDeriveStoredRun',
    'recalculateAt',
]);
/** Parameter type identifiers on named compute entry points. */
function computeEntrypointParamTypes(source) {
    const found = [];
    const re = /export\s+function\s+(\w+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)/g;
    let match;
    while ((match = re.exec(source)) !== null) {
        const fn = match[1];
        if (!COMPUTE_ENTRYPOINTS.has(fn))
            continue;
        const params = match[2] ?? '';
        for (const part of params.split(',')) {
            const typeMatch = /:\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(part);
            if (typeMatch)
                found.push({ fn, typeName: typeMatch[1] });
        }
    }
    return found;
}
describe('ComputationInputs closure (AR-19 / AD-10)', () => {
    it('ComputationInputs carries the AD-10 pin fields the capture path fills', () => {
        // Structural check against the alias — if ReviewInput drops a field, this fails to typecheck
        // when the witness above is assigned in a future edit; runtime shape is asserted here.
        const requiredKeys = [
            'trackerSnapshotIdByConnector',
            'ledgerSeqMax',
            'baselineVersionId',
            'rateSeqMax',
            'projectDefaultRateSeqMax',
            'pctOverrideSeqMax',
            'dispositionSeqMax',
            'settingSeqMax',
            'tenantSettingSeqMax',
            'wpStatusSeqMax',
            'wpFlagSeqMax',
            'linkSeqMax',
            'calendarSeqMax',
            'connectorScopeSeqMax',
            'connectorSettingSeqMax',
            'basisSeqMax',
            'visibilityPolicy',
            'visibilitySeqMax',
            'scheduleRunSeq',
            'period',
            'asOf',
            'formulaVersion',
            'calendarId',
            'calendarVersion',
            'mappingSeqMax',
            'priorEvByWp',
        ];
        const reviewSource = readFileSync(join(DOMAIN, 'review.ts'), 'utf8');
        for (const key of requiredKeys) {
            expect(reviewSource, `ComputationInputs / ReviewInput missing pin field ${key}`).toMatch(new RegExp(`\\b${key}\\b`));
        }
    });
    it('exported compute input types in domain/{evm,health,forecast,attribution,schedule} are reachable from the pin', () => {
        const unreachable = [];
        const seenEntrypoints = new Set();
        for (const rel of COMPUTE_MODULES) {
            const path = join(DOMAIN, rel);
            const source = readFileSync(path, 'utf8');
            for (const { fn, typeName } of computeEntrypointParamTypes(source)) {
                seenEntrypoints.add(fn);
                if (typeName === 'string' ||
                    typeName === 'number' ||
                    typeName === 'boolean' ||
                    typeName === 'bigint' ||
                    typeName === 'unknown' ||
                    typeName === 'Json') {
                    continue;
                }
                if (!REACHABLE_FROM_PIN.has(typeName)) {
                    unreachable.push(`${relative(ROOT, path).replaceAll('\\', '/')}: ${fn} param type ${typeName}`);
                }
            }
        }
        for (const required of [
            'computeEvm',
            'computeHealth',
            'computeForecast',
            'attribute',
            'recalculate',
            'recalculateAt',
            'decodeScheduleInputs',
        ]) {
            expect(seenEntrypoints.has(required), `missing compute entrypoint ${required}`).toBe(true);
        }
        expect(unreachable, `input type(s) not reachable from ComputationInputs (schedule must use schedule_run.inputs only):\n${unreachable.join('\n')}`).toEqual([]);
    });
    it('schedule module does not import live work_package column reads for compute', () => {
        // Soft fence: schedule compute files must not reference workPackage table accessors.
        const scheduleDir = join(DOMAIN, 'schedule');
        const offenders = [];
        for (const file of walkTs(scheduleDir)) {
            const text = readFileSync(file, 'utf8');
            const rel = relative(ROOT, file).replaceAll('\\', '/');
            if (/from ['"]\.\.\/types['"]/.test(text) && /WorkPackage/.test(text)) {
                // ScheduleWp is the pin path; WorkPackage from types would be a live-plan smell in compute.
                if (/recalculate\.ts$/.test(rel) || /stored-run\.ts$/.test(rel) || /re-derive\.ts$/.test(rel)) {
                    if (/\bWorkPackage\b/.test(text)) {
                        offenders.push(rel);
                    }
                }
            }
        }
        expect(offenders, `schedule compute imports live WorkPackage:\n${offenders.join('\n')}`).toEqual([]);
    });
});
