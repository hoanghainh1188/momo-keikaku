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
import { encode, INITIAL_BASIS_LATCH, replayBasisLatch, resolveCalendarVersion } from '@momo/domain';
import { sql } from 'drizzle-orm';
import type { Db } from './client';
import { actorOf, DEMO_USERS } from './demo-identities';
import { buildDemoState, type DemoState } from './fixtures';
import * as s from './schema';
import { tenantMembership } from './schema-membership';
import { MAINTENANCE_SETTING } from './table-classes';
import { lockWatermark } from './watermark-lock';
import { withTenant, type Tx } from './with-tenant';

/**
 * Every table the reseed empties, children first. It must name every table in `TABLE_REGISTRY`:
 * `CASCADE` reaches a table only through a foreign key that references it, so a table left off
 * with nothing pointing at it keeps its rows across a reseed. `registry.test.ts` holds it to the
 * registry.
 */
export const TRUNCATE_ORDER: readonly string[] = [
  'audit_log',
  'disposition_event',
  'mapping_event',
  'mapping_rule',
  'actuals_ledger_entry',
  'connector_overlap',
  'connector_ownership_event',
  'ticket_observation',
  'tracker_snapshot',
  'tracker_snapshot_attempt',
  'measurement_basis_event',
  'connector_setting_event',
  'connector_scope_event',
  'fixture_cursor',
  'ticket',
  'tracker_account_link_event',
  'tracker_account',
  'connector',
  'baseline_wp',
  'baseline_version',
  'wp_schedule',
  'schedule_run',
  'holiday_calendar_version',
  'calendar_day_event',
  'custom_field_value',
  'custom_field_definition',
  'pct_override_event',
  'wp_status_event',
  'wp_dependency',
  'work_package',
  'rate_entry',
  'project_default_rate_entry',
  'resource',
  'project_setting_event',
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
   * Added to every fixture-relative `seq` the seed writes with `OVERRIDING SYSTEM VALUE` —
   * `actuals_ledger_entry` and `mapping_event` (identity columns since the watermark slice's
   * migration 0001, D1), and Rates, snapshots and audit (story 1.8). `seq` is a global primary
   * key, so two Tenants seeded from the same fixture would both start at 1 and collide. The demo
   * seed passes `0`. It also keeps a reseed independent of `RESTART IDENTITY`.
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
   * When set, stamps `demo_anchor`, member timestamps, the seed's `wp_status_event.at` and the
   * seed audit `at` from this Clock (AD-15). Structural — `packages/db`
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

export interface TenantRowWriteResult {
  readonly tenantId: string;
  readonly counts: {
    readonly wps: number;
    /** `wp_status_event` rows: one per WP the fixture records an actual finish for. */
    readonly statusEvents: number;
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
 * SEQUENCE VALUES ARE FIXTURE-RELATIVE (story 1.8). Identity columns (Rates, snapshots,
 * audit) are written with `OVERRIDING SYSTEM VALUE` at `fixtureSeq + seqOffset`, so a reseed
 * after leftover probe rows does not depend on `RESTART IDENTITY`.
 *
 * NO BASELINE (story 2.1, founder decision 2-A). A Baseline pins a `schedule_run` by foreign key
 * (AD-26), and there is no engine yet to produce one, so the writer records none — and every
 * ledger entry's `active_baseline_version_seq` is null, which is what AD-7 writes when no Baseline
 * was committed before the snapshot. The demo has no Baseline and no EVM until Epic 4. The
 * `DemoState`'s Baseline versions are read by nothing here.
 *
 * THE FOREIGN KEYS DECIDE THE ORDER (story 2.1): every row is written after the rows it
 * references — Project before its Work Packages, a Work Package before the Mapping Rules and
 * events that name it, a Tracker Snapshot before its observations and ledger entries.
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
  // Rate `effectiveFrom` must cover the whole fixture timeline (domain rates use
  // `2026-01-01`). Stamping it from the Clock made seeded Rates start at the fixture
  // "now" and broke Review numbers vs probes / the golden corpus (story 1.8 CI).
  const rateFrom = '2026-01-01';
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

  // Story 5.5: seed project_setting_event head from project columns (Period placement).
  await tx.insert(s.projectSettingEvent).values({
    tenantId,
    projectId: f.project.id,
    tzOffsetMinutes: f.project.tzOffsetMinutes,
    teireiWeekday: f.project.teireiWeekday,
    actor: actorOf(own(DEMO_USERS.linh.id)),
    at: stamp,
  });

  // Story 2.12: materialise a real resolved Holiday Calendar version (never synthetic-2.9).
  const seededCalendar = resolveCalendarVersion({
    calendarJp: f.project.calendar.jp,
    calendarVn: f.project.calendar.vn,
  });
  await lockWatermark({ tx, tenantId }, { kind: 'project', projectId: f.project.id });
  await tx.insert(s.holidayCalendarVersion).values({
    tenantId,
    projectId: f.project.id,
    nonWorkingDays: [...seededCalendar.nonWorkingDays],
    rangeStart: seededCalendar.rangeStart,
    rangeEnd: seededCalendar.rangeEnd,
    nationalSets: [...seededCalendar.nationalSets],
    nationalDatasetVersion: seededCalendar.nationalDatasetVersion,
    reason: 'seed',
    actor: actorOf(own(DEMO_USERS.linh.id)),
    at: stamp,
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

  // `is_leaf` is generated from `child_count` (AD-25), so the writer states the count and the
  // database derives the flag. The fixture's own `isLeaf` must agree with its parentage; a
  // disagreement would silently turn a summary into a leaf, so it is refused instead.
  const childCounts = childCountsOf(state.wps);
  const disagreeing = state.wps.filter((w) => w.isLeaf !== ((childCounts.get(w.id) ?? 0) === 0));
  if (disagreeing.length > 0) {
    throw new Error(
      `writeTenantRows: these Work Packages' isLeaf disagrees with their children: ` +
        disagreeing.map((w) => w.id).join(', '),
    );
  }
  // Scheduling inputs (duration, constraint) are left at their defaults — null and `asap` — and
  // the Project's three schedule settings null: no Work Package is schedulable until Epic 2's
  // stories write them through `app/schedule`'s fence. The fixture's planned `start`/`finish`
  // have no column any more (AD-30) and are not written anywhere.
  await tx.insert(s.workPackage).values(
    state.wps.map((w) => ({
      id: w.id,
      tenantId,
      projectId: f.project.id,
      wbsCode: w.wbsCode,
      name: w.name,
      parentId: w.parentId,
      childCount: childCounts.get(w.id) ?? 0,
      isMilestone: w.isMilestone,
      isCatchAll: w.isCatchAll,
      plannedMh: w.plannedMh,
      assignedResourceIds: w.assignedResourceIds,
      deletedAt: null,
    })),
  );

  // Actual dates live in `wp_status_event` alone (AD-25). A fixture WP with any actual date
  // becomes one event restating its whole actual state `(actualStart, actualFinish)`; a WP with
  // neither gets no event, so its head reads as no actual dates at all.
  const statusEvents = state.wps.flatMap((w) =>
    w.actualStart === null && w.actualFinish === null
      ? []
      : [
          {
            tenantId,
            projectId: f.project.id,
            wpId: w.id,
            actualStart: w.actualStart,
            actualFinish: w.actualFinish,
            source: 'seed',
            actor: actorOf(own(DEMO_USERS.linh.id)),
            at: stamp,
          },
        ],
  );
  if (statusEvents.length > 0) {
    await tx.insert(s.wpStatusEvent).values(statusEvents);
  }

  const connectorId = own(projectOnly ? `con-fixture-${f.project.id}` : 'con-fixture-ec2');
  const connectorScope = own(
    projectOnly
      ? `project key ${f.project.id} (all issue types)`
      : 'project key EC2 (all issue types)',
  );
  const connectorSite = projectOnly ? 'ec-phase2' : 'ec-phase2';
  const connectorSpaceLabel = own(
    projectOnly
      ? `${f.project.id}.backlog.jp (fixture replay)`
      : 'osaka-retail.backlog.jp (fixture replay)',
  );
  // Story 5.2: fixture Connectors are pre-approved so Review/Mapping demos keep loading.
  // No live apiKey — credentials stay null for fixture-replay.
  await tx.insert(s.connector).values({
    id: connectorId,
    tenantId,
    projectId: f.project.id,
    adapter: 'fixture',
    site: connectorSite,
    scope: connectorScope,
    spaceLabel: connectorSpaceLabel,
    approvalRecordedAt: stamp,
    approvalName: 'fixture',
  });
  const [scopeEvent] = await tx
    .insert(s.connectorScopeEvent)
    .values({
      tenantId,
      connectorId,
      projectId: f.project.id,
      scope: connectorScope,
      actor: 'system:seed',
      at: stamp,
    })
    .returning({ seq: s.connectorScopeEvent.seq });
  const fixtureScopeSeq = scopeEvent!.seq;

  // Story 5.7: seed Resolved `{Closed}`; latch basis after snapshots (below).
  await tx.insert(s.connectorSettingEvent).values({
    tenantId,
    connectorId,
    projectId: f.project.id,
    resolvedStatusIds: ['Closed'],
    actor: 'system:seed',
    at: stamp,
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
        adapterKind: snap.adapterKind ?? 'fixture',
        scopeSeq: fixtureScopeSeq,
      });
  }

  // Story 5.7: latch basis from complete fixture snaps (N=3 hysteresis).
  {
    const observed = state.snapshots.map((snap) =>
      snap.hoursFieldPresent ? ('hours' as const) : ('count' as const),
    );
    const advanced = replayBasisLatch(INITIAL_BASIS_LATCH, observed);
    await tx.insert(s.measurementBasisEvent).values({
      tenantId,
      connectorId,
      projectId: f.project.id,
      basis: advanced.basis,
      actor: 'system:seed',
      at: stamp,
    });
  }

  // AD-6: upsert Ticket + Tracker Account identity from the latest snapshot observations.
  const latestForIdentity = state.snapshots.at(-1);
  if (latestForIdentity) {
    const site = own(
      projectOnly ? `${f.project.id}.backlog.jp` : 'osaka-retail.backlog.jp',
    );
    const accounts = latestForIdentity.accounts ?? [];
    if (accounts.length > 0) {
      await chunked(accounts, 500, (batch) =>
        tx
          .insert(s.trackerAccount)
          .values(
            batch.map((a) => ({
              id: own(`ta-${a.accountId}`),
              tenantId,
              trackerKind: 'fixture',
              trackerSite: site,
              accountId: a.accountId,
              displayName: a.displayName,
              email: a.email ?? null,
            })),
          )
          .onConflictDoUpdate({
            target: [
              s.trackerAccount.tenantId,
              s.trackerAccount.trackerKind,
              s.trackerAccount.trackerSite,
              s.trackerAccount.accountId,
            ],
            set: {
              displayName: sql`excluded.display_name`,
              email: sql`excluded.email`,
            },
          }),
      );
      // Story 5.8: demo links as append-only events (live array already stamped on resource insert).
      // Fixture Resources may name accountIds absent from every snapshot (e.g. bk-1001 / Linh).
      // Upsert synthetic Tracker Account rows so link events satisfy the FK and cross-tenant
      // fixture-value coverage still sees those accountIds after link_seq_max rebuild.
      if (!projectOnly) {
        const seededAccountIds = new Set(accounts.map((a) => a.accountId));
        const missingLinked = f.resources.filter((r) => !seededAccountIds.has(r.accountId));
        if (missingLinked.length > 0) {
          await tx
            .insert(s.trackerAccount)
            .values(
              missingLinked.map((r) => ({
                id: own(`ta-${r.accountId}`),
                tenantId,
                trackerKind: 'fixture',
                trackerSite: site,
                accountId: r.accountId,
                displayName: r.name,
                email: null as string | null,
              })),
            )
            .onConflictDoUpdate({
              target: [
                s.trackerAccount.tenantId,
                s.trackerAccount.trackerKind,
                s.trackerAccount.trackerSite,
                s.trackerAccount.accountId,
              ],
              set: {
                displayName: sql`excluded.display_name`,
              },
            });
        }
        if (f.resources.length > 0) {
          await tx.insert(s.trackerAccountLinkEvent).values(
            f.resources.map((r) => ({
              tenantId,
              trackerAccountId: own(`ta-${r.accountId}`),
              resourceId: r.id,
              actor: 'system:seed',
              at: stamp,
            })),
          );
        }
      }
    }
    await chunked(latestForIdentity.tickets, 500, (batch) =>
      tx
        .insert(s.ticket)
        .values(
          batch.map((t) => ({
            id: own(`tkt-${t.trackerIssueId}`),
            tenantId,
            trackerKind: 'fixture',
            trackerSite: site,
            trackerIssueId: t.trackerIssueId,
            ownerConnectorId: connectorId,
            projectId: f.project.id,
            key: t.key,
          })),
        )
        .onConflictDoUpdate({
          target: [
            s.ticket.tenantId,
            s.ticket.trackerKind,
            s.ticket.trackerSite,
            s.ticket.trackerIssueId,
          ],
          set: {
            // Story 5.6: ownership / Project move only via connector_ownership_event / first insert.
            key: sql`excluded.key`,
          },
        }),
    );
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
          estimateMh: t.estimateMh,
          actualMh: t.actualMh,
          assigneeAccountId: t.assigneeAccountId,
          issueTypeId: t.issueTypeId,
          parentIssueId: t.parentIssueId,
          trackerProjectId: t.trackerProjectId,
          attributes: t.attributes,
          createdAt: new Date(t.createdAt),
          hoursCleared: false,
        })),
      ),
    );
  }

  const snapshotOfEntry = (windowEnd: string): string => {
    const id =
      state.snapshots.find((x) => x.observedAt === windowEnd)?.snapshotId ??
      state.snapshots.at(-1)?.snapshotId;
    if (id === undefined) {
      throw new Error(
        'writeTenantRows: ledger has entries but state.snapshots is empty — cannot resolve snapshotId',
      );
    }
    return id;
  };

  const prevSnapshotOfEntry = (windowStart: string | null): string | null => {
    if (windowStart === null) return null;
    return state.snapshots.find((x) => x.observedAt === windowStart)?.snapshotId ?? null;
  };

  if (state.ledger.length > 0) {
    await chunked(state.ledger, 500, (batch) =>
      tx.insert(s.actualsLedgerEntry).overridingSystemValue().values(
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
          // No Baseline is written (decision 2-A), so none was active for any entry.
          activeBaselineVersionSeq: null,
          snapshotId: snapshotOfEntry(e.windowEnd),
          prevSnapshotId: prevSnapshotOfEntry(e.windowStart),
        })),
      ),
    );
  }

  if (state.mappingEvents.length > 0) {
    await chunked(state.mappingEvents, 500, (batch) =>
      tx.insert(s.mappingEvent).overridingSystemValue().values(
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

  // OVERRIDING SYSTEM VALUE does not advance the identity counter. Without this, the next
  // product insert that uses the default (e.g. `appendResourceRate`, audit.record) collides
  // with the fixture seqs the seed just wrote (CI: duplicate key on rate_entry / audit_log).
  await syncIdentitySequences(tx);

  return {
    tenantId,
    counts: {
      wps: state.wps.length,
      statusEvents: statusEvents.length,
      snapshots: state.snapshots.length,
      ledgerEntries: state.ledger.length,
      mappingEvents: state.mappingEvents.length,
    },
  };
}

/** How many Work Packages name each Work Package as their parent (`work_package.child_count`). */
function childCountsOf(wps: readonly { readonly parentId: string | null }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const w of wps) {
    if (w.parentId !== null) counts.set(w.parentId, (counts.get(w.parentId) ?? 0) + 1);
  }
  return counts;
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
   * Product Clock (AD-15). Stamps `demo_anchor` / member and event times / seed audit. Injected by
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
    `seeded (demo): ${written.counts.wps} WPs, ${written.counts.statusEvents} actual-date events, ` +
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
 * no longer silently reclassify Actuals on reseed. After writing those values,
 * `writeTenantRows` calls `syncIdentitySequences` so the next identity default is past MAX.
 */
async function truncateForReseed(tx: Tx): Promise<void> {
  await tx.execute(sql`SELECT set_config(${MAINTENANCE_SETTING}, 'on', true)`);
  await tx.execute(sql.raw(`TRUNCATE ${TRUNCATE_ORDER.map(quoteIdent).join(', ')} CASCADE`));
}

/**
 * Tables whose `seq` is an identity column and that `writeTenantRows` stamps with
 * `OVERRIDING SYSTEM VALUE`. Keep this list aligned with those insert sites.
 * `actuals_ledger_entry` and `mapping_event` joined with the watermark slice (D1): their `seq`
 * became `GENERATED BY DEFAULT AS IDENTITY`, and the product's appends now take the identity
 * default, which must start past every fixture value written here.
 */
const IDENTITY_SEQ_TABLES = [
  'rate_entry',
  'project_default_rate_entry',
  'tracker_snapshot',
  'actuals_ledger_entry',
  'mapping_event',
  'disposition_event',
  'audit_log',
] as const;

/**
 * Advance each identity counter past `MAX(seq)` so a later default insert does not collide
 * with fixture-relative values written via `OVERRIDING SYSTEM VALUE`.
 *
 * ADVANCE, NEVER REWIND. These counters are per-table and therefore shared by every Tenant in
 * the database, while `MAX(seq)` is whatever rows happen to exist at this instant. Setting a
 * counter *to* that maximum moves it DOWN whenever rows above it have just been deleted —
 * which is routine: the test suites create and remove probe Tenants in parallel bands, so a
 * `createProbeTenant` in the 700,000,000 band could reset a counter another suite had already
 * carried to 860,000,000. The next ordinary insert then re-issued a `seq` a surviving row still
 * held, and Postgres refused it with `duplicate key value violates unique constraint
 * "audit_log_pkey"` — a failure that appeared in whichever suite lost the race, never in the one
 * that caused it. Found by the Epic 1 retrospective (F1); pinned by `seed-sequences.test.ts`.
 *
 * `GREATEST` against the counter's current position makes the operation monotonic, which is what
 * the name always promised. `pg_sequence_last_value` returns NULL for a counter never yet used,
 * hence the COALESCE.
 */
async function syncIdentitySequences(tx: Tx): Promise<void> {
  for (const table of IDENTITY_SEQ_TABLES) {
    const quoted = quoteIdent(table);
    // pg_get_serial_sequence wants a text literal (single-quoted), not an identifier.
    const seqRef = `pg_get_serial_sequence('${table}', 'seq')`;
    await tx.execute(
      sql.raw(
        `SELECT setval(${seqRef}, GREATEST(` +
          `COALESCE((SELECT MAX(seq) FROM ${quoted}), 1), ` +
          `COALESCE(pg_sequence_last_value(${seqRef}::regclass), 1)` +
          `), true)`,
      ),
    );
  }
}
