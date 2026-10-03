/**
 * Pure view decisions for *Set Baseline* controls (story 4.1) — shared by the server button
 * and the Plan toolbar client control so disable/link branches cannot drift.
 */

export type SetBaselineDisabledView =
  | { readonly kind: 'hidden' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'link'; readonly count: number; readonly href: string }
  | { readonly kind: 'blocked' };

/**
 * When Set is disabled, show the exceptions-rail link if either not-schedulable rows or other
 * blocking WPs exist; otherwise the plain blocked caption (halted / missing run / no start).
 */
export function setBaselineDisabledView(input: {
  readonly hasBaseline: boolean;
  readonly canSet: boolean;
  readonly notSchedulableCount: number;
  readonly blockingWpIdsLength: number;
  readonly exceptionsRailHref: string;
}): SetBaselineDisabledView {
  if (input.hasBaseline) return { kind: 'hidden' };
  if (input.canSet) return { kind: 'ready' };
  const count = Math.max(input.notSchedulableCount, input.blockingWpIdsLength);
  if (count > 0) {
    return { kind: 'link', count, href: input.exceptionsRailHref };
  }
  return { kind: 'blocked' };
}
