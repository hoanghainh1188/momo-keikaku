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
});
