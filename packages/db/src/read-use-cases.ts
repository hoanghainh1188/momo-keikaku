/**
 * The read surface, enumerated mechanically.
 *
 * NFR-S1 asks that tenant isolation be tested automatically, and epic 1's requirement is
 * sharper than that: the harness must enumerate the read use cases MECHANICALLY, so a new
 * one is covered the day it is written rather than the day somebody remembers to add it to
 * a list. This file is that enumeration. `cross-tenant.test.ts` drives it.
 *
 * HOW THE ENUMERATION IS MECHANICAL. `readSurfaceFunctionNames()` reads the exported
 * FUNCTIONS off the read surface's module namespace — not a hand-written list — and the
 * harness fails, with no database, naming any export that has no entry below. Adding an
 * exported read and forgetting the entry is therefore a red build, not a silent gap.
 *
 * WHERE THE READ SURFACE IS, AND WHAT THAT DOES NOT INCLUDE. The read-use-case surface is
 * `packages/db/src/repo.ts` and its two exported functions: every page in `apps/web`, and
 * `scripts/peek-db.ts`, load their data through them.
 *
 * It is NOT every read in the product. `apps/web/src/app/actions.ts` issues two reads of
 * its own — `anchorOf` selects from `project`, and `planTickets` selects from
 * `work_package` — inside write actions, on the `tx` of its own `withTenant`, using the
 * barrel's `schema` and `withTenant` exports rather than `repo.ts`. This gate does not
 * enumerate them: they are steps inside a write, not use cases a reader invokes, and
 * `actions.ts` exports form actions taking `FormData` rather than anything a harness can
 * drive with a Tenant and a Project. The next slice's rewiring is where they join — when
 * those five actions become `packages/app` use cases, they become enumerable, and a write
 * entry can be registered beside the reads (see `UseCaseKind`).
 *
 * THE ONE POINTER THAT MOVES. The next slice moves the use cases into `packages/app`.
 * When it does, the import below and
 * `READ_SURFACE_MODULE` are the change — one pointer — and every entry, every assertion
 * and the whole probe matrix follow it unchanged. The harness lands FIRST, before that
 * rewiring, deliberately: a harness that already exists is what guards the move, so a
 * rewiring that breaks isolation turns CI red while it is being made.
 *
 * Deliberately NOT re-exported from `packages/db/src/index.ts`: nothing an application
 * does involves enumerating its own read surface.
 */
import type { Db } from './client';
import type { DemoState } from './fixtures';
import * as readSurface from './repo';

/** Named in failure messages, so the reader is sent to the file rather than to a diff. */
export const READ_SURFACE_MODULE = 'packages/db/src/repo.ts';

/** What a use case is invoked against: one Tenant, one Project. */
export interface UseCaseTarget {
  readonly tenantId: string;
  readonly projectId: string;
}

/**
 * Whether the export is a read the harness must drive.
 *
 * `not-a-read` exists so that a future non-read export (a writer, a health check) can be
 * registered with a stated reason rather than silently omitted — the point of the gate is
 * that every export is ACCOUNTED FOR, not that every export is a read.
 */
export type UseCaseKind = 'read' | 'not-a-read';

export interface ReadUseCase {
  /** Must equal an exported function name of the read surface. Asserted, not assumed. */
  readonly name: string;
  readonly kind: UseCaseKind;
  /** Why this entry is classed as it is, and what it reads. One line, for the next reader. */
  readonly why: string;
  /** Required when `kind` is `not-a-read`: why the harness does not drive it. */
  readonly reason?: string;
  /** How the harness invokes it. Required for a `read`. */
  readonly invoke?: (handle: Db, target: UseCaseTarget) => Promise<unknown>;
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
}

/**
 * Everything a Project bundle must carry, read out of the fixture.
 *
 * Both of today's use cases return the same bundle, so both declare this. A future read
 * that legitimately returns less declares its own — which is the point of putting it on
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

export const READ_USE_CASES: readonly ReadUseCase[] = [
  {
    name: 'loadProjectBundle',
    kind: 'read',
    why:
      'The Project bundle behind every page: 15 selects across 15 of the 17 tables, FOUR of ' +
      'them with no WHERE clause at all (baseline_wp, rate_entry, tracker_snapshot, ' +
      'actuals_ledger_entry), so row-level security is their only filter. Two of those ' +
      'four are then re-filtered in memory, which is why table-level isolation is ' +
      'asserted separately — see cross-tenant.test.ts.',
    invoke: (handle, target) =>
      readSurface.loadProjectBundle(handle, target.tenantId, target.projectId),
    mustSurface: projectBundleLabels,
  },
  {
    name: 'loadReview',
    kind: 'read',
    why:
      'The Reconciliation Review: the same bundle plus computeReview over it. Driven ' +
      'separately because its result graph is much larger — EVM per Work Package, ' +
      'attribution Maps keyed by Work Package and Ticket id, the unmapped groups — and a ' +
      'leak reaching only the computed half would be invisible in the bundle.',
    invoke: (handle, target) =>
      readSurface.loadReview(handle, target.tenantId, target.projectId),
    mustSurface: projectBundleLabels,
  },
] as const;

/**
 * The INVOCABLE exports of the read surface, read off the module namespace.
 *
 * This is the mechanical half. `repo.ts` also exports constants (`DEMO_PROJECT_ID`,
 * `DEMO_TENANT_ID`) and types; types are erased and constants are not invocable, so what
 * remains is what the harness can and must drive.
 *
 * "Invocable" is deliberately wider than `typeof value === 'function'`. That test alone
 * sees a bare exported function and a class (which is a function), but NOT a surface
 * exported as an object of methods — `export const projectReads = { loadBundle, … }` — and
 * the stated plan moves this surface into `packages/app`, where an object is the likely
 * shape. Such an export would be silently invisible to the coverage gate, which is the one
 * failure mode a coverage gate must not have, so an object carrying any function value is
 * named here too and has to be accounted for in the registry.
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
    table: 'audit_log',
    why:
      'Written by the seed and by `apps/web`\'s actions, never read. Story 1.7 gives the ' +
      'Tenant Admin the log viewer, which is the read use case that will bring it into this ' +
      'harness — and the day it does, this entry has to come out or the reach assertion fails.',
  },
] as const;
