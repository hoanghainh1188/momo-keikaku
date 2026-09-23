/**
 * The fence's pre-write guard on FR-6a's four graph rules (AR-45, AR-46; story 2.4, Q1 → B).
 *
 * `checkPlanInvariants(plan, edges)` runs `domain/schedule.validate` over the PROPOSED plan — the
 * state a mutation would leave — and answers `invalid_input` when any rule is broken. Story 2.9's
 * `applyPlanChange` calls it on every mutation, before the write (`deferred-work.md`); the
 * database's leaf and composite FKs are only the backstop.
 *
 * It is a pure guard, not a use case: it takes no ctx, touches no port or database, and is not on
 * the role-gated use-case surface. `details` maps `dependencies` to the rule codes present, in
 * the fixed order of `PLAN_INVARIANT_RULES`, and never echoes a WP id or name — the wording and
 * the offending WPs are story 2.14's to present, from `validate`'s own lists.
 */
import {
  validate,
  type GraphOffences,
  type PlanGraph,
  type PlanGraphEdge,
  type PlanGraphWp,
} from '@momo/domain';
import { fail, ok, type AppError, type Result } from '../result';

export const DEPENDENCY_CYCLE = 'dependency_cycle';
export const ANCESTOR_DESCENDANT_LINK = 'ancestor_descendant_link';
export const SUMMARY_ENDPOINT = 'summary_endpoint';
export const CROSS_PROJECT_LINK = 'cross_project_link';

/** The four rule codes, in the fixed order `details.dependencies` lists them. */
export const PLAN_INVARIANT_RULES = [
  DEPENDENCY_CYCLE,
  ANCESTOR_DESCENDANT_LINK,
  SUMMARY_ENDPOINT,
  CROSS_PROJECT_LINK,
] as const;

export type PlanInvariantRule = (typeof PLAN_INVARIANT_RULES)[number];

const LIST_OF_RULE: Record<PlanInvariantRule, keyof GraphOffences> = {
  [DEPENDENCY_CYCLE]: 'cycles',
  [ANCESTOR_DESCENDANT_LINK]: 'ancestorDescendant',
  [SUMMARY_ENDPOINT]: 'summaryEndpoints',
  [CROSS_PROJECT_LINK]: 'crossProject',
};

export function checkPlanInvariants<W extends PlanGraphWp>(
  plan: PlanGraph<W>,
  edges: readonly PlanGraphEdge[],
): Result<void, AppError> {
  const offences = validate(plan, edges);
  const broken = PLAN_INVARIANT_RULES.filter((rule) => offences[LIST_OF_RULE[rule]].length > 0);
  return broken.length === 0 ? ok(undefined) : fail('invalid_input', { dependencies: broken });
}
