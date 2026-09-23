import { asc, desc, eq } from 'drizzle-orm';
import {
  buildCalendar,
  computeReview,
  DEFAULT_THRESHOLDS,
  periodOf,
  projectDate,
  type BaselineVersion,
  type DispositionEvent,
  type LedgerEntry,
  type MappingEvent,
  type MappingRule,
  type ProjectConfig,
  type Resource,
  type ReviewInput,
  type ReviewResult,
  type SnapshotRead,
  type WorkPackage,
} from '@momo/domain';
import type { Db } from './client';
import { projectNotFound } from './project-not-found';
import * as s from './schema';
import { withTenant, type Tx } from './with-tenant';

export const DEMO_PROJECT_ID = 'prj-ec2';

/**
 * The demo Tenant `seed.ts` writes.
 *
 * Exported as a NAME, not as a default. Every read below runs inside `withTenant`, which
 * needs a Tenant before it can read the Project that would have told it which one, so the
 * caller states it — and `tenantId` is a required parameter precisely because this story's
 * thesis is that the Tenant is never remembered in application code. A default here would
 * mean a forgotten Tenant silently reads `ten-momo`, which is the bug wearing the fix's
 * clothes. Story 1.4 replaces each call site's use of this constant with the Tenant on the
 * RequestContext.
 */
export const DEMO_TENANT_ID = 'ten-momo';

export interface ProjectBundle {
  project: ProjectConfig;
  meta: {
    tenantName: string;
    departmentName: string;
    clientName: string;
    connector: { id: string; adapter: string; scope: string; spaceLabel: string };
    /** AD-15 / review G-5: the demo's fixed clock. */
    anchor: string;
    snapshotAgeMinutes: number;
    baselineReason: string;
    baselineRecordedAt: string;
  };
  input: ReviewInput;
  rules: (MappingRule & { currentlyMapped: number })[];
  wps: WorkPackage[];
  baseline: BaselineVersion;
  resources: Resource[];
}

/**
 * AD-10: capture a fully resolved ComputationInputs value once, then compute.
 * Nothing below reads the clock; "now" is the Project's demo anchor.
 */
export async function loadProjectBundle(
  db: Db,
  tenantId: string,
  projectId: string = DEMO_PROJECT_ID,
): Promise<ProjectBundle> {
  // Everything below is issued on `tx`, inside the transaction `withTenant` opened with
  // `app.tenant_id` bound. On the bare `db` handle each of these 15 selects would return
  // zero rows as the application role, because the isolation policy would compare
  // `tenant_id` against a setting nothing had set.
  return withTenant(db, tenantId, (tx) => loadBundleInTenant(tx, projectId));
}

async function loadBundleInTenant(tx: Tx, projectId: string): Promise<ProjectBundle> {
  const [p] = await tx.select().from(s.project).where(eq(s.project.id, projectId));
  if (!p) throw projectNotFound(projectId);
  const [ten] = await tx.select().from(s.tenant).where(eq(s.tenant.id, p.tenantId));
  const [dep] = await tx.select().from(s.department).where(eq(s.department.id, p.departmentId));
  const [con] = await tx.select().from(s.connector).where(eq(s.connector.projectId, projectId));

  const wpRows = await tx
    .select()
    .from(s.workPackage)
    .where(eq(s.workPackage.projectId, projectId))
    .orderBy(asc(s.workPackage.wbsCode));

  // Actual dates have one home, `wp_status_event` (AD-25): each row restates a WP's whole actual
  // state, so the head — the highest `seq` per WP — is the state. Read ascending and let the last
  // row per WP win.
  const statusRows = await tx
    .select()
    .from(s.wpStatusEvent)
    .where(eq(s.wpStatusEvent.projectId, projectId))
    .orderBy(asc(s.wpStatusEvent.seq));
  const actualFinishOf = new Map<string, string | null>(
    statusRows.map((e) => [e.wpId, e.actualFinish]),
  );

  // STORY 2.1 → 2.2 SEAM. The domain's `WorkPackage` still has the spike's shape. Planned
  // `start`/`finish` have no column any more (AD-30) and nothing computes them until the scheduler
  // (2.5, 2.9), so they read as null; "marked complete" and "milestone done" are the head event's
  // actual finish. Story 2.2 reshapes the type and its readers.
  const wps: WorkPackage[] = wpRows.map((w) => {
    const actualFinish = actualFinishOf.get(w.id) ?? null;
    return {
      id: w.id,
      wbsCode: w.wbsCode,
      name: w.name,
      parentId: w.parentId,
      isLeaf: w.isLeaf,
      isMilestone: w.isMilestone,
      isCatchAll: w.isCatchAll,
      start: null,
      finish: null,
      plannedMh: w.plannedMh,
      // A milestone's actual finish is its done date, not a "marked complete": the spike kept
      // `completedAt` null for milestones, and `evm.ts` lifts the 99% cap on it.
      completedAt: w.isMilestone ? null : actualFinish,
      milestoneDoneAt: w.isMilestone ? actualFinish : null,
      assignedResourceIds: w.assignedResourceIds,
    };
  });

  const bvRows = await tx
    .select()
    .from(s.baselineVersion)
    .where(eq(s.baselineVersion.projectId, projectId))
    .orderBy(asc(s.baselineVersion.seq));
  const blWps = await tx.select().from(s.baselineWp);

  const baselineVersions: BaselineVersion[] = bvRows.map((b) => ({
    seq: Number(b.seq),
    id: b.id,
    reason: b.reason,
    recordedAt: b.recordedAt.toISOString(),
    wps: blWps
      .filter((x) => Number(x.baselineVersionSeq) === Number(b.seq))
      .map((x) => ({
        wpId: x.wpId,
        start: x.start,
        finish: x.finish,
        baselineMh: x.baselineMh,
        isMilestone: x.isMilestone,
      })),
  }));
  const activeBaselineSeq = Math.max(...baselineVersions.map((b) => b.seq));

  const resRows = await tx.select().from(s.resource).where(eq(s.resource.tenantId, p.tenantId));
  const rateRows = await tx.select().from(s.rateEntry).orderBy(asc(s.rateEntry.seq));
  const resources: Resource[] = resRows.map((r) => ({
    id: r.id,
    name: r.name,
    departmentId: r.departmentId,
    trackerAccountIds: r.trackerAccountIds,
    rates: rateRows
      .filter((x) => x.resourceId === r.id)
      // The yen columns stay Postgres `integer`; they are read into `bigint` here (AD-4).
      // `seq` is the append-only watermark a pinned lookup ceilings on (story 1.6).
      .map((x) => ({
        seq: Number(x.seq),
        effectiveFrom: x.effectiveFrom,
        yenPerHour: BigInt(x.yenPerHour),
      })),
  }));

  const [latestSnap] = await tx
    .select()
    .from(s.trackerSnapshot)
    .orderBy(desc(s.trackerSnapshot.observedAt))
    .limit(1);
  if (!latestSnap) throw new Error('no Tracker Snapshot — run the seed');

  const obsRows = await tx
    .select()
    .from(s.ticketObservation)
    .where(eq(s.ticketObservation.snapshotId, latestSnap.id));

  const pinnedSnapshot: SnapshotRead & { snapshotId: string } = {
    snapshotId: latestSnap.id,
    observedAt: latestSnap.observedAt.toISOString(),
    hoursFieldPresent: latestSnap.measurementBasis === 'hours',
    tickets: obsRows.map((o) => ({
      trackerIssueId: o.trackerIssueId,
      key: o.key,
      title: o.title,
      statusId: o.statusId,
      resolved: o.resolved,
      estimateMh: o.estimateMh,
      actualMh: o.actualMh,
      assigneeAccountId: o.assigneeAccountId,
      issueTypeId: o.issueTypeId,
      categoryIds: o.categoryIds,
      milestoneIds: o.milestoneIds,
      createdAt: o.createdAt.toISOString(),
    })),
  };

  const ledgerRows = await tx
    .select()
    .from(s.actualsLedgerEntry)
    .orderBy(asc(s.actualsLedgerEntry.seq));
  const ledger: LedgerEntry[] = ledgerRows.map((e) => ({
    seq: Number(e.seq),
    ticketId: e.ticketId,
    kind: e.kind as LedgerEntry['kind'],
    deltaMh: e.deltaMh,
    windowStart: e.windowStart ? e.windowStart.toISOString() : null,
    windowEnd: e.windowEnd.toISOString(),
    assigneeAccountId: e.assigneeAccountId,
    activeBaselineVersionSeq:
      e.activeBaselineVersionSeq === null ? null : Number(e.activeBaselineVersionSeq),
  }));

  const mapRows = await tx
    .select()
    .from(s.mappingEvent)
    .where(eq(s.mappingEvent.projectId, projectId))
    .orderBy(asc(s.mappingEvent.seq));
  const mappingEvents: MappingEvent[] = mapRows.map((m) => ({
    seq: Number(m.seq),
    ticketId: m.ticketId,
    wpId: m.wpId,
    source: m.source as MappingEvent['source'],
    ruleId: m.ruleId,
    at: m.at.toISOString(),
    actor: m.actor,
  }));

  const dispRows = await tx
    .select()
    .from(s.dispositionEvent)
    .where(eq(s.dispositionEvent.projectId, projectId))
    .orderBy(asc(s.dispositionEvent.seq));
  const dispositions: DispositionEvent[] = dispRows.map((d) => ({
    seq: Number(d.seq),
    kind: d.kind as DispositionEvent['kind'],
    ticketIds: d.ticketIds,
    wpId: d.wpId,
    note: d.note,
    at: d.at.toISOString(),
    actor: d.actor,
  }));

  const ruleRows = await tx
    .select()
    .from(s.mappingRule)
    .where(eq(s.mappingRule.projectId, projectId))
    .orderBy(asc(s.mappingRule.priority));
  const rules = ruleRows.map((r) => ({
    id: r.id,
    priority: r.priority,
    name: r.name,
    wpId: r.wpId,
    match: { field: r.matchField, value: r.matchValue } as MappingRule['match'],
    currentlyMapped: mappingEvents.filter((m) => m.source === 'rule' && m.wpId === r.wpId).length,
  }));

  const project: ProjectConfig = {
    id: p.id,
    name: p.name,
    clientName: p.clientName,
    contractType: p.contractType as ProjectConfig['contractType'],
    tzOffsetMinutes: p.tzOffsetMinutes,
    teireiWeekday: p.teireiWeekday,
    defaultRateYenPerHour: BigInt(p.defaultRateJpy),
    eacMethod: 'typical',
    thresholds: DEFAULT_THRESHOLDS,
  };

  const anchor = p.demoAnchor.toISOString();
  const calendar = buildCalendar('jp-vn-2026', { jp: p.calendarJp, vn: p.calendarVn });
  const period = periodOf(anchor, p.tzOffsetMinutes, p.teireiWeekday);

  const input: ReviewInput = {
    project,
    calendar,
    wps,
    baselineVersions,
    activeBaselineSeq,
    ledger,
    mappingEvents,
    pinnedSnapshot,
    resources,
    period,
    asOf: projectDate(anchor, p.tzOffsetMinutes),
    dispositions,
  };

  return {
    project,
    meta: {
      tenantName: ten?.name ?? '',
      departmentName: dep?.name ?? '',
      clientName: p.clientName,
      connector: {
        id: con?.id ?? '',
        adapter: con?.adapter ?? 'fixture',
        scope: con?.scope ?? '',
        spaceLabel: con?.spaceLabel ?? '',
      },
      anchor,
      snapshotAgeMinutes: Math.round(
        (new Date(anchor).getTime() - latestSnap.observedAt.getTime()) / 60_000,
      ),
      baselineReason: baselineVersions.at(-1)?.reason ?? '',
      baselineRecordedAt: baselineVersions.at(-1)?.recordedAt ?? '',
    },
    input,
    rules,
    wps,
    baseline: baselineVersions.find((b) => b.seq === activeBaselineSeq)!,
    resources,
  };
}

export async function loadReview(
  db: Db,
  tenantId: string,
  projectId: string = DEMO_PROJECT_ID,
): Promise<{ bundle: ProjectBundle; review: ReviewResult }> {
  const bundle = await loadProjectBundle(db, tenantId, projectId);
  return { bundle, review: computeReview(bundle.input) };
}
