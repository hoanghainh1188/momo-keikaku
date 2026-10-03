import { describe, expect, it } from 'vitest';
import { reBaselineDisabledView } from './re-baseline-ui';

const href = '/p/p1/plan?exceptions=not_schedulable';

describe('reBaselineDisabledView', () => {
  it('hides when no Baseline exists', () => {
    expect(
      reBaselineDisabledView({
        hasBaseline: false,
        canReBaseline: false,
        notSchedulableCount: 0,
        blockingWpIdsLength: 0,
        exceptionsRailHref: href,
      }),
    ).toEqual({ kind: 'hidden' });
  });

  it('is ready when Re-baseline would succeed', () => {
    expect(
      reBaselineDisabledView({
        hasBaseline: true,
        canReBaseline: true,
        notSchedulableCount: 0,
        blockingWpIdsLength: 0,
        exceptionsRailHref: href,
      }),
    ).toEqual({ kind: 'ready' });
  });

  it('links to the exceptions rail when blockers exist', () => {
    expect(
      reBaselineDisabledView({
        hasBaseline: true,
        canReBaseline: false,
        notSchedulableCount: 2,
        blockingWpIdsLength: 0,
        exceptionsRailHref: href,
      }),
    ).toEqual({ kind: 'link', count: 2, href });
  });

  it('shows blocked when disabled without countable blockers', () => {
    expect(
      reBaselineDisabledView({
        hasBaseline: true,
        canReBaseline: false,
        notSchedulableCount: 0,
        blockingWpIdsLength: 0,
        exceptionsRailHref: href,
      }),
    ).toEqual({ kind: 'blocked' });
  });
});
