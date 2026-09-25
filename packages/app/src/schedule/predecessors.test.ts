/**
 * Story 2.14 — predecessor parse/diff/FR-6a explainer (pure, no React / DB).
 */
import { describe, expect, it } from 'vitest';
import type { GraphOffences } from '@momo/domain';
import {
  diffPredecessorEdges,
  explainGraphOffences,
  explainProposedGraphRefuse,
  filterLeafCandidates,
  parsePredecessorsText,
  replaceSuccessorEdges,
} from './predecessors';

const wbsToId = new Map([
  ['2.3', 'a'],
  ['2.4', 'b'],
  ['3.0', 'sum'],
  ['1', 'one'],
]);
const leafIds = new Set(['a', 'b', 'one']);

describe('parsePredecessorsText (story 2.14)', () => {
  it('parses MS-Project text with optional FS and signed lag', () => {
    expect(parsePredecessorsText('2.3FS+2d, 2.4', wbsToId, { leafIds })).toEqual({
      ok: true,
      edges: [
        { predecessorWpId: 'a', lagDays: 2 },
        { predecessorWpId: 'b', lagDays: 0 },
      ],
    });
    expect(parsePredecessorsText('2.3+2d', wbsToId, { leafIds })).toEqual({
      ok: true,
      edges: [{ predecessorWpId: 'a', lagDays: 2 }],
    });
    expect(parsePredecessorsText('2.3FS-1d', wbsToId, { leafIds })).toEqual({
      ok: true,
      edges: [{ predecessorWpId: 'a', lagDays: -1 }],
    });
    expect(parsePredecessorsText('', wbsToId, { leafIds })).toEqual({ ok: true, edges: [] });
  });

  it('refuses malformed tokens and unknown / summary WBS while naming them', () => {
    expect(parsePredecessorsText('2.3FS++2d', wbsToId, { leafIds }).ok).toBe(false);
    expect(parsePredecessorsText('9.9', wbsToId, { leafIds })).toEqual({
      ok: false,
      message: 'Unknown work package 9.9',
    });
    expect(parsePredecessorsText('3.0', wbsToId, { leafIds })).toEqual({
      ok: false,
      message: '3.0 is a summary work package',
    });
  });
});

describe('diffPredecessorEdges (story 2.14)', () => {
  it('orders removes, re-lags, then adds', () => {
    const mutations = diffPredecessorEdges(
      's',
      [
        { predecessorWpId: 'a', lagDays: 0 },
        { predecessorWpId: 'b', lagDays: 1 },
      ],
      [
        { predecessorWpId: 'b', lagDays: 3 },
        { predecessorWpId: 'c', lagDays: 0 },
      ],
    );
    expect(mutations.map((m) => m.kind)).toEqual([
      'remove_dependency',
      're_lag_dependency',
      'add_dependency',
    ]);
    expect(mutations[0]).toMatchObject({ predecessorWpId: 'a', successorWpId: 's' });
    expect(mutations[1]).toMatchObject({ predecessorWpId: 'b', lagDays: 3 });
    expect(mutations[2]).toMatchObject({ predecessorWpId: 'c', lagDays: 0 });
  });
});

describe('explainGraphOffences (story 2.14 / UX-DR6)', () => {
  const wbsById = new Map([
    ['1', '2.1'],
    ['2', '2.3'],
    ['3', '4.2'],
    ['4', '4.2.1'],
    ['5', '3.0'],
  ]);
  const parentOf = new Map([
    ['3', null],
    ['4', '3'],
    ['5', null],
  ]);

  it('names cycle, ancestor, summary, and cross-project offences', () => {
    const offences: GraphOffences = {
      cycles: [['1', '2']],
      ancestorDescendant: [{ predecessorId: '4', successorId: '3' }],
      summaryEndpoints: [
        { predecessorId: '5', successorId: '1', summaryIds: ['5'] },
      ],
      crossProject: [{ predecessorId: '1', successorId: 'x' }],
    };
    expect(explainGraphOffences(offences, wbsById, parentOf)).toEqual([
      '2.1 → 2.3 → 2.1 would be a cycle',
      '4.2 is an ancestor of 4.2.1',
      '3.0 is a summary work package',
      'that work package is in another project',
    ]);
  });

  it('explainProposedGraphRefuse returns null for a legal graph', () => {
    const plan = {
      projectId: 'p',
      wps: [
        { id: 'a', wbsCode: '1', projectId: 'p', parentId: null },
        { id: 'b', wbsCode: '2', projectId: 'p', parentId: null },
      ],
    };
    expect(
      explainProposedGraphRefuse(plan, [{ predecessorId: 'a', successorId: 'b' }], new Map([
        ['a', '1'],
        ['b', '2'],
      ])),
    ).toBeNull();
  });
});

describe('filterLeafCandidates / replaceSuccessorEdges', () => {
  it('returns no suggestions for an empty query', () => {
    expect(
      filterLeafCandidates('', [
        { wpId: 'a', wbsCode: '2.3', name: 'Design' },
        { wpId: 'b', wbsCode: '2.4', name: 'Build' },
      ]),
    ).toEqual([]);
  });

  it('matches WBS or name and excludes the edited WP', () => {
    expect(
      filterLeafCandidates('des', [
        { wpId: 'a', wbsCode: '2.3', name: 'Design' },
        { wpId: 'b', wbsCode: '2.4', name: 'Build' },
      ], { excludeWpId: 'a' }),
    ).toEqual([]);
    expect(
      filterLeafCandidates('2.4', [
        { wpId: 'a', wbsCode: '2.3', name: 'Design' },
        { wpId: 'b', wbsCode: '2.4', name: 'Build' },
      ]),
    ).toEqual([{ wpId: 'b', wbsCode: '2.4', name: 'Build' }]);
  });

  it('replaces only the successor edges in the proposed graph', () => {
    expect(
      replaceSuccessorEdges(
        [
          { predecessorId: 'a', successorId: 's' },
          { predecessorId: 'x', successorId: 'y' },
        ],
        's',
        [{ predecessorWpId: 'b', lagDays: 2 }],
      ),
    ).toEqual([
      { predecessorId: 'x', successorId: 'y' },
      { predecessorId: 'b', successorId: 's' },
    ]);
  });
});
