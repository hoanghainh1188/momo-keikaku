import { describe, expect, it } from 'vitest';
import { compareNfkc, compareNfkcNumeric } from './compareNfkc';

describe('compareNfkc', () => {
  it('orders full- and half-width forms equally after NFKC', () => {
    expect(compareNfkc('Ａ', 'A')).toBe(0);
  });

  it('sorts WBS codes with numeric segments', () => {
    const codes = ['1.10', '1.2', '1.02'].sort(compareNfkcNumeric);
    expect(codes).toEqual(['1.02', '1.2', '1.10']);
  });

  /**
   * NFR-I1 asks for Unicode code point order after NFKC normalisation, and `epics.md:744` names
   * `domain/text.compareNfkc` as the single comparator product text sorts through.
   *
   * `compareNfkcNumeric` is what the product actually calls (`review.ts:189`, `:282`), and it used
   * to fall back to `localeCompare(a, b, undefined, { sensitivity: 'base' })` for any segment pair
   * that was not two plain integers. ICU base sensitivity ignores exactly the distinctions
   * Japanese text turns on: it reported `あ`/`ア`, `ガ`/`カ` and `A`/`a` as EQUAL. A comparator that
   * returns 0 for unequal strings makes `Array.prototype.sort` unstable for those rows — the
   * output order then depends on the input order, in a product whose central claim is that the
   * same inputs reproduce the same numbers, and one story before Epic 2's "one canonical order for
   * everything the scheduler reports".
   *
   * Epic 1 retrospective, F24.
   */
  describe('never reports distinct strings as equal (retro F24)', () => {
    const distinct: readonly (readonly [string, string, string])[] = [
      ['あ', 'ア', 'hiragana vs katakana'],
      ['ガ', 'カ', 'with and without dakuten'],
      ['A', 'a', 'upper vs lower case'],
      ['か', 'が', 'the same pair the other way round'],
      ['ﾊﾞ', 'バ', 'half-width with combining dakuten vs composed full-width'],
    ];

    for (const [left, right, why] of distinct) {
      it(`orders ${JSON.stringify(left)} against ${JSON.stringify(right)} — ${why}`, () => {
        const nfkcEqual = left.normalize('NFKC') === right.normalize('NFKC');
        const result = compareNfkcNumeric(left, right);

        if (nfkcEqual) {
          // NFKC genuinely unifies these: equal is the right answer, and must agree with
          // `compareNfkc`, which is the comparator the criterion names.
          expect(result).toBe(0);
          expect(compareNfkc(left, right)).toBe(0);
          return;
        }

        expect(result, 'distinct after NFKC, so the comparator must order them').not.toBe(0);
        expect(
          Math.sign(result),
          'and must order them the same way as the comparator NFR-I1 names',
        ).toBe(Math.sign(compareNfkc(left, right)));
      });
    }

    it('is antisymmetric and gives a total order over a mixed-script set', () => {
      const words = ['あ', 'ア', 'A', 'a', 'カ', 'ガ', '1.2', '1.10', 'Ａ', 'ｱ'];

      // `|| 0` folds -0 into 0: `Object.is(-0, 0)` is false, and comparing a word with itself
      // would otherwise fail on the sign of zero rather than on the ordering.
      const sign = (n: number): number => Math.sign(n) || 0;

      for (const a of words) {
        for (const b of words) {
          expect(
            sign(compareNfkcNumeric(a, b)),
            `${JSON.stringify(a)} vs ${JSON.stringify(b)} must be the negation of the reverse`,
          ).toBe(sign(-compareNfkcNumeric(b, a)));
        }
      }

      // Order independence is asserted over NFKC-DISTINCT words only. `A`/`Ａ` and `ｱ`/`ア` are
      // unified by NFKC and therefore genuinely compare equal, so their relative order is
      // input order by definition — that is the criterion working, not a gap in it. What must
      // hold is that nothing ELSE ties.
      const distinctAfterNfkc = [...new Map(words.map((w) => [w.normalize('NFKC'), w])).values()];
      const forwards = [...distinctAfterNfkc].sort(compareNfkcNumeric);
      const backwards = [...distinctAfterNfkc].reverse().sort(compareNfkcNumeric);
      expect(backwards).toEqual(forwards);

      for (const a of distinctAfterNfkc) {
        for (const b of distinctAfterNfkc) {
          if (a === b) continue;
          expect(
            compareNfkcNumeric(a, b),
            `${JSON.stringify(a)} and ${JSON.stringify(b)} are distinct after NFKC and must not tie`,
          ).not.toBe(0);
        }
      }
    });

    it('still orders unequal non-numeric segments inside a dotted code', () => {
      expect(compareNfkcNumeric('1.あ', '1.ア')).not.toBe(0);
      expect(Math.sign(compareNfkcNumeric('1.あ', '1.ア'))).toBe(
        Math.sign(compareNfkc('あ', 'ア')),
      );
    });

    it('keeps the numeric-segment rule that WBS codes depend on', () => {
      expect(compareNfkcNumeric('2.9', '2.10')).toBeLessThan(0);
      expect(compareNfkcNumeric('10.1', '9.1')).toBeGreaterThan(0);
    });
  });
});
