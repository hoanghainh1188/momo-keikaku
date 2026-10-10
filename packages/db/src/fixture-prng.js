/**
 * Deterministic PRNG shared by the demo fixture generator and the NFR-P1 load builder
 * (story 1.8). Same seed → same sequence; fold of `scripts/gen-fixtures.ts`'s mulberry32.
 */
export function mulberry32(seed) {
    let a = seed;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
