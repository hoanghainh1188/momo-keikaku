import { describe, expect, it } from 'vitest';
import { filterLeafCandidates } from './plan-pred-suggest';

describe('filterLeafCandidates (web / story 2.14)', () => {
  const candidates = [
    { wpId: 'a', wbsCode: '2.3', name: 'Design' },
    { wpId: 'b', wbsCode: '2.4', name: 'Build' },
  ];

  it('returns no suggestions for an empty query', () => {
    expect(filterLeafCandidates('', candidates)).toEqual([]);
  });

  it('matches WBS or name and excludes the edited WP', () => {
    expect(filterLeafCandidates('des', candidates, { excludeWpId: 'a' })).toEqual([]);
    expect(filterLeafCandidates('2.4', candidates)).toEqual([
      { wpId: 'b', wbsCode: '2.4', name: 'Build' },
    ]);
  });
});
