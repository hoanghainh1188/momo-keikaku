// `packages/app` is the application layer: use cases, ports, RequestContext,
// authorisation, audit and configuration. Inbound adapters (`apps/web`,
// `apps/worker`) may call only what this barrel exposes.
//
// Story 1.2 slice 3 brings the first use cases: the two project reads, the port they depend
// on, and the `Result` they return. Slice 4 adds the five project writes and their port. The
// web → domain/present edge (2026-09-21) adds the Client View and Mapping reads, so no page
// computes from the domain. Story 2.2 removes the Client View read with the demo spike's page.
// Story 1.3 slice 1 adds the audit mechanism (`./audit`) and the tenant transaction the writes
// run in; slice 2 generalises the write deps (`AuditedWriteDeps`, `WriteDeps`), adds the Clock and
// id ports, and the eight organisation writes. Story 1.4 slice 1 adds the `RequestContext` and
// its resolver (`./authz`), the identity and membership ports, and the auth configuration keys;
// slice 2 the four audited membership writes and the bridge's write port. Story 1.5 adds the
// declared-roles helper (`./authz/authorize`) every use case runs before its work.
//
// `./use-cases` does not import `./config`, so code that needs the use cases and not the
// configuration can import `packages/app/src/use-cases` directly. `config` is lazy (a getter
// per key), so importing this barrel reads no environment either.
//
// The result and port modules cross this barrel as TYPES only. Their runtime helpers — `ok`,
// `fail`, `isProjectNotFound`, the message-key table — are how a use case builds its answer,
// and an inbound adapter that could call them could fabricate one.
export * from './config';
export { createLogger, PINO_REDACT_PATHS, type Logger } from './logger';
export type { AppError, AppErrorCode, AppErrorMessageKey, Result } from './result';
export type {
  ProjectBundle,
  ProjectReadDeps,
  ProjectReadPort,
  ProjectReview,
} from './ports/project-read';
export type {
  ChangeRequestCandidateCommand,
  ExplainDispositionCommand,
  ManualMappingCommand,
  MapDispositionCommand,
  PlanDispositionCommand,
  ProjectWriteDeps,
  ProjectWriteRepository,
  ProjectWriteScope,
} from './ports/project-write';
export type { AuditedWriteDeps, WriteStamp } from './ports/audited-write';
export type { Clock } from './ports/clock';
export type { IdGenerator } from './ports/ids';
export type { MailerPort, MailMessage } from './ports/mailer';
export type {
  DepartmentRow,
  NewProjectRow,
  OrgRepository,
  OrgWriteDeps,
  OrgWriteScope,
  ProgramRow,
  ProjectPlacementRow,
} from './ports/org-write';
export type {
  LockedMemberRow,
  MembershipWriteDeps,
  MembershipWriteRepository,
  MembershipWriteScope,
} from './ports/membership-write';
export type { WriteDeps, WriteScope } from './ports/write-deps';
export type { Created } from './use-cases/org-writes';
export type { TenantTransaction } from './ports/tenant-transaction';
// Audit crosses as TYPES plus the closed action enum and payload decode helpers the Admin
// filter UI and the write harness need. `audit.record` stays a use case's to call inside its
// own transaction — never an inbound adapter's.
export type { AuditAction, AuditEntry, AuditSink } from './audit';
export { AUDIT_ACTIONS, AUDIT_PAYLOAD_BY_ACTION, auditPayloadSchema, decodeAuditPayload, isAuditAction } from './audit';
export * from './use-cases';
export type { Locale, RequestContext, Role } from './authz/request-context';
// The resolver is a runtime value, like the use cases: the composition root calls it once per
// request. It is not on the use-case surface (`./use-cases`), which the harness enumerates.
export {
  resolveRequestContext,
  type NoAccessEvent,
  type NoAccessReason,
  type RequestContextResolution,
  type ResolveRequestContextDeps,
} from './authz/resolve-request-context';
export type { IdentityPort, IdentityUser, SessionIdentity } from './ports/identity';
export type {
  AuditLogEntry,
  AuditLogPage,
  ListAuditLogInput,
} from './use-cases/list-audit-log';
export type {
  AuditLogFilters,
  AuditLogReadDeps,
  AuditLogReadPort,
  AuditLogRow,
} from './ports/audit-log-read';
export type {
  DepartmentListPage,
  ProgramListPage,
  ProjectListPage,
} from './use-cases/list-org';
export type {
  DepartmentListRow,
  OrgReadDeps,
  OrgReadPort,
  ProgramListRow,
  ProjectListRow,
} from './ports/org-read';
export type { MembershipReader, MembershipRecord } from './ports/membership';
export type {
  MappingRuleRow,
  MappingTicketRow,
  MappingWorkPackage,
  ProjectMapping,
} from './use-cases/get-project-mapping';
export type { ProjectInput } from './use-cases/project-input';
// The one runtime value besides the use cases and `config`: the Explain note's length bound,
// so the action's truncation and the use case's validation cannot drift apart.
export { EXPLAIN_NOTE_MAX } from './use-cases/project-write-input';
export type {
  ChangeRequestCandidatesInput,
  ExplainTicketsInput,
  MapTicketInput,
  MapTicketsInput,
  PlanTicketsInput,
} from './use-cases/project-write-input';
export type {
  CreateDepartmentInput,
  CreateProgramInput,
  CreateProjectInput,
  ReassignProjectDepartmentInput,
  ReassignProjectProgramInput,
  RenameDepartmentInput,
  RenameProgramInput,
  RenameProjectInput,
} from './use-cases/org-input';
export type {
  AssignMemberProjectInput,
  ChangeMemberRoleInput,
  RevokeMembershipInput,
  UnassignMemberProjectInput,
} from './use-cases/membership-input';
export type {
  AppendProjectDefaultRateInput,
  AppendResourceRateInput,
  CreateResourceInput,
} from './use-cases/resource-input';
export type { ChangeTenantCurrencyInput, TenantCurrencyDeps } from './use-cases/tenant-currency';

// Story 2.10 fence surface — outside the use-cases barrel (role/audit gates enumerate it via a
// second module list — Epic 2 retro F10 / Q1→B).
export {
  applyPlanChange,
  planMutationSchema,
  type ApplyPlanChangeDeps,
  type ApplyPlanChangeResult,
  type PlanMutation,
} from './schedule/apply-plan-change';
export {
  completeWorkPackage,
  deleteWorkPackage,
  getFirstObservedActivity,
  getPlanThinUiState,
  getWpDeleteConfirm,
  proposedCompleteDay,
  refuseDerivedDateEdit,
  setProjectStart,
  clearProjectStart,
  patchProjectFinishSetting,
  patchDataDateSetting,
  dataDateAdvancePreview,
  DERIVED_DATE_TEACHING,
  PROJECT_FINISH_TEACHING,
  NO_PROJECT_START_YET,
} from './schedule/plan-edit';
export {
  getPlanGridState,
  actorUserIdOf,
  formatPlanDate,
  formatPlanDateShort,
  formatPlanDateLong,
  formatConstraintLabel,
  formatPredecessorsText,
  floatAnchorHeader,
  floatAnchorSentence,
  minFloatFromRows,
  formatMinFloat,
  speakFloat,
  formatRelativeAgo,
  buildWhatMovedBand,
  stripDerivedScalars,
  emptyExceptionsRail,
  calendarRangeHaltBanner,
  buildExceptionsRail,
  inkTone,
  formatFloatDisplay,
  recordedPctDisplay,
  resolveException,
  SUMMARY_NA_LABEL,
  type PlanGridState,
  type PlanGridRow,
  type PlanGridException,
  type PlanGridLeafCandidate,
  type PlanGridPredecessorEdge,
  type PlanExceptionsRail,
  type PlanExceptionsRailViolation,
  type PlanExceptionsRailOos,
  type PlanExceptionsRailNotSchedulable,
  type PlanExceptionsRailChainEntry,
  type WhatMovedBand,
  type WhatMovedCauseGroup,
  type WhatMovedEntry,
} from './schedule/plan-grid';
export {
  parsePredecessorsText,
  diffPredecessorEdges,
  replaceSuccessorEdges,
  explainGraphOffences,
  explainProposedGraphRefuse,
  filterLeafCandidates,
  type ParsedPredecessor,
  type LivePredecessorEdge,
  type PredecessorFenceMutation,
  type LeafCandidate,
} from './schedule/predecessors';
export { applyPredecessorSet } from './schedule/apply-predecessor-set';

export {
  publishCalendarVersion,
  publishCalendarVersionFanOut,
  patchNationalCalendarFlags,
  addProjectNonWorkingDay,
  removeProjectNonWorkingDay,
  type PublishCalendarResult,
  type FanOutProjectResult,
} from './calendar/publish-calendar-version';
