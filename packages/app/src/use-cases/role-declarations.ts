/**
 * EVERY use case's role declaration, in one table — what the role gate
 * (`tests/role-declarations.test.ts`) enumerates and snapshots.
 *
 * Internal to `use-cases/`, like `audit-declarations.ts`: not re-exported from
 * `use-cases/index.ts`, whose exports ARE the primary enumerated surface. The gate also
 * enumerates a second schedule/calendar module list (Epic 2 retro F10 / Q1→B) whose writers
 * stay off that barrel. The gate fails, with no database, naming any export that has no
 * declaration. Enforcement is proved by the behavioural half of that gate: every export,
 * called with a viewer-only context and deps that throw, must answer `not_found` without
 * touching a port — so a table entry that never reaches `authorize` cannot pass CI.
 *
 * COLOCATED, THEN MERGED — the same convention as `audit-declarations.ts`. Each use-case
 * module (and the schedule/calendar write modules) exports the declarations for the writers it
 * owns, and this file imports and spreads them.
 *
 * It used to be the other way round: every declaration was written out here, away from the module
 * implementing it, while audit declarations were colocated. Two conceptually parallel gates with
 * opposite answers to "where do I declare this" meant a contributor adding a use case had two
 * homes to remember and nothing forced them to use both. The audit convention came first (story
 * 1.3) and this one diverged from it two stories later (1.5), so this is the one that moved.
 * Epic 1 retrospective, F12.
 *
 * `RoleDeclaration` and the three shapes (`ADMIN_ONLY`, `PROJECT_REACH`, `STAFF_RESOURCE`) live in
 * `../authz/authorize` beside the role sets, so a use-case module can declare its roles without
 * importing this file — which would be a cycle.
 */
import type { RoleDeclaration } from '../authz/authorize';
import { COMPARE_BASELINE_VERSIONS_ROLES } from '../baseline/compare-baseline-versions';
import { RE_BASELINE_ROLES } from '../baseline/re-baseline';
import { RE_DERIVE_PINNED_BASELINE_ROLES } from '../baseline/re-derive-pinned';
import { SET_BASELINE_ROLES } from '../baseline/set-baseline';
import { CALENDAR_ROLES } from '../calendar/publish-calendar-version';
import { SCHEDULE_ROLES } from '../schedule/apply-plan-change';
import { GET_PROJECT_HEADER_ROLES } from './get-project-header';
import { GET_PROJECT_MAPPING_ROLES } from './get-project-mapping';
import { GET_PROJECT_REVIEW_ROLES } from './get-project-review';
import { AUDIT_LOG_READ_ROLES } from './list-audit-log';
import { ORG_LIST_READ_ROLES } from './list-org';
import { MAPPING_RULE_ROLES } from './mapping-rules';
import { MEMBERSHIP_WRITE_ROLES } from './membership-writes';
import { ORG_WRITE_ROLES } from './org-writes';
import { PROJECT_WRITE_ROLES } from './project-writes';
import { RESOURCE_WRITE_ROLES } from './resource-writes';
import { TENANT_CURRENCY_ROLES } from './tenant-currency';
import { CONNECTOR_WRITE_ROLES } from './connector-writes';

export type { RoleDeclaration };

/**
 * Spread order matters only for readability — the gate asserts the key set against the exported
 * surface (use-cases barrel plus the schedule/calendar second module list — Epic 2 retro F10),
 * and a duplicate key would be a compile error in the module that owns it.
 */
export const USE_CASE_ROLES: Readonly<Record<string, RoleDeclaration>> = {
  ...GET_PROJECT_HEADER_ROLES,
  ...GET_PROJECT_REVIEW_ROLES,
  ...GET_PROJECT_MAPPING_ROLES,
  ...PROJECT_WRITE_ROLES,
  ...MAPPING_RULE_ROLES,
  ...ORG_WRITE_ROLES,
  ...ORG_LIST_READ_ROLES,
  ...MEMBERSHIP_WRITE_ROLES,
  ...RESOURCE_WRITE_ROLES,
  ...AUDIT_LOG_READ_ROLES,
  ...TENANT_CURRENCY_ROLES,
  ...SCHEDULE_ROLES,
  ...CALENDAR_ROLES,
  ...SET_BASELINE_ROLES,
  ...RE_BASELINE_ROLES,
  ...COMPARE_BASELINE_VERSIONS_ROLES,
  ...RE_DERIVE_PINNED_BASELINE_ROLES,
  ...CONNECTOR_WRITE_ROLES,
};
