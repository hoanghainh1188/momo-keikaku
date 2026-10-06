import { attribute, periodUnplannedTicketCount, type AttributionResult, type Buckets } from './attribution';
import type { MeasurementBasis } from './basis';
import type { HolidayCalendar, IsoDate, ReportingPeriod } from './calendar';
import { computeEvm, FORMULA_VERSION, type EvmResult, type WpMeasure } from './evm';
import { computeForecast, type ForecastResult } from './forecast';
import { computeHealth, isBehindPlan, type HealthColour, type HealthIndicator } from './health';
import { mappingHead, type MappingHeadEntry } from './mapping';
import { compareWp } from './schedule/order';
import {
  DEFAULT_RESOLVED_STATUS_IDS,
  isResolvedStatus,
  type BaselineVersion,
  type LedgerEntry,
  type MappingEvent,
  type ProjectConfig,
  type Resource,
  type SnapshotRead,
  type TicketObservation,
  type WorkPackage,
} from './types';
import {
  compareBigint,
  costOf,
  mhAmountOrZero,
  ratio,
  sum,
  ZERO,
  type Jpy,
  type Mh,
  type MetricCoverage,
  type Ratio,
} from './units';

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
  /** Null while the Project has no Baseline (story 2.2, decision Q1-A): the Review is then partial. */
  activeBaselineSeq: number | null;
  ledger: LedgerEntry[];
  mappingEvents: MappingEvent[];
  pinnedSnapshot: SnapshotRead & { snapshotId: string };
  resources: Resource[];
  period: ReportingPeriod;
  asOf: IsoDate;
  dispositions: DispositionEvent[];
  formulaVersion?: string;
  /**
   * Story 5.7: latched measurement basis at `basis_seq_max`. Missing head ≡ `count`.
   * Metrics never read `pinnedSnapshot.hoursFieldPresent`.
   */
  measurementBasis?: MeasurementBasis;
  /** Pin ceiling for `measurement_basis_event` (ComputationInputs). */
  basisSeqMax?: number | null;
  /** Pin ceiling for `connector_setting_event`. */
  connectorSettingSeqMax?: number | null;
  /** Pin ceiling for Mapping head used by Unplanned count. */
  mappingSeqMax?: number | null;
  /**
   * Story 5.7: Resolved status set from `connector_setting_event` at `connector_setting_seq_max`.
   * Seed default `{Closed}` only when the setting head is missing.
   */
  resolvedStatusIds?: ReadonlySet<string>;
  /**
   * Mixed Project: caption when AC covers hours Connectors only. `null` when not mixed.
   */
  acCoverage?: MetricCoverage;
  /**
   * Optional first-observed instants by tracker issue id (for Ticket-Count Unplanned).
   * Falls back to the observation's `createdAt` when omitted.
   */
  firstObservedAtByTicket?: ReadonlyMap<string, string>;
  /**
   * Optional first-seen-Resolved instants by tracker issue id (MIN snapshot observedAt
   * where statusId ∈ Resolved set). When omitted/null, Resolved-in-Period does not fire.
   */
  resolvedAtByTicket?: ReadonlyMap<string, string>;
}

export interface UnmappedGroup {
  key: string;
  label: string;
  attribute: string;
  ticketCount: number;
  mh: Mh;
  jpy: Jpy;
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
  /** The milestone's actual finish (its head `wp_status_event`). */
  doneDate: IsoDate | null;
  slipped: boolean;
}

export interface DivergenceRow {
  wpId: string;
  wbsCode: string;
  name: string;
  baselineStart: IsoDate | null;
  baselineFinish: IsoDate | null;
  /** The WP's actual dates (its head `wp_status_event`); a WP carries no planned date. */
  actualStart: IsoDate | null;
  actualFinish: IsoDate | null;
  baselineMh: Mh;
  plannedMh: Mh;
  acMh: Mh;
  evMh: Mh;
  pctComplete: Ratio;
  pctBasis: WpMeasure['pctBasis'];
  lowEvidence: boolean;
  isCatchAll: boolean;
  nonBaselined: boolean;
}

/**
 * A Reconciliation Review. With no active Baseline (story 2.2, decision Q1-A) it is PARTIAL, not
 * an error: `evm`, `money`, `forecast`, `milestones` and `divergence` are null, Schedule and
 * Effort/Cost are unavailable, and Coverage, AC and the Unplanned split still compute — every
 * mapped hour then counts as non-baselined Unplanned Work, because no ledger entry was ingested
 * under a Baseline.
 */
export interface ReviewResult {
  formulaVersion: string;
  snapshot: { id: string; observedAt: string; ticketCount: number };
  measurementBasis: 'hours' | 'count';
  /** Null while the Project has no Baseline. */
  evm: EvmResult | null;
  /**
   * PV and EV in money, at the Project default Rate (`costOf`, half-even per figure). AC's money
   * is `attribution.cumulative.totalJpy`, at the per-Resource Rate in force on each hour's date.
   * Null while the Project has no Baseline.
   */
  money: { pvJpy: Jpy; evJpy: Jpy } | null;
  /** SPI strictly below 1, compared exactly (`isBehindPlan`); false while SPI is unavailable. */
  behindPlan: boolean;
  /** Null while the Project has no Baseline. */
  forecast: ForecastResult | null;
  health: { indicators: HealthIndicator[]; overall: HealthColour; overallNote: string | null };
  attribution: AttributionResult;
  unplanned: {
    period: Buckets;
    cumulative: Buckets;
    sharePeriod: Ratio | null;
    shareCumulative: Ratio | null;
    /** Ticket-Count Mode: Period Unplanned ticket count (same attribution function as Health). */
    ticketCountPeriod: number | null;
    /** `share` is the component's part of cumulative Unplanned Work; null while that is zero. */
    components: { key: string; label: string; mh: Mh; jpy: Jpy; share: Ratio | null }[];
  };
  scopeLedger: { key: string; label: string; mh: Mh; share: Ratio }[];
  unmappedGroups: UnmappedGroup[];
  /** Null while the Project has no Baseline: a milestone's slip is judged against it. */
  milestones: MilestoneRow[] | null;
  /** Null while the Project has no Baseline. */
  divergence: DivergenceRow[] | null;
  coverage: { mappedTicketShare: Ratio; mappedHourShare: Ratio; unmappedTickets: number };
  dispositions: DispositionEvent[];
  explainNotes: { note: string; ticketCount: number; mh: Mh }[];
  openingBalanceMh: Mh;
}

export function computeReview(input: ReviewInput): ReviewResult {
  const mappingSeqMax = input.mappingSeqMax;
  const mappingEventsForHead =
    mappingSeqMax === undefined || mappingSeqMax === null
      ? input.mappingEvents
      : input.mappingEvents.filter((e) => e.seq <= mappingSeqMax);
  const head = mappingHead(mappingEventsForHead);
  const baseline = activeBaseline(input);
  const resolvedStatusIds = input.resolvedStatusIds ?? DEFAULT_RESOLVED_STATUS_IDS;

  const attribution = attribute({
    entries: input.ledger,
    head,
    wps: input.wps,
    baselineVersions: input.baselineVersions,
    resources: input.resources,
    project: input.project,
    period: input.period,
  });

  // Story 5.7: latched basis at basis_seq_max — never snapshot hoursFieldPresent.
  const measurementBasis: MeasurementBasis = input.measurementBasis ?? 'count';

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

  const evm =
    baseline === null
      ? null
      : computeEvm({
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
          acCoverage: input.acCoverage ?? null,
          resolvedStatusIds,
        });

  const milestones = baseline === null ? null : milestoneRows(baseline, input.wps, input.asOf);

  const unplannedTickets = periodUnplannedTicketCount({
    tickets: input.pinnedSnapshot.tickets.map((t) => ({
      trackerIssueId: t.trackerIssueId,
      firstObservedAt: input.firstObservedAtByTicket?.get(t.trackerIssueId) ?? t.createdAt,
      statusId: t.statusId,
      resolvedAt: input.resolvedAtByTicket?.get(t.trackerIssueId) ?? null,
    })),
    period: input.period,
    head,
    resolvedStatusIds,
    tzOffsetMinutes: input.project.tzOffsetMinutes,
  });

  const sharePeriodHours =
    attribution.period.totalMh > 0n
      ? ratio(attribution.period.unplannedMh, attribution.period.totalMh)
      : null;
  const sharePeriod =
    measurementBasis === 'count'
      ? unplannedTickets.unplannedShare === null
        ? null
        : ratio(unplannedTickets.unplannedShare.num, unplannedTickets.unplannedShare.den)
      : sharePeriodHours;
  const shareCumulative =
    attribution.cumulative.totalMh > 0n
      ? ratio(attribution.cumulative.unplannedMh, attribution.cumulative.totalMh)
      : null;

  const health = computeHealth({
    evm,
    thresholds: input.project.thresholds,
    unplannedSharePeriod: sharePeriod,
    unplannedShareCumulative: shareCumulative,
    slippedMilestones: (milestones ?? [])
      .filter((m) => m.slipped)
      .map((m) => ({ wbsCode: m.wbsCode, name: m.name, baselineDate: m.baselineDate })),
    measurementBasis,
  });

  const forecast =
    baseline === null || evm === null
      ? null
      : computeForecast(evm, baseline, input.asOf, input.calendar);

  // --- FR-28: Unmapped Work grouped by Tracker attribute, expandable to Tickets
  const dispositionByTicket = new Map<string, DispositionKind>();
  for (const d of [...input.dispositions].sort((a, b) => a.seq - b.seq))
    for (const t of d.ticketIds) dispositionByTicket.set(t, d.kind);

  const groups = new Map<string, UnmappedGroup>();
  for (const t of input.pinnedSnapshot.tickets) {
    const m = head.get(t.trackerIssueId);
    if (m?.wpId) continue;
    const mh = attribution.hoursByTicket.get(t.trackerIssueId) ?? 0n;
    if (mh === 0n) continue;
    const categoryId = t.attributes.find((a) => a.kind === 'category')?.id;
    const attr = categoryId ?? t.issueTypeId;
    const g = groups.get(attr) ?? {
      key: attr,
      label: attr,
      attribute: categoryId ? 'category' : 'issue type',
      ticketCount: 0,
      mh: 0n,
      jpy: 0n,
      dispositioned: null,
      tickets: [],
    };
    g.ticketCount += 1;
    g.mh += mh;
    g.jpy += costOf(mh, input.project.defaultRateYenPerHour);
    g.tickets.push({
      ticketId: t.trackerIssueId,
      key: t.key,
      title: t.title,
      mh,
      resolved: isResolvedStatus(t.statusId, resolvedStatusIds),
      status: t.statusId,
    });
    groups.set(attr, g);
  }
  for (const g of groups.values()) {
    g.tickets.sort((a, b) => compareBigint(b.mh, a.mh));
    const kinds = new Set(g.tickets.map((t) => dispositionByTicket.get(t.ticketId)));
    g.dispositioned =
      kinds.size === 1 && !kinds.has(undefined) ? ([...kinds][0] as DispositionKind) : null;
  }
  const unmappedGroups = [...groups.values()].sort((a, b) => compareBigint(b.mh, a.mh));

  const divergence =
    baseline === null || evm === null
      ? null
      : divergenceRows(baseline, evm, input.wps, attribution.acByWp);

  // --- FR-23 coverage
  const totalTickets = input.pinnedSnapshot.tickets.length;
  const unmappedTickets = input.pinnedSnapshot.tickets.filter(
    (t) => !head.get(t.trackerIssueId)?.wpId,
  ).length;
  const coverage = {
    mappedTicketShare:
      totalTickets === 0
        ? ZERO
        : ratio(BigInt(totalTickets - unmappedTickets), BigInt(totalTickets)),
    mappedHourShare:
      attribution.cumulative.totalMh === 0n
        ? ZERO
        : ratio(
            attribution.cumulative.totalMh - attribution.cumulative.unmappedMh,
            attribution.cumulative.totalMh,
          ),
    unmappedTickets,
  };

  const c = attribution.cumulative;
  const scopeTotal = c.totalMh === 0n ? 1n : c.totalMh;
  const scopeLedger = [
    { key: 'mapped-baselined', label: 'Mapped to baselined WPs', mh: c.mappedBaselinedMh },
    { key: 'mapped-non-baselined', label: 'Mapped to non-baselined WPs', mh: c.mappedNonBaselinedMh },
    { key: 'catch-all', label: 'Catch-all (within Baseline)', mh: c.catchAllMh },
    { key: 'catch-all-overflow', label: 'Catch-all overflow', mh: c.catchAllOverflowMh },
    { key: 'unmapped', label: 'Unmapped Work', mh: c.unmappedMh },
  ].map((s) => ({ ...s, share: ratio(s.mh, scopeTotal) }));

  const explainNotes = input.dispositions
    .filter((d) => d.kind === 'explain' && d.note)
    .map((d) => ({
      note: d.note!,
      ticketCount: d.ticketIds.length,
      mh: sum(d.ticketIds.map((t) => attribution.hoursByTicket.get(t) ?? 0n)),
    }));

  return {
    formulaVersion: input.formulaVersion ?? FORMULA_VERSION,
    snapshot: {
      id: input.pinnedSnapshot.snapshotId,
      observedAt: input.pinnedSnapshot.observedAt,
      ticketCount: totalTickets,
    },
    measurementBasis,
    evm,
    money:
      evm === null
        ? null
        : {
            pvJpy: costOf(mhAmountOrZero(evm.pvMh), input.project.defaultRateYenPerHour),
            evJpy: costOf(mhAmountOrZero(evm.evMh), input.project.defaultRateYenPerHour),
          },
    behindPlan: evm !== null && isBehindPlan(evm.spi),
    forecast,
    health,
    attribution,
    unplanned: {
      period: attribution.period,
      cumulative: attribution.cumulative,
      sharePeriod,
      shareCumulative,
      ticketCountPeriod:
        measurementBasis === 'count' ? unplannedTickets.unplannedTicketIds.length : null,
      components: [
        { key: 'unmapped', label: 'Unmapped Work', mh: c.unmappedMh, jpy: 0n },
        {
          key: 'non-baselined',
          label: 'Hours on non-baselined WPs',
          mh: c.mappedNonBaselinedMh,
          jpy: 0n,
        },
        {
          key: 'catch-all-overflow',
          label: 'Catch-all WP hours beyond Baseline',
          mh: c.catchAllOverflowMh,
          jpy: 0n,
        },
      ].map((component) => ({
        ...component,
        share: c.unplannedMh === 0n ? null : ratio(component.mh, c.unplannedMh),
      })),
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

/**
 * The active Baseline, or null when the Project has none. A seq naming no version is an
 * inconsistent input, not a missing Baseline, and still throws.
 */
function activeBaseline(input: ReviewInput): BaselineVersion | null {
  if (input.activeBaselineSeq === null) return null;
  const baseline = input.baselineVersions.find((b) => b.seq === input.activeBaselineSeq);
  if (!baseline) throw new Error(`no baseline version with seq ${input.activeBaselineSeq}`);
  return baseline;
}

/** FR-31: milestone slip, judged against the Baseline date; done is the actual finish. */
function milestoneRows(
  baseline: BaselineVersion,
  wps: readonly WorkPackage[],
  asOf: IsoDate,
): MilestoneRow[] {
  const wpById = new Map(wps.map((w) => [w.id, w]));
  // Sorted with the row's `wpId` in hand (AD-28's tie-break), which `MilestoneRow` does not carry.
  return baseline.wps
    .filter((b) => b.isMilestone)
    .map((b) => {
      const wp = wpById.get(b.wpId);
      const done = wp?.isMilestone ? wp.actualFinish : null;
      const row: MilestoneRow = {
        wbsCode: wp?.wbsCode ?? '',
        name: wp?.name ?? '',
        baselineDate: b.finish,
        doneDate: done,
        slipped: !done && asOf > b.finish,
      };
      return { key: { id: b.wpId, wbsCode: row.wbsCode }, row };
    })
    .sort((a, b) => compareWp(a.key, b.key))
    .map(({ row }) => row);
}

/** Divergence by WP: the Baseline against the Current Plan's effort and the actual dates. */
function divergenceRows(
  baseline: BaselineVersion,
  evm: EvmResult,
  wps: readonly WorkPackage[],
  acByWp: ReadonlyMap<string, Mh>,
): DivergenceRow[] {
  const baselineWpById = new Map(baseline.wps.map((b) => [b.wpId, b]));
  const perWpById = new Map(evm.perWp.map((w) => [w.wpId, w]));
  return wps
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
        actualStart: w.actualStart,
        actualFinish: w.actualFinish,
        baselineMh: b?.baselineMh ?? 0n,
        plannedMh: w.plannedMh,
        acMh: acByWp.get(w.id) ?? 0n,
        evMh: m?.evMh ?? 0n,
        pctComplete: m?.pctComplete ?? ZERO,
        pctBasis: m?.pctBasis ?? 'no-evidence',
        lowEvidence: m?.lowEvidence ?? true,
        isCatchAll: w.isCatchAll,
        nonBaselined: !b,
      };
    })
    .sort((a, b) =>
      compareWp({ id: a.wpId, wbsCode: a.wbsCode }, { id: b.wpId, wbsCode: b.wbsCode }),
    );
}

export type { MappingHeadEntry };
