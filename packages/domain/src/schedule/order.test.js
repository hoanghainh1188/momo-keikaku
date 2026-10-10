import { describe, expect, it } from 'vitest';
import { canonicalWps, compareWp } from './order';
import { expectShuffleInvariant, seededShuffle, seededUint32, } from '../../../../tests/support/shuffle-invariant';
/** `|| 0` folds -0 into 0, so a self-comparison fails on the ordering and not on the zero's sign. */
const sign = (n) => Math.sign(n) || 0;
const wp = (id, wbsCode) => ({ id, wbsCode });
/** Asserts `first` sorts before `second`, in both argument orders. */
function expectBefore(first, second) {
    expect(sign(compareWp(first, second)), 'first against second').toBe(-1);
    expect(sign(compareWp(second, first)), 'second against first').toBe(1);
}
describe('compareWp — the I/O matrix (AD-28)', () => {
    it('compares numeric segments as integers: 1.2 before 1.10', () => {
        expectBefore(wp('z', '1.2'), wp('a', '1.10'));
    });
    it('compares numeric segments beyond 2^53 exactly', () => {
        // A `Number` comparison would tie: both parse to 9007199254740992.
        expect(Number('9007199254740993')).toBe(Number('9007199254740992'));
        expectBefore(wp('z', '1.9007199254740992'), wp('a', '1.9007199254740993'));
    });
    it('folds full-width digits: １.２ sorts as 1.2, before 1.10', () => {
        expectBefore(wp('z', '１.２'), wp('a', '1.10'));
    });
    it('sorts a digit run before a non-digit run, in either argument order', () => {
        expectBefore(wp('z', '1.2'), wp('a', '1.a'));
    });
    it('orders segments naturally: 3, 3a, 3b, 4, 10 in any input order', () => {
        const codes = ['3', '3a', '3b', '4', '10'];
        const wps = codes.map((code, i) => wp(`id-${i}`, code));
        for (let seed = 0; seed < 50; seed++) {
            expect(seededShuffle(wps, seed).sort(compareWp).map((w) => w.wbsCode), `seed ${seed}`).toEqual(codes);
        }
    });
    it('breaks the former cycle: 2, 10, 1a sort as 1a, 2, 10 in every input order', () => {
        // AD-28's literal step 2 gave 2 < 10 < 1a < 2 (amended by the founder, decision T-A).
        const [two, ten, oneA] = [wp('a', '2'), wp('b', '10'), wp('c', '1a')];
        expectBefore(oneA, two);
        expectBefore(two, ten);
        expectBefore(oneA, ten);
        const permutations = [
            [two, ten, oneA], [two, oneA, ten], [ten, two, oneA],
            [ten, oneA, two], [oneA, two, ten], [oneA, ten, two],
        ];
        for (const order of permutations) {
            expect(order.sort(compareWp).map((w) => w.wbsCode)).toEqual(['1a', '2', '10']);
        }
    });
    it('compares runs inside a segment: digit runs as integers, text by code point', () => {
        expectBefore(wp('z', '1a2'), wp('a', '1a10'));
        expectBefore(wp('z', '1a'), wp('a', '1a2')); // fewer runs first
        expectBefore(wp('z', 'a3'), wp('a', 'b1'));
        expectBefore(wp('z', '３ａ'), wp('a', '3b')); // full-width folds to 3a
        expectBefore(wp('z', '1..2'), wp('a', '1.0.2')); // the empty segment sorts first
    });
    it('sorts a prefix first: 1.2 before 1.2.1', () => {
        expectBefore(wp('z', '1.2'), wp('a', '1.2.1'));
    });
    it('breaks equal codes on the lowercased id, never 0', () => {
        // Raw code-unit order would put 'B…' first; the lowercase comparison puts 'a…' first.
        expectBefore(wp('a-1', '3.1'), wp('B-1', '3.1'));
    });
    it('breaks two absent codes on the id, and sorts an absent code before any non-empty one', () => {
        expectBefore(wp('a', null), wp('b', undefined));
        expectBefore(wp('z', null), wp('a', '0'));
        expectBefore(wp('z', ''), wp('a', '1'));
        expectBefore(wp('z', undefined), wp('a', 'a'));
        // A missing code IS the empty code: the id decides between them.
        expectBefore(wp('a', null), wp('b', ''));
        expectBefore(wp('a', ''), wp('b', null));
    });
    it('ties equal integers spelled differently (1.01 / 1.1), so the id decides', () => {
        expectBefore(wp('a', '1.01'), wp('b', '1.1'));
        expectBefore(wp('a', '1.1'), wp('b', '1.01'));
        // And the tie does not end the comparison: the next segment still decides.
        expectBefore(wp('z', '01.1'), wp('a', '1.2'));
    });
    it('splits on a full-width full stop, which NFKC folds to `.`: １．２ orders as 1.2', () => {
        expect('１．２'.normalize('NFKC')).toBe('1.2');
        // A code-level tie with 1.2, so the id decides — in both directions.
        expectBefore(wp('a', '１．２'), wp('b', '1.2'));
        expectBefore(wp('a', '1.2'), wp('b', '１．２'));
        expectBefore(wp('z', '１．２'), wp('a', '1.10'));
    });
    it('splits on the full stop NFKC produces from ⒈ (U+2488): ⒈2 orders as 1.2', () => {
        // One raw segment becomes two after NFKC. Pinned as the rule yields it.
        expect('⒈2'.normalize('NFKC')).toBe('1.2');
        expectBefore(wp('a', '⒈2'), wp('b', '1.2'));
        expectBefore(wp('a', '1.2'), wp('b', '⒈2'));
        expectBefore(wp('z', '1'), wp('a', '⒈2'));
        expectBefore(wp('z', '⒈2'), wp('a', '1.10'));
    });
    it('treats a non-ASCII digit as a non-digit run: Arabic-Indic ٣ sorts after 9 and 10', () => {
        // NFKC does not fold U+0663 to '3', and only ASCII digits form a digit run.
        expect('٣'.normalize('NFKC')).toBe('٣');
        expectBefore(wp('z', '9'), wp('a', '٣'));
        expectBefore(wp('z', '10'), wp('a', '٣'));
        expectBefore(wp('z', '3'), wp('a', '3٣'));
    });
    it('returns 0 for the same WP', () => {
        const same = wp('a', '1.2');
        expect(sign(compareWp(same, same))).toBe(0);
        expect(sign(compareWp(same, { ...same }))).toBe(0);
    });
    it('never returns 0 for two ids that differ only in case', () => {
        // Beyond AD-28's letter (canonical ids are lowercase UUIDs): the raw id is the last resort.
        expect(sign(compareWp(wp('A', '1'), wp('a', '1')))).not.toBe(0);
        expect(sign(compareWp(wp('A', '1'), wp('a', '1')))).toBe(sign(-compareWp(wp('a', '1'), wp('A', '1'))));
    });
    it('accepts a WorkPackage as it is', () => {
        const full = { id: 'x', wbsCode: '1.2' };
        expect(sign(compareWp(full, wp('y', '1.10')))).toBe(-1);
    });
});
/**
 * Ported from `text/compareNfkc.test.ts` when `compareNfkcNumeric` was deleted (story 2.3, Q2-A).
 * Each still holds under AD-28, now with the id as the final tie-break.
 */
describe('compareWp — ported from compareNfkcNumeric', () => {
    it('sorts WBS codes with numeric segments; 1.02 and 1.2 now tie on the integer', () => {
        // Before AD-28 `1.02` sorted before `1.2` by code point. Now the integers tie and the id
        // decides, so both orders are reachable and each is fixed by the ids.
        const byCode = (ids) => [wp(ids[0], '1.10'), wp(ids[1], '1.2'), wp(ids[2], '1.02')].sort(compareWp).map((w) => w.wbsCode);
        expect(byCode(['c', 'a', 'b'])).toEqual(['1.2', '1.02', '1.10']);
        expect(byCode(['c', 'b', 'a'])).toEqual(['1.02', '1.2', '1.10']);
    });
    it('keeps the numeric-segment rule that WBS codes depend on', () => {
        expectBefore(wp('z', '2.9'), wp('a', '2.10'));
        expectBefore(wp('z', '9.1'), wp('a', '10.1'));
    });
    /** Epic 1 retrospective, F24: distinct strings are never reported as equal. */
    describe('never reports NFKC-distinct codes as equal (retro F24)', () => {
        // [left code, right code, expected sign of compareWp(left with id 'z', right with id 'a'), why]
        // The ids run against the codes, so a code-level tie shows up as +1 (the id decides, 'a' < 'z').
        const pairs = [
            ['あ', 'ア', -1, 'hiragana U+3042 before katakana U+30A2'],
            ['ガ', 'カ', 1, 'with dakuten U+30AC after without U+30AB'],
            ['A', 'a', -1, 'upper U+0041 before lower U+0061'],
            ['か', 'が', -1, 'without dakuten U+304B before with U+304C'],
            ['ﾊﾞ', 'バ', 1, 'NFKC unifies them, so the id decides'],
            ['1.あ', '1.ア', -1, 'unequal non-numeric segments inside a dotted code'],
        ];
        for (const [left, right, expected, why] of pairs) {
            it(`orders ${JSON.stringify(left)} against ${JSON.stringify(right)} — ${why}`, () => {
                expect(sign(compareWp(wp('z', left), wp('a', right)))).toBe(expected);
                expect(sign(compareWp(wp('a', right), wp('z', left)))).toBe(-expected);
            });
        }
        it('is antisymmetric and never 0 over a mixed-script set', () => {
            const codes = ['あ', 'ア', 'A', 'a', 'カ', 'ガ', '1.2', '1.10', 'Ａ', 'ｱ'];
            const wps = codes.map((code, i) => wp(`wp-${i}`, code));
            for (const a of wps) {
                for (const b of wps) {
                    expect(sign(compareWp(a, b)), `${a.wbsCode} vs ${b.wbsCode}`).toBe(sign(-compareWp(b, a)));
                    if (a !== b)
                        expect(compareWp(a, b)).not.toBe(0);
                }
            }
            const forwards = [...wps].sort(compareWp);
            const backwards = [...wps].reverse().sort(compareWp);
            expect(backwards).toEqual(forwards);
        });
    });
});
/**
 * Generated WPs over every code shape the matrix names: numeric (including leading zeros and
 * values past 2^53), full-width, mixed numeric/non-numeric, prefixes, duplicate codes, and absent
 * codes. Seeded, so a failure reproduces.
 *
 * Segments include mixed digit/letter runs (`3a`, `a3`, `1a2`), their full-width forms and the
 * empty segment — the shapes AD-28's literal step 2 was intransitive over (decision T-A).
 */
function generatedWps(seed, count) {
    const next = seededUint32(seed);
    const pick = (xs) => xs[next() % xs.length];
    const segmentPool = [
        '0', '1', '2', '9', '10', '01', '001', '11', '100',
        '9007199254740992', '9007199254740993', '18446744073709551616',
        '１', '２', '１０', '０１',
        'a', 'A', 'b', 'x1', 'あ', 'ア', 'ｱ', 'ガ', '',
        '3a', '3b', '3', '4', 'a3', 'a10', '1a', '1a2', '1a10', '01a', '2b1', 'b2a',
        '３ａ', '１ａ２', 'ａ３', '1ア', 'ア1',
    ];
    const codes = [null, undefined, ''];
    for (let i = 0; i < count; i++) {
        const depth = 1 + (next() % 4);
        const segs = [];
        for (let d = 0; d < depth; d++)
            segs.push(pick(segmentPool));
        codes.push(segs.join('.'));
        // A prefix of the code just made, and sometimes a duplicate of an earlier code.
        if (depth > 1 && next() % 3 === 0)
            codes.push(segs.slice(0, depth - 1).join('.'));
        if (next() % 4 === 0)
            codes.push(pick(codes));
    }
    return codes.map((code, i) => {
        const raw = next().toString(16).padStart(8, '0');
        // Mixed-case ids, so the lowercase tie-break is exercised.
        const id = `${next() % 2 === 0 ? raw.toUpperCase() : raw}-${i}`;
        return wp(id, code);
    });
}
describe('compareWp — properties over generated codes', () => {
    const wps = generatedWps(0x2_3, 120);
    it('generates the shapes it claims to', () => {
        const codes = wps.map((w) => w.wbsCode);
        expect(codes).toContain(null);
        expect(codes).toContain(undefined);
        expect(new Set(codes).size, 'some codes are duplicated').toBeLessThan(codes.length);
        expect(codes.some((c) => c?.includes('１'))).toBe(true);
        expect(codes.some((c) => c?.includes('9007199254740993'))).toBe(true);
        expect(codes.some((c) => c?.includes('1a2'))).toBe(true);
        expect(codes.some((c) => c?.includes('３ａ'))).toBe(true);
        expect(codes.some((c) => c?.includes('..') || c?.startsWith('.'))).toBe(true);
    });
    it('never returns 0 for distinct ids, and is antisymmetric', () => {
        for (const a of wps) {
            for (const b of wps) {
                const ab = sign(compareWp(a, b));
                expect(ab, `${a.id} vs ${b.id}`).toBe(sign(-compareWp(b, a)));
                if (a.id !== b.id)
                    expect(ab, `${a.id} vs ${b.id}`).not.toBe(0);
            }
        }
    });
    it('is transitive over every triple of a sample', () => {
        const sample = wps.slice(0, 70);
        for (const a of sample) {
            for (const b of sample) {
                if (compareWp(a, b) >= 0)
                    continue;
                for (const c of sample) {
                    if (compareWp(b, c) >= 0)
                        continue;
                    expect(compareWp(a, c), `${a.wbsCode} < ${b.wbsCode} < ${c.wbsCode}`).toBeLessThan(0);
                }
            }
        }
    });
    it('sorts every shuffle into one order', () => {
        const expected = [...wps].sort(compareWp).map((w) => w.id);
        for (let seed = 0; seed < 50; seed++) {
            expect(seededShuffle(wps, seed).sort(compareWp).map((w) => w.id), `seed ${seed}`).toEqual(expected);
        }
    });
});
describe('canonicalWps', () => {
    const input = generatedWps(0x2_3_1, 60);
    it('returns a new array in compareWp order and an index map that agrees with it', () => {
        const { wps, indexOf } = canonicalWps(input);
        expect(wps).not.toBe(input);
        expect(wps).toEqual([...input].sort(compareWp));
        expect(indexOf.size).toBe(wps.length);
        wps.forEach((w, i) => expect(indexOf.get(w.id)).toBe(i));
    });
    it('does not mutate its input', () => {
        const before = [...input];
        canonicalWps(input);
        expect(input).toEqual(before);
        input.forEach((w, i) => expect(w).toBe(before[i]));
    });
    it('throws on a duplicate id, naming it', () => {
        expect(() => canonicalWps([wp('dup-1', '1'), wp('other', '2'), wp('dup-1', '3')])).toThrow(/"dup-1"/);
    });
    it('accepts an empty list', () => {
        const { wps, indexOf } = canonicalWps([]);
        expect(wps).toEqual([]);
        expect(indexOf.size).toBe(0);
    });
    it('is shuffle-invariant in the codec-canonical form (AC 4: the ordering stage)', () => {
        expectShuffleInvariant((shuffled) => {
            const { wps, indexOf } = canonicalWps(shuffled);
            // The codec carries plain JSON only, so the map goes out as ordered entries.
            return {
                wps: wps.map((w) => ({ id: w.id, wbsCode: w.wbsCode ?? null })),
                indexOf: [...indexOf.entries()],
            };
        }, input, 50);
    });
});
