import { describe, expect, it } from 'vitest';
import { advanceBasisLatch, INITIAL_BASIS_LATCH, replayBasisLatch, } from './basis';
describe('advanceBasisLatch (Story 5.7 / AD-8, N=3 both ways)', () => {
    it('treats a missing head as count until hours hysteresis fires', () => {
        expect(INITIAL_BASIS_LATCH.basis).toBe('count');
        let s = INITIAL_BASIS_LATCH;
        s = advanceBasisLatch(s, 'hours');
        expect(s).toEqual({ basis: 'count', streakTowardOpposite: 1, flipped: false });
        s = advanceBasisLatch(s, 'hours');
        expect(s).toEqual({ basis: 'count', streakTowardOpposite: 2, flipped: false });
        s = advanceBasisLatch(s, 'hours');
        expect(s).toEqual({ basis: 'hours', streakTowardOpposite: 0, flipped: true });
    });
    it('does not flip on a single hours blip amid count', () => {
        let s = INITIAL_BASIS_LATCH;
        s = advanceBasisLatch(s, 'hours');
        expect(s.basis).toBe('count');
        s = advanceBasisLatch(s, 'count');
        expect(s).toEqual({ basis: 'count', streakTowardOpposite: 0, flipped: false });
    });
    it('flips back to count after 3 consecutive empty observations while latched hours', () => {
        let s = { basis: 'hours', streakTowardOpposite: 0 };
        s = advanceBasisLatch(s, 'count');
        expect(s.streakTowardOpposite).toBe(1);
        s = advanceBasisLatch(s, 'count');
        expect(s.streakTowardOpposite).toBe(2);
        s = advanceBasisLatch(s, 'count');
        expect(s).toEqual({ basis: 'count', streakTowardOpposite: 0, flipped: true });
    });
    it('resets the opposite streak when the observed basis matches the latch', () => {
        let s = { basis: 'hours', streakTowardOpposite: 2 };
        s = advanceBasisLatch(s, 'hours');
        expect(s).toEqual({ basis: 'hours', streakTowardOpposite: 0, flipped: false });
    });
    it('replays a sequence and reports the final flip only at the end', () => {
        const end = replayBasisLatch(INITIAL_BASIS_LATCH, ['hours', 'hours', 'hours']);
        expect(end).toEqual({ basis: 'hours', streakTowardOpposite: 0, flipped: true });
        const noFlip = replayBasisLatch(INITIAL_BASIS_LATCH, ['hours', 'hours', 'count']);
        expect(noFlip).toEqual({ basis: 'count', streakTowardOpposite: 0, flipped: false });
    });
});
