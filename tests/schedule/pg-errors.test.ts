/**
 * mapSchedulingConstraint — Drizzle `.cause` walk + leaf-only / duplicate-edge mapping.
 */
import { describe, expect, it } from 'vitest';
import { SUMMARY_ENDPOINT } from '../../packages/app/src/schedule/plan-invariants';
import {
  mapSchedulingConstraint,
  postgresConstraintCode,
} from '../../packages/app/src/schedule/pg-errors';

describe('mapSchedulingConstraint', () => {
  it('walks Drizzle .cause for SQLSTATE', () => {
    const wrapped = {
      message: 'Failed query',
      cause: { code: '23514', constraint: 'work_package_leaf_only_inputs_check' },
    };
    expect(postgresConstraintCode(wrapped)).toBe('23514');
    expect(mapSchedulingConstraint(wrapped)).toEqual({ dependencies: [SUMMARY_ENDPOINT] });
  });

  it('maps duplicate wp_dependency 23505 to invalid_input (empty rule codes)', () => {
    const err = {
      cause: { code: '23505', constraint: 'wp_dependency_edge_key' },
    };
    expect(mapSchedulingConstraint(err)).toEqual({ dependencies: [] });
  });
});
