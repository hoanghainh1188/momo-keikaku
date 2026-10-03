/**
 * Story 4.1 — Set Baseline disable/link branches (shared by button + Plan control).
 */
import { describe, expect, it } from 'vitest';
import { setBaselineDisabledView } from './set-baseline-ui';

const href = '/p/p1/plan?exceptions=not_schedulable';

describe('setBaselineDisabledView', () => {
  it('hides once a Baseline exists', () => {
    expect(
      setBaselineDisabledView({
        hasBaseline: true,
        canSet: false,
        notSchedulableCount: 2,
        blockingWpIdsLength: 1,
        exceptionsRailHref: href,
      }),
    ).toEqual({ kind: 'hidden' });
  });

  it('is ready when Set is allowed', () => {
    expect(
      setBaselineDisabledView({
        hasBaseline: false,
        canSet: true,
        notSchedulableCount: 0,
        blockingWpIdsLength: 0,
        exceptionsRailHref: href,
      }),
    ).toEqual({ kind: 'ready' });
  });

  it('links with max(notSchedulable, blockers) when either count is positive', () => {
    expect(
      setBaselineDisabledView({
        hasBaseline: false,
        canSet: false,
        notSchedulableCount: 0,
        blockingWpIdsLength: 3,
        exceptionsRailHref: href,
      }),
    ).toEqual({ kind: 'link', count: 3, href });

    expect(
      setBaselineDisabledView({
        hasBaseline: false,
        canSet: false,
        notSchedulableCount: 2,
        blockingWpIdsLength: 0,
        exceptionsRailHref: href,
      }),
    ).toEqual({ kind: 'link', count: 2, href });

    expect(
      setBaselineDisabledView({
        hasBaseline: false,
        canSet: false,
        notSchedulableCount: 1,
        blockingWpIdsLength: 4,
        exceptionsRailHref: href,
      }),
    ).toEqual({ kind: 'link', count: 4, href });
  });

  it('shows blocked caption when Set is refused with no NS rows and no blockers', () => {
    expect(
      setBaselineDisabledView({
        hasBaseline: false,
        canSet: false,
        notSchedulableCount: 0,
        blockingWpIdsLength: 0,
        exceptionsRailHref: href,
      }),
    ).toEqual({ kind: 'blocked' });
  });
});
