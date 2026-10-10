import { describe, expect, it } from 'vitest';
import { encode, stringify } from '../../present/codec';
import { ENGINE_VERSION, engineAt, recalculateAt, registeredEngineVersions, } from '../engine-version';
import { CORPUS } from './index';
/**
 * Story 2.8 — the golden scheduler corpus (AD-27 / AR-35 / AR-51).
 *
 * Each case's hand-computed `expected` is compared through the AD-4 codec's canonical form,
 * `stringify(encode(…))`, never as raw jsonb text. Every case re-derives under its own
 * recorded `engine_version` via the registry.
 */
describe('golden scheduler corpus', () => {
    it('registers schedule-2026-09-24 and keeps every registered version executable', () => {
        expect(registeredEngineVersions()).toContain(ENGINE_VERSION);
        for (const version of registeredEngineVersions()) {
            const result = recalculateAt(version, CORPUS[0].inputs, null);
            expect(result.kind).toBe('scheduled');
        }
    });
    it('engineAt and recalculateAt throw RangeError naming an unknown engine_version', () => {
        const unknown = 'schedule-never-registered';
        expect(() => engineAt(unknown)).toThrowError(RangeError);
        expect(() => engineAt(unknown)).toThrowError(`unknown engine_version "${unknown}"`);
        expect(() => recalculateAt(unknown, CORPUS[0].inputs, null)).toThrowError(RangeError);
        expect(() => recalculateAt(unknown, CORPUS[0].inputs, null)).toThrowError(`unknown engine_version "${unknown}"`);
    });
    it('inventories every AR-35 / 2.6 Q6 / Q7 matrix row', () => {
        expect(CORPUS.map((c) => c.id)).toEqual([
            'jp-weekend-slip',
            'vn-weekend-slip',
            'mid-flight',
            'negative-float',
            'out-of-sequence',
            'mfo-six-weeks',
            'milestone',
            'no-duration',
            'anchor-cap',
            'all-complete',
        ]);
    });
    it('JP and VN weekend-slip dates differ where the calendars differ', () => {
        const jp = CORPUS.find((c) => c.id === 'jp-weekend-slip');
        const vn = CORPUS.find((c) => c.id === 'vn-weekend-slip');
        expect(stringify(encode(jp.expected.wps))).not.toBe(stringify(encode(vn.expected.wps)));
        // Same total duration clears both mid-week holidays, so finishes may match; early dates must not.
        expect(jp.expected.wps[0].earlyFinish).not.toBe(vn.expected.wps[0].earlyFinish);
        expect(jp.expected.wps[1].earlyStart).not.toBe(vn.expected.wps[1].earlyStart);
    });
    for (const c of CORPUS) {
        describe(c.id, () => {
            it(`matches the hand-computed expectation (${c.title})`, () => {
                const result = recalculateAt(c.engineVersion, c.inputs, null);
                expect(result.kind, c.note).toBe('scheduled');
                if (result.kind !== 'scheduled')
                    return;
                expect(stringify(encode(result.outputs)), c.note).toBe(stringify(encode(c.expected)));
            });
            it(`re-derives under its own engine_version ${c.engineVersion}`, () => {
                const result = recalculateAt(c.engineVersion, c.inputs, null);
                expect(result.kind).toBe('scheduled');
                if (result.kind !== 'scheduled')
                    return;
                // Same dispatch path a stored run will use in 2.9: version → engine → outputs.
                expect(stringify(encode(result.outputs))).toBe(stringify(encode(c.expected)));
                expect(registeredEngineVersions()).toContain(c.engineVersion);
            });
        });
    }
    it('MFO −6 weeks leaves Float and the critical path identical to the asap twin', () => {
        const c = CORPUS.find((x) => x.id === 'mfo-six-weeks');
        const asapInputs = {
            ...c.inputs,
            wps: c.inputs.wps.map((w) => w.id === 'Z'
                ? { ...w, constraintType: 'asap', constraintDate: null }
                : w),
        };
        const withMfo = recalculateAt(c.engineVersion, c.inputs, null);
        const asap = recalculateAt(c.engineVersion, asapInputs, null);
        expect(withMfo.kind).toBe('scheduled');
        expect(asap.kind).toBe('scheduled');
        if (withMfo.kind !== 'scheduled' || asap.kind !== 'scheduled')
            return;
        expect(withMfo.outputs.criticalPath).toEqual(asap.outputs.criticalPath);
        expect(withMfo.outputs.violations).toHaveLength(1);
        expect(withMfo.outputs.violations[0].wpId).toBe('Z');
        for (const id of ['A', 'B', 'C', 'Z']) {
            const a = withMfo.outputs.wps.find((w) => w.wpId === id);
            const b = asap.outputs.wps.find((w) => w.wpId === id);
            expect(a.floatDays).toBe(b.floatDays);
            expect(a.isCritical).toBe(b.isCritical);
            expect([a.earlyStart, a.earlyFinish]).toEqual([b.earlyStart, b.earlyFinish]);
        }
    });
});
