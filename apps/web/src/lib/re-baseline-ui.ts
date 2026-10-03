/**
 * Pure view decisions for *Re-baseline* controls (story 4.3) — shared so disable/link
 * branches cannot drift between server and client surfaces.
 */

export type ReBaselineDisabledView =
  | { readonly kind: 'hidden' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'link'; readonly count: number; readonly href: string }
  | { readonly kind: 'blocked' };

/**
 * Re-baseline is only offered when a Baseline exists. When disabled, show the exceptions-rail
 * link if blockers exist; otherwise the plain blocked caption.
 */
export function reBaselineDisabledView(input: {
  readonly hasBaseline: boolean;
  readonly canReBaseline: boolean;
  readonly notSchedulableCount: number;
  readonly blockingWpIdsLength: number;
  readonly exceptionsRailHref: string;
}): ReBaselineDisabledView {
  if (!input.hasBaseline) return { kind: 'hidden' };
  if (input.canReBaseline) return { kind: 'ready' };
  const count = Math.max(input.notSchedulableCount, input.blockingWpIdsLength);
  if (count > 0) {
    return { kind: 'link', count, href: input.exceptionsRailHref };
  }
  return { kind: 'blocked' };
}
