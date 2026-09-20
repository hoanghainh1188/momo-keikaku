import { attribute, type AttributionResult, type Buckets } from './attribution';
import type { HolidayCalendar, IsoDate, ReportingPeriod } from './calendar';
import { computeEvm, type EvmResult, type WpMeasure } from './evm';
import { computeForecast, type ForecastResult } from './forecast';
import { computeHealth, type HealthColour, type HealthIndicator } from './health';
import { mappingHead, type MappingHeadEntry } from './mapping';
import type {
  BaselineVersion,
  LedgerEntry,
  MappingEvent,
  ProjectConfig,
  Resource,
  SnapshotRead,
  TicketObservation,
  WorkPackage,
} from './types';
import type { Mh } from './units';

export type DispositionKind = 'map' | 'plan' | 'cr_candidate' | 'explain';

export interface DispositionEvent {
  seq: number;
  kind: DispositionKind;
  ticketIds: string[];
  wpId: string | null;
  note: string | null;
  at: string;
  actor: string;
}

/** AD-10: a fully resolved ComputationInputs value. Nothing here reads the clock or the DB. */
export interface ReviewInput {
  project: ProjectConfig;
  calendar: HolidayCalendar;
  wps: WorkPackage[];
  baselineVersions: BaselineVersion[];
  activeBaselineSeq: number;
  ledger: LedgerEntry[];
  mappingEvents: MappingEvent[];
  pinnedSnapshot: SnapshotRead & { snapshotId: string };
  resources: Resource[];
  period: ReportingPeriod;
  asOf: IsoDate;
  dispositions: DispositionEvent[];
  formulaVersion?: string;
}

export interface UnmappedGroup {
  key: string;
  label: string;
  attribute: string;
  ticketCount: number;
  mh: Mh;
  jpy: number;
  dispositioned: DispositionKind | null;
  tickets: {
    ticketId: string;
    key: string;
    title: string;
    mh: Mh;
    resolved: boolean;
    status: string;
  }[];
}

export interface MilestoneRow {
  wbsCode: string;
  name: string;
  baselineDate: IsoDate;
  currentDate: IsoDate | null;
  doneDate: IsoDate | null;
  slipped: boolean;
}

export interface DivergenceRow {
  wpId: string;
  wbsCode: string;
  name: string;
  baselineStart: IsoDate | null;
  baselineFinish: IsoDate | null;
  currentStart: IsoDate | null;
  currentFinish: IsoDate | null;
  baselineMh: Mh;
  plannedMh: Mh;
  acMh: Mh;
  evMh: Mh;
  pctComplete: number;
  pctBasis: WpMeasure['pctBasis'];
  lowEvidence: boolean;
  isCatchAll: boolean;
  nonBaselined: boolean;
}

export interface ReviewResult {
  formulaVersion: string;
  snapshot: { id: string; observedAt: string; ticketCount: number };
  measurementBasis: 'hours' | 'count';
  evm: EvmResult;
  forecast: ForecastResult;
  health: { indicators: HealthIndicator[]; overall: HealthColour; overallNote: string | null };
  attribution: AttributionResult;
  unplanned: {
    period: Buckets;
    cumulative: Buckets;
    sharePeriod: number | null;
    shareCumulative: number | null;
    components: { key: string; label: string; mh: Mh; jpy: number }[];
  };
  scopeLedger: { key: string; label: string; mh: Mh; share: number }[];
  unmappedGroups: UnmappedGroup[];
  milestones: MilestoneRow[];
  divergence: DivergenceRow[];
  coverage: { mappedTicketShare: number; mappedHourShare: number; unmappedTickets: number };
  dispositions: DispositionEvent[];
  explainNotes: { note: string; ticketCount: number; mh: Mh }[];
  openingBalanceMh: Mh;
}

export function computeReview(input: ReviewInput): ReviewResult {
  const head = mappingHead(input.mappingEvents);
  const baseline = input.baselineVersions.find((b) => b.seq === input.activeBaselineSeq);
  if (!baseline) throw new Error(`no baseline version with seq ${input.activeBaselineSeq}`);

  const attribution = attribute({
    entries: input.ledger,
    head,
    wps: input.wps,
    baselineVersions: input.baselineVersions,
    resources: input.resources,
    project: input.project,
    period: input.period,
  });

  const measurementBasis = input.pinnedSnapshot.hoursFieldPresent ? 'hours' : 'count';

  // FR-30: mapped Tickets per WP, from the pinned Tracker Snapshot.
  const mappedTicketsByWp = new Map<string, TicketObservation[]>();
  for (const t of input.pinnedSnapshot.tickets) {
    const m = head.get(t.trackerIssueId);
    if (!m?.wpId) continue;
    const arr = mappedTicketsByWp.get(m.wpId) ?? [];
    arr.push(t);
    mappedTicketsByWp.set(m.wpId, arr);
  }

  const plannedScopeAcMh =
    attribution.cumulative.mappedBaselinedMh + attribution.cumulative.catchAllMh;

  const evm = computeEvm({
    asOf: input.asOf,
    calendar: input.calendar,
    baseline,
    wps: input.wps,
    mappedTicketsByWp,
    acByWp: attribution.acByWp,
    unplannedAcMh: attribution.cumulative.unplannedMh,
    totalAcMh: attribution.cumulative.totalMh,
    plannedScopeAcMh,
    measurementBasis,
  });

  const wpById = new Map(input.wps.map((w) => [w.id, w]));
  const baselineWpById = new Map(baseline.wps.map((b) => [b.wpId, b]));

  // FR-31: milestone slip
  const milestones: MilestoneRow[] = baseline.wps
    .filter((b) => b.isMilestone)
    .map((b) => {
      const wp = wpById.get(b.wpId);
      const done = wp?.milestoneDoneAt ?? null;
      return {
        wbsCode: wp?.wbsCode ?? '',
        name: wp?.name ?? '',
        baselineDate: b.finish,
        currentDate: wp?.finish ?? null,
        doneDate: done,
        slipped: !done && input.asOf > b.finish,
      };
    })
    .sort((a, b) => a.wbsCode.localeCompare(b.wbsCode));

  const sharePeriod =
    attribution.period.totalMh > 0
      ? attribution.period.unplannedMh / attribution.period.totalMh
      : null;
  const shareCumulative =
    attribution.cumulative.totalMh > 0
      ? attribution.cumulative.unplannedMh / attribution.cumulative.totalMh
      : null;

  const health = computeHealth({
    evm,
    thresholds: input.project.thresholds,
    unplannedSharePeriod: sharePeriod,
    unplannedShareCumulative: shareCumulative,
    slippedMilestones: milestones
      .filter((m) => m.slipped)
      .map((m) => ({ wbsCode: m.wbsCode, name: m.name, baselineDate: m.baselineDate })),
    measurementBasis,
  });

  const forecast = computeForecast(evm, baseline, input.asOf, input.calendar);

  // --- FR-28: Unmapped Work grouped by Tracker attribute, expandable to Tickets
  const dispositionByTicket = new Map<string, DispositionKind>();
  for (const d of [...input.dispositions].sort((a, b) => a.seq - b.seq))
    for (const t of d.ticketIds) dispositionByTicket.set(t, d.kind);

  const groups = new Map<string, UnmappedGroup>();
  for (const t of input.pinnedSnapshot.tickets) {
    const m = head.get(t.trackerIssueId);
    if (m?.wpId) continue;
    const mh = attribution.hoursByTicket.get(t.trackerIssueId) ?? 0;
    if (mh === 0) continue;
    const attr = t.categoryIds[0] ?? t.issueTypeId;
    const g = groups.get(attr) ?? {
      key: attr,
      label: attr,
      attribute: t.categoryIds[0] ? 'category' : 'issue type',
      ticketCount: 0,
      mh: 0,
      jpy: 0,
      dispositioned: null,
      tickets: [],
    };
    g.ticketCount += 1;
    g.mh += mh;
    g.jpy += Math.round((mh * input.project.defaultRateYenPerHour) / 1000);
    g.tickets.push({
      ticketId: t.trackerIssueId,
      key: t.key,
      title: t.title,
      mh,
      resolved: t.resolved,
      status: t.statusId,
    });
    groups.set(attr, g);
  }
  for (const g of groups.values()) {
    g.tickets.sort((a, b) => b.mh - a.mh);
    const kinds = new Set(g.tickets.map((t) => dispositionByTicket.get(t.ticketId)));
    g.dispositioned =
      kinds.size === 1 && !kinds.has(undefined) ? ([...kinds][0] as DispositionKind) : null;
  }
  const unmappedGroups = [...groups.values()].sort((a, b) => b.mh - a.mh);

  // --- Divergence by WP (Baseline vs Current Plan vs actual)
  const perWpById = new Map(evm.perWp.map((w) => [w.wpId, w]));
  const divergence: DivergenceRow[] = input.wps
    .filter((w) => w.isLeaf)
    .map((w) => {
      const b = baselineWpById.get(w.id);
      const m = perWpById.get(w.id);
      return {
        wpId: w.id,
        wbsCode: w.wbsCode,
        name: w.name,
        baselineStart: b?.start ?? null,
        baselineFinish: b?.finish ?? null,
        currentStart: w.start,
        currentFinish: w.finish,
        baselineMh: b?.baselineMh ?? 0,
        plannedMh: w.plannedMh,
        acMh: attribution.acByWp.get(w.id) ?? 0,
        evMh: m?.evMh ?? 0,
        pctComplete: m?.pctComplete ?? 0,
        pctBasis: m?.pctBasis ?? 'no-evidence',
        lowEvidence: m?.lowEvidence ?? true,
        isCatchAll: w.isCatchAll,
        nonBaselined: !b,
      };
    })
    .sort((a, b) => a.wbsCode.localeCompare(b.wbsCode, undefined, { numeric: true }));

  // --- FR-23 coverage
  const totalTickets = input.pinnedSnapshot.tickets.length;
  const unmappedTickets = input.pinnedSnapshot.tickets.filter(
    (t) => !head.get(t.trackerIssueId)?.wpId,
  ).length;
  const coverage = {
    mappedTicketShare: totalTickets === 0 ? 0 : (totalTickets - unmappedTickets) / totalTickets,
    mappedHourShare:
      attribution.cumulative.totalMh === 0
        ? 0
        : (attribution.cumulative.totalMh - attribution.cumulative.unmappedMh) /
          attribution.cumulative.totalMh,
    unmappedTickets,
  };

  const c = attribution.cumulative;
  const scopeTotal = c.totalMh || 1;
  const scopeLedger = [
    { key: 'mapped-baselined', label: 'Mapped to baselined WPs', mh: c.mappedBaselinedMh },
    { key: 'mapped-non-baselined', label: 'Mapped to non-baselined WPs', mh: c.mappedNonBaselinedMh },
    { key: 'catch-all', label: 'Catch-all (within Baseline)', mh: c.catchAllMh },
    { key: 'catch-all-overflow', label: 'Catch-all overflow', mh: c.catchAllOverflowMh },
    { key: 'unmapped', label: 'Unmapped Work', mh: c.unmappedMh },
  ].map((s) => ({ ...s, share: s.mh / scopeTotal }));

  const explainNotes = input.dispositions
    .filter((d) => d.kind === 'explain' && d.note)
    .map((d) => ({
      note: d.note!,
      ticketCount: d.ticketIds.length,
      mh: d.ticketIds.reduce((a, t) => a + (attribution.hoursByTicket.get(t) ?? 0), 0),
    }));

  return {
    formulaVersion: input.formulaVersion ?? evm.formulaVersion,
    snapshot: {
      id: input.pinnedSnapshot.snapshotId,
      observedAt: input.pinnedSnapshot.observedAt,
      ticketCount: totalTickets,
    },
    measurementBasis,
    evm,
    forecast,
    health,
    attribution,
    unplanned: {
      period: attribution.period,
      cumulative: attribution.cumulative,
      sharePeriod,
      shareCumulative,
      components: [
        { key: 'unmapped', label: 'Unmapped Work', mh: c.unmappedMh, jpy: 0 },
        {
          key: 'non-baselined',
          label: 'Hours on non-baselined WPs',
          mh: c.mappedNonBaselinedMh,
          jpy: 0,
        },
        {
          key: 'catch-all-overflow',
          label: 'Catch-all WP hours beyond Baseline',
          mh: c.catchAllOverflowMh,
          jpy: 0,
        },
      ],
    },
    scopeLedger,
    unmappedGroups,
    milestones,
    divergence,
    coverage,
    dispositions: input.dispositions,
    explainNotes,
    openingBalanceMh: attribution.openingBalanceMh,
  };
}

export type { MappingHeadEntry };
