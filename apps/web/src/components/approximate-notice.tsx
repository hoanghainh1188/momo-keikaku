import { useTranslations } from 'next-intl';
import { createElement, type ReactNode } from 'react';
import type { ApproximateReason, Approximated } from '@momo/domain/present/approximate';

/*
 * Story 5.14 / FR-26 / ARCHITECTURE-SPINE "Approximation label" / EXPERIENCE.md: the caption every
 * person- or day-level actuals breakdown carries, and the one place such a breakdown's data is
 * unwrapped.
 *
 * No `'use client'` here, on purpose (pinned by `app/approximate-guards.test.ts`): the breakdown
 * is passed as a FUNCTION child, and a function cannot cross the server → client boundary. A
 * client component that needs the data renders inside the render-prop instead.
 *
 * Written with `createElement`, not JSX, so the unit gate can import it without a JSX transform
 * (`apps/web` compiles with `jsx: preserve`), as `user-chip-menu.ts` is.
 */

/**
 * The static caption: no close control, no state — a caption, not a toast. Module-private, so it
 * cannot be rendered anywhere but directly above the data it qualifies.
 */
function ApproximateNotice({ reasonCode }: { reasonCode: ApproximateReason }) {
  const t = useTranslations();
  // Exhaustive over the closed reason set, with literal keys so the i18n key-usage test sees
  // them: a new reason fails typecheck here until it has its caption.
  const caption: Record<ApproximateReason, string> = {
    hours_spread_between_snapshots: t('actuals.approximate.hours_spread_between_snapshots'),
  };
  return createElement(
    'figcaption',
    {
      className: 'caption',
      'data-testid': 'approximate-notice',
      'data-reason': reasonCode,
    },
    caption[reasonCode],
  );
}

export interface ApproximateBreakdownProps<T> {
  /** The domain output, labelled approximate with its reason. */
  readonly label: Approximated<T>;
  /** Renders the chart or table from `label.data`; it appears below the caption. */
  readonly children: (data: T) => ReactNode;
}

/**
 * The only way to render an `Approximated<T>`: a `<figure>` whose first child is the caption
 * (`<figcaption>`, so assistive tech associates it with the breakdown), then the render-prop's
 * output for `label.data`. `app/approximate-guards.test.ts` fails any web view that imports
 * `Approximated` without rendering through this wrapper.
 */
export function ApproximateBreakdown<T>({ label, children }: ApproximateBreakdownProps<T>) {
  return createElement(
    'figure',
    { 'data-testid': 'approximate-breakdown' },
    createElement(ApproximateNotice, { reasonCode: label.reasonCode }),
    children(label.data),
  );
}
