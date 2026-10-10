import { describe, expect, it } from 'vitest';
import { deriveWpCauses, recalculate, withCauses } from '@momo/domain';
import { edge, inputs, scheduled, wp } from '../support/schedule-fixtures';
describe('FR-28 per-WP cause from prevInputs', () => {
    it('leaves every cause null on the first run', () => {
        const first = inputs([wp('A', { durationDays: 2 }), wp('B', { durationDays: 2 })], [edge('A', 'B')]);
        const outputs = scheduled(recalculate(first, null));
        expect(outputs.wps.every((row) => row.cause === null)).toBe(true);
    });
    it('marks the edited WP as edited and a downstream mover as moved by a predecessor', () => {
        const prev = inputs([wp('A', { durationDays: 2 }), wp('B', { durationDays: 2 })], [edge('A', 'B')]);
        const next = inputs([wp('A', { durationDays: 5 }), wp('B', { durationDays: 2 })], [edge('A', 'B')]);
        const result = scheduled(recalculate(next, prev));
        const byId = Object.fromEntries(result.wps.map((r) => [r.wpId, r.cause]));
        expect(byId.A).toBe('edited');
        expect(byId.B).toBe('moved by a predecessor');
    });
    it('deriveWpCauses agrees with recalculate overlay', () => {
        const prev = inputs([wp('A', { durationDays: 2 })]);
        const next = inputs([wp('A', { durationDays: 4 })]);
        const prevOut = scheduled(recalculate(prev, null));
        const nextBare = scheduled(recalculate(next, null));
        // scheduleOnce path: strip causes then re-derive
        const causes = deriveWpCauses(next, prev, { ...nextBare, wps: nextBare.wps.map((r) => ({ ...r, cause: null })) }, prevOut);
        expect(withCauses({ ...nextBare, wps: nextBare.wps.map((r) => ({ ...r, cause: null })) }, causes).wps[0]
            .cause).toBe('edited');
    });
});
