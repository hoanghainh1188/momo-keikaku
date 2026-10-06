/**
 * What the two database write suites share — `tests/cross-tenant-writes.test.ts` (every write on
 * the surface, foreign and own-Tenant) and `tests/org-writes.test.ts` (the organisation rules
 * against real rows). Split out by story 1.3 slice 2, when the organisation writes would have
 * taken the first file past the size the repository's rules allow.
 *
 * A composition root, like the files that import it: it wires `packages/app`'s write use cases to
 * `packages/db`'s tenant transaction on the RESTRICTED role's handle, with a fixed Clock and a
 * predictable id port, under the same `satisfies WriteDeps<Db>` the web app's composition root
 * makes. Test-only wiring, outside the import graph (`tests/` is not cruised).
 *
 * It reads no environment itself — the env fence covers this non-test module — so each suite
 * hands its connection strings to `connectWriteHarness` once, at load, and everything below uses
 * them. (Vitest isolates test files, so each suite has its own copy of this module's state.)
 */
import { isDeepStrictEqual } from 'node:util';
import { and, eq, sql } from 'drizzle-orm';
import { decode } from '@momo/domain';
import { auditPayloadSchema } from '../packages/app/src/audit/payloads';
import { auditActorOf } from '../packages/app/src/authz/request-context';
import type { WriteDeps } from '../packages/app/src/ports/write-deps';
import type { AppError } from '../packages/app/src/result';
import { getDb, getPool, schema, type Db } from '../packages/db/src/client';
import { DEMO_USERS } from '../packages/db/src/demo-identities';
import type { ProbeTenant } from '../packages/db/src/probe-tenants';
import { tenantMembership } from '../packages/db/src/schema-membership';
import { TENANT_BRIDGES, TENANT_OWNED } from '../packages/db/src/table-classes';
import { inTenantTransaction } from '../packages/db/src/tenant-transaction';
import { withTenant } from '../packages/db/src/with-tenant';
import type { InvokeWrite, WriteTarget } from './read-use-cases';
import { HARNESS_USER_ID } from './request-context';
import { acquireSeedSuiteLock, type SeedLockMode } from '../packages/db/src/seed-suite-lock';

export interface HarnessEnv {
  /** DATABASE_URL: the owning role. */
  readonly ownerUrl: string | undefined;
  /** APP_DATABASE_URL: the restricted application role. */
  readonly appUrl: string | undefined;
  /** REQUIRE_DB=1: an unreachable database fails the suite instead of skipping it. */
  readonly requireDb: boolean;
}

let connected: HarnessEnv | undefined;

function env(): HarnessEnv {
  if (!connected) throw new Error('call connectWriteHarness(...) before using the write harness');
  return connected;
}

async function reachableAs(connectionString: string | undefined): Promise<boolean> {
  if (!connectionString) return false;
  try {
    const client = await getPool(connectionString).connect();
    client.release();
    return true;
  } catch {
    return false;
  }
}

export interface ConnectOptions {
  /**
   * How this suite holds the seed-suite lock (`tests/seed-suite-lock.ts`, retrospective F1).
   *
   * The default, `shared`, is right for every suite that writes probe Tenants — which is every
   * suite using this harness except the two that seed. A suite that calls `seed()` must pass
   * `exclusive`, because seeding TRUNCATEs the whole database underneath everyone else.
   *
   * Defaulting rather than requiring is deliberate: a new suite that forgets to think about this
   * gets the safe half, and the only suites that must remember are the two whose whole subject is
   * the seed.
   */
  readonly seedLock?: SeedLockMode;
}

/**
 * Points the harness at the suite's database and answers whether both roles are reachable — the
 * DB suites skip without them, or fail under REQUIRE_DB=1.
 *
 * Also takes the seed-suite lock when the database is reachable, and holds it for the suite's
 * lifetime; `closeAllPools()` in the suite's `afterAll` drops it with the session, so a suite that
 * does not seed needs no teardown of its own.
 */
export async function connectWriteHarness(
  harnessEnv: HarnessEnv,
  options: ConnectOptions = {},
): Promise<boolean> {
  connected = harnessEnv;
  if (harnessEnv.requireDb && !(harnessEnv.ownerUrl && harnessEnv.appUrl)) {
    throw new Error(
      'REQUIRE_DB=1 but DATABASE_URL and APP_DATABASE_URL are not both set. The write half of ' +
        'the cross-tenant harness needs the owner to write the probe Tenants and the application ' +
        'role to drive the writes; it must not be skipped here.',
    );
  }
  const reachable =
    (await reachableAs(harnessEnv.ownerUrl)) && (await reachableAs(harnessEnv.appUrl));
  if (harnessEnv.requireDb && !reachable) {
    throw new Error(
      'REQUIRE_DB=1 but the database is not reachable as both roles. Run `pnpm pgboss:migrate` ' +
        'and `pnpm db:policies` first.',
    );
  }
  if (reachable) {
    await acquireSeedSuiteLock(harnessEnv.ownerUrl!, options.seedLock ?? 'shared');
  }
  return reachable;
}

/** The OWNING role's handle: writes and removes the probe Tenants, and reads what landed. */
export function owner(): Db {
  return getDb(env().ownerUrl!);
}

/**
 * Distinct from every fixture actor, so the rows a write lands can be told apart. Derived from the
 * harness's RequestContext user (story 1.4: the actor is `user:<ctx.userId>`, never a deps value).
 */
export const TEST_ACTOR = auditActorOf({ userId: HARNESS_USER_ID });

/**
 * The Clock the organisation writes are stamped with — fixed, and distinct from every Project
 * anchor, so an org write stamped with an anchor (or the other way round) fails the row match.
 */
export const TEST_NOW = new Date('2026-09-20T01:02:03.456Z');

/**
 * Ids handed out by the harness's id port, in order, for the whole run. Predictable, so the rows a
 * create lands can be expected exactly; prefixed per file, so two files running in parallel
 * never hand out the same id; never reused, so a rolled-back create cannot collide with a later one.
 */
export function idPort(prefix: string) {
  const issued: string[] = [];
  return {
    issued: issued as readonly string[],
    next: (): string => {
      const id = `${prefix}-${String(issued.length + 1).padStart(4, '0')}`;
      issued.push(id);
      return id;
    },
  };
}

export type IdPort = ReturnType<typeof idPort>;

/**
 * The write deps, wired: `packages/db`'s tenant transaction as `packages/app` declares it, on the
 * RESTRICTED role's handle, with the fixed Clock and the given id port. The same structural check
 * the web app's composition root makes.
 */
export function restrictedWriteDeps(ids: IdPort) {
  return {
    handle: getDb(env().appUrl!),
    clock: { now: () => TEST_NOW },
    ids,
    transaction: inTenantTransaction,
  } satisfies WriteDeps<Db>;
}

/**
 * A probe Tenant's own ids: two Tickets it has Mapping history for, a leaf non-Catch-all WP, its
 * Project's Department and Program, and the member the membership writes change (its PM, staged by
 * `stageProbeMembers`) — run as `tenantId`, which is the probe's own Tenant for an own write and the
 * OTHER probe's for the id-from-a-URL replay.
 */
export function targetOf(probe: ProbeTenant, tenantId: string): WriteTarget {
  const tickets = [...new Set(probe.state.mappingEvents.map((m) => m.ticketId))];
  const leaf = probe.state.wps.find((w) => w.isLeaf && !w.isMilestone && !w.isCatchAll);
  if (tickets.length < 2 || !leaf) {
    throw new Error(`${probe.token}'s fixture has too few Tickets or no leaf Work Package`);
  }
  const connectorId = `${probe.writeOptions.idPrefix}con-fixture-ec2`;
  const rules = [...probe.state.fixture.mappingRules]
    .sort((a, b) => a.priority - b.priority)
    .map((r) => ({ id: r.id, wpId: r.wpId, matchField: r.match.field, matchValue: r.match.value }));
  if (rules.length < 2) throw new Error(`${probe.token}'s fixture has fewer than two Mapping Rules`);
  return {
    tenantId,
    projectId: probe.projectId,
    ticketIds: [tickets[0]!, tickets[1]!],
    wpId: leaf.id,
    departmentId: probe.state.fixture.department.id,
    programId: probe.state.fixture.program.id,
    resourceId: probe.state.fixture.resources[0]!.id,
    memberUserId: probePmId(probe),
    staleProjectId: staleProjectIdOf(probe),
    // The probe's seeded Tenant Admin; the harness user (`stageProbeMembers`) is the other one.
    secondAdminUserId: `${probe.writeOptions.idPrefix}${DEMO_USERS.hoang.id}`,
    connectorId,
    rules: [rules[0]!, rules[1]!],
  };
}

/** The probe's PM — `writeTenantRows` writes `DEMO_USERS.linh` under the probe's id prefix. */
export function probePmId(probe: ProbeTenant): string {
  return `${probe.writeOptions.idPrefix}${DEMO_USERS.linh.id}`;
}

/** A Project id no Project carries, prefixed so it is the probe's own. */
export function staleProjectIdOf(probe: ProbeTenant): string {
  return `${probe.writeOptions.idPrefix}prj-gone`;
}

/**
 * Stages a probe Tenant's memberships for the membership writes (story 1.4 slice 2), as the owner:
 *
 * HAZARD, RECORDED RATHER THAN FIXED (code review, 2026-09-22): `HARNESS_USER_ID` is ONE constant
 * shared by every suite and is staged here UNPREFIXED, while `removeProbeTenant` collects user ids
 * from a Tenant's memberships and then deletes matching rows in `identity_event`, `verification`,
 * `session`, `account` and `auth_user` — none tenant-scoped, and the first two were added to that
 * teardown by this same story. Latent only because no `auth_user` row exists for this id. Prefixing
 * it per probe was tried and reverted: the id is also the user of every registry CONTEXT, so the
 * prefixed membership no longer matches the caller and every membership write refuses. The real fix
 * threads a per-probe id through `request-context.ts` and each context, which is not a patch.
 *
 *   * the harness's own user (`HARNESS_USER_ID`, the user of every registry context) gets a
 *     `tenant_admin` membership — the membership writes re-check the caller against the bridge
 *     inside their transaction, so without one every write would answer `not_found` at the
 *     caller check and the foreign-Tenant assertion would prove nothing;
 *   * the probe's PM holds the stale Project id instead of the Project, so `targetOf`'s assign and
 *     unassign each change something from this starting state.
 */
export async function stageProbeMembers(probe: ProbeTenant): Promise<void> {
  await owner().transaction(async (tx) => {
    await tx
      .insert(tenantMembership)
      .values({ userId: HARNESS_USER_ID, tenantId: probe.tenantId, role: 'tenant_admin', projectIds: [] })
      .onConflictDoUpdate({
        target: [tenantMembership.userId, tenantMembership.tenantId],
        set: { role: 'tenant_admin', projectIds: [] },
      });
    const res = await tx
      .update(tenantMembership)
      .set({ projectIds: [staleProjectIdOf(probe)] })
      .where(and(eq(tenantMembership.tenantId, probe.tenantId), eq(tenantMembership.userId, probePmId(probe))));
    if (res.rowCount !== 1) throw new Error(`${probe.token} has no PM membership to stage`);
  });
}

export interface Outcome {
  readonly ok?: true;
  readonly refused?: AppError;
  readonly error?: unknown;
}

/** Runs one write and sorts its answer into ok / refused / threw, without unwrapping for it. */
export async function drive(
  name: string,
  invoke: InvokeWrite,
  target: WriteTarget,
  deps: WriteDeps<Db>,
): Promise<Outcome> {
  try {
    const returned = (await invoke(deps, target)) as { ok?: boolean; error?: AppError } | null;
    if (returned?.ok === true) return { ok: true };
    if (returned?.ok === false && returned.error) return { refused: returned.error };
    return { error: new Error(`${name} did not return a Result`) };
  } catch (error) {
    return { error };
  }
}

/**
 * The tables a Tenant's rows are read from: every tenant-owned table by its tenant column — and the
 * membership bridge (story 1.4 slice 2), which carries `tenant_id` with no row-level security, so
 * the explicit filter below is the only thing that scopes it. Without it the membership writes'
 * rows would be invisible to every "nothing else moved" assertion.
 */
const TENANT_TABLES: readonly { readonly table: string; readonly column: string }[] = [
  ...TENANT_OWNED.map((owned) => ({ table: owned.table, column: owned.tenantColumn! })),
  ...TENANT_BRIDGES.map((bridge) => ({ table: bridge.table, column: 'tenant_id' })),
];

/** Rows per tenant table for one Tenant, counted inside its own tenant scope. */
export async function rowCounts(tenantId: string): Promise<Record<string, number>> {
  return withTenant(owner(), tenantId, async (tx) => {
    // Sequential: one transaction is one connection, and pg refuses overlapping queries on it.
    const entries: (readonly [string, number])[] = [];
    for (const { table, column } of TENANT_TABLES) {
      const res = await tx.execute<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM ${sql.identifier(table)}
             WHERE ${sql.identifier(column)} = ${tenantId}`,
      );
      entries.push([table, Number(res.rows[0]?.n ?? 0)]);
    }
    return Object.fromEntries(entries);
  });
}

/**
 * EVERY row of every tenant table (the bridge included) for one Tenant, each as Postgres's own
 * text form of the whole row (`t::text` — every column, no codec, no driver conversion), sorted so
 * two reads compare row for row. What "only `program_id` changed" is measured against.
 */
export async function allRows(tenantId: string): Promise<Record<string, readonly string[]>> {
  return withTenant(owner(), tenantId, async (tx) => {
    const entries: (readonly [string, readonly string[]])[] = [];
    for (const { table, column } of TENANT_TABLES) {
      const res = await tx.execute<{ row: string }>(
        sql`SELECT t::text AS row FROM ${sql.identifier(table)} AS t
             WHERE ${sql.identifier(column)} = ${tenantId} ORDER BY 1`,
      );
      entries.push([table, res.rows.map((r) => r.row)]);
    }
    return Object.fromEntries(entries);
  });
}

/** The rows a write may land, for one Tenant, keyed so a later read can be diffed. */
export async function landedRows(tenantId: string) {
  return withTenant(owner(), tenantId, async (tx) => ({
    mappingEvents: await tx
      .select()
      .from(schema.mappingEvent)
      .where(eq(schema.mappingEvent.tenantId, tenantId)),
    mappingHeads: await tx
      .select()
      .from(schema.mappingHead)
      .where(eq(schema.mappingHead.tenantId, tenantId)),
    dispositions: await tx
      .select()
      .from(schema.dispositionEvent)
      .where(eq(schema.dispositionEvent.tenantId, tenantId)),
    audits: (
      await tx.select().from(schema.auditLog).where(eq(schema.auditLog.tenantId, tenantId))
    ).map((row) => ({ ...row, payload: decode(row.payload, auditPayloadSchema) })),
    workPackages: await tx
      .select()
      .from(schema.workPackage)
      .where(eq(schema.workPackage.tenantId, tenantId)),
    departments: await tx
      .select()
      .from(schema.department)
      .where(eq(schema.department.tenantId, tenantId)),
    programs: await tx.select().from(schema.program).where(eq(schema.program.tenantId, tenantId)),
    projects: await tx.select().from(schema.project).where(eq(schema.project.tenantId, tenantId)),
    resources: await tx.select().from(schema.resource).where(eq(schema.resource.tenantId, tenantId)),
    rateEntries: await tx
      .select()
      .from(schema.rateEntry)
      .where(eq(schema.rateEntry.tenantId, tenantId)),
    projectDefaultRates: await tx
      .select()
      .from(schema.projectDefaultRateEntry)
      .where(eq(schema.projectDefaultRateEntry.tenantId, tenantId)),
    // The bridge has no RLS: `withTenant` scopes nothing here, the filter does.
    memberships: await tx
      .select()
      .from(tenantMembership)
      .where(eq(tenantMembership.tenantId, tenantId)),
    connectors: (
      await tx.select().from(schema.connector).where(eq(schema.connector.tenantId, tenantId))
    ).map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      projectId: row.projectId,
      adapter: row.adapter,
      site: row.site,
      scope: row.scope,
      spaceLabel: row.spaceLabel,
      approvalName: row.approvalName,
      credentialsKeyId: row.credentialsKeyId,
      hasCredentials: row.credentialsCiphertext != null,
    })),
    connectorScopeEvents: await tx
      .select()
      .from(schema.connectorScopeEvent)
      .where(eq(schema.connectorScopeEvent.tenantId, tenantId)),
    connectorSettingEvents: await tx
      .select()
      .from(schema.connectorSettingEvent)
      .where(eq(schema.connectorSettingEvent.tenantId, tenantId)),
    // Story 5.10: mutable-audited — a rule edit, delete (soft) or reorder changes rows in place.
    mappingRules: await tx
      .select()
      .from(schema.mappingRule)
      .where(eq(schema.mappingRule.tenantId, tenantId)),
  }));
}

export type Landed = Awaited<ReturnType<typeof landedRows>>;

/** The SQL table each `landedRows` key reads — what `allRows` keys the same rows by. */
export const LANDED_TABLE: Readonly<Record<keyof Landed, string>> = {
  mappingEvents: 'mapping_event',
  mappingHeads: 'mapping_head',
  dispositions: 'disposition_event',
  audits: 'audit_log',
  workPackages: 'work_package',
  departments: 'department',
  programs: 'program',
  projects: 'project',
  resources: 'resource',
  rateEntries: 'rate_entry',
  projectDefaultRates: 'project_default_rate_entry',
  memberships: 'tenant_membership',
  connectors: 'connector',
  connectorScopeEvents: 'connector_scope_event',
  connectorSettingEvents: 'connector_setting_event',
  mappingRules: 'mapping_rule',
};

/** The table `newSince`'s removed memberships come from — the same as `memberships`'. */
export const REMOVED_TABLE = { membershipsRemoved: 'tenant_membership' } as const;

/**
 * The rows of a MUTABLE table that are new or different since `before` — by id, compared whole.
 * The org tables are `mutable-audited`: a rename changes a row in place, so "new by key" (enough
 * for the append-only tables) would miss it.
 */
function changedSince<T extends { id: string }>(before: readonly T[], after: readonly T[]): T[] {
  const was = new Map(before.map((row) => [row.id, row]));
  return after.filter((row) => !isDeepStrictEqual(was.get(row.id), row));
}

type MembershipRowOf = Landed['memberships'][number];

/** A membership's key: the bridge's primary key, `(user_id, tenant_id)`. */
const memberKey = (row: MembershipRowOf) => `${row.userId}\u0000${row.tenantId}`;

/**
 * The bridge's rows, diffed by `(user_id, tenant_id)` — new or changed ones, and REMOVED ones: a
 * revocation deletes a row, which a "new or changed" diff alone would never report.
 */
function membershipsSince(before: readonly MembershipRowOf[], after: readonly MembershipRowOf[]) {
  const was = new Map(before.map((row) => [memberKey(row), row]));
  const now = new Set(after.map(memberKey));
  return {
    memberships: after.filter((row) => !isDeepStrictEqual(was.get(memberKey(row)), row)),
    membershipsRemoved: before.filter((row) => !now.has(memberKey(row))),
  };
}

type MappingHeadRowOf = Landed['mappingHeads'][number];

/** Derived head key: `(tenant_id, project_id, ticket_id)`. */
const mappingHeadKey = (row: MappingHeadRowOf) =>
  `${row.tenantId}\u0000${row.projectId}\u0000${row.ticketId}`;

/** New or changed mapping_head rows (dual-written with every mapping_event append). */
function mappingHeadsSince(
  before: readonly MappingHeadRowOf[],
  after: readonly MappingHeadRowOf[],
): MappingHeadRowOf[] {
  const was = new Map(before.map((row) => [mappingHeadKey(row), row]));
  return after
    .filter((row) => !isDeepStrictEqual(was.get(mappingHeadKey(row)), row))
    .sort((a, b) => a.ticketId.localeCompare(b.ticketId));
}

/** What appeared, changed or (for the bridge) disappeared between two reads, per table. */
export function newSince(before: Landed, after: Landed) {
  const seqs = (rows: readonly { seq: number }[]) => new Set(rows.map((row) => row.seq));
  const mapSeqs = seqs(before.mappingEvents);
  const dispSeqs = seqs(before.dispositions);
  const auditSeqs = seqs(before.audits);
  const rateSeqs = seqs(before.rateEntries);
  const defaultRateSeqs = seqs(before.projectDefaultRates);
  const scopeSeqs = seqs(before.connectorScopeEvents);
  const settingSeqs = seqs(before.connectorSettingEvents);
  const wpIds = new Set(before.workPackages.map((row) => row.id));
  const resourceIds = new Set(before.resources.map((row) => row.id));
  return {
    mappingEvents: after.mappingEvents
      .filter((row) => !mapSeqs.has(row.seq))
      .sort((a, b) => a.seq - b.seq),
    mappingHeads: mappingHeadsSince(before.mappingHeads, after.mappingHeads),
    dispositions: after.dispositions.filter((row) => !dispSeqs.has(row.seq)),
    audits: after.audits.filter((row) => !auditSeqs.has(row.seq)),
    workPackages: after.workPackages.filter((row) => !wpIds.has(row.id)),
    departments: changedSince(before.departments, after.departments),
    programs: changedSince(before.programs, after.programs),
    projects: changedSince(before.projects, after.projects),
    resources: after.resources.filter((row) => !resourceIds.has(row.id)),
    rateEntries: after.rateEntries.filter((row) => !rateSeqs.has(row.seq)),
    projectDefaultRates: after.projectDefaultRates.filter((row) => !defaultRateSeqs.has(row.seq)),
    connectors: changedSince(before.connectors, after.connectors),
    connectorScopeEvents: after.connectorScopeEvents.filter((row) => !scopeSeqs.has(row.seq)),
    connectorSettingEvents: after.connectorSettingEvents.filter((row) => !settingSeqs.has(row.seq)),
    mappingRules: changedSince(before.mappingRules, after.mappingRules).sort((a, b) =>
      a.id.localeCompare(b.id),
    ),
    ...membershipsSince(before.memberships, after.memberships),
  };
}

/** Drops the database-allocated `seq`, which the expectations cannot know. */
export function withoutSeq<T extends { seq: number }>(rows: readonly T[]): Omit<T, 'seq'>[] {
  return rows.map(({ seq: _seq, ...rest }) => rest);
}
