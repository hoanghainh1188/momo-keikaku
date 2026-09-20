/**
 * Seeds the demo Tenant/Department/Project and replays the `fixture` Connector's six
 * weekly Tracker Snapshots into the Actuals Ledger (FR-19 on demand, no pg-boss cron
 * in the demo — the build brief defers the scheduler).
 *
 * Idempotent: it truncates the demo tables first.
 */
import { sql } from 'drizzle-orm';
import { getDb, getPool } from './client';
import { buildDemoState } from './fixtures';
import * as s from './schema';

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

export async function seed(): Promise<void> {
  const db = getDb();
  const state = buildDemoState();
  const f = state.fixture;
  const tenantId = f.tenant.id;

  await db.execute(sql.raw(`TRUNCATE ${TRUNCATE_ORDER.join(', ')} RESTART IDENTITY CASCADE`));

  await db.insert(s.tenant).values({ id: tenantId, name: f.tenant.name });
  await db
    .insert(s.department)
    .values({ id: f.department.id, tenantId, name: f.department.name });

  // No auth in the demo: a single seeded PM session (build brief non-goal).
  await db.insert(s.appUser).values([
    { id: 'user-linh', tenantId, email: 'linh@momo-digital.example', name: 'Nguyen Thi Linh', role: 'pm' },
    { id: 'user-hoang', tenantId, email: 'hoang@momo-digital.example', name: 'Hoang Hai', role: 'tenant_admin' },
  ]);

  await db.insert(s.project).values({
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

  await db.insert(s.resource).values(
    f.resources.map((r) => ({
      id: r.id,
      tenantId,
      departmentId: f.department.id,
      name: r.name,
      role: r.role,
      trackerAccountIds: [r.accountId],
    })),
  );
  await db.insert(s.rateEntry).values(
    f.resources.map((r) => ({
      tenantId,
      resourceId: r.id,
      effectiveFrom: '2026-01-01',
      yenPerHour: r.yenPerHour,
    })),
  );

  await db.insert(s.workPackage).values(
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

  const [bv] = await db
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

  await db.insert(s.baselineWp).values(
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
  await db.insert(s.connector).values({
    id: connectorId,
    tenantId,
    projectId: f.project.id,
    adapter: 'fixture',
    scope: 'project key EC2 (all issue types)',
    spaceLabel: 'osaka-retail.backlog.jp (fixture replay)',
  });

  await db.insert(s.mappingRule).values(
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
    await db.insert(s.trackerSnapshot).values({
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
      db.insert(s.ticketObservation).values(
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
    db.insert(s.actualsLedgerEntry).values(
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
    db.insert(s.mappingEvent).values(
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

  await db.insert(s.auditLog).values({
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

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop()!);
if (isMain) {
  seed()
    .then(() => getPool().end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
