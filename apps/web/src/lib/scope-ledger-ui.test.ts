/**
 * Story 5.11 — Review keeps the static Scope Ledger chrome (verification-gap pin).
 */
import { describe, expect, it } from 'vitest';
import { scopeLedgerChrome } from './scope-ledger-ui';

describe('scopeLedgerChrome', () => {
  it('defaults to Review static mode: role=img, legend on, no basis/table toggles', () => {
    expect(scopeLedgerChrome()).toEqual({
      role: 'img',
      showBasisToggle: false,
      showTableToggle: false,
      showLegend: true,
    });
    expect(scopeLedgerChrome(true)).toEqual(scopeLedgerChrome());
  });

  it('interactive Mapping mode exposes toolbar + toggles and drops the Review legend', () => {
    expect(scopeLedgerChrome(false)).toEqual({
      role: 'toolbar',
      showBasisToggle: true,
      showTableToggle: true,
      showLegend: false,
    });
  });
});
