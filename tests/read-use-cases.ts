/**
 * The read surface, enumerated mechanically.
 *
 * NFR-S1 asks that tenant isolation be tested automatically, and epic 1's requirement is
 * sharper than that: the harness must enumerate the read use cases MECHANICALLY, so a new
 * one is covered the day it is written rather than the day somebody remembers to add it to
 * a list. This file is that enumeration. `tests/cross-tenant.test.ts` drives it.
 *
 * HOW THE ENUMERATION IS MECHANICAL. `readSurfaceFunctionNames()` reads the exported
 * FUNCTIONS off the read surface's module namespace — not a hand-written list — and the
 * harness fails, with no database, naming any export that has no entry below. Adding an
 * exported read and forgetting the entry is therefore a red build, not a silent gap.
 *
 * WHERE THE READ SURFACE IS. Since story 1.2 slice 3 it is `packages/app`'s use cases —
 * `packages/app/src/use-cases/index.ts`, whose every export is a use case. Every page in
 * `apps/web` reaches its data through them, by way of the composition root
 * (`apps/web/src/server/composition.ts`). Until that slice the pointer below named
 * `packages/db/src/repo.ts`; moving it was, as planned, a change of one import, one module
 * name and the `invoke` signature, and every assertion followed it unchanged.
 *
 * Driving the USE CASES rather than the repository buys one thing the repository-level
 * enumeration could not prove: that a use case has not WIDENED what the repository returns.
 * A use case that swallowed the repository's failure and answered with a default would look,
 * at repository level, like nothing at all — here it fails the completeness assertions (an
 * own-Tenant read) or the not_found assertion (a foreign Project id).
 *
 * THE WRITES ARE ON IT TOO. Since story 1.2 slice 4 the same module exports the five project
 * write use cases (FR-29's Dispositions and FR-21's manual Mapping), which used to live in
 * `apps/web/src/app/actions.ts` with two reads of their own on a private `withTenant`. They
 * are registered below as `kind: 'write'`, so the same no-database gate names a write
 * exported with no entry, and `tests/cross-tenant-writes.test.ts` drives every one: a
 * foreign-Tenant write must answer `not_found` and land nothing in any tenant-owned table, and
 * an own-Tenant write must land exactly the rows the action always wrote. `scripts/peek-db.ts`
 * still calls the repository directly; it is tooling, not an inbound adapter.
 *
 * WHY THIS LIVES IN `tests/`. It needs `@momo/app`'s use cases, `@momo/db`'s repository and
 * the wiring between them at once, which makes the harness a composition root of its own. A
 * suite spanning layers belongs to none of them.
 */
import type { ProjectReadDeps } from '../packages/app/src/ports/project-read';
import type { AuditLogReadDeps } from '../packages/app/src/ports/audit-log-read';
import type { OrgReadDeps } from '../packages/app/src/ports/org-read';
import type { WriteDeps } from '../packages/app/src/ports/write-deps';
import * as readSurface from '../packages/app/src/use-cases';
import type { Db } from '../packages/db/src/client';
import type { DemoState } from '../packages/db/src/fixtures';
import { tenantCurrencyOn } from '../packages/db/src/repo-tenant-currency';
import { adminContextFor, pmContextFor } from './request-context';

/** What the harness wires for every read invoke — project reads, audit, and org lists. */
export type HarnessReadDeps = ProjectReadDeps<Db> & AuditLogReadDeps<Db> & OrgReadDeps<Db>;

/** Named in failure messages, so the reader is sent to the file rather than to a diff. */
export const READ_SURFACE_MODULE = 'packages/app/src/use-cases/index.ts';

/** This file, named in the same messages. */
export const REGISTRY_MODULE = 'tests/read-use-cases.ts';

/** What a use case is invoked against: one Tenant, one Project — as one user. */
export interface UseCaseTarget {
  readonly tenantId: string;
  readonly projectId: string;
  /** The signed-in user the context names (story 1.4); the harness's own when absent. */
  readonly userId?: string;
}

/**
 * The RequestContext a project-scoped registry entry calls with (story 1.5): a PM that reaches
 * the target Project, so the role gate passes and a foreign id still reaches RLS rather than
 * being refused as "unassigned".
 */
function contextOf(target: UseCaseTarget) {
  return pmContextFor(target.tenantId, target.projectId, target.userId);
}

/**
 * The context membership and organisation writes are called with (story 1.5): a Tenant Admin,
 * because they refuse anyone else with `not_found` before looking at anything — a PM context
 * would make the foreign-Tenant assertion pass without ever reaching the target lookup. The
 * caller must also hold a `tenant_admin` membership in the Tenant it acts in (the harnesses give
 * it one), because membership writers re-check that against the bridge inside their transaction.
 */
function adminContextOf(target: UseCaseTarget) {
  return adminContextFor(target.tenantId, target.userId);
}

/**
 * What one write invocation is given: the Tenant it runs as, the Project it names, and ids to
 * put in the command. The ids come from the Project's OWN Tenant's fixture — for the
 * cross-Tenant probe too, which is the id-from-a-URL shape: a foreign Tenant replaying ids it
 * has seen.
 */
export interface WriteTarget extends UseCaseTarget {
  /** Two Ticket ids of the Project's Tenant. The single-Ticket write uses the first. */
  readonly ticketIds: readonly [string, string];
  /** A leaf Work Package of the Project's Tenant. */
  readonly wpId: string;
  /** The Project's owning Department (story 1.3 slice 2). */
  readonly departmentId: string;
  /** A Program of that Department — the one the Project sits in, in the fixture. */
  readonly programId: string;
  /** A Resource of the Tenant (story 1.6) — what `appendResourceRate` names. */
  readonly resourceId: string;
  /**
   * A member of the Project's Tenant for the membership writes to change (story 1.4 slice 2): the
   * probe's PM, a `pm` holding `staleProjectId` and not the Project — so promoting, assigning the
   * Project and unassigning the stale id each change something from the starting state, and
   * revoking comes last.
   */
  readonly memberUserId: string;
  /** A Project id the member holds whose Project does not exist — what an unassign removes. */
  readonly staleProjectId: string;
  /**
   * A Tenant Admin of the Project's Tenant other than the caller — what the audit gate's admin
   * demotion and admin revocation (`moreWrites`) target. The caller stays an admin, so neither is
   * ever the last admin.
   */
  readonly secondAdminUserId: string;
  /** The Project's fixture Connector id (story 5.2 rotate / change-scope). */
  readonly connectorId: string;
  /**
   * The Project's two fixture Mapping Rules, priority order (story 5.10) — what the rule writes
   * edit, delete and reorder.
   */
  readonly rules: readonly [WriteTargetRule, WriteTargetRule];
}

/** One fixture Mapping Rule, as the rule writes name it. */
export interface WriteTargetRule {
  readonly id: string;
  readonly wpId: string;
  readonly matchField: 'milestone' | 'category' | 'issueType' | 'parent' | 'keyPattern';
  readonly matchValue: string;
}

/** How a write is driven: the deps its caller chose, and the target's ids. */
export type InvokeWrite = <Handle>(deps: WriteDeps<Handle>, target: WriteTarget) => Promise<unknown>;

/**
 * What the export is, and so how the harness drives it.
 *
 * `read` is driven by `tests/cross-tenant.test.ts`, `write` by
 * `tests/cross-tenant-writes.test.ts`. `not-a-read` exists so that a future export that is
 * neither (a health check) can be registered with a stated reason rather than silently
 * omitted — the point of the gate is that every export is ACCOUNTED FOR.
 */
export type UseCaseKind = 'read' | 'write' | 'not-a-read';

export interface ReadUseCase {
  /** Must equal an exported function name of the read surface. Asserted, not assumed. */
  readonly name: string;
  readonly kind: UseCaseKind;
  /** Why this entry is classed as it is, and what it reads. One line, for the next reader. */
  readonly why: string;
  /** Required when `kind` is `not-a-read`: why the harness does not drive it. */
  readonly reason?: string;
  /**
   * How the harness invokes it. Required for a `read`.
   *
   * Given the port already wired to the RESTRICTED role's handle, so the harness decides the
   * role and the entry decides only how to call its use case. It returns whatever the use
   * case returns — a `Result` — and the harness, not the entry, unwraps it: an entry that
   * unwrapped its own result could turn an error arm into a value on the way out.
   *
   * Deps may carry more than `ProjectReadDeps` (story 1.7's audit-log read adds its own
   * port and identity lookup); project reads ignore the extras.
   */
  readonly invoke?: (deps: HarnessReadDeps, target: UseCaseTarget) => Promise<unknown>;
  /**
   * How the cross-Tenant probe (B's context naming A's Project id) must answer.
   * Default `'not_found'` for project-scoped reads. Tenant-wide reads that ignore `projectId`
   * set `'own-tenant-ok'`: they return the caller's own Tenant's rows and never A's.
   */
  readonly crossTenant?: 'not_found' | 'own-tenant-ok';
  /**
   * The fixture values this use case's result MUST carry. Required for a `read`.
   *
   * This is the absolute floor under the harness's completeness assertions, and it exists
   * because the relative ones have a blind spot: comparing a probe Tenant's result against
   * the demo Tenant's catches a read that lost data for ONE Tenant, and comparing the two
   * probes against each other catches an asymmetry — but a read that lost the same field
   * for EVERY Tenant (a select issued on the bare handle, outside the tenant scope, which
   * returns nothing as the restricted role) is symmetric, and both comparisons pass.
   * Measured on 2026-09-21: that sabotage left all sixteen assertions green until this
   * floor was added.
   *
   * It is a function of the fixture rather than a list of strings, so it grows with the
   * fixture instead of going stale beside it.
   */
  readonly mustSurface?: (state: DemoState) => string[];
  /**
   * The floor under "the demo Tenant's result carries labelled data at all", when this read's
   * result is legitimately smaller than the harness's default of 100 relabelled strings. State
   * why beside it: a floor lowered to make a test pass is a gate removed.
   */
  readonly minimumLabels?: number;
  /**
   * How the harness invokes a `write`. Required for one, forbidden otherwise.
   *
   * Given the write deps chosen by the caller, for the same reason as `invoke`: the caller
   * decides the transaction and the role, the entry decides only how to build its command. It
   * returns the use case's `Result` untouched. Generic in the handle, because two callers drive
   * it: the write harness (the RESTRICTED role's handle and `packages/db`'s tenant transaction)
   * and the audit gate (`tests/audited-use-cases.test.ts`, a fake transaction, no database).
   */
  readonly invokeWrite?: InvokeWrite;
  /**
   * FURTHER inputs the audit gate drives, beside `invokeWrite` — one per branch that records a
   * different action (story 1.3 slice 2, resolving slice 1's E2). The gate requires every action
   * a use case declares to be recorded by at least one of its invocations, so a branch that skips
   * `audit.record` cannot hide behind the branch the registry happens to drive.
   */
  readonly moreWrites?: readonly InvokeWrite[];
  /**
   * Set, with the reason, on a write that names NO existing row — it creates in the caller's own
   * Tenant from nothing but a name (`createDepartment`). There is no foreign id for another Tenant
   * to replay, so the write harness asserts instead that it lands in the caller's Tenant only and
   * nothing in the other. Every other write must answer `not_found` to a foreign id.
   */
  readonly namesNoExistingRow?: string;
  /**
   * Set, with the reason, on a write that refuses once any Rate exists. Probe Tenants already
   * have Rates, so the harness asserts the refusal and that nothing lands — it cannot drive the
   * success path, and the write is not on the audit-rollback pair.
   */
  readonly refusesWhenAnyRate?: string;
  /**
   * Set when the probe Project already has a Connector, so `addConnector` refuses
   * `invalid_input` / `connector_exists`. Dedicated connector tests cover the success path.
   */
  readonly refusesWhenConnectorExists?: string;
}

/**
 * Everything a Project bundle must carry, read out of the fixture.
 *
 * The two bundle reads (`getProjectHeader`, `getProjectReview`) return the same bundle, so
 * both declare this. A read that legitimately returns less declares its own, as the Mapping
 * surface does below — which is the point of putting it on
 * the entry rather than in the harness: "this use case returns less" becomes a statement
 * somebody writes down, not a gap nobody notices.
 *
 * Deliberately absent: `resource.role` and the Tenant's own id, because `ProjectBundle`
 * carries neither — a required value the read surface never returns would be a
 * permanently red gate, which is the same as no gate. The department's id IS required:
 * `meta` carries only its name, but every Resource carries `departmentId`.
 */
export function projectBundleLabels(state: DemoState): string[] {
  const f = state.fixture;
  const latest = state.snapshots[state.snapshots.length - 1];
  return [
    ...new Set([
      f.tenant.name,
      f.department.id,
      f.department.name,
      f.project.id,
      f.project.name,
      f.project.clientName,
      // No Baseline id or reason: the seed writes no Baseline (story 2.1, decision 2-A), so no
      // bundle can carry one until Epic 4 records Baselines against a schedule_run.
      ...f.resources.flatMap((r) => [r.id, r.name, r.accountId]),
      ...f.wps.flatMap((w) => [w.id, w.wbsCode, w.name]),
      ...f.mappingRules.flatMap((r) => [r.id, r.name]),
      ...(latest ? [latest.snapshotId] : []),
      ...(latest?.tickets ?? []).flatMap((t) => [
        t.trackerIssueId,
        t.key,
        t.title,
        t.statusId,
        t.issueTypeId,
        ...t.attributes.map((a) => a.id),
        ...(t.assigneeAccountId === null ? [] : [t.assigneeAccountId]),
      ]),
      ...state.ledger.flatMap((e) => [
        e.ticketId,
        ...(e.assigneeAccountId === null ? [] : [e.assigneeAccountId]),
      ]),
      ...state.mappingEvents.flatMap((m) => [
        m.ticketId,
        m.actor,
        ...(m.wpId === null ? [] : [m.wpId]),
      ]),
    ]),
  ];
}

/**
 * What the Mapping surface must carry: every leaf, non-milestone Work Package (the targets a
 * Ticket can be mapped to) and every Mapping Rule.
 *
 * Its Tickets are NOT required one by one: the surface lists only the sixty carrying the most
 * hours, and restating that selection here would be the use case again rather than a floor
 * under it. They are still covered — the relative assertions compare them against the demo
 * Tenant's own result, label for label.
 */
export function projectMappingLabels(state: DemoState): string[] {
  return [
    ...new Set([
      ...state.wps
        .filter((w) => w.isLeaf && !w.isMilestone)
        .flatMap((w) => [w.id, w.wbsCode, w.name]),
      ...state.fixture.mappingRules.flatMap((r) => [r.id, r.name]),
    ]),
  ];
}

/**
 * What the audit-log reader must surface from the seed row: the Project id (target). Action
 * `demo.seed` is a literal outside the relabel map, so it is not required via decode.
 */
export function auditLogLabels(state: DemoState): string[] {
  return [state.fixture.project.id];
}

/** Department id + name from the seed fixture (story 2.17 listDepartments). */
export function departmentListLabels(state: DemoState): string[] {
  return [state.fixture.department.id, state.fixture.department.name];
}

/** Program id + name + owning Department name (story 2.17 listPrograms). */
export function programListLabels(state: DemoState): string[] {
  return [
    state.fixture.program.id,
    state.fixture.program.name,
    state.fixture.department.name,
  ];
}

/** Project id + name + parent Department / Program names (story 2.17 listProjects). */
export function projectListLabels(state: DemoState): string[] {
  return [
    state.fixture.project.id,
    state.fixture.project.name,
    state.fixture.department.name,
    state.fixture.program.name,
  ];
}

/**
 * Every export of the use-case surface, reads and writes alike. (The name predates the writes;
 * `kind` is what tells them apart.)
 */
export const READ_USE_CASES: readonly ReadUseCase[] = [
  {
    name: 'getProjectHeader',
    kind: 'read',
    why:
      'The Project bundle behind the project frame (apps/web p/[projectId]/layout.tsx): ' +
      'repo.ts loadProjectBundle, 15 selects across 15 of the 18 tables, FOUR of them with ' +
      'no WHERE clause at all (baseline_wp, rate_entry, tracker_snapshot, ' +
      'actuals_ledger_entry), so row-level security is their only filter. Two of those four ' +
      'are then re-filtered in memory, which is why table-level isolation is asserted ' +
      'separately — see tests/cross-tenant.test.ts.',
    invoke: (deps, target) =>
      readSurface.getProjectHeader(
        deps,
        contextOf(target),
        { projectId: target.projectId },
      ),
    mustSurface: projectBundleLabels,
  },
  {
    name: 'getProjectReview',
    kind: 'read',
    why:
      'The Reconciliation Review behind the six project pages: the same bundle plus ' +
      'computeReview over it (repo.ts loadReview). Driven separately because its result ' +
      'graph is much larger — EVM per Work Package, attribution Maps keyed by Work Package ' +
      'and Ticket id, the unmapped groups — and a leak reaching only the computed half would ' +
      'be invisible in the bundle.',
    invoke: (deps, target) =>
      readSurface.getProjectReview(
        deps,
        contextOf(target),
        { projectId: target.projectId },
      ),
    mustSurface: projectBundleLabels,
  },
  {
    name: 'getProjectMapping',
    kind: 'read',
    why:
      'The Mapping surface (apps/web p/[projectId]/mapping): repo.ts loadReview, then the ' +
      'current Mapping head joined to the pinned snapshot\'s Tickets, their hours and the ' +
      'Work Package labels, top sixty by hours. The join runs over mapping_event and the ' +
      'snapshot, so a foreign row surviving the load would surface here as a Ticket or a label.',
    invoke: (deps, target) =>
      readSurface.getProjectMapping(
        deps,
        contextOf(target),
        { projectId: target.projectId },
      ),
    mustSurface: projectMappingLabels,
  },
  {
    name: 'listAuditLog',
    kind: 'read',
    why:
      'The Tenant Admin audit-log reader (story 1.7): packages/db repo-audit listAuditLog ' +
      'inside withTenant over audit_log. Tenant-wide — ignores projectId. Admin context so ' +
      'the role gate passes; cross-Tenant probe expects own-tenant rows, not not_found.',
    crossTenant: 'own-tenant-ok',
    invoke: (deps, target) =>
      readSurface.listAuditLog(deps, adminContextOf(target), {}),
    mustSurface: auditLogLabels,
    // Seed writes one audit row; originalsIn finds the Project id only (demo.seed is outside
    // the fixture universe). Floor 0: toBeGreaterThan(0) still requires at least one label.
    minimumLabels: 0,
  },
  {
    name: 'listDepartments',
    kind: 'read',
    why:
      'Story 2.17 Organisation Admin: packages/db repo-org-list listDepartments inside ' +
      'withTenant over department. Tenant-wide Admin list; cross-Tenant probe expects ' +
      'own-tenant rows.',
    crossTenant: 'own-tenant-ok',
    invoke: (deps, target) =>
      readSurface.listDepartments(deps, adminContextOf(target)),
    mustSurface: departmentListLabels,
    // Fixture has one Department — few labels; floor 0 like listAuditLog.
    minimumLabels: 0,
  },
  {
    name: 'listPrograms',
    kind: 'read',
    why:
      'Story 2.17 Organisation Admin: packages/db repo-org-list listPrograms joins program ' +
      'to department. Removes program from UNREACHED_TENANT_OWNED_TABLES. Own-tenant-ok.',
    crossTenant: 'own-tenant-ok',
    invoke: (deps, target) =>
      readSurface.listPrograms(deps, adminContextOf(target)),
    mustSurface: programListLabels,
    minimumLabels: 0,
  },
  {
    name: 'listProjects',
    kind: 'read',
    why:
      'Story 2.17 Organisation Admin: packages/db repo-org-list listProjects joins project ' +
      'to department and left-joins program. Own-tenant-ok.',
    crossTenant: 'own-tenant-ok',
    invoke: (deps, target) =>
      readSurface.listProjects(deps, adminContextOf(target)),
    mustSurface: projectListLabels,
    minimumLabels: 0,
  },
  {
    name: 'mapTickets',
    kind: 'write',
    why:
      'FR-29 Map (was actions.ts mapTickets): one mapping_event per Ticket, a disposition_event ' +
      'and an audit_log row, in one withTenant transaction after reading project for its anchor.',
    invokeWrite: (deps, target) =>
      readSurface.mapTickets(
        deps,
        contextOf(target),
        { projectId: target.projectId, wpId: target.wpId, ticketIds: target.ticketIds },
      ),
  },
  {
    name: 'planTicketsAsWorkPackage',
    kind: 'write',
    why:
      'FR-29 Plan (was actions.ts planTickets): reads project and the Project\'s work_package ' +
      'rows, inserts a new work_package, then the mapping_events, disposition_event and audit_log.',
    invokeWrite: (deps, target) =>
      readSurface.planTicketsAsWorkPackage(
        deps,
        contextOf(target),
        { projectId: target.projectId, name: 'Harness Plan', ticketIds: target.ticketIds },
      ),
  },
  {
    name: 'explainTickets',
    kind: 'write',
    why:
      'FR-29 Explain (was actions.ts explainTickets): a disposition_event carrying the note and ' +
      'an audit_log row, after reading project for its anchor.',
    invokeWrite: (deps, target) =>
      readSurface.explainTickets(
        deps,
        contextOf(target),
        { projectId: target.projectId, note: 'Harness note.', ticketIds: target.ticketIds },
      ),
  },
  {
    name: 'markChangeRequestCandidates',
    kind: 'write',
    why:
      'FR-29 Change Request candidate (was actions.ts crCandidate): a disposition_event and an ' +
      'audit_log row, after reading project for its anchor.',
    invokeWrite: (deps, target) =>
      readSurface.markChangeRequestCandidates(
        deps,
        contextOf(target),
        { projectId: target.projectId, ticketIds: target.ticketIds },
      ),
  },
  {
    name: 'mapTicket',
    kind: 'write',
    why:
      'FR-21 manual Mapping (was actions.ts mapSingleTicket): one manual mapping_event and an ' +
      'audit_log row, after reading project for its anchor. The unmap arm is asserted separately.',
    invokeWrite: (deps, target) =>
      readSurface.mapTicket(
        deps,
        contextOf(target),
        { projectId: target.projectId, ticketId: target.ticketIds[0], wpId: target.wpId },
      ),
    moreWrites: [
      // The unmap branch, which records `mapping.unmap`.
      (deps, target) =>
        readSurface.mapTicket(
          deps,
          contextOf(target),
          { projectId: target.projectId, ticketId: target.ticketIds[0], wpId: '' },
        ),
    ],
  },
  // --- Story 5.10: Mapping Rules authored by the PM ------------------------------------------------
  {
    name: 'previewMappingRuleChange',
    kind: 'read',
    why:
      'UX-DR22 move preview (read-only): repo-mapping-rules loadRuleEvaluation — live mapping_rule ' +
      'rows, the latest ticket_observation per in-scope ticket, mapping_event heads, ledger hours ' +
      'from hours Connectors — then the domain previewRuleChange. Driven as "delete the first ' +
      'rule", whose id it reads off getProjectMapping first (rule ids are relabelled per probe).',
    invoke: async (deps, target) => {
      const mapping = await readSurface.getProjectMapping(deps, contextOf(target), {
        projectId: target.projectId,
      });
      if (!mapping.ok) return mapping;
      const first = mapping.value.rules[0];
      if (!first) throw new Error(`${target.tenantId}'s Project has no Mapping Rule to preview`);
      return readSurface.previewMappingRuleChange(deps, contextOf(target), {
        projectId: target.projectId,
        change: { kind: 'delete', ruleId: first.id },
      });
    },
    mustSurface: (state) => {
      const first = [...state.fixture.mappingRules].sort((a, b) => a.priority - b.priority)[0];
      return first ? [first.wpId] : [];
    },
    // The preview carries only the Tickets the first rule holds and the WP they leave — a few
    // dozen labels, not the bundle's hundreds. Floor 0: at least one label is still required.
    minimumLabels: 0,
  },
  {
    name: 'reorderMappingRules',
    kind: 'write',
    why:
      'Story 5.10 / UX-DR22: renumbers the live mapping_rule priorities 1..n in the given order ' +
      '(the two fixture rules swapped), re-evaluates under the Project lock (mapping_event + ' +
      'mapping_head only on change) and records mapping.rule_reorder. Registered before the other ' +
      'rule writes so the live set is still exactly the fixture\'s two rules.',
    invokeWrite: (deps, target) =>
      readSurface.reorderMappingRules(deps, contextOf(target), {
        projectId: target.projectId,
        orderedRuleIds: [target.rules[1].id, target.rules[0].id],
      }),
  },
  {
    name: 'updateMappingRule',
    kind: 'write',
    why:
      'Story 5.10 / FR-22: edits a live mapping_rule in place (renamed, moved to an unused ' +
      'priority, same target and condition), re-evaluates, records mapping.rule_update.',
    invokeWrite: (deps, target) =>
      readSurface.updateMappingRule(deps, contextOf(target), {
        projectId: target.projectId,
        ruleId: target.rules[0].id,
        name: 'Harness rule renamed',
        priority: 100,
        wpId: target.rules[0].wpId,
        matchField: target.rules[0].matchField,
        matchValue: target.rules[0].matchValue,
      }),
  },
  {
    name: 'createMappingRule',
    kind: 'write',
    why:
      'Story 5.10 / FR-22: inserts a mapping_rule (id from the id port) whose key pattern matches ' +
      'no Ticket, re-evaluates (nothing moves), records mapping.rule_create.',
    invokeWrite: (deps, target) =>
      readSurface.createMappingRule(deps, contextOf(target), {
        projectId: target.projectId,
        name: 'Harness rule',
        priority: 50,
        wpId: target.wpId,
        matchField: 'keyPattern',
        matchValue: 'ZZ-NOMATCH-*',
      }),
  },
  {
    name: 'deleteMappingRule',
    kind: 'write',
    why:
      'Story 5.10 / FR-22: soft-deletes a live mapping_rule (deleted_at), re-evaluates — the ' +
      'Tickets it held leave for Unmapped, each a rule event naming it — records mapping.rule_delete.',
    invokeWrite: (deps, target) =>
      readSurface.deleteMappingRule(deps, contextOf(target), {
        projectId: target.projectId,
        ruleId: target.rules[1].id,
      }),
  },
  // --- FR-1's organisation writes (story 1.3 slice 2; story 1.5: tenant_admin only) -------------
  {
    name: 'createDepartment',
    kind: 'write',
    why: 'FR-1: inserts a department (id from the id port) and an audit_log row, Clock-stamped.',
    invokeWrite: (deps, target) =>
      readSurface.createDepartment(deps, adminContextOf(target), { name: 'Harness Department' }),
    namesNoExistingRow:
      'It takes a name and nothing else, and creates in ctx.tenantId: there is no id a foreign ' +
      'Tenant could replay, so the probe asserts the row lands for the caller and nothing for the other.',
  },
  {
    name: 'renameDepartment',
    kind: 'write',
    why: 'FR-1: reads the department, updates its name, audits { before, after }.',
    invokeWrite: (deps, target) =>
      readSurface.renameDepartment(
        deps,
        adminContextOf(target),
        { departmentId: target.departmentId, name: 'Harness Department renamed' },
      ),
  },
  {
    name: 'createProgram',
    kind: 'write',
    why: 'FR-1: reads the department, inserts a program in it, audits { departmentId, name }.',
    invokeWrite: (deps, target) =>
      readSurface.createProgram(
        deps,
        adminContextOf(target),
        { departmentId: target.departmentId, name: 'Harness Program' },
      ),
  },
  {
    name: 'renameProgram',
    kind: 'write',
    why: 'FR-1: reads the program, updates its name, audits { before, after }.',
    invokeWrite: (deps, target) =>
      readSurface.renameProgram(
        deps,
        adminContextOf(target),
        { programId: target.programId, name: 'Harness Program renamed' },
      ),
  },
  {
    name: 'createProject',
    kind: 'write',
    why:
      'FR-1: reads the department and the program (which must be the department\'s), inserts a ' +
      'project with the documented defaults and the Clock as demo_anchor, dual-writes the first ' +
      'project_default_rate_entry at yen 0 (story 1.6), audits the placement.',
    invokeWrite: (deps, target) =>
      readSurface.createProject(
        deps,
        adminContextOf(target),
        {
          name: 'Harness Project',
          departmentId: target.departmentId,
          programId: target.programId,
          clientName: 'Harness Client',
          contractType: '準委任',
        },
      ),
  },
  {
    name: 'renameProject',
    kind: 'write',
    why: 'FR-1: reads the project (locked), updates its name, audits { before, after }.',
    invokeWrite: (deps, target) =>
      readSurface.renameProject(
        deps,
        adminContextOf(target),
        { projectId: target.projectId, name: 'Harness Project renamed' },
      ),
  },
  {
    name: 'reassignProjectProgram',
    kind: 'write',
    why:
      'FR-1: reads the project (locked), clears its program_id — roll-up only, nothing else ' +
      'moves — and audits { before, after }.',
    invokeWrite: (deps, target) =>
      readSurface.reassignProjectProgram(
        deps,
        adminContextOf(target),
        { projectId: target.projectId, programId: null },
      ),
    moreWrites: [
      // Into a Program rather than out of one: the same action, the branch that checks the rule.
      (deps, target) =>
        readSurface.reassignProjectProgram(
          deps,
          adminContextOf(target),
          { projectId: target.projectId, programId: target.programId },
        ),
    ],
  },
  {
    name: 'reassignProjectDepartment',
    kind: 'write',
    why:
      'FR-1: reads the project (locked), the department and the program (which must be the new ' +
      'department\'s), updates department_id and program_id together, audits both before and after.',
    invokeWrite: (deps, target) =>
      readSurface.reassignProjectDepartment(
        deps,
        adminContextOf(target),
        { projectId: target.projectId, departmentId: target.departmentId, programId: target.programId },
      ),
  },
  // --- Membership changes (story 1.4 slice 2) --------------------------------------------------
  // In this order, on the one probe member: promote the PM, assign the Project, unassign the stale
  // id, revoke last — the write harness drives own-Tenant writes in registry order, each one
  // changing something from where the previous left the member. Called as a Tenant Admin.
  {
    name: 'changeMemberRole',
    kind: 'write',
    why:
      'FR-3/NFR-A1: locks the Tenant\'s admin rows plus caller and target (one ordered statement), ' +
      'sets tenant_membership.role (projectIds kept), audits { before, after }. The bridge has no ' +
      'RLS, so every statement filters by tenant_id itself.',
    invokeWrite: (deps, target) =>
      readSurface.changeMemberRole(deps, adminContextOf(target), {
        userId: target.memberUserId,
        role: 'tenant_admin',
      }),
    moreWrites: [
      // Demoting an admin while the caller remains one: the branch the last-admin rule guards.
      (deps, target) =>
        readSurface.changeMemberRole(deps, adminContextOf(target), {
          userId: target.secondAdminUserId,
          role: 'pm',
        }),
    ],
  },
  {
    name: 'assignMemberProject',
    kind: 'write',
    why:
      'FR-1 PM assignment: the same lock, then the Project (locked, must be this Tenant\'s), appends ' +
      'it to project_ids, audits { before, after }.',
    invokeWrite: (deps, target) =>
      readSurface.assignMemberProject(deps, adminContextOf(target), {
        userId: target.memberUserId,
        projectId: target.projectId,
      }),
  },
  {
    name: 'unassignMemberProject',
    kind: 'write',
    why:
      'FR-1 PM assignment: the same lock, removes a Project id from project_ids — a stale one here, ' +
      'whose Project does not exist — audits { before, after }.',
    invokeWrite: (deps, target) =>
      readSurface.unassignMemberProject(deps, adminContextOf(target), {
        userId: target.memberUserId,
        projectId: target.staleProjectId,
      }),
  },
  {
    name: 'revokeMembership',
    kind: 'write',
    why:
      'FR-3: the same lock, the last-admin rule, deletes the tenant_membership row, audits ' +
      '{ before: { role, projectIds } }. The resolver ends the member\'s session on their next request.',
    invokeWrite: (deps, target) =>
      readSurface.revokeMembership(deps, adminContextOf(target), { userId: target.memberUserId }),
    moreWrites: [
      // Revoking an admin while the caller remains one: the branch the last-admin rule guards.
      (deps, target) =>
        readSurface.revokeMembership(deps, adminContextOf(target), { userId: target.secondAdminUserId }),
    ],
  },
  {
    name: 'createResource',
    kind: 'write',
    why:
      'FR-12: reads the department, inserts a Resource with empty Tracker links and no Rate row, ' +
      'audits { departmentId, name, role }. Callable by tenant_admin or pm (story 1.6).',
    invokeWrite: (deps, target) =>
      readSurface.createResource(deps, adminContextOf(target), {
        departmentId: target.departmentId,
        name: 'Harness Resource',
        role: 'Engineer',
      }),
  },
  {
    name: 'appendResourceRate',
    kind: 'write',
    why:
      'FR-12: reads the Resource, appends a rate_entry (ledger untouched), audits ' +
      '{ effectiveFrom, yenPerHour }. tenant_admin only.',
    invokeWrite: (deps, target) =>
      readSurface.appendResourceRate(deps, adminContextOf(target), {
        resourceId: target.resourceId,
        effectiveFrom: '2026-06-01',
        yenPerHour: 5500,
      }),
  },
  {
    name: 'appendProjectDefaultRate',
    kind: 'write',
    why:
      'FR-12: reads the Project (locked), appends project_default_rate_entry and dual-writes ' +
      'project.default_rate_jpy, audits { effectiveFrom, yenPerHour }. tenant_admin only.',
    invokeWrite: (deps, target) =>
      readSurface.appendProjectDefaultRate(deps, adminContextOf(target), {
        projectId: target.projectId,
        effectiveFrom: '2026-06-01',
        yenPerHour: 4200,
      }),
  },
  {
    name: 'changeTenantCurrency',
    kind: 'write',
    why:
      'FR-4: sets tenant.currency to JPY only while the Tenant has no Rate; refuses once any ' +
      'rate_entry or project_default_rate_entry exists. Unaudited — the refusal writes nothing.',
    refusesWhenAnyRate:
      'A probe Tenant is seeded with a Project, which always inserts a default Rate, so the ' +
      'success path cannot run here. The harness asserts the lock refuses and lands nothing.',
    invokeWrite: (deps, target) =>
      readSurface.changeTenantCurrency(
        tenantCurrencyOn(deps.handle as Db),
        adminContextOf(target),
        { currency: 'JPY' },
      ),
  },
  {
    name: 'addConnector',
    kind: 'write',
    why:
      'FR-17 / story 5.2: inserts a Backlog Connector with encrypted credentials, client approval, ' +
      'first connector_scope_event, and audit — never returns secrets.',
    refusesWhenConnectorExists:
      'Every probe Project already has a fixture Connector from seed. The success path is covered ' +
      'by packages/app connector-writes unit tests; here the harness asserts the refuse.',
    invokeWrite: (deps, target) =>
      readSurface.addConnector(
        {
          ...deps,
          crypto: {
            keyId: 'harness-local',
            encrypt: () => ({
              ciphertext: Buffer.from('c'),
              nonce: Buffer.from('n-----------'),
              keyId: 'harness-local',
            }),
          },
          searchBudget: {
            assessSearchBudget: async () => ({
              kind: 'assessed',
              searchLimit: 150,
              ticketCount: 40,
              estimatedSearchCalls: 3,
              withinBudget: true,
            }),
          },
        },
        contextOf(target),
        {
          projectId: target.projectId,
          spaceUrl: 'https://example.backlog.jp/',
          apiKey: 'harness-key',
          projectKey: 'EC2',
          approvalName: 'Client Approver',
          approvalRecordedAt: '2026-09-01T00:00:00.000Z',
        },
      ),
  },
  {
    name: 'rotateCredentials',
    kind: 'write',
    why:
      'FR-17 / story 5.2: overwrites ciphertext only; Mapping history unchanged; audit without secrets.',
    invokeWrite: (deps, target) =>
      readSurface.rotateCredentials(
        {
          ...deps,
          crypto: {
            keyId: 'harness-local',
            encrypt: () => ({
              ciphertext: Buffer.from('rotated'),
              nonce: Buffer.from('n-----------'),
              keyId: 'harness-local',
            }),
          },
        },
        contextOf(target),
        {
          projectId: target.projectId,
          connectorId: target.connectorId,
          apiKey: 'rotated-key',
        },
      ),
  },
  {
    name: 'changeConnectorScope',
    kind: 'write',
    why:
      'FR-17 / AR-19 / story 5.2: updates connector.scope and appends connector_scope_event.',
    invokeWrite: (deps, target) =>
      readSurface.changeConnectorScope(
        {
          ...deps,
          crypto: {
            keyId: 'harness-local',
            encrypt: () => ({
              ciphertext: Buffer.from('c'),
              nonce: Buffer.from('n-----------'),
              keyId: 'harness-local',
            }),
          },
        },
        contextOf(target),
        {
          projectId: target.projectId,
          connectorId: target.connectorId,
          projectKey: 'EC2-NEW',
        },
      ),
  },
  {
    name: 'appendResolvedStatuses',
    kind: 'write',
    why:
      'Story 5.7 surface B: appends connector_setting_event Resolved status set for tests/API only ' +
      '(no PM form). Seeds on addConnector; this writer is the explicit override path.',
    invokeWrite: (deps, target) =>
      readSurface.appendResolvedStatuses(
        {
          ...deps,
          crypto: {
            keyId: 'harness-local',
            encrypt: () => ({
              ciphertext: Buffer.from('c'),
              nonce: Buffer.from('n-----------'),
              keyId: 'harness-local',
            }),
          },
        },
        contextOf(target),
        {
          projectId: target.projectId,
          connectorId: target.connectorId,
          resolvedStatusIds: ['Closed', 'Done'],
        },
      ),
  },
] as const;

/**
 * The INVOCABLE exports of the read surface, read off the module namespace.
 *
 * This is the mechanical half. Types are erased and constants are not invocable, so what
 * remains is what the harness can and must drive.
 *
 * "Invocable" is deliberately wider than `typeof value === 'function'`. That test alone
 * sees a bare exported function and a class (which is a function), but NOT a surface
 * exported as an object of methods — `export const projectReads = { getBundle, … }` — which
 * is a likely shape for a use-case module to grow into. Such an export would be silently
 * invisible to the coverage gate, which is the one failure mode a coverage gate must not
 * have, so an object carrying any function value is named here too and has to be accounted
 * for in the registry.
 */
export function readSurfaceFunctionNames(): string[] {
  return Object.entries(readSurface)
    .filter(([, value]) => typeof value === 'function' || holdsFunctions(value))
    .map(([name]) => name)
    .sort();
}

/** True for a non-null object (or array) with a function anywhere among its own values. */
function holdsFunctions(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  return Object.values(value).some((member) => typeof member === 'function');
}

export interface UnreachedTable {
  readonly table: string;
  readonly why: string;
}

/**
 * The tenant-owned tables NO read use case reaches — declared, and asserted against what
 * the harness MEASURES with a query logger.
 *
 * Saying what a gate does not cover is the part that turns "the harness covers every read
 * use case" from a claim into a number. Both directions fail: a table that stops being
 * read without being declared here, and a table declared here that a use case has started
 * reading. Either way the change becomes a decision somebody makes on purpose.
 */
export const UNREACHED_TENANT_OWNED_TABLES: readonly UnreachedTable[] = [
  {
    table: 'project_default_rate_entry',
    why:
      'Written by createProject and appendProjectDefaultRate (story 1.6); live valuation still ' +
      'reads project.default_rate_jpy. History is loaded only for a pinned lookup (Epic 5\'s ' +
      'Published Snapshot). No dedicated Rate read this story — the day one lands, this entry ' +
      'comes out or the reach assertion fails.',
  },
  {
    table: 'wp_dependency',
    why:
      'Written through app/schedule\'s fence (stories 2.9 / 2.10); no READ use case yet — the tree ' +
      'grid (2.13) and schedule strip are the first readers. The first read use case over it must ' +
      'remove this entry.',
  },
  {
    table: 'pct_override_event',
    why:
      'Created by story 2.10 as append-only Recorded %; written through the fence. No READ use ' +
      'case yet — resolveScheduleInputs loads heads inside the fence, and the Plan grid (2.13) ' +
      'will surface them. The first read use case removes this entry.',
  },
  {
    table: 'custom_field_definition',
    why:
      'Created by story 2.10 (FR-8); written through the fence with no definition UX yet. The ' +
      'first read use case (Plan columns / grouping) removes this entry.',
  },
  {
    table: 'custom_field_value',
    why:
      'Created by story 2.10 (FR-8); written through the fence. No READ use case yet — Plan grid ' +
      'columns (2.13+) are the first readers. The first read use case removes this entry.',
  },
  {
    table: 'calendar_day_event',
    why:
      'Created by story 2.12 (FR-14) as append-only Project non-working days. Written by ' +
      'publish/settings paths; heads feed publishCalendarVersion. No READ use case yet — Project ' +
      'settings thin UI loads them inside the calendar writer path, not a declared read use case. ' +
      'The first dedicated read removes this entry.',
  },
  {
    table: 'holiday_calendar_version',
    why:
      'Append-only resolved versions (AD-29). Written by seed and app/calendar.publishCalendarVersion ' +
      '(2.12); schedule resolve loads the latest inside the fence. No product READ use case yet — ' +
      'the first one removes this entry.',
  },
  {
    table: 'schedule_run',
    why:
      'Created by story 2.1 (AD-26); app/schedule appends runs (2.9) and the schedule strip and ' +
      'exception rail read them (2.15, 2.16). No READ use case yet — the first read of it removes ' +
      'this entry.',
  },
  {
    table: 'wp_schedule',
    why:
      'Created by story 2.1 (AD-26); app/schedule rebuilds it (2.9) and the tree grid reads it ' +
      '(2.13). No READ use case yet — the first read of it removes this entry.',
  },
  {
    table: 'connector_ownership_event',
    why:
      'Created by story 5.6 as append-only Keep/Transfer history. Written by confirmConnectorOwnership; ' +
      'no READ use case yet — Connectors/Review resolve against connector_overlap and ticket.owner. ' +
      'The first history reader removes this entry.',
  },
  {
    table: 'fixture_cursor',
    why:
      'Created by story 5.1 as operational bookkeeping behind FixtureCursorPort. No product READ ' +
      'use case — cursor is only read through the port inside fixture-replay. Keep declared until ' +
      'a dedicated operator/read path exists.',
  },
  {
    table: 'tracker_snapshot_attempt',
    why:
      'Created by story 5.2 for failed snapshot attempts. Written by ingest gate / credential ' +
      'notify; no READ use case yet — banner reads connector.last_error_*. The first read removes ' +
      'this entry.',
  },
  {
    table: 'mapping_head',
    why:
      'Created by story 5.9 as a derived dual-write index (AR-18 / AR-38). Writers and the ' +
      'schedule leaf guard read it live; attribution pins and getProjectMapping still replay ' +
      'mapping_event (never SoT). The first product READ that loads heads instead of events ' +
      'removes this entry.',
  },
] as const;
