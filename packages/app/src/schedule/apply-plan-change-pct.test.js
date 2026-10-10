import { describe, expect, it } from 'vitest';
import { planMutationSchema } from './apply-plan-change';
import { pctOverrideAppendFields } from './pct-override-append-fields';
describe('patch_recorded_pct fence (story 6.4)', () => {
    it('refuses Accept (pm_override) with empty reason', () => {
        const parsed = planMutationSchema.safeParse({
            kind: 'patch_recorded_pct',
            projectId: 'p1',
            wpId: 'wp1',
            recordedPctNum: 60n,
            recordedPctDen: 100n,
            source: 'pm_override',
            reason: '   ',
        });
        expect(parsed.success).toBe(false);
    });
    it('accepts pm_override with a non-empty reason', () => {
        const parsed = planMutationSchema.safeParse({
            kind: 'patch_recorded_pct',
            projectId: 'p1',
            wpId: 'wp1',
            recordedPctNum: 60n,
            recordedPctDen: 100n,
            source: 'pm_override',
            reason: 'QA sign-off pending',
        });
        expect(parsed.success).toBe(true);
    });
    it('allows plan_edit with null/omitted reason', () => {
        const parsed = planMutationSchema.safeParse({
            kind: 'patch_recorded_pct',
            projectId: 'p1',
            wpId: 'wp1',
            recordedPctNum: 25n,
            recordedPctDen: 100n,
            source: 'plan_edit',
        });
        expect(parsed.success).toBe(true);
    });
    it('pctOverrideAppendFields persists pm_override reason+source for the append path', () => {
        expect(pctOverrideAppendFields({
            recordedPctNum: 60n,
            recordedPctDen: 100n,
            source: 'pm_override',
            reason: '  QA pending  ',
        })).toEqual({
            recordedPctNum: 60n,
            recordedPctDen: 100n,
            reason: 'QA pending',
            source: 'pm_override',
        });
    });
    it('pctOverrideAppendFields defaults omitted source to plan_edit with null reason', () => {
        expect(pctOverrideAppendFields({
            recordedPctNum: 25n,
            recordedPctDen: 100n,
        })).toEqual({
            recordedPctNum: 25n,
            recordedPctDen: 100n,
            reason: null,
            source: 'plan_edit',
        });
    });
});
