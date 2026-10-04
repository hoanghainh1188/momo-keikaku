/**
 * Pure view decisions for Baseline compare panel (story 4.4) — need-two / form / error.
 */

export type BaselineComparePanelView =
  | { readonly kind: 'need_two' }
  | { readonly kind: 'form'; readonly error: string | null };

/**
 * `<2` versions → empty-state caption; otherwise show the picker (and optional refuse error).
 */
export function baselineComparePanelView(input: {
  readonly versionCount: number;
  readonly error: string | null;
}): BaselineComparePanelView {
  if (input.versionCount < 2) return { kind: 'need_two' };
  return { kind: 'form', error: input.error };
}
