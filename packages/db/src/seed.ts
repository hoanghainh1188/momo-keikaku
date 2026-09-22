/**
 * Seeds the demo Tenant/Department/Program/Project and replays the `fixture` Connector's six
 * weekly Tracker Snapshots into the Actuals Ledger (FR-19 on demand, no pg-boss cron
 * in the demo — the build brief defers the scheduler).
 *
 * Idempotent: it truncates the demo tables first.
 *
 * TWO HALVES, AND THE SPLIT IS LOAD-BEARING. `seedInTenant` below is the demo seed: it
 * refuses a second Tenant, opens the maintenance hatch and TRUNCATEs. `writeTenantRows`
 * is the *row writer* — the inserts and nothing else — and it is shared with
 * `probe-tenants.ts`, which builds the cross-tenant harness's two probe Tenants. One
 * definition, because two would drift and the harness would then be proving isolation
 * over a dataset that is not the one the application actually stores.
 *
 * WHICH ROLE THIS RUNS AS — decided in story 1.2 slice 1, recorded here because the answer
 * is not obvious. It keeps the OWNING role (DATABASE_URL), for two reasons that the
 * restricted application role cannot satisfy:
 *
 *   1. It TRUNCATEs. TRUNCATE is not in any class's grant in `table-classes.ts` and must
 *      not be: an application role that can empty `audit_log` makes the append-only
 *      argument false.
 *   2. It writes the `tenant` row itself, which is `global` — the application role holds
 *      SELECT there and nothing else, because a Tenant is provisioned by the owner (and,
 *      from story 1.3, by a use case that audits it), never by a request.
 *
 * It still runs every write inside `withTenant`, on `tx`. That is not decoration: it is
 * what makes the seed exercise the same path the application does, so a policy that would
 * reject an application write shows up here rather than in production. The owner is
 * subject to FORCE row-level security like anyone else; only a superuser is not, and the
 * local/CI `momo` role happens to be one — which is precisely why the isolation gates in
 * `rls.test.ts` connect as the application role instead.
 *
 * The composition root is `scripts/seed.ts`: this module takes its handle as an argument
 * because `packages/db` may not read the environment.
 */
import { encode } from '@momo/domain';
import { sql } from 'drizzle-orm';
import type { Db } from './client';
import { actorOf, DEMO_USERS } from './demo-identities';
import { buildDemoState, mhFromJson, type DemoState } from './fixtures';
import * as s from './schema';
import { tenantMembership } from './schema-membership';
import { MAINTENANCE_SETTING } from './table-classes';
import { withTenant, type Tx } from './with-tenant';

/**
 * Every table the reseed empties, children first. It must name every table in `TABLE_REGISTRY`:
 * there are no foreign keys, so `CASCADE` reaches nothing and a table left off keeps its rows
 * across a reseed. `registry.test.ts` holds it to the registry.
 */
export const TRUNCATE_ORDER: readonly string[] = [
  'audit_log',
  'disposition_event',
  'mapping_event',
  'mapping_rule',
  'actuals_ledger_entry',
  'ticket_observation',
  'tracker_snapshot',
  'connector',
  'baseline_wp',
  'baseline_version',
  'work_package',
  'rate_entry',
  'project_default_rate_entry',
  'resource',
  'project',
  'program',
  'department',
  // Story 1.4 slice 1: the identity tables and the membership bridge. `global`, so TRUNCATE
  // empties them for every Tenant — which the single-Tenant guard below already requires.
  // Slice 4 adds `identity_event`, also global, ahead of the users it names.
  'identity_event',
  'tenant_membership',
  'session',
  'account',
  'verification',
  'auth_user',
  'tenant',
];

/** A Postgres identifier, quoted — `session`, `account` and `auth_user` are not safe bare. */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

async function chunked<T>(rows: T[], size: number, fn: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

/**
 * What a caller must decide before the row writer can write a *second* Tenant safely.
 *
 * Both fields exist because of traps that are invisible until a second Tenant appears,
 * and both are deliberately the WRITER's responsibility rather than the caller's — see
 * `writeTenantRows` for what each one closes.
 */
export interface TenantRowWriteOptions {
  /**
   * Prefixed onto every identifier and literal the writer invents rather than reads out
   * of the `DemoState` it is given.
   *
   * `blwp-${i}`, `led-${seq}`, `map-${seq}`, the Connector id and the two seeded users are
   * built INSIDE this function out of values a relabelled fixture never sees, so without a
   * prefix a second Tenant collides with the first on globally unique primary keys. The
   * demo seed passes `''`, which leaves every id exactly as it was.
   */
  readonly idPrefix: string;
  /**
   * Added to every `seq` the CALLER allocates — `actuals_ledger_entry` and `mapping_event`,
   * the two tables `table-classes.ts` marks `clientAllocatedSeq`. Their `seq` is a global
   * primary key with no identity default, so two Tenants seeded from the same fixture both
   * start at 1 and collide. The demo seed passes `0`. Also added to fixture-relative identity
   * `seq` values (`baseline_version`, Rates, …) so a reseed no longer depends on
   * `RESTART IDENTITY` (story 1.8).
   */
  readonly seqOffset: number;
  /**
   * The scrypt hash every seeded member's credential account carries (story 1.4 slice 1), or
   * absent to write the members WITHOUT credential accounts — the probe Tenants, which nobody
   * signs in to. The demo seed passes the hash of `SEED_DEMO_PASSWORD`, which
   * `scripts/seed.ts` computes through `@momo/db-auth`: `packages/db` never sees the password.
   */
  readonly passwordHash?: string;
  /**
   * When set, stamps `demo_anchor`, Baseline `recordedAt`, Rate `effectiveFrom`, member
   * timestamps and the seed audit `at` from this Clock (AD-15). Structural — `packages/db`
   * never imports `@momo/adapters`. Probes omit it and keep the fixture anchor.
   */
  readonly clock?: { readonly now: () => Date };
  /**
   * When true, skip Tenant / Department / Program / members / Resources / Rates — used by the
   * load seed after the first project has written the Tenant shell (story 1.8).
   */
  readonly projectOnly?: boolean;
  /**
   * 0-based load-project index. When set, `project_default_rate` / related audit seq bands are
   * `1_000 + projectIndex` — stable and collision-free across the 5×500 shape (story 1.8).
   */
  readonly projectIndex?: number;
}

/** The demo seed's own options: no prefix, no offset — byte-for-byte what it wrote before. */
export const DEMO_ROW_WRITE_OPTIONS: TenantRowWriteOptions = { idPrefix: '', seqOffset: 0 };

/**
 * Fixture-relative identity seq: fixture value + the Tenant's band offset.
 * Exported so tests pin the formula (story 1.8); `writeTenantRows` is the sole writer.
 */
export function fixtureRelativeSeq(fixtureValue: number, offset: number): number {
  return fixtureValue + offset;
}

function isoDateUtc(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

export interface TenantRowWriteResult {
  readonly tenantId: string;
  /**
   * The `baseline_version.seq` Postgres actually allocated, which is what every ledger row
   * was written against. Not the fixture's `1`: see `writeTenantRows`.
   */
  readonly activeBaselineSeq: number;
  readonly counts: {
    readonly wps: number;
    readonly baselineWps: number;
    readonly snapshots: number;
    readonly ledgerEntries: number;
    readonly mappingEvents: number;
  };
}

/**
 * Writes one Tenant's complete dataset — its rows, its members — and nothing else.
 *
 * No TRUNCATE, no guard, no maintenance hatch: those belong to the demo seed, which is the
 * only caller that owns the whole database. This function assumes `tx` is already inside
 * `withTenant(state.fixture.tenant.id)`.
 *
 * SEQUENCE VALUES ARE FIXTURE-RELATIVE (story 1.8). Identity columns
 * (`baseline_version`, Rates, snapshots, audit) are written with `OVERRIDING SYSTEM VALUE`
 * at `fixtureSeq + seqOffset`, so a reseed after leftover probe rows does not depend on
 * `RESTART IDENTITY`. A `fixtureSeq → allocatedSeq` map translates every ledger
 * `activeBaselineVersionSeq` (multi-baseline ready).
 */
export async function writeTenantRows(
  tx: Tx,
  state: DemoState,
  options: TenantRowWriteOptions,
): Promise<TenantRowWriteResult> {
  const f = state.fixture;
  const tenantId = f.tenant.id;
  /** Every id and literal this function invents, rather than reads out of `state`. */
  const own = (value: string) => `${options.idPrefix}${value}`;
  const stamp = options.clock?.now() ?? new Date(state.anchor);
  const rateFrom = options.clock ? isoDateUtc(stamp) : '2026-01-01';
  const projectOnly = options.projectOnly === true;

  if (!projectOnly) {
    await tx.insert(s.tenant).values({ id: tenantId, name: f.tenant.name });
    await tx
      .insert(s.department)
      .values({ id: f.department.id, tenantId, name: f.department.name });
    // FR-1's middle tier (story 1.3 slice 2): one Program in the Department, holding the Project.
    await tx.insert(s.program).values({
      id: f.program.id,
      tenantId,
      departmentId: f.department.id,
      name: f.program.name,
    });

    // The Tenant's people (story 1.4 slice 1): users, their memberships and — for the demo seed
    // only — credential accounts. Names are opaque for a probe Tenant: the demo PM's name is also a
    // Resource name, and the harness scans probe results for the demo Tenant's strings.
    await writeMembers(tx, tenantId, f.project.id, own, options.passwordHash, stamp.toISOString());

    await tx.insert(s.resource).values(
      f.resources.map((r) => ({
        id: r.id,
        tenantId,
        departmentId: f.department.id,
        name: r.name,
        role: r.role,
        trackerAccountIds: [r.accountId],
      })),
    );
    await tx
      .insert(s.rateEntry)
      .overridingSystemValue()
      .values(
        f.resources.map((r, i) => ({
          seq: fixtureRelativeSeq(i + 1, options.seqOffset),
          tenantId,
          resourceId: r.id,
          effectiveFrom: rateFrom,
          yenPerHour: r.yenPerHour,
        })),
      );
  }

  await tx.insert(s.project).values({
    id: f.project.id,
    tenantId,
    departmentId: f.department.id,
    programId: f.program.id,
    name: f.project.name,
    clientName: f.project.clientName,
    contractType: f.project.contractType,
    tzOffsetMinutes: f.project.tzOffsetMinutes,
    teireiWeekday: f.project.teireiWeekday,
    defaultRateJpy: f.project.defaultRateYenPerHour,
    eacMethod: 'typical',
    calendarJp: f.project.calendar.jp,
    calendarVn: f.project.calendar.vn,
    demoAnchor: stamp,
  });

  // Story 1.6: the Project's default Rate history — head matches `project.default_rate_jpy`.
  // Fixture-relative seq: demo uses 1; load projects use a stable per-project band (loop index).
  const projectDefaultSeq =
    options.projectIndex !== undefined ? 1_000 + options.projectIndex : 1;
  await tx
    .insert(s.projectDefaultRateEntry)
    .overridingSystemValue()
    .values({
      seq: fixtureRelativeSeq(projectDefaultSeq, options.seqOffset),
      tenantId,
      projectId: f.project.id,
      effectiveFrom: rateFrom,
      yenPerHour: f.project.defaultRateYenPerHour,
    });

  await tx.insert(s.workPackage).values(
    state.wps.map((w) => ({
      id: w.id,
      tenantId,
      projectId: f.project.id,
      wbsCode: w.wbsCode,
      name: w.name,
      parentId: w.parentId,
      isLeaf: w.isLeaf,
      isMilestone: w.isMilestone,
      isCatchAll: w.isCatchAll,
      start: w.start,
      finish: w.finish,
      plannedMh: w.plannedMh,
      completedAt: w.completedAt ? new Date(w.completedAt) : null,
      milestoneDoneAt: w.milestoneDoneAt,
      assignedResourceIds: w.assignedResourceIds,
      deletedAt: null,
    })),
  );

  // Multi-baseline map: insert every version the state carries, in seq order, with
  // fixture-relative identity values; translate ledger references through the map.
  const baselineSeqMap = new Map<number, number>();
  const versions = [...state.baselineVersions].sort((a, b) => a.seq - b.seq);
  if (versions.length === 0) {
    throw new Error('writeTenantRows requires at least one Baseline version in state');
  }
  for (const version of versions) {
    const [bv] = await tx
      .insert(s.baselineVersion)
      .overridingSystemValue()
      .values({
        seq: fixtureRelativeSeq(version.seq, options.seqOffset),
        id: version.id,
        tenantId,
        projectId: f.project.id,
        reason: version.reason,
        recordedAt: options.clock ? stamp : new Date(version.recordedAt),
        actor: actorOf(own(DEMO_USERS.linh.id)),
      })
      .returning({ seq: s.baselineVersion.seq });
    // Allocated value must equal the fixture-relative stamp (OVERRIDING SYSTEM VALUE).
    baselineSeqMap.set(version.seq, Number(bv!.seq));
  }
  const activeBaselineSeq = baselineSeqMap.get(
    Math.max(...versions.map((v) => v.seq)),
  )!;

  const referenced = [
    ...new Set(
      state.ledger
        .map((e) => e.activeBaselineVersionSeq)
        .filter((seq): seq is number => seq !== null),
    ),
  ].sort((a, b) => a - b);
  for (const fixtureBaselineSeq of referenced) {
    if (!baselineSeqMap.has(fixtureBaselineSeq)) {
      throw new Error(
        `ledger references Baseline fixture seq ${fixtureBaselineSeq}, which was not inserted. ` +
          `Known fixture seqs: ${[...baselineSeqMap.keys()].join(', ') || '(none)'}.`,
      );
    }
  }

  const baselineWps =
    versions.find((v) => v.seq === Math.max(...versions.map((x) => x.seq)))?.wps ??
    f.baseline.wps.map((b) => ({ ...b, baselineMh: mhFromJson(b.baselineMh) }));

  await tx.insert(s.baselineWp).values(
    baselineWps.map((b, i) => ({
      id: own(projectOnly ? `blwp-${f.project.id}-${i}` : `blwp-${i}`),
      tenantId,
      baselineVersionSeq: activeBaselineSeq,
      wpId: b.wpId,
      start: b.start,
      finish: b.finish,
      baselineMh: typeof b.baselineMh === 'bigint' ? b.baselineMh : mhFromJson(b.baselineMh),
      isMilestone: b.isMilestone,
    })),
  );

  const connectorId = own(projectOnly ? `con-fixture-${f.project.id}` : 'con-fixture-ec2');
  await tx.insert(s.connector).values({
    id: connectorId,
    tenantId,
    projectId: f.project.id,
    adapter: 'fixture',
    scope: own(
      projectOnly
        ? `project key ${f.project.id} (all issue types)`
        : 'project key EC2 (all issue types)',
    ),
    spaceLabel: own(
      projectOnly
        ? `${f.project.id}.backlog.jp (fixture replay)`
        : 'osaka-retail.backlog.jp (fixture replay)',
    ),
  });

  if (f.mappingRules.length > 0) {
    await tx.insert(s.mappingRule).values(
      f.mappingRules.map((r) => ({
        id: r.id,
        tenantId,
        projectId: f.project.id,
        priority: r.priority,
        name: r.name,
        wpId: r.wpId,
        matchField: r.match.field,
        matchValue: r.match.value,
      })),
    );
  }

  // --- the replayed Connector
  for (let i = 0; i < state.snapshots.length; i += 1) {
    const snap = state.snapshots[i]!;
    await tx
      .insert(s.trackerSnapshot)
      .overridingSystemValue()
      .values({
        seq: fixtureRelativeSeq(i + 1, options.seqOffset),
        id: snap.snapshotId,
        tenantId,
        connectorId,
        observedAt: new Date(snap.observedAt),
        measurementBasis: snap.hoursFieldPresent ? 'hours' : 'count',
        ticketCount: snap.tickets.length,
      });
  }
  // FR-19: only the latest snapshot's observations are needed for the demo's
  // Percent Complete; older observations are stored for the two most recent
  // snapshots so period deltas can be inspected. (Retention/compaction: TODO.)
  for (const snap of state.snapshots.slice(-2)) {
    await chunked(snap.tickets, 500, (batch) =>
      tx.insert(s.ticketObservation).values(
        batch.map((t) => ({
          id: `${snap.snapshotId}-${t.trackerIssueId}`,
          tenantId,
          snapshotId: snap.snapshotId,
          trackerIssueId: t.trackerIssueId,
          key: t.key,
          title: t.title,
          statusId: t.statusId,
          resolved: t.resolved,
          estimateMh: t.estimateMh,
          actualMh: t.actualMh,
          assigneeAccountId: t.assigneeAccountId,
          issueTypeId: t.issueTypeId,
          categoryIds: t.categoryIds,
          milestoneIds: t.milestoneIds,
          createdAt: new Date(t.createdAt),
        })),
      ),
    );
  }

  const snapshotOfEntry = (windowEnd: string) =>
    state.snapshots.find((x) => x.observedAt === windowEnd)?.snapshotId ??
    state.snapshots[state.snapshots.length - 1]?.snapshotId ??
    null;

  if (state.ledger.length > 0) {
    await chunked(state.ledger, 500, (batch) =>
      tx.insert(s.actualsLedgerEntry).values(
        batch.map((e) => ({
          seq: e.seq + options.seqOffset,
          id: own(`led-${e.seq}`),
          tenantId,
          connectorId,
          ticketId: e.ticketId,
          kind: e.kind,
          deltaMh: e.deltaMh,
          windowStart: e.windowStart ? new Date(e.windowStart) : null,
          windowEnd: new Date(e.windowEnd),
          assigneeAccountId: e.assigneeAccountId,
          activeBaselineVersionSeq:
            e.activeBaselineVersionSeq === null
              ? null
              : baselineSeqMap.get(e.activeBaselineVersionSeq)!,
          snapshotId: snapshotOfEntry(e.windowEnd)!,
        })),
      ),
    );
  }

  if (state.mappingEvents.length > 0) {
    await chunked(state.mappingEvents, 500, (batch) =>
      tx.insert(s.mappingEvent).values(
        batch.map((m) => ({
          seq: m.seq + options.seqOffset,
          id: own(`map-${m.seq}`),
          tenantId,
          projectId: f.project.id,
          ticketId: m.ticketId,
          wpId: m.wpId,
          source: m.source,
          ruleId: m.ruleId ?? null,
          at: new Date(m.at),
          actor: m.actor,
        })),
      ),
    );
  }

  const auditFixtureSeq = projectOnly ? 100 + projectDefaultSeq : 1;
  await tx
    .insert(s.auditLog)
    .overridingSystemValue()
    .values({
      seq: fixtureRelativeSeq(auditFixtureSeq, options.seqOffset),
      tenantId,
      actor: own('system:seed'),
      action: 'demo.seed',
      target: f.project.id,
      payload: encode({
        snapshots: state.snapshots.length,
        ledgerEntries: state.ledger.length,
        mappingEvents: state.mappingEvents.length,
        anchor: stamp.toISOString(),
      }),
      at: stamp,
    });

  return {
    tenantId,
    activeBaselineSeq,
    counts: {
      wps: state.wps.length,
      baselineWps: baselineWps.length,
      snapshots: state.snapshots.length,
      ledgerEntries: state.ledger.length,
      mappingEvents: state.mappingEvents.length,
    },
  };
}

/**
 * The demo Tenant's members, or a probe Tenant's: one user per `DEMO_USERS` entry, its
 * membership in `tenantId`, and — when a hash is given — its credential account (Better Auth's
 * `credential` provider, `account_id` = the user id, which is what `signInEmail` looks up).
 *
 * `own` prefixes every invented value, so two Tenants written from the same fixture never share
 * a user id or an email. Timestamps are the demo anchor: `packages/db` reads no wall clock.
 */
async function writeMembers(
  tx: Tx,
  tenantId: string,
  projectId: string,
  own: (value: string) => string,
  passwordHash: string | undefined,
  anchor: string,
): Promise<void> {
  const at = new Date(anchor);
  const probe = own('') !== '';
  const members = Object.entries(DEMO_USERS).map(([handle, user]) => ({
    handle,
    user,
    id: own(user.id),
  }));
  await tx.insert(s.authUser).values(
    members.map(({ handle, user, id }) => ({
      id,
      name: probe ? own(`member-${handle}`) : user.name,
      email: own(user.email),
      emailVerified: true,
      createdAt: at,
      updatedAt: at,
    })),
  );
  if (passwordHash !== undefined) {
    await tx.insert(s.account).values(
      members.map(({ id }) => ({
        id: own(`acct-${id}`),
        accountId: id,
        providerId: 'credential',
        userId: id,
        password: passwordHash,
        createdAt: at,
        updatedAt: at,
      })),
    );
  }
  await tx.insert(tenantMembership).values(
    members.map(({ user, id }) => ({
      userId: id,
      tenantId,
      role: user.role,
      projectIds: user.onDemoProject ? [projectId] : [],
    })),
  );
}

/** What the demo/load seed needs from its composition root. */
export interface SeedOptions {
  /** The scrypt hash of `SEED_DEMO_PASSWORD`, computed by `scripts/seed.ts` via `@momo/db-auth`. */
  readonly demoPasswordHash: string;
  /**
   * Product Clock (AD-15). Stamps Baseline / Rates / `demo_anchor` / seed audit. Injected by
   * `scripts/seed.ts` — `packages/db` never imports `@momo/adapters`.
   */
  readonly clock: { readonly now: () => Date };
  /** `demo` keeps `prj-ec2`; `load` writes the NFR-P1 5×500 shape. */
  readonly profile: 'demo' | 'load';
}

/**
 * @param db the OWNING role's handle — see the module note. `scripts/seed.ts` builds it
 *   from `config.DATABASE_URL`.
 */
export async function seed(db: Db, options: SeedOptions): Promise<void> {
  if (options.demoPasswordHash.trim() === '') {
    throw new Error('seed was given an empty demo password hash; hash SEED_DEMO_PASSWORD first.');
  }
  if (options.profile === 'load') {
    const { generateLoadFixture, loadProjectAsDemoState } = await import('./load-generator');
    const shape = generateLoadFixture();
    const first = loadProjectAsDemoState(shape, 0);
    await withTenant(db, first.fixture.tenant.id, (tx) =>
      seedLoadInTenant(tx, shape, options),
    );
    return;
  }
  const state = buildDemoState();
  const tenantId = state.fixture.tenant.id;
  await withTenant(db, tenantId, (tx) => seedInTenant(tx, state, options));
}

async function seedInTenant(tx: Tx, state: DemoState, options: SeedOptions): Promise<void> {
  const tenantId = state.fixture.tenant.id;
  await assertSingleTenantDatabase(tx, tenantId);
  await truncateForReseed(tx);

  const written = await writeTenantRows(tx, state, {
    ...DEMO_ROW_WRITE_OPTIONS,
    passwordHash: options.demoPasswordHash,
    clock: options.clock,
  });

  console.log(
    `seeded (demo): ${written.counts.wps} WPs, ${written.counts.baselineWps} baseline WPs, ` +
      `${written.counts.snapshots} snapshots, ${written.counts.ledgerEntries} ledger entries, ` +
      `${written.counts.mappingEvents} mapping events`,
  );
}

async function seedLoadInTenant(
  tx: Tx,
  shape: import('./load-generator').LoadFixtureShape,
  options: SeedOptions,
): Promise<void> {
  const { loadProjectAsDemoState, LOAD_PROJECT_COUNT, LOAD_WP_PER_PROJECT } = await import(
    './load-generator'
  );
  const first = loadProjectAsDemoState(shape, 0);
  const tenantId = first.fixture.tenant.id;
  await assertSingleTenantDatabase(tx, tenantId);
  await truncateForReseed(tx);

  const allProjectIds = shape.projects.map((p) => p.id);
  let totalWps = 0;
  for (let i = 0; i < shape.projects.length; i += 1) {
    const state = loadProjectAsDemoState(shape, i);
    if (i === 0) {
      const written = await writeTenantRows(tx, state, {
        ...DEMO_ROW_WRITE_OPTIONS,
        passwordHash: options.demoPasswordHash,
        clock: options.clock,
        projectIndex: i,
      });
      totalWps += written.counts.wps;
      await tx
        .update(tenantMembership)
        .set({ projectIds: allProjectIds })
        .where(
          sql`${tenantMembership.tenantId} = ${tenantId} AND ${tenantMembership.role} = 'pm'`,
        );
    } else {
      const written = await writeTenantRows(tx, state, {
        ...DEMO_ROW_WRITE_OPTIONS,
        clock: options.clock,
        projectOnly: true,
        projectIndex: i,
      });
      totalWps += written.counts.wps;
    }
  }

  console.log(
    `seeded (load): ${LOAD_PROJECT_COUNT} Projects × ${LOAD_WP_PER_PROJECT} WPs ` +
      `(${totalWps} total), ${shape.resources.length} Resources`,
  );
}

async function assertSingleTenantDatabase(tx: Tx, tenantId: string): Promise<void> {
  // The seed TRUNCATEs every registered table. Refuse when MORE THAN ONE Tenant is present
  // (e.g. leftover probes beside the demo) — that would destroy rows the operator did not name.
  // A single Tenant is fine even when its id differs from the profile being seeded: switching
  // `SEED_PROFILE=demo|load` replaces that one Tenant deliberately.
  const existing = await tx.execute<{ id: string }>(sql`SELECT id FROM tenant ORDER BY id`);
  if (existing.rows.length <= 1) return;
  throw new Error(
    `Refusing to seed: this database holds ${existing.rows.length} Tenants — ` +
      `${existing.rows.map((row) => row.id).join(', ')} (target would be ${tenantId}). The seed ` +
      'TRUNCATEs, and TRUNCATE is exempt from row-level security, so it would destroy every Tenant. ' +
      'Drop the database, or delete the extra Tenants deliberately, then seed again.',
  );
}

/**
 * Empty every registered table. Does NOT `RESTART IDENTITY` — sequence values are
 * fixture-relative via `OVERRIDING SYSTEM VALUE` (story 1.8), so leftover probe counters
 * no longer silently reclassify Actuals on reseed.
 */
async function truncateForReseed(tx: Tx): Promise<void> {
  await tx.execute(sql`SELECT set_config(${MAINTENANCE_SETTING}, 'on', true)`);
  await tx.execute(sql.raw(`TRUNCATE ${TRUNCATE_ORDER.map(quoteIdent).join(', ')} CASCADE`));
}
