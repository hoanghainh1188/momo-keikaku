/**
 * Story 5.14 / FR-26: `ApproximateBreakdown` puts the static approximate caption ABOVE what it
 * qualifies, in the viewer's locale, with no way to dismiss it — and is the one place the
 * labelled data is handed to the view.
 */
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { t, type Locale } from '@momo/i18n';
import type { Approximated } from '@momo/domain/present/approximate';

let locale: Locale = 'en';
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => t(locale, key),
}));

const notice = await import('./approximate-notice');
const { ApproximateBreakdown } = notice;

interface Row {
  readonly day: string;
  readonly hours: string;
}

const rows: readonly Row[] = [
  { day: '2026-09-15', hours: '3.0' },
  { day: '2026-09-16', hours: '5.0' },
];

const label: Approximated<readonly Row[]> = Object.freeze({
  approximate: true,
  reasonCode: 'hours_spread_between_snapshots',
  data: rows,
});

const table = (data: readonly Row[]): ReactNode =>
  createElement(
    'table',
    { 'data-testid': 'breakdown-table' },
    createElement(
      'tbody',
      null,
      data.map((r) => createElement('tr', { key: r.day }, createElement('td', null, r.day))),
    ),
  );

const render = (loc: Locale, children: (data: readonly Row[]) => ReactNode = table): string => {
  locale = loc;
  return renderToStaticMarkup(createElement(ApproximateBreakdown<readonly Row[]>, { label, children }));
};

describe('ApproximateBreakdown', () => {
  it('renders the notice before the render-prop output', () => {
    const html = render('en');
    const caption = html.indexOf('data-testid="approximate-notice"');
    const breakdown = html.indexOf('data-testid="breakdown-table"');
    expect(caption).toBeGreaterThanOrEqual(0);
    expect(breakdown).toBeGreaterThan(caption);
  });

  it('hands the render-prop exactly the labelled data', () => {
    const seen = vi.fn(table);
    const html = render('en', seen);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0]![0]).toBe(rows);
    expect(html).toContain('2026-09-15');
    expect(html).toContain('2026-09-16');
  });

  it('uses the exact English caption, as the figure\'s first child, a figcaption', () => {
    const html = render('en');
    expect(html).toContain('Approximate — hours are spread between snapshots, not taken from worklogs.');
    expect(html).toMatch(/^<figure data-testid="approximate-breakdown"><figcaption class="caption" data-testid="approximate-notice"/);
    expect(html).not.toContain('actuals.approximate.');
  });

  it('uses the Japanese caption in the ja locale', () => {
    const html = render('ja');
    expect(html).toContain(t('ja', 'actuals.approximate.hours_spread_between_snapshots'));
    expect(html).not.toContain('Approximate —');
    expect(html).not.toContain('actuals.approximate.');
  });

  it('has no dismiss control', () => {
    const html = render('en');
    expect(html).not.toMatch(/<button|aria-label="(close|dismiss)"|role="button"/i);
  });

  it('exports no way to render the caption on its own', () => {
    expect(Object.keys(notice)).toEqual(['ApproximateBreakdown']);
  });
});
