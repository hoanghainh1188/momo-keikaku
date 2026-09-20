/**
 * Seeds the demo Tenant/Department/Project and replays the `fixture` Connector's six
 * weekly Tracker Snapshots into the Actuals Ledger (FR-19 on demand, no pg-boss cron
 * in the demo — the build brief defers the scheduler).
 *
 * Idempotent: it truncates the demo tables first.
 *
 * WHICH ROLE THIS RUNS AS — decided in this story, recorded here because the answer is not
 * obvious. It keeps the OWNING role (DATABASE_URL), for two reasons that the restricted
 * application role cannot satisfy:
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
import { sql } from 'drizzle-orm';
import type { Db } from './client';
import { buildDemoState } from './fixtures';
import * as s from './schema';
import { MAINTENANCE_SETTING } from './table-classes';
import { withTenant, type Tx } from './with-tenant';

const TRUNCATE_ORDER = [
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
  'resource',
  'project',
  'app_user',
  'department',
  'tenant',
];

async function chunked<T>(rows: T[], size: number, fn: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

/**
 * @param db the OWNING role's handle — see the module note. `scripts/seed.ts` builds it
 *   from `config.DATABASE_URL`.
 */
export async function seed(db: Db): Promise<void> {
  const state = buildDemoState();
  const tenantId = state.fixture.tenant.id;
  // One transaction, one tenant: the truncate and all 16 inserts either land together or
  // not at all, and every one of them is issued with `app.tenant_id` bound.
  await withTenant(db, tenantId, (tx) => seedInTenant(tx, state));
}

async function seedInTenant(tx: Tx, state: ReturnType<typeof buildDemoState>): Promise<void> {
  const f = state.fixture;
  const tenantId = f.tenant.id;

  // TRUNCATE is exempt from row-level security by design — it is a table-level operation, so
  // no policy filters it — which means the truncate below would destroy EVERY Tenant's rows,
  // not just this one's. Re-seeding one Tenant must never be able to empty another's ledger.
  //
  // Refusing is the guard rather than a tenant-scoped DELETE, on purpose: the truncate carries
  // `RESTART IDENTITY`, and the identity counters are what make a re-seed reproduce the same
  // `baseline_version.seq` the fixture's ledger entries were recorded against. A DELETE would
  // leave those counters where they were, so the second seed would stamp a different active
  // Baseline sequence and silently reclassify the Actuals — exactly the kind of wrong figure
  // this story is upstream of. So: assert this is a single-Tenant database, and say whose
  // rows are in the way when it is not.
  const others = await tx.execute<{ id: string }>(
    sql`SELECT id FROM tenant WHERE id <> ${tenantId} ORDER BY id`,
  );
  if (others.rows.length > 0) {
    throw new Error(
      `Refusing to seed: this database also holds ${others.rows.length} other Tenant(s) — ` +
        `${others.rows.map((row) => row.id).join(', ')}. The seed TRUNCATEs, and TRUNCATE is ` +
        'exempt from row-level security, so it would destroy their rows too. Drop the database, ' +
        'or delete those Tenants deliberately, then seed again.',
    );
  }

  // The append-only tables now carry a BEFORE TRUNCATE trigger as well as a BEFORE
  // UPDATE OR DELETE one, and a trigger is a property of the table, so it refuses the owner
  // too. Opening the maintenance hatch is the honest way through: re-seeding IS maintenance,
  // and saying so in one transaction-scoped setting is better than a table that any statement
  // can empty. The setting is reset at COMMIT, like the tenant.
  await tx.execute(sql`SELECT set_config(${MAINTENANCE_SETTING}, 'on', true)`);
  await tx.execute(sql.raw(`TRUNCATE ${TRUNCATE_ORDER.join(', ')} RESTART IDENTITY CASCADE`));

  await tx.insert(s.tenant).values({ id: tenantId, name: f.tenant.name });
  await tx
    .insert(s.department)
    .values({ id: f.department.id, tenantId, name: f.department.name });

  // No auth in the demo: a single seeded PM session (build brief non-goal).
  await tx.insert(s.appUser).values([
    { id: 'user-linh', tenantId, email: 'linh@momo-digital.example', name: 'Nguyen Thi Linh', role: 'pm' },
    { id: 'user-hoang', tenantId, email: 'hoang@momo-digital.example', name: 'Hoang Hai', role: 'tenant_admin' },
  ]);

  await tx.insert(s.project).values({
    id: f.project.id,
    tenantId,
    departmentId: f.department.id,
    name: f.project.name,
    clientName: f.project.clientName,
    contractType: f.project.contractType,
    tzOffsetMinutes: f.project.tzOffsetMinutes,
    teireiWeekday: f.project.teireiWeekday,
    defaultRateJpy: f.project.defaultRateYenPerHour,
    eacMethod: 'typical',
    calendarJp: f.project.calendar.jp,
    calendarVn: f.project.calendar.vn,
    demoAnchor: new Date(state.anchor),
  });

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
  await tx.insert(s.rateEntry).values(
    f.resources.map((r) => ({
      tenantId,
      resourceId: r.id,
      effectiveFrom: '2026-01-01',
      yenPerHour: r.yenPerHour,
    })),
  );

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

  const [bv] = await tx
    .insert(s.baselineVersion)
    .values({
      id: f.baseline.id,
      tenantId,
      projectId: f.project.id,
      reason: f.baseline.reason,
      recordedAt: new Date(f.baseline.recordedAt),
      actor: 'user:linh',
    })
    .returning({ seq: s.baselineVersion.seq });

  await tx.insert(s.baselineWp).values(
    f.baseline.wps.map((b, i) => ({
      id: `blwp-${i}`,
      tenantId,
      baselineVersionSeq: bv!.seq,
      wpId: b.wpId,
      start: b.start,
      finish: b.finish,
      baselineMh: b.baselineMh,
      isMilestone: b.isMilestone,
    })),
  );

  const connectorId = 'con-fixture-ec2';
  await tx.insert(s.connector).values({
    id: connectorId,
    tenantId,
    projectId: f.project.id,
    adapter: 'fixture',
    scope: 'project key EC2 (all issue types)',
    spaceLabel: 'osaka-retail.backlog.jp (fixture replay)',
  });

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

  // --- the replayed Connector
  for (const snap of state.snapshots) {
    await tx.insert(s.trackerSnapshot).values({
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
    state.snapshots[state.snapshots.length - 1]!.snapshotId;

  await chunked(state.ledger, 500, (batch) =>
    tx.insert(s.actualsLedgerEntry).values(
      batch.map((e) => ({
        seq: e.seq,
        id: `led-${e.seq}`,
        tenantId,
        connectorId,
        ticketId: e.ticketId,
        kind: e.kind,
        deltaMh: e.deltaMh,
        windowStart: e.windowStart ? new Date(e.windowStart) : null,
        windowEnd: new Date(e.windowEnd),
        assigneeAccountId: e.assigneeAccountId,
        activeBaselineVersionSeq: e.activeBaselineVersionSeq,
        snapshotId: snapshotOfEntry(e.windowEnd),
      })),
    ),
  );

  await chunked(state.mappingEvents, 500, (batch) =>
    tx.insert(s.mappingEvent).values(
      batch.map((m) => ({
        seq: m.seq,
        id: `map-${m.seq}`,
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

  await tx.insert(s.auditLog).values({
    tenantId,
    actor: 'system:seed',
    action: 'demo.seed',
    target: f.project.id,
    payload: {
      snapshots: state.snapshots.length,
      ledgerEntries: state.ledger.length,
      mappingEvents: state.mappingEvents.length,
      anchor: state.anchor,
    },
    at: new Date(state.anchor),
  });

  console.log(
    `seeded: ${state.wps.length} WPs, ${f.baseline.wps.length} baseline WPs, ` +
      `${state.snapshots.length} snapshots, ${state.ledger.length} ledger entries, ` +
      `${state.mappingEvents.length} mapping events`,
  );
}

