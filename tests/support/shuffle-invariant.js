import { expect } from 'vitest';
import { encode, stringify } from '@momo/domain';
/**
 * AD-28's shuffled-input determinism check, as a reusable helper (story 2.3, Q1-A).
 *
 * Runs `fn` over `n` seeded shuffles of `input` and asserts every result is identical in the
 * codec's canonical form, `stringify(encode(…))` — never `jsonb` text or object identity (AD-26).
 * Story 2.3 applies it to `canonicalWps`; stories 2.5 and 2.9 point it at `recalculate` and at the
 * stored run (`deferred-work.md`).
 *
 * The shuffle is seeded, never `Math.random` or the wall clock, so a failure names the seed that
 * reproduces it.
 */
export function expectShuffleInvariant(fn, input, n = 50, seed = 0x2_3) {
    const expected = stringify(encode(fn([...input])));
    for (let i = 0; i < n; i++) {
        const runSeed = seed + i;
        const shuffled = seededShuffle(input, runSeed);
        const actual = stringify(encode(fn(shuffled)));
        expect(actual, `shuffle ${i} (seed ${runSeed}) changed the canonical output`).toBe(expected);
    }
}
/**
 * A deterministic uint32 stream (mulberry32, the same generator as
 * `packages/db/src/fixture-prng.ts`, returned as an integer so no caller needs to round).
 */
export function seededUint32(seed) {
    let a = seed | 0;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return (t ^ (t >>> 14)) >>> 0;
    };
}
/** A new array: Fisher–Yates over `input` driven by `seed`. The input is not mutated. */
export function seededShuffle(input, seed) {
    const next = seededUint32(seed);
    const out = [...input];
    for (let i = out.length - 1; i > 0; i--) {
        const j = next() % (i + 1);
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
    }
    return out;
}
