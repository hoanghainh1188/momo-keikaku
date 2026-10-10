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
export { createLogger, PINO_REDACT_PATHS } from './logger';
export { AUDIT_ACTIONS, AUDIT_PAYLOAD_BY_ACTION, auditPayloadSchema, decodeAuditPayload, isAuditAction } from './audit';
export * from './use-cases';
// The resolver is a runtime value, like the use cases: the composition root calls it once per
// request. It is not on the use-case surface (`./use-cases`), which the harness enumerates.
export { resolveRequestContext, } from './authz/resolve-request-context';
export { MAPPING_RULE_REFUSALS, MAPPING_RULE_TEXT_MAX } from './use-cases/mapping-rule-input';
// The one runtime value besides the use cases and `config`: the Explain note's length bound,
// so the action's truncation and the use case's validation cannot drift apart.
export { EXPLAIN_NOTE_MAX } from './use-cases/project-write-input';
export { linkTrackerAccount, unlinkTrackerAccount } from './use-cases/resource-writes';
export { suggestTrackerAccountLinks, } from '@momo/domain';
export { ADD_CONNECTOR_REFUSALS } from './use-cases/connector-writes';
export { confirmConnectorOwnership } from './use-cases/connector-ownership';
export { INGEST_SNAPSHOT_QUEUE, INGEST_SNAPSHOT_QUEUE_OPTIONS, SNAPSHOT_TICK_CRON, SNAPSHOT_TICK_QUEUE, SNAPSHOT_TICK_SCHEDULE_OPTIONS, } from './ports/ingest-snapshot-queue';
export { APPROVAL_REQUIRED_MESSAGE, APPROVAL_REQUIRED_REASON, CREDENTIAL_AUTH_FAILED_REASON, READ_INCOMPLETE_MESSAGE, READ_INCOMPLETE_REASON, admitScopeRead, credentialFailureMessage, gateIngestApproval, notifyCredentialFailure, recordIncompleteRead, runIngestSnapshotJob, } from './use-cases/connector-ingest';
export { HOURLY_INTERVAL_MS, OFF_WINDOW_INTERVAL_MS, RATE_LIMIT_PACED_MESSAGE, RATE_LIMIT_PACED_REASON, READ_COMPLETE_WRITER_PENDING_MESSAGE, READ_COMPLETE_WRITER_PENDING_REASON, SEARCH_BUDGET_SLOWDOWN_MESSAGE, dueWatermark, estimateSearchCalls, exceedsSearchBudget, getSnapshotPinState, isConnectorDue, listSnapshotAttempts, nextScheduledAt, rateLimitStartAfter, requestSnapshotRefresh, selectDueConnectors, snapshotScheduleCalendar, } from './use-cases/connector-schedule';
// Story 2.10 fence surface — outside the use-cases barrel (role/audit gates enumerate it via a
// second module list — Epic 2 retro F10 / Q1→B).
export { applyPlanChange, planMutationSchema, } from './schedule/apply-plan-change';
export { completeWorkPackage, deleteWorkPackage, getFirstObservedActivity, getPlanThinUiState, getWpDeleteConfirm, proposedCompleteDay, refuseDerivedDateEdit, setProjectStart, clearProjectStart, patchProjectFinishSetting, patchDataDateSetting, dataDateAdvancePreview, DERIVED_DATE_TEACHING, PROJECT_FINISH_TEACHING, NO_PROJECT_START_YET, } from './schedule/plan-edit';
export { getPlanGridState, actorUserIdOf, formatPlanDate, formatPlanDateShort, formatPlanDateLong, formatConstraintLabel, formatPredecessorsText, floatAnchorHeader, floatAnchorSentence, minFloatFromRows, formatMinFloat, speakFloat, formatRelativeAgo, buildWhatMovedBand, stripDerivedScalars, emptyExceptionsRail, calendarRangeHaltBanner, buildExceptionsRail, inkTone, formatFloatDisplay, recordedPctDisplay, resolveException, SUMMARY_NA_LABEL, } from './schedule/plan-grid';
export { parsePredecessorsText, diffPredecessorEdges, replaceSuccessorEdges, explainGraphOffences, explainProposedGraphRefuse, filterLeafCandidates, } from './schedule/predecessors';
export { applyPredecessorSet } from './schedule/apply-predecessor-set';
// Story 2.12 calendar publish surface — outside the use-cases barrel (role/audit gates
// enumerate it via a second module list — Epic 2 retro F10 / Q1→B).
export { publishCalendarVersion, publishCalendarVersionFanOut, patchNationalCalendarFlags, addProjectNonWorkingDay, removeProjectNonWorkingDay, } from './calendar/publish-calendar-version';
// Story 4.1 / 4.3 Baseline writers — outside the use-cases barrel (F10 second module list).
export { setBaseline, FIRST_SET_REASON, } from './baseline/set-baseline';
export { reBaseline, } from './baseline/re-baseline';
export { getBaselineSetState, getReBaselineState, } from './baseline/set-baseline-state';
export { reDerivePinnedBaseline, } from './baseline/re-derive-pinned';
export { compareBaselineVersions, } from './baseline/compare-baseline-versions';
