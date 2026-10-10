import { describe, expect, it } from 'vitest';
import { uuidV7IdsOn } from './ids';
/** The id adapter hands out RFC 9562 version-7 UUIDs whose timestamp is the Clock's. */
describe('uuidV7IdsOn', () => {
    const V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    const at = (ms) => ({ nowMs: () => ms });
    it('hands out version-7 UUIDs', () => {
        expect(uuidV7IdsOn(at(1_800_000_000_000)).next()).toMatch(V7);
    });
    it('stamps the Clock millisecond, not the wall clock', () => {
        const ms = 1_700_000_000_123;
        const id = uuidV7IdsOn(at(ms)).next();
        expect(Number.parseInt(id.replace(/-/g, '').slice(0, 12), 16)).toBe(ms);
    });
    it('never repeats within one millisecond, and sorts by the Clock across milliseconds', () => {
        const same = uuidV7IdsOn(at(1_800_000_000_000));
        const burst = Array.from({ length: 1000 }, () => same.next());
        expect(new Set(burst).size).toBe(burst.length);
        let ms = 1_800_000_000_000;
        const ticking = uuidV7IdsOn({ nowMs: () => (ms += 1) });
        const ids = Array.from({ length: 100 }, () => ticking.next());
        expect([...ids].sort()).toEqual(ids);
    });
    it('sorts ids minted in one fixed Clock millisecond in creation order', () => {
        const fixed = uuidV7IdsOn(at(1_800_000_000_000));
        const ids = Array.from({ length: 1000 }, () => fixed.next());
        expect(new Set(ids).size).toBe(ids.length);
        expect([...ids].sort()).toEqual(ids);
    });
    it('still hands out increasing ids when the Clock steps backwards', () => {
        const steps = [1_800_000_000_005, 1_800_000_000_005, 1_800_000_000_001, 1_800_000_000_000];
        let i = 0;
        const stepping = uuidV7IdsOn({ nowMs: () => steps[i++] ?? 0 });
        const ids = steps.map(() => stepping.next());
        expect([...ids].sort()).toEqual(ids);
        expect(new Set(ids).size).toBe(ids.length);
    });
});
