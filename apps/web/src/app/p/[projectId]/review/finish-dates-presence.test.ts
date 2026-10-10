import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Story 6.6: dual-finish / Schedule-context testids stay present on the Review page source.
 * Source scan only — mirrors the approximate-guards style of holding chrome in the TSX.
 */
const PAGE = fileURLToPath(new URL('./page.tsx', import.meta.url));

describe('Review dual-finish presence (Story 6.6)', () => {
  it('keeps Status / Ahead-Behind / Forecast finish testids in page.tsx', () => {
    const src = readFileSync(PAGE, 'utf8');
    for (const id of [
      'schedule-finish-context',
      'm-status-computed-finish',
      'm-status-trend-finish',
      'm-computed-finish',
      'm-forecast-finish',
      'm-forecast-computed-finish',
      'm-forecast-trend-finish',
      'status-finish-gap',
      'ahead-behind-finish-gap',
      'forecast-finish-gap',
    ]) {
      expect(src, `missing data-testid ${id}`).toContain(id);
    }
  });
});
