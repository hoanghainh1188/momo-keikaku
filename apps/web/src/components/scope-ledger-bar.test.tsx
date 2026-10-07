/**
 * Story 5.11 — Review keeps the static Scope Ledger Bar (role=img, legend, no toggles).
 */
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ratio } from '@momo/domain';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (key.startsWith('mapping.ledger.hour_segments.')) {
      return key.slice('mapping.ledger.hour_segments.'.length);
    }
    if (key === 'mapping.ledger.buckets_footnote') {
      return `footnote ${values?.totalHours}/${values?.openingHours}`;
    }
    if (key === 'mapping.ledger.segment_title') {
      return `${values?.label}:${values?.hours}`;
    }
    if (key === 'mapping.ledger.segment_aria') {
      return `${values?.label} ${values?.hours} ${values?.share}`;
    }
    return key;
  },
}));

const { ScopeLedgerBar } = await import('./scope-ledger-bar');

describe('ScopeLedgerBar readOnly (Review)', () => {
  it('defaults to role=img with legend values and no basis/table controls', () => {
    const html = renderToStaticMarkup(
      createElement(ScopeLedgerBar, {
        segments: [
          {
            key: 'mapped-baselined',
            label: 'mapped-baselined',
            mh: 8_000n,
            share: ratio(8n, 10n),
          },
          {
            key: 'unmapped',
            label: 'unmapped',
            mh: 2_000n,
            share: ratio(2n, 10n),
          },
        ],
        openingBalanceMh: 1_000n,
        totalMh: 10_000n,
      }) as ReactNode,
    );

    expect(html).toContain('role="img"');
    expect(html).toContain('data-testid="scope-value-mapped-baselined"');
    expect(html).toContain('data-testid="scope-value-unmapped"');
    expect(html).not.toContain('data-testid="scope-basis-hours"');
    expect(html).not.toContain('data-testid="scope-basis-tickets"');
    expect(html).not.toContain('data-testid="scope-show-as-table"');
    expect(html).not.toContain('role="toolbar"');
  });
});
