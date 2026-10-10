import { describe, expect, it } from 'vitest';
import { runsBetweenPins, scheduleRunRetention } from '@momo/domain';
describe('AD-5 schedule_run retention by reference', () => {
    it('keeps intervening runs between two Review pins (the set a last-N rule would delete)', () => {
        // Reviews pin seq 2 and seq 8; latest is 10. Runs 3–7 are between the pins.
        const runs = Array.from({ length: 10 }, (_, i) => ({
            seq: i + 1,
            hasInputs: true,
            hasOutputs: true,
        }));
        const decisions = scheduleRunRetention(runs, [2, 8]);
        const retainInputs = decisions.filter((d) => d.retainInputs).map((d) => d.seq);
        // Everything from oldest pin through latest.
        expect(retainInputs).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
        // Outputs only on pins + latest.
        expect(decisions.filter((d) => d.retainOutputs).map((d) => d.seq)).toEqual([2, 8, 10]);
        expect(runsBetweenPins(2, 8, 10)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });
    it('with no pins, only the latest retains inputs and outputs', () => {
        const runs = [
            { seq: 1, hasInputs: true, hasOutputs: true },
            { seq: 2, hasInputs: true, hasOutputs: true },
            { seq: 3, hasInputs: true, hasOutputs: true },
        ];
        const decisions = scheduleRunRetention(runs, []);
        expect(decisions.map((d) => [d.seq, d.retainInputs, d.retainOutputs])).toEqual([
            [1, false, false],
            [2, false, false],
            [3, true, true],
        ]);
    });
    it('keeps inputs for a pin prev older than the oldest pin when the collector expands pins', () => {
        // Baseline pins seq 5; its prev_run_seq is 4 (typical pin−1), older than the oldest pin.
        // Without expanding the pin set, retainInputs at 4 is false — re-derive would lose prev.
        const runs = Array.from({ length: 7 }, (_, i) => ({
            seq: i + 1,
            hasInputs: true,
            hasOutputs: true,
        }));
        const pinOnly = scheduleRunRetention(runs, [5]);
        expect(pinOnly.find((d) => d.seq === 4)?.retainInputs).toBe(false);
        expect(pinOnly.find((d) => d.seq === 5)?.retainInputs).toBe(true);
        // Collector includes immediate prev (F8 / item-19) — not a full cause chain.
        const withPrev = scheduleRunRetention(runs, [4, 5]);
        expect(withPrev.find((d) => d.seq === 4)?.retainInputs).toBe(true);
        expect(withPrev.find((d) => d.seq === 5)?.retainInputs).toBe(true);
        // Still droppable: runs older than the expanded oldest pin.
        expect(withPrev.find((d) => d.seq === 3)?.retainInputs).toBe(false);
    });
});
