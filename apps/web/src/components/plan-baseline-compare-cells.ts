/**
 * Story 4.5 / Epic 4 retro F5 — Baseline compare column chrome + cells for the Plan treegrid.
 * Extracted from plan-tree-grid so the grid shell stays focused on orchestration.
 * Plain `.ts` (createElement) so the unit gate can import it without JSX transform.
 */

import { createElement, Fragment, type ReactNode } from 'react';
import type { PlanGridRowView } from '@/components/plan-grid-types';
import {
  daysSigned,
  formatPlanDate,
  hours,
  hoursDeltaSigned,
  SUMMARY_NA_LABEL,
} from '@momo/domain/present';
import {
  BASELINE_COMPARE_COLUMNS,
  BASELINE_COMPARE_DELTA_ARIA,
  BASELINE_COMPARE_WIDTHS,
} from '@/lib/plan-grid-view';

function SummaryDash(): ReactNode {
  return createElement(
    'span',
    { className: 'plan-dash', 'aria-label': SUMMARY_NA_LABEL },
    '—',
  );
}

/** Twelve scrolling `<col>` elements for the Baseline compare sized preset (UX-DR4). */
export function BaselineCompareColgroup(): ReactNode {
  return createElement(
    Fragment,
    null,
    ...BASELINE_COMPARE_WIDTHS.map((width, i) =>
      createElement('col', { key: i, style: { width } }),
    ),
  );
}

/** Twelve `<th>` cells for the Baseline compare preset headers. */
export function BaselineCompareHeaderCells(): ReactNode {
  return createElement(
    Fragment,
    null,
    ...BASELINE_COMPARE_COLUMNS.map((label, i) => {
      const num =
        label === 'Δ' ||
        label === 'Dur' ||
        label === 'Baseline duration' ||
        label === 'Baseline effort' ||
        label === 'Effort';
      const deltaAria =
        label === 'Δ' ? BASELINE_COMPARE_DELTA_ARIA[(i - 2) / 3] : undefined;
      // Duplicate "Δ" headers need a stable key + distinguishing name.
      return createElement(
        'th',
        { key: `${label}-${i}`, className: num ? 'num' : undefined, 'aria-label': deltaAria },
        label,
        label === 'Start' || label === 'Finish'
          ? createElement('span', { className: 'plan-anch' }, 'derived')
          : null,
      );
    }),
  );
}

/** Twelve data cells: Baseline vs Current Plan with signed Δ (FR-7 / UX-DR4). */
export function BaselineCompareCells({
  row,
}: {
  readonly row: PlanGridRowView;
}): ReactNode {
  const baselineStart = row.baselineStart;
  const baselineFinish = row.baselineFinish;
  const baselineDur = row.baselineDurationDays;
  const baselineMh =
    row.baselineMh === null || row.baselineMh === undefined ? null : BigInt(row.baselineMh);
  const plannedMh =
    row.plannedMh === null || row.plannedMh === undefined ? null : BigInt(row.plannedMh);
  const effortDelta =
    row.effortDeltaMh === null || row.effortDeltaMh === undefined
      ? null
      : BigInt(row.effortDeltaMh);

  const dateCell = (date: string | null, summaryNa: boolean): ReactNode => {
    if (summaryNa || date === null) {
      return summaryNa ? SummaryDash() : createElement('span', { className: 'plan-dash' }, '—');
    }
    return formatPlanDate(date);
  };
  const dayCell = (value: number | null, summaryNa: boolean): ReactNode => {
    if (summaryNa || value === null) {
      return summaryNa ? SummaryDash() : createElement('span', { className: 'plan-dash' }, '—');
    }
    return createElement(Fragment, null, value, createElement('span', { className: 'plan-u' }, 'd'));
  };
  const effortCell = (mh: bigint | null, summaryNa: boolean): ReactNode => {
    if (summaryNa || mh === null) {
      return summaryNa ? SummaryDash() : createElement('span', { className: 'plan-dash' }, '—');
    }
    return createElement(
      Fragment,
      null,
      hours(mh),
      createElement('span', { className: 'plan-u' }, 'h'),
    );
  };
  const deltaDay = (delta: number | null): ReactNode =>
    createElement('span', { className: 'num' }, daysSigned(delta));

  return createElement(
    Fragment,
    null,
    createElement('td', null, dateCell(baselineStart, !row.isLeaf)),
    createElement('td', null, dateCell(row.earlyStart, !row.isLeaf)),
    createElement('td', { className: 'num' }, deltaDay(row.startDeltaDays)),
    createElement('td', null, dateCell(baselineFinish, !row.isLeaf)),
    createElement('td', null, dateCell(row.earlyFinish, !row.isLeaf)),
    createElement('td', { className: 'num' }, deltaDay(row.finishDeltaDays)),
    createElement('td', { className: 'num' }, dayCell(baselineDur, !row.isLeaf)),
    createElement('td', { className: 'num' }, dayCell(row.durationDays, !row.isLeaf)),
    createElement('td', { className: 'num' }, deltaDay(row.durationDeltaDays)),
    createElement('td', { className: 'num' }, effortCell(baselineMh, !row.isLeaf)),
    createElement('td', { className: 'num' }, effortCell(plannedMh, false)),
    createElement(
      'td',
      { className: 'num' },
      createElement('span', { className: 'num' }, hoursDeltaSigned(effortDelta)),
    ),
  );
}
