/**
 * EVERY use case's role declaration, in one table — what the role gate
 * (`role-declarations.test.ts`) enumerates and snapshots.
 *
 * Internal to `use-cases/`, like `audit-declarations.ts`: not re-exported from
 * `use-cases/index.ts`, whose exports ARE the enumerated surface. A module that adds a use case
 * spreads its declaration in here; the gate fails, with no database, naming any export that has
 * none. Enforcement is proved by the behavioural half of that gate: every export, called with a
 * viewer-only context and deps that throw, must answer `not_found` without touching a port — so
 * a table entry that never reaches `authorize` cannot pass CI.
 */
import type { Role } from '../authz/request-context';
import { PROJECT_REACH_ROLES, TENANT_ADMIN_ROLES } from '../authz/authorize';

/** What one use case declares: allowed roles, and whether it names a Project the caller must reach. */
export interface RoleDeclaration {
  readonly roles: readonly Role[];
  /** True when the call names a Project — the helper also checks Project reach. */
  readonly projectScoped: boolean;
}

const adminOnly = {
  roles: TENANT_ADMIN_ROLES,
  projectScoped: false,
} as const satisfies RoleDeclaration;

const projectReach = {
  roles: PROJECT_REACH_ROLES,
  projectScoped: true,
} as const satisfies RoleDeclaration;

/** Project reads and Plan/Mapping writes — `tenant_admin` | `pm` plus Project reach. */
export const PROJECT_USE_CASE_ROLES = {
  getProjectHeader: projectReach,
  getProjectReview: projectReach,
  getProjectMapping: projectReach,
  getClientView: projectReach,
  planTicketsAsWorkPackage: projectReach,
  mapTickets: projectReach,
  mapTicket: projectReach,
  explainTickets: projectReach,
  markChangeRequestCandidates: projectReach,
} as const satisfies Readonly<Record<string, RoleDeclaration>>;

/** Organisation writes — `tenant_admin` only, no Project check. */
export const ORG_USE_CASE_ROLES = {
  createDepartment: adminOnly,
  renameDepartment: adminOnly,
  createProgram: adminOnly,
  renameProgram: adminOnly,
  createProject: adminOnly,
  renameProject: adminOnly,
  reassignProjectProgram: adminOnly,
  reassignProjectDepartment: adminOnly,
} as const satisfies Readonly<Record<string, RoleDeclaration>>;

/** Membership writes — `tenant_admin` only; the lock re-check stays in the writers. */
export const MEMBERSHIP_USE_CASE_ROLES = {
  revokeMembership: adminOnly,
  changeMemberRole: adminOnly,
  assignMemberProject: adminOnly,
  unassignMemberProject: adminOnly,
} as const satisfies Readonly<Record<string, RoleDeclaration>>;

export const USE_CASE_ROLES: Readonly<Record<string, RoleDeclaration>> = {
  ...PROJECT_USE_CASE_ROLES,
  ...ORG_USE_CASE_ROLES,
  ...MEMBERSHIP_USE_CASE_ROLES,
};
