import { describe, expect, it } from 'vitest';
import { flattenKeys, messagesOf } from './index';

describe('i18n catalogs', () => {
  it('keeps identical key sets in en and ja', () => {
    expect(flattenKeys(messagesOf('ja'))).toEqual(flattenKeys(messagesOf('en')));
  });

  // Story 6.2 matrix: money Internal caption + EV-fall tag copy must stay in the catalog.
  it('carries the CPI-in-money diverge footnote and EV-fell tag (FR-30 / UX-DR28)', () => {
    const en = messagesOf('en');
    const footnote = en.review.evm.cpi_money_footnote;
    expect(footnote).toMatch(/CPI in money can differ from CPI in hours/i);
    expect(en.review.ev_fell.length).toBeGreaterThan(0);
    expect(messagesOf('ja').review.evm.cpi_money_footnote.length).toBeGreaterThan(0);
  });
});
