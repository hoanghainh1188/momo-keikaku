/**
 * Epic 4 retro F5 — Baseline compare cells/chrome extracted from plan-tree-grid.
 */
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  BaselineCompareCells,
  BaselineCompareColgroup,
  BaselineCompareHeaderCells,
} from './plan-baseline-compare-cells';
import type { PlanGridRowView } from './plan-grid-types';
import {
  BASELINE_COMPARE_COLUMNS,
  BASELINE_COMPARE_DELTA_ARIA,
  BASELINE_COMPARE_WIDTHS,
} from '@/lib/plan-grid-view';
import { SUMMARY_NA_LABEL } from '@momo/domain/present';

function leafRow(overrides: Partial<PlanGridRowView> = {}): PlanGridRowView {
  return {
    wpId: 'leaf-1',
    wbsCode: '1.1',
    name: 'Leaf',
    parentId: 'sum-1',
    isLeaf: true,
    isMilestone: false,
    isCatchAll: false,
    level: 2,
    posInSet: 1,
    setSize: 1,
    hasChildren: false,
    durationDays: 10,
    constraintType: 'asap',
    constraintDate: null,
    constraintLabel: '',
    predecessorsText: '',
    predecessorEdges: [],
    earlyStart: '2026-09-01',
    earlyFinish: '2026-10-01',
    floatDays: 0,
    isCritical: false,
    state: 'remaining',
    notSchedulable: false,
    stale: false,
    actualStart: null,
    actualFinish: null,
    recordedPct: null,
    remainingDays: null,
    exceptionLabel: null,
    exceptionKind: null,
    plannedMh: '40000',
    baselineStart: '2026-08-01',
    baselineFinish: '2026-08-20',
    baselineDurationDays: 8,
    baselineMh: '32000',
    startDeltaDays: 5,
    finishDeltaDays: 6,
    durationDeltaDays: 2,
    effortDeltaMh: '8000',
    ...overrides,
  };
}

describe('plan-baseline-compare-cells (epic 4 retro F5)', () => {
  it('renders twelve col widths matching the sized Baseline compare budget', () => {
    const html = renderToStaticMarkup(
      createElement('colgroup', null, createElement(BaselineCompareColgroup)) as ReactNode,
    );
    expect(BASELINE_COMPARE_WIDTHS).toHaveLength(12);
    for (const width of BASELINE_COMPARE_WIDTHS) {
      expect(html).toContain(`width:${width}px`);
    }
  });

  it('renders twelve headers with distinguishing Δ aria-labels', () => {
    const html = renderToStaticMarkup(
      createElement('tr', null, createElement(BaselineCompareHeaderCells)) as ReactNode,
    );
    expect(BASELINE_COMPARE_COLUMNS).toHaveLength(12);
    expect(html).toContain('Baseline start');
    expect(html).toContain('Baseline finish');
    expect(html).toContain('Baseline duration');
    expect(html).toContain('Baseline effort');
    for (const aria of BASELINE_COMPARE_DELTA_ARIA) {
      expect(html).toContain(`aria-label="${aria}"`);
    }
    expect(html).toContain('plan-anch');
  });

  it('renders leaf Baseline vs Current Plan cells with signed day and effort Δ', () => {
    const html = renderToStaticMarkup(
      createElement('tr', null, createElement(BaselineCompareCells, { row: leafRow() })) as ReactNode,
    );
    expect(html.match(/<td/g)?.length).toBe(12);
    expect(html).toContain('1 Aug 2026');
    expect(html).toContain('20 Aug 2026');
    expect(html).toContain('1 Sep 2026');
    expect(html).toContain('1 Oct 2026');
    expect(html).toContain('+5');
    expect(html).toContain('+6');
    expect(html).toContain('+2');
    // Baseline duration 8d, Current Plan duration 10d, effort 32h / 40h / +8.0h family.
    expect(html).toContain('>8<span class="plan-u">d</span>');
    expect(html).toContain('>10<span class="plan-u">d</span>');
    expect(html).toContain('plan-u');
    expect(html).toMatch(/32(\.0)?/);
    expect(html).toMatch(/40(\.0)?/);
    expect(html).toMatch(/\+8(\.0)?/);
  });

  it('uses plain dash (not summary N/A) for null leaf Baseline fields', () => {
    const html = renderToStaticMarkup(
      createElement(
        'tr',
        null,
        createElement(BaselineCompareCells, {
          row: leafRow({
            baselineStart: null,
            baselineFinish: null,
            baselineDurationDays: null,
            baselineMh: null,
            durationDays: null,
            plannedMh: null,
            startDeltaDays: null,
            finishDeltaDays: null,
            durationDeltaDays: null,
            effortDeltaMh: null,
          }),
        }),
      ) as ReactNode,
    );
    expect(html).not.toContain(`aria-label="${SUMMARY_NA_LABEL}"`);
    expect((html.match(/class="plan-dash"/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('shows summary N/A on Baseline-side fields for non-leaf rows', () => {
    const html = renderToStaticMarkup(
      createElement(
        'tr',
        null,
        createElement(BaselineCompareCells, {
          row: leafRow({
            isLeaf: false,
            hasChildren: true,
            durationDays: null,
            startDeltaDays: null,
            finishDeltaDays: null,
            durationDeltaDays: null,
            effortDeltaMh: null,
          }),
        }),
      ) as ReactNode,
    );
    // baseline start/finish/dur/effort + current start/finish/dur → seven SummaryDash labels.
    expect((html.match(new RegExp(`aria-label="${SUMMARY_NA_LABEL}"`, 'g')) ?? []).length).toBe(7);
  });
});
