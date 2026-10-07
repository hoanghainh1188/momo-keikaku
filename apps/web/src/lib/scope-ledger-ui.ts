/**
 * Scope Ledger Bar chrome modes (story 5.11).
 * Review uses the static path; Mapping › Coverage uses the interactive path.
 */
export type ScopeLedgerChrome = {
  readonly role: 'img' | 'toolbar';
  readonly showBasisToggle: boolean;
  readonly showTableToggle: boolean;
  /** Under-bar hours legend (Review). Interactive Coverage uses adjacent text + optional table. */
  readonly showLegend: boolean;
};

/** Defaults match `<ScopeLedgerBar />` with no props beyond segments — Review's Unplanned bar. */
export function scopeLedgerChrome(readOnly = true): ScopeLedgerChrome {
  return {
    role: readOnly ? 'img' : 'toolbar',
    showBasisToggle: !readOnly,
    showTableToggle: !readOnly,
    showLegend: readOnly,
  };
}
