import { describe, expect, it } from 'vitest';
import { encode, encodeScheduleInputs, encodeScheduleOutputs, decodeScheduleInputs, decodeScheduleOutputs, stripRemainingDays, stringify, recalculate, } from '@momo/domain';
import { edge, inputs, scheduled, wp, CAL } from '../support/schedule-fixtures';
describe('AD-26 stored-run encode/decode', () => {
    it('round-trips inputs with index-encoded parents and edges', () => {
        const domain = inputs([wp('B', { durationDays: 2 }), wp('A', { durationDays: 3 }), wp('S', { parentId: 'A', durationDays: 1 })], [edge('A', 'B', 1)]);
        const causes = new Map();
        const stored = encodeScheduleInputs(domain, causes, { calendarVersionSeq: 7 });
        expect(stored.wps.map((w) => w.id)).toEqual(['A', 'B', 'S']); // compareWp on wbs codes
        expect(stored.wps[2].parentId).toBe(0); // S → A
        expect(stored.edges[0]).toMatchObject({ predecessorId: 0, successorId: 1, lagDays: 1 });
        expect(stored.calendar.versionSeq).toBe(7);
        const back = decodeScheduleInputs(stored);
        expect(stringify(encode({ ...back, wps: [...back.wps].sort((a, b) => a.id.localeCompare(b.id)) }))).toBe(stringify(encode({ ...domain, wps: [...domain.wps].sort((a, b) => a.id.localeCompare(b.id)) })));
    });
    it('strips remainingDays and index-encodes drivers, path and violations', () => {
        const domain = inputs([
            wp('A', { durationDays: 5 }),
            wp('B', { durationDays: 5, constraintType: 'must_finish_on', constraintDate: '2026-10-06' }),
        ], [edge('A', 'B')], { projectFinish: '2026-10-20', calendar: CAL });
        const outputs = scheduled(recalculate(domain, null));
        const storedIn = encodeScheduleInputs(domain, new Map(outputs.wps.map((r) => [r.wpId, r.cause])), {
            calendarVersionSeq: 1,
        });
        const storedOut = encodeScheduleOutputs(outputs, storedIn.wps.map((w) => w.id));
        expect(stringify(encode(storedOut))).not.toContain('remainingDays');
        for (const row of storedOut.wps) {
            expect(row).not.toHaveProperty('remainingDays');
            for (const d of row.drivingPredecessors)
                expect(typeof d).toBe('number');
        }
        for (const i of storedOut.criticalPath)
            expect(typeof i).toBe('number');
        for (const v of storedOut.violations) {
            expect(typeof v.wpId).toBe('number');
            for (const c of v.chain)
                expect(typeof c).toBe('number');
        }
        const decoded = decodeScheduleOutputs(storedOut, storedIn.wps.map((w) => w.id));
        // Round-trip equals domain after strip; filter to owned rows present in domain outputs.
        const owned = new Set(outputs.wps.map((r) => r.wpId));
        const decodedOwned = {
            ...decoded,
            wps: decoded.wps.filter((r) => owned.has(r.wpId)),
        };
        expect(stringify(encode(decodedOwned))).toBe(stringify(encode(stripRemainingDays(outputs))));
    });
});
