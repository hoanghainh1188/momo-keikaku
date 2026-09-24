/**
 * Map Postgres FK / CHECK failures from plan-input writes to `invalid_input` with the
 * plan-invariant rule codes (story 2.9; deferred-work 23503/23514 entry).
 */
import {
  CROSS_PROJECT_LINK,
  SUMMARY_ENDPOINT,
  type PlanInvariantRule,
} from './plan-invariants';

export function postgresConstraintCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

export function postgresConstraintName(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const name = (error as { constraint?: unknown }).constraint;
  return typeof name === 'string' ? name : null;
}

/**
 * Map a 23503 / 23514 from a scheduling write to the guard's rule codes, or null when the
 * error is not a mapped constraint failure.
 */
export function mapSchedulingConstraint(
  error: unknown,
): { readonly dependencies: readonly PlanInvariantRule[] } | null {
  const code = postgresConstraintCode(error);
  if (code !== '23503' && code !== '23514') return null;
  const name = postgresConstraintName(error) ?? '';

  if (name.includes('wp_dependency_predecessor') || name.includes('wp_dependency_successor')) {
    // Leaf FK failure: either a summary endpoint or a cross-project / missing WP.
    // Prefer SUMMARY_ENDPOINT when the constraint name mentions leaf; CROSS_PROJECT otherwise
    // is not distinguishable from a missing WP at the DB layer — both are 23503 on the leaf FK.
    if (name.includes('leaf') || name.includes('_fk')) {
      return { dependencies: [SUMMARY_ENDPOINT, CROSS_PROJECT_LINK] };
    }
  }
  if (name === 'wp_dependency_type_check') {
    // Non-FS type — not one of the four graph rules; still invalid_input without a rule code.
    return { dependencies: [] };
  }
  if (name.includes('work_package') && code === '23514') {
    return { dependencies: [SUMMARY_ENDPOINT] };
  }
  // Generic FK / check on a scheduling table.
  if (name.startsWith('wp_dependency') || name.startsWith('work_package')) {
    return { dependencies: [SUMMARY_ENDPOINT, CROSS_PROJECT_LINK] };
  }
  return { dependencies: [] };
}
