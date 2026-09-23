import { describe, expect, it } from 'vitest';
import { compareCodePoints, compareNfkc } from './compareNfkc';

/**
 * NFR-I1: `domain/text.compareNfkc` is the single comparator product text sorts through (NFKC,
 * then code point order). The dotted-code comparator `compareNfkcNumeric` that used to live
 * beside it was deleted by story 2.3; WBS codes order through `domain/schedule/order.compareWp`
 * (AD-28), and the tests that still held moved to `schedule/order.test.ts`.
 */
describe('compareNfkc', () => {
  it('orders full- and half-width forms equally after NFKC', () => {
    expect(compareNfkc('Ａ', 'A')).toBe(0);
  });

  /** Epic 1 retrospective, F24: base-sensitivity collation reported these as EQUAL. */
  describe('never reports NFKC-distinct strings as equal (retro F24)', () => {
    const pairs: readonly (readonly [string, string, string])[] = [
      ['あ', 'ア', 'hiragana vs katakana'],
      ['ガ', 'カ', 'with and without dakuten'],
      ['A', 'a', 'upper vs lower case'],
      ['か', 'が', 'the same pair the other way round'],
    ];

    for (const [left, right, why] of pairs) {
      it(`orders ${JSON.stringify(left)} against ${JSON.stringify(right)} — ${why}`, () => {
        expect(compareNfkc(left, right)).not.toBe(0);
        expect(Math.sign(compareNfkc(left, right))).toBe(-Math.sign(compareNfkc(right, left)));
      });
    }

    it('treats a pair NFKC unifies as equal', () => {
      expect(compareNfkc('ﾊﾞ', 'バ')).toBe(0);
    });
  });

  it('orders by code point, not UTF-16 code unit, above U+FFFF', () => {
    // U+2000B (CJK Ext. B) is a surrogate pair led by U+D840, which `<` puts before U+FA0E
    // (a CJK compatibility ideograph with no decomposition, so NFKC keeps it). By code point
    // U+FA0E comes first.
    const astral = '\u{2000B}';
    const bmp = '\uFA0E';
    expect(astral < bmp, 'UTF-16 code unit order disagrees').toBe(true);
    expect(bmp.normalize('NFKC')).toBe(bmp);
    expect(compareCodePoints(bmp, astral)).toBe(-1);
    expect(compareCodePoints(astral, bmp)).toBe(1);
    expect(compareNfkc(bmp, astral)).toBe(-1);
    expect(compareNfkc(astral, bmp)).toBe(1);
  });
});
