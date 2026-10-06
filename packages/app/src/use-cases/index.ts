// THE USE-CASE SURFACE. Every export of this module is a use case, and the cross-tenant harness
// (`tests/cross-tenant.test.ts`) reads this module's namespace to decide what it must drive:
// an export here with no entry in `tests/read-use-cases.ts` fails the build, naming it, with
// no database running. Reads and writes alike (story 1.2 slice 4 added the writes): a write
// is registered as `kind: 'write'` and driven by `tests/cross-tenant-writes.test.ts`. So
// export use cases from here and nothing else — a helper, a schema or a constant belongs in
// its own module.
//
// Deliberately free of `../config`: a pure use-case test, or the harness, imports this module
// without needing a single environment variable.
export { getProjectHeader } from './get-project-header';
export { getProjectMapping } from './get-project-mapping';
export { getProjectReview } from './get-project-review';
export {
  explainTickets,
  mapTicket,
  mapTickets,
  markChangeRequestCandidates,
  planTicketsAsWorkPackage,
} from './project-writes';
export {
  createMappingRule,
  deleteMappingRule,
  previewMappingRuleChange,
  reorderMappingRules,
  updateMappingRule,
} from './mapping-rules';
export {
  createDepartment,
  createProgram,
  createProject,
  reassignProjectDepartment,
  reassignProjectProgram,
  renameDepartment,
  renameProgram,
  renameProject,
} from './org-writes';
export {
  assignMemberProject,
  changeMemberRole,
  revokeMembership,
  unassignMemberProject,
} from './membership-writes';
export {
  appendProjectDefaultRate,
  appendResourceRate,
  createResource,
} from './resource-writes';
export { listAuditLog } from './list-audit-log';
export { listDepartments, listPrograms, listProjects } from './list-org';
export { changeTenantCurrency } from './tenant-currency';
export { addConnector, rotateCredentials, changeConnectorScope, appendResolvedStatuses } from './connector-writes';
// Ingest gate + credential-failure notify stay off this barrel (composition imports them
// from `@momo/app`); unit tests cover them. Full snapshot writer is story 5.5.
