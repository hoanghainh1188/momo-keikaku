import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import {
  buildCalendar,
  computeReview,
  DEFAULT_THRESHOLDS,
  mappingHead,
  periodOf,
  projectDate,
  trackerAccountIdsFromLinkHeads,
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
    connector: {
      id: string;
      adapter: string;
      scope: string;
      spaceLabel: string;
      site: string;
      approvalRecordedAt: string | null;
      approvalName: string | null;
      lastErrorCode: string | null;
      lastErrorMessage: string | null;
      lastErrorAt: string | null;
      hasCredentials: boolean;
    };
    /** Story 5.6: open overlap claims (conflict banner). */
    overlaps: readonly {
      id: string;
      trackerIssueId: string;
      ticketKey: string;
      ownerConnectorId: string;
      claimerConnectorId: string;
      observedAt: string;
    }[];
    /** Story 5.6: durable left-scope Tickets with retained hours. */
    leftScopeTickets: readonly {
      trackerIssueId: string;
      key: string;
      ownerConnectorId: string;
      hoursMh: bigint;
    }[];
    /**
     * Story 5.8: Tracker Accounts for the Connectors linking panel (display name + email).
     * Personal data under NFR-S6 — UI only; never log these fields.
     */
    trackerAccounts: readonly {
      id: string;
      accountId: string;
      displayName: string;
      email: string | null;
      linkedResourceId: string | null;
    }[];
    /** AD-15 / review G-5: the demo's fixed clock. */
    anchor: string;
    snapshotAgeMinutes: number;
    baselineReason: string;
    baselineRecordedAt: string;
  };
  input: ReviewInput;
  /**
   * Live rules. `parentKey` (story 5.10): for a `parent` rule, the parent Ticket's key from the
   * Project's Ticket identities (null when no identity carries the stored id).
   */
  rules: (MappingRule & { currentlyMapped: number; parentKey: string | null })[];
  wps: WorkPackage[];
  /** The active Baseline — null while the Project has none (story 2.1, decision 2-A). */
  baseline: BaselineVersion | null;
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
  const connectorRows = await tx
    .select()
    .from(s.connector)
    .where(eq(s.connector.projectId, projectId));
  const con = connectorRows[0] ?? null;

  const wpRows = await tx
    .select()
    .from(s.workPackage)
    .where(eq(s.workPackage.projectId, projectId))
    .orderBy(asc(s.workPackage.wbsCode));

  // Actual dates have one home, `wp_status_event` (AD-25): each row restates a WP's whole actual
  // state, so the head — the highest `seq` per WP — is the state. Read ascending and let the last
  // row per WP win. A WP carries no planned date: nothing computes one until the scheduler (2.5,
  // 2.9), and every planned date the domain reads today is the active Baseline's.
  const statusRows = await tx
    .select()
    .from(s.wpStatusEvent)
    .where(eq(s.wpStatusEvent.projectId, projectId))
    .orderBy(asc(s.wpStatusEvent.seq));
  const actualsOf = new Map(
    statusRows.map((e) => [e.wpId, { actualStart: e.actualStart, actualFinish: e.actualFinish }]),
  );

  const wps: WorkPackage[] = wpRows.map((w) => ({
    id: w.id,
    wbsCode: w.wbsCode,
    name: w.name,
    parentId: w.parentId,
    isLeaf: w.isLeaf,
    isMilestone: w.isMilestone,
    isCatchAll: w.isCatchAll,
    plannedMh: w.plannedMh,
    actualStart: actualsOf.get(w.id)?.actualStart ?? null,
    actualFinish: actualsOf.get(w.id)?.actualFinish ?? null,
    assignedResourceIds: w.assignedResourceIds,
  }));

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
    actor: b.actor,
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
  // The active Baseline is the latest committed version BY SEQUENCE (AD-7); null when there is
  // none, which is the seeded demo's state until Epic 4 (decision 2-A).
  const activeBaseline = baselineVersions.reduce<BaselineVersion | null>(
    (latest, b) => (latest === null || b.seq > latest.seq ? b : latest),
    null,
  );
  const activeBaselineSeq = activeBaseline?.seq ?? null;

  const resRows = await tx.select().from(s.resource).where(eq(s.resource.tenantId, p.tenantId));
  const rateRows = await tx.select().from(s.rateEntry).orderBy(asc(s.rateEntry.seq));
  const accountRows = await tx
    .select({
      id: s.trackerAccount.id,
      accountId: s.trackerAccount.accountId,
      displayName: s.trackerAccount.displayName,
      email: s.trackerAccount.email,
    })
    .from(s.trackerAccount)
    .where(eq(s.trackerAccount.tenantId, p.tenantId));
  const linkEventRows = await tx
    .select({
      seq: s.trackerAccountLinkEvent.seq,
      trackerAccountId: s.trackerAccountLinkEvent.trackerAccountId,
      resourceId: s.trackerAccountLinkEvent.resourceId,
    })
    .from(s.trackerAccountLinkEvent)
    .where(eq(s.trackerAccountLinkEvent.tenantId, p.tenantId))
    .orderBy(asc(s.trackerAccountLinkEvent.seq));
  const linkSeqMax =
    linkEventRows.length > 0 ? linkEventRows[linkEventRows.length - 1]!.seq : null;
  const accountIdByInternalId = new Map(accountRows.map((a) => [a.id, a.accountId]));
  // Story 5.8: events are SoT for compute; rebuild trackerAccountIds at link_seq_max (live = head).
  const idsByResource = trackerAccountIdsFromLinkHeads({
    events: linkEventRows,
    accountIdByInternalId,
    resourceIds: resRows.map((r) => r.id),
    seqMax: linkSeqMax ?? undefined,
  });
  // When no link events yet, keep the live array cache (seed / pre-5.8 dual-write).
  const resources: Resource[] = resRows.map((r) => ({
    id: r.id,
    name: r.name,
    departmentId: r.departmentId,
    trackerAccountIds:
      linkEventRows.length > 0 ? (idsByResource.get(r.id) ?? []) : r.trackerAccountIds,
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
  const linkedByInternal = new Map<string, string | null>();
  for (const e of linkEventRows) linkedByInternal.set(e.trackerAccountId, e.resourceId);
  const trackerAccountsMeta = accountRows.map((a) => {
    let linkedResourceId: string | null = null;
    if (linkEventRows.length > 0) {
      linkedResourceId = linkedByInternal.get(a.id) ?? null;
    } else {
      const holder = resources.find((r) => r.trackerAccountIds.includes(a.accountId));
      linkedResourceId = holder?.id ?? null;
    }
    return {
      id: a.id,
      accountId: a.accountId,
      displayName: a.displayName,
      email: a.email,
      linkedResourceId,
    };
  });

  const [latestSnap] = await tx
    .select()
    .from(s.trackerSnapshot)
    .orderBy(desc(s.trackerSnapshot.observedAt))
    .limit(1);

  // Story 5.2: greenfield Projects (no Connector / no snapshot yet) must still load so the
  // Connectors page can show AddConnectorForm. Empty pinned snapshot until the first ingest.
  const anchorIsoEarly = p.demoAnchor.toISOString();
  let pinnedSnapshot: SnapshotRead & { snapshotId: string };
  if (!latestSnap) {
    pinnedSnapshot = {
      snapshotId: '',
      observedAt: anchorIsoEarly,
      hoursFieldPresent: false,
      complete: true,
      rateLimit: null,
      tickets: [],
    };
  } else {
    const obsRows = await tx
      .select()
      .from(s.ticketObservation)
      .where(eq(s.ticketObservation.snapshotId, latestSnap.id));

    pinnedSnapshot = {
      snapshotId: latestSnap.id,
      observedAt: latestSnap.observedAt.toISOString(),
      hoursFieldPresent: latestSnap.measurementBasis === 'hours',
      adapterKind: (latestSnap.adapterKind as SnapshotRead['adapterKind']) ?? 'fixture',
      complete: true,
      rateLimit: null,
      tickets: obsRows.map((o) => ({
        trackerIssueId: o.trackerIssueId,
        key: o.key,
        title: o.title,
        statusId: o.statusId,
        estimateMh: o.estimateMh,
        actualMh: o.actualMh,
        assigneeAccountId: o.assigneeAccountId,
        issueTypeId: o.issueTypeId,
        parentIssueId: o.parentIssueId,
        trackerProjectId: o.trackerProjectId,
        attributes: (o.attributes ?? []) as SnapshotRead['tickets'][number]['attributes'],
        createdAt: o.createdAt.toISOString(),
      })),
    };
  }

  const ledgerRowsAll = await tx
    .select()
    .from(s.actualsLedgerEntry)
    .orderBy(asc(s.actualsLedgerEntry.seq));

  // Story 5.7: latched basis per Connector — Project basis = hours if any Connector is hours.
  const hoursConnectorIds = new Set<string>();
  const countConnectorIds = new Set<string>();
  let basisSeqMax: number | null = null;
  let connectorSettingSeqMax: number | null = null;
  let resolvedStatusIds: ReadonlySet<string> = new Set(['Closed']);

  for (const c of connectorRows) {
    const [basisHead] = await tx
      .select({
        seq: s.measurementBasisEvent.seq,
        basis: s.measurementBasisEvent.basis,
      })
      .from(s.measurementBasisEvent)
      .where(
        and(
          eq(s.measurementBasisEvent.tenantId, p.tenantId),
          eq(s.measurementBasisEvent.connectorId, c.id),
        ),
      )
      .orderBy(desc(s.measurementBasisEvent.seq))
      .limit(1);
    const latched = basisHead?.basis === 'hours' ? 'hours' : 'count';
    if (latched === 'hours') hoursConnectorIds.add(c.id);
    else countConnectorIds.add(c.id);
    if (basisHead && (basisSeqMax === null || basisHead.seq > basisSeqMax)) {
      basisSeqMax = basisHead.seq;
    }
  }

  const measurementBasis: 'hours' | 'count' = hoursConnectorIds.size > 0 ? 'hours' : 'count';
  const mixedProject =
    hoursConnectorIds.size > 0 && countConnectorIds.size > 0 && connectorRows.length > 1;
  const ledgerRows = mixedProject
    ? ledgerRowsAll.filter((e) => hoursConnectorIds.has(e.connectorId))
    : ledgerRowsAll;
  const acCoverage: ReviewInput['acCoverage'] = mixedProject
    ? `hours Connectors only (${hoursConnectorIds.size} of ${connectorRows.length})`
    : undefined;

  if (con) {
    const [settingHeadRow] = await tx
      .select({
        seq: s.connectorSettingEvent.seq,
        resolvedStatusIds: s.connectorSettingEvent.resolvedStatusIds,
      })
      .from(s.connectorSettingEvent)
      .where(
        and(
          eq(s.connectorSettingEvent.tenantId, p.tenantId),
          eq(s.connectorSettingEvent.connectorId, con.id),
        ),
      )
      .orderBy(desc(s.connectorSettingEvent.seq))
      .limit(1);
    if (settingHeadRow) {
      connectorSettingSeqMax = settingHeadRow.seq;
      const ids = settingHeadRow.resolvedStatusIds ?? ['Closed'];
      resolvedStatusIds = new Set(ids.length === 0 ? ['Closed'] : ids);
    }
  }

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

  // Story 5.10: every rule (soft-deleted included) names the Review's "moved to Unmapped by
  // rule '…'" rows; only LIVE rules are listed and evaluated.
  const ruleRows = await tx
    .select()
    .from(s.mappingRule)
    .where(eq(s.mappingRule.projectId, projectId))
    .orderBy(asc(s.mappingRule.priority), asc(s.mappingRule.id));
  const ruleNamesById = new Map(ruleRows.map((r) => [r.id, r.name]));
  // Tickets each rule holds NOW: heads whose `rule_id` is the rule (not every event it ever wrote).
  const ruleHeads = mappingHead(mappingEvents);
  const heldByRule = new Map<string, number>();
  for (const h of ruleHeads.values()) {
    if (h.source !== 'rule' || h.wpId === null || !h.ruleId) continue;
    heldByRule.set(h.ruleId, (heldByRule.get(h.ruleId) ?? 0) + 1);
  }
  // Story 5.10: a `parent` rule stores the parent's tracker issue id; the PM reads and types its
  // key — resolved from the Project's Ticket identities (the source `ticketIdForKey` reads).
  const parentIds = ruleRows.filter((r) => r.matchField === 'parent').map((r) => r.matchValue);
  const parentKeyById = new Map<string, string>();
  if (parentIds.length > 0) {
    const parents = await tx
      .select({ trackerIssueId: s.ticket.trackerIssueId, key: s.ticket.key })
      .from(s.ticket)
      .where(and(eq(s.ticket.projectId, projectId), inArray(s.ticket.trackerIssueId, parentIds)));
    for (const row of parents) parentKeyById.set(row.trackerIssueId, row.key);
  }
  const rules = ruleRows
    .filter((r) => r.deletedAt === null)
    .map((r) => ({
      id: r.id,
      priority: r.priority,
      name: r.name,
      wpId: r.wpId,
      match: { field: r.matchField, value: r.matchValue } as MappingRule['match'],
      currentlyMapped: heldByRule.get(r.id) ?? 0,
      parentKey: r.matchField === 'parent' ? (parentKeyById.get(r.matchValue) ?? null) : null,
    }));

  const [settingHead] = await tx
    .select({
      tzOffsetMinutes: s.projectSettingEvent.tzOffsetMinutes,
      teireiWeekday: s.projectSettingEvent.teireiWeekday,
    })
    .from(s.projectSettingEvent)
    .where(eq(s.projectSettingEvent.projectId, projectId))
    .orderBy(desc(s.projectSettingEvent.seq))
    .limit(1);
  const tzOffsetMinutes = settingHead?.tzOffsetMinutes ?? p.tzOffsetMinutes;
  const teireiWeekday = settingHead?.teireiWeekday ?? p.teireiWeekday;

  const project: ProjectConfig = {
    id: p.id,
    name: p.name,
    clientName: p.clientName,
    contractType: p.contractType as ProjectConfig['contractType'],
    tzOffsetMinutes,
    teireiWeekday,
    defaultRateYenPerHour: BigInt(p.defaultRateJpy),
    eacMethod: 'typical',
    thresholds: DEFAULT_THRESHOLDS,
  };

  const anchor = anchorIsoEarly;
  const calendar = buildCalendar('jp-vn-2026', { jp: p.calendarJp, vn: p.calendarVn });
  const period = periodOf(anchor, tzOffsetMinutes, teireiWeekday);

  const mappingSeqMax =
    mappingEvents.length > 0 ? mappingEvents[mappingEvents.length - 1]!.seq : null;

  let firstObservedAtByTicket: Map<string, string> | undefined;
  let resolvedAtByTicket: Map<string, string> | undefined;
  if (connectorRows.length > 0) {
    const connectorIds = connectorRows.map((c) => c.id);
    const firstObsRows = await tx
      .select({
        trackerIssueId: s.ticketObservation.trackerIssueId,
        statusId: s.ticketObservation.statusId,
        createdAt: s.ticketObservation.createdAt,
        observedAt: s.trackerSnapshot.observedAt,
      })
      .from(s.ticketObservation)
      .innerJoin(
        s.trackerSnapshot,
        and(
          eq(s.ticketObservation.tenantId, s.trackerSnapshot.tenantId),
          eq(s.ticketObservation.snapshotId, s.trackerSnapshot.id),
        ),
      )
      .where(
        and(
          eq(s.ticketObservation.tenantId, p.tenantId),
          inArray(s.trackerSnapshot.connectorId, connectorIds),
        ),
      );
    firstObservedAtByTicket = new Map();
    resolvedAtByTicket = new Map();
    for (const row of firstObsRows) {
      const created = row.createdAt.toISOString();
      const observed = row.observedAt.toISOString();
      const instant = created < observed ? created : observed;
      const prev = firstObservedAtByTicket.get(row.trackerIssueId);
      if (prev === undefined || instant < prev) {
        firstObservedAtByTicket.set(row.trackerIssueId, instant);
      }
      if (resolvedStatusIds.has(row.statusId)) {
        const prevResolved = resolvedAtByTicket.get(row.trackerIssueId);
        if (prevResolved === undefined || observed < prevResolved) {
          resolvedAtByTicket.set(row.trackerIssueId, observed);
        }
      }
    }
  }

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
    asOf: projectDate(anchor, tzOffsetMinutes),
    dispositions,
    measurementBasis,
    basisSeqMax,
    connectorSettingSeqMax,
    ruleNamesById,
    mappingSeqMax,
    linkSeqMax,
    resolvedStatusIds,
    acCoverage,
    firstObservedAtByTicket,
    resolvedAtByTicket,
  };

  const overlapRows = await tx
    .select({
      id: s.connectorOverlap.id,
      trackerIssueId: s.connectorOverlap.trackerIssueId,
      ticketKey: s.connectorOverlap.ticketKey,
      ownerConnectorId: s.connectorOverlap.ownerConnectorId,
      claimerConnectorId: s.connectorOverlap.claimerConnectorId,
      observedAt: s.connectorOverlap.observedAt,
    })
    .from(s.connectorOverlap)
    .where(and(eq(s.connectorOverlap.tenantId, p.tenantId), eq(s.connectorOverlap.projectId, projectId)))
    .orderBy(asc(s.connectorOverlap.ticketKey));

  const leftScopeRows = await tx
    .select({
      trackerIssueId: s.ticket.trackerIssueId,
      key: s.ticket.key,
      ownerConnectorId: s.ticket.ownerConnectorId,
    })
    .from(s.ticket)
    .where(
      and(
        eq(s.ticket.tenantId, p.tenantId),
        eq(s.ticket.projectId, projectId),
        eq(s.ticket.leftScope, true),
      ),
    )
    .orderBy(asc(s.ticket.key));
  const leftScopeHours = new Map<string, bigint>();
  if (leftScopeRows.length > 0) {
    const leftIds = leftScopeRows.map((r) => r.trackerIssueId);
    const leftLedger = await tx
      .select({
        ticketId: s.actualsLedgerEntry.ticketId,
        deltaMh: s.actualsLedgerEntry.deltaMh,
      })
      .from(s.actualsLedgerEntry)
      .where(
        and(
          eq(s.actualsLedgerEntry.tenantId, p.tenantId),
          inArray(s.actualsLedgerEntry.ticketId, leftIds),
        ),
      );
    for (const e of leftLedger) {
      leftScopeHours.set(e.ticketId, (leftScopeHours.get(e.ticketId) ?? 0n) + e.deltaMh);
    }
  }

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
        site: con?.site ?? '',
        approvalRecordedAt: con?.approvalRecordedAt?.toISOString() ?? null,
        approvalName: con?.approvalName ?? null,
        lastErrorCode: con?.lastErrorCode ?? null,
        lastErrorMessage: con?.lastErrorMessage ?? null,
        lastErrorAt: con?.lastErrorAt?.toISOString() ?? null,
        hasCredentials:
          con?.credentialsCiphertext != null && con?.credentialsNonce != null,
      },
      overlaps: overlapRows.map((o) => ({
        id: o.id,
        trackerIssueId: o.trackerIssueId,
        ticketKey: o.ticketKey,
        ownerConnectorId: o.ownerConnectorId,
        claimerConnectorId: o.claimerConnectorId,
        observedAt: o.observedAt.toISOString(),
      })),
      leftScopeTickets: leftScopeRows.map((r) => ({
        trackerIssueId: r.trackerIssueId,
        key: r.key,
        ownerConnectorId: r.ownerConnectorId,
        hoursMh: leftScopeHours.get(r.trackerIssueId) ?? 0n,
      })),
      trackerAccounts: trackerAccountsMeta,
      anchor,
      snapshotAgeMinutes: latestSnap
        ? Math.round(
            (new Date(anchor).getTime() - latestSnap.observedAt.getTime()) / 60_000,
          )
        : 0,
      baselineReason: activeBaseline?.reason ?? '',
      baselineRecordedAt: activeBaseline?.recordedAt ?? '',
    },
    input,
    rules,
    wps,
    baseline: activeBaseline,
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
