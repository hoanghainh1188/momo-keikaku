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
import type { WriteDeps } from '../packages/app/src/ports/write-deps';
import * as readSurface from '../packages/app/src/use-cases';
import type { Db } from '../packages/db/src/client';
import type { DemoState } from '../packages/db/src/fixtures';

/** Named in failure messages, so the reader is sent to the file rather than to a diff. */
export const READ_SURFACE_MODULE = 'packages/app/src/use-cases/index.ts';

/** This file, named in the same messages. */
export const REGISTRY_MODULE = 'tests/read-use-cases.ts';

/** What a use case is invoked against: one Tenant, one Project. */
export interface UseCaseTarget {
  readonly tenantId: string;
  readonly projectId: string;
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
   */
  readonly invoke?: (deps: ProjectReadDeps<Db>, target: UseCaseTarget) => Promise<unknown>;
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
}

/**
 * Everything a Project bundle must carry, read out of the fixture.
 *
 * The two bundle reads (`getProjectHeader`, `getProjectReview`) return the same bundle, so
 * both declare this. A read that legitimately returns less declares its own, as the Client
 * View and the Mapping surface do below — which is the point of putting it on
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
      f.baseline.id,
      f.baseline.reason,
      ...f.resources.flatMap((r) => [r.id, r.name, r.accountId]),
      ...f.wps.flatMap((w) => [w.id, w.wbsCode, w.name]),
      ...f.baseline.wps.map((b) => b.wpId),
      ...f.mappingRules.flatMap((r) => [r.id, r.name]),
      ...(latest ? [latest.snapshotId] : []),
      ...(latest?.tickets ?? []).flatMap((t) => [
        t.trackerIssueId,
        t.key,
        t.title,
        t.statusId,
        t.issueTypeId,
        ...t.categoryIds,
        ...t.milestoneIds,
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
 * What the Client View must carry: the client's and the Project's names, the Milestones, and
 * the Schedule to WBS level 2 — read out of the fixture as the projection selects them.
 *
 * Deliberately NOT `projectBundleLabels`: the projection is FR-34's client-safe type, with no
 * Resource, Tracker Account, Ticket, Rule or Rate, so requiring those would be requiring a
 * leak. The Milestone and Schedule rows come from the ACTIVE Baseline and the Current Plan's
 * leaves, the same selection `computeReview` and `clientProjection` make.
 */
export function clientViewLabels(state: DemoState): string[] {
  const baseline = state.baselineVersions.find((b) => b.seq === state.activeBaselineSeq);
  const milestoneIds = new Set(baseline?.wps.filter((b) => b.isMilestone).map((b) => b.wpId));
  return [
    ...new Set([
      state.fixture.project.name,
      state.fixture.project.clientName,
      ...state.wps.filter((w) => milestoneIds.has(w.id)).map((w) => w.name),
      ...state.wps
        .filter((w) => w.isLeaf && w.wbsCode.split('.').length <= 2)
        .flatMap((w) => [w.wbsCode, w.name]),
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
        { tenantId: target.tenantId },
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
        { tenantId: target.tenantId },
        { projectId: target.projectId },
      ),
    mustSurface: projectBundleLabels,
  },
  {
    name: 'getClientView',
    kind: 'read',
    why:
      'The Client View preview (apps/web c/[projectId]): repo.ts loadReview, then the ' +
      'client projection with the default visibility. Driven on its own because the ' +
      'projection is what a client would see, so a foreign or demo string reaching it is the ' +
      'leak that matters most, and because its not_found is what the page\'s 404 rests on.',
    invoke: (deps, target) =>
      readSurface.getClientView(
        deps,
        { tenantId: target.tenantId },
        { projectId: target.projectId },
      ),
    mustSurface: clientViewLabels,
    // The projection is FR-34's client-safe subset: names, Milestones and the WBS-level-2
    // Schedule — no Resource, Ticket, Rule or Account. The demo result carries 84 labelled
    // strings (measured 2026-09-21), against the 100 a bundle read clears many times over.
    minimumLabels: 50,
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
        { tenantId: target.tenantId },
        { projectId: target.projectId },
      ),
    mustSurface: projectMappingLabels,
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
        { tenantId: target.tenantId },
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
        { tenantId: target.tenantId },
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
        { tenantId: target.tenantId },
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
        { tenantId: target.tenantId },
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
        { tenantId: target.tenantId },
        { projectId: target.projectId, ticketId: target.ticketIds[0], wpId: target.wpId },
      ),
    moreWrites: [
      // The unmap branch, which records `mapping.unmap`.
      (deps, target) =>
        readSurface.mapTicket(
          deps,
          { tenantId: target.tenantId },
          { projectId: target.projectId, ticketId: target.ticketIds[0], wpId: '' },
        ),
    ],
  },
  // --- FR-1's organisation writes (story 1.3 slice 2) -------------------------------------------
  {
    name: 'createDepartment',
    kind: 'write',
    why: 'FR-1: inserts a department (id from the id port) and an audit_log row, Clock-stamped.',
    invokeWrite: (deps, target) =>
      readSurface.createDepartment(deps, { tenantId: target.tenantId }, { name: 'Harness Department' }),
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
        { tenantId: target.tenantId },
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
        { tenantId: target.tenantId },
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
        { tenantId: target.tenantId },
        { programId: target.programId, name: 'Harness Program renamed' },
      ),
  },
  {
    name: 'createProject',
    kind: 'write',
    why:
      'FR-1: reads the department and the program (which must be the department\'s), inserts a ' +
      'project with the documented defaults and the Clock as demo_anchor, audits the placement.',
    invokeWrite: (deps, target) =>
      readSurface.createProject(
        deps,
        { tenantId: target.tenantId },
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
        { tenantId: target.tenantId },
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
        { tenantId: target.tenantId },
        { projectId: target.projectId, programId: null },
      ),
    moreWrites: [
      // Into a Program rather than out of one: the same action, the branch that checks the rule.
      (deps, target) =>
        readSurface.reassignProjectProgram(
          deps,
          { tenantId: target.tenantId },
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
        { tenantId: target.tenantId },
        { projectId: target.projectId, departmentId: target.departmentId, programId: target.programId },
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
    table: 'app_user',
    why:
      'No read use case reads it. There is no auth yet; story 1.4 replaces this table with ' +
      'the identity tables plus the membership bridge, and `resolveRequestContext` becomes ' +
      'the one reader. Until then nothing renders a user, so nothing selects one. NOTE for ' +
      'whoever removes this entry: a probe Tenant\'s `app_user` rows are the only place the ' +
      'row writer prefixes a HUMAN NAME rather than an id, so they literally contain the ' +
      'demo Tenant\'s resource names and the demo-marker scan would report a leak that is ' +
      'not one. Give those two rows opaque names in the same change.',
  },
  {
    table: 'program',
    why:
      'Written by the organisation writes (story 1.3 slice 2), read by none of the READ use ' +
      'cases: the Project bundle carries the Department\'s name but no Program, and there is no ' +
      'read use case for the org in 1.3 (no Organisation UI). The first read of it — the admin ' +
      'surface or a Program roll-up — brings it into this harness and must remove this entry.',
  },
  {
    table: 'audit_log',
    why:
      'Written by the seed and by the write use cases, never read. Story 1.7 gives the ' +
      'Tenant Admin the log viewer, which is the read use case that will bring it into this ' +
      'harness — and the day it does, this entry has to come out or the reach assertion fails.',
  },
] as const;
