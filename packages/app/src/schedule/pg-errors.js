/**
 * Map Postgres FK / CHECK failures from plan-input writes to `invalid_input` with the
 * plan-invariant rule codes (story 2.9; deferred-work 23503/23514 entry).
 *
 * Drizzle wraps driver errors on `.cause` — walk the chain for `code` / `constraint`.
 */
import { CROSS_PROJECT_LINK, SUMMARY_ENDPOINT, } from './plan-invariants';
function walkPgField(error, field) {
    let cur = error;
    for (let i = 0; i < 6 && cur && typeof cur === 'object'; i++) {
        const value = cur[field];
        if (typeof value === 'string' && value.length > 0) {
            if (field === 'code' && !/^[0-9A-Z]{5}$/.test(value)) {
                cur = cur.cause;
                continue;
            }
            return value;
        }
        cur = cur.cause;
    }
    return null;
}
export function postgresConstraintCode(error) {
    return walkPgField(error, 'code');
}
export function postgresConstraintName(error) {
    return walkPgField(error, 'constraint');
}
/**
 * Map a 23503 / 23514 / duplicate-edge 23505 from a scheduling write to the guard's rule codes,
 * or null when the error is not a mapped constraint failure.
 */
export function mapSchedulingConstraint(error) {
    const code = postgresConstraintCode(error);
    if (code !== '23503' && code !== '23514' && code !== '23505')
        return null;
    const name = postgresConstraintName(error) ?? '';
    // Duplicate dependency edge (wp_dependency_edge_key).
    if (code === '23505' && name.includes('wp_dependency')) {
        return { dependencies: [] };
    }
    if (code === '23505')
        return null;
    if (name.includes('wp_dependency_predecessor') || name.includes('wp_dependency_successor')) {
        // Leaf FK failure: either a summary endpoint or a cross-project / missing WP.
        if (name.includes('leaf') || name.includes('_fk')) {
            return { dependencies: [SUMMARY_ENDPOINT, CROSS_PROJECT_LINK] };
        }
    }
    if (name === 'wp_dependency_type_check') {
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
