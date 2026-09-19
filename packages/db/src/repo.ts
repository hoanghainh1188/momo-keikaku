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
import { getDb } from './client';
import * as s from './schema';

export const DEMO_PROJECT_ID = 'prj-ec2';

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
export async function loadProjectBundle(projectId = DEMO_PROJECT_ID): Promise<ProjectBundle> {
  const db = getDb();

  const [p] = await db.select().from(s.project).where(eq(s.project.id, projectId));
  if (!p) throw new Error(`project ${projectId} not found — run \`pnpm demo\` to seed`);
  const [ten] = await db.select().from(s.tenant).where(eq(s.tenant.id, p.tenantId));
  const [dep] = await db.select().from(s.department).where(eq(s.department.id, p.departmentId));
  const [con] = await db.select().from(s.connector).where(eq(s.connector.projectId, projectId));

  const wpRows = await db
    .select()
    .from(s.workPackage)
    .where(eq(s.workPackage.projectId, projectId))
    .orderBy(asc(s.workPackage.wbsCode));

  const wps: WorkPackage[] = wpRows.map((w) => ({
    id: w.id,
    wbsCode: w.wbsCode,
    name: w.name,
    parentId: w.parentId,
    isLeaf: w.isLeaf,
    isMilestone: w.isMilestone,
    isCatchAll: w.isCatchAll,
    start: w.start,
    finish: w.finish,
    plannedMh: Number(w.plannedMh),
    completedAt: w.completedAt ? w.completedAt.toISOString() : null,
    milestoneDoneAt: w.milestoneDoneAt,
    assignedResourceIds: w.assignedResourceIds,
  }));

  const bvRows = await db
    .select()
    .from(s.baselineVersion)
    .where(eq(s.baselineVersion.projectId, projectId))
    .orderBy(asc(s.baselineVersion.seq));
  const blWps = await db.select().from(s.baselineWp);

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
        baselineMh: Number(x.baselineMh),
        isMilestone: x.isMilestone,
      })),
  }));
  const activeBaselineSeq = Math.max(...baselineVersions.map((b) => b.seq));

  const resRows = await db.select().from(s.resource).where(eq(s.resource.tenantId, p.tenantId));
  const rateRows = await db.select().from(s.rateEntry).orderBy(asc(s.rateEntry.seq));
  const resources: Resource[] = resRows.map((r) => ({
    id: r.id,
    name: r.name,
    departmentId: r.departmentId,
    trackerAccountIds: r.trackerAccountIds,
    rates: rateRows
      .filter((x) => x.resourceId === r.id)
      .map((x) => ({ effectiveFrom: x.effectiveFrom, yenPerHour: x.yenPerHour })),
  }));

  const [latestSnap] = await db
    .select()
    .from(s.trackerSnapshot)
    .orderBy(desc(s.trackerSnapshot.observedAt))
    .limit(1);
  if (!latestSnap) throw new Error('no Tracker Snapshot — run the seed');

  const obsRows = await db
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
      estimateMh: o.estimateMh === null ? null : Number(o.estimateMh),
      actualMh: o.actualMh === null ? null : Number(o.actualMh),
      assigneeAccountId: o.assigneeAccountId,
      issueTypeId: o.issueTypeId,
      categoryIds: o.categoryIds,
      milestoneIds: o.milestoneIds,
      createdAt: o.createdAt.toISOString(),
    })),
  };

  const ledgerRows = await db
    .select()
    .from(s.actualsLedgerEntry)
    .orderBy(asc(s.actualsLedgerEntry.seq));
  const ledger: LedgerEntry[] = ledgerRows.map((e) => ({
    seq: Number(e.seq),
    ticketId: e.ticketId,
    kind: e.kind as LedgerEntry['kind'],
    deltaMh: Number(e.deltaMh),
    windowStart: e.windowStart ? e.windowStart.toISOString() : null,
    windowEnd: e.windowEnd.toISOString(),
    assigneeAccountId: e.assigneeAccountId,
    activeBaselineVersionSeq:
      e.activeBaselineVersionSeq === null ? null : Number(e.activeBaselineVersionSeq),
  }));

  const mapRows = await db
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

  const dispRows = await db
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

  const ruleRows = await db
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
    defaultRateYenPerHour: p.defaultRateJpy,
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
  projectId = DEMO_PROJECT_ID,
): Promise<{ bundle: ProjectBundle; review: ReviewResult }> {
  const bundle = await loadProjectBundle(projectId);
  return { bundle, review: computeReview(bundle.input) };
}
