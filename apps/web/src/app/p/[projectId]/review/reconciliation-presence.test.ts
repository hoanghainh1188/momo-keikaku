import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Story 6.7: source/`data-testid` guards for fixed order, Contract placement, stale banner,
 * print CSS markers, Unmapped money — no Postgres required.
 */
const PAGE = fileURLToPath(new URL('./page.tsx', import.meta.url));
const UNMAPPED = fileURLToPath(
  new URL('../../../../components/unmapped-group-rows.tsx', import.meta.url),
);
const RAIL = fileURLToPath(
  new URL('../../../../components/disposition-rail.tsx', import.meta.url),
);
const REFRESH = fileURLToPath(
  new URL('../../../../components/review-refresh-now-form.tsx', import.meta.url),
);
const CSS = fileURLToPath(new URL('../../../globals.css', import.meta.url));

describe('Review reconciliation presence (Story 6.7)', () => {
  it('keeps fixed section order Status → Unplanned → Ahead/Behind → Progress → Effort → Forecast', () => {
    const src = readFileSync(PAGE, 'utf8');
    const ids = [
      'id="status"',
      'id="unplanned"',
      'id="ahead-behind"',
      'id="progress-dates"',
      'id="effort-cost"',
      'id="forecast"',
    ];
    let last = -1;
    for (const id of ids) {
      const at = src.indexOf(id);
      expect(at, `missing ${id}`).toBeGreaterThan(last);
      last = at;
    }
    expect(src.lastIndexOf('<DispositionRail')).toBeGreaterThan(src.indexOf('id="forecast"'));
  });

  it('places Contract Type beside Unplanned and offers stale Refresh now banner', () => {
    const src = readFileSync(PAGE, 'utf8');
    const refresh = readFileSync(REFRESH, 'utf8');
    expect(src).toContain('unplanned-contract-type');
    expect(src).toContain('contract_type_beside_unplanned');
    expect(src).toContain('review-stale-banner');
    expect(src).toContain('ReviewRefreshNowForm');
    expect(refresh).toContain('review-stale-refresh');
    // Fresh pin (≤24h): banner is gated — no unconditional render.
    expect(src).toMatch(/pinAgeMinutes\s*>\s*24\s*\*\s*60/);
    expect(src).toMatch(/stalePin\s*\?/);
  });

  it('wires Q2 pragmatic drills (Unmapped money, component/Divergence links)', () => {
    const page = readFileSync(PAGE, 'utf8');
    const unmapped = readFileSync(UNMAPPED, 'utf8');
    expect(unmapped).toContain('unmapped-money-');
    expect(unmapped).toContain('yen(ticket.jpy');
    expect(unmapped).toContain('unmapped-ticket-link-');
    expect(page).toContain('component-hours-link-');
    expect(page).toContain('divergence-wp-link-');
  });

  it('keeps Disposition drawer toggle and A4-landscape print hide markers', () => {
    const rail = readFileSync(RAIL, 'utf8');
    const css = readFileSync(CSS, 'utf8');
    expect(rail).toContain('disposition-rail-toggle');
    expect(rail).toContain('max-width: 1279px');
    expect(css).toContain('@media print');
    expect(css).toContain('size: A4 landscape');
    expect(css).toMatch(/\.topbar[\s\S]*display:\s*none/);
    expect(css).toMatch(/\.sidebar[\s\S]*display:\s*none/);
    expect(css).toMatch(/\.rail[\s\S]*display:\s*none/);
  });
});
