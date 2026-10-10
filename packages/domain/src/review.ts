import { attribute, periodUnplannedTicketCount, type AttributionResult, type Buckets } from './attribution';
import type { MeasurementBasis } from './basis';
import type { HolidayCalendar, IsoDate, ReportingPeriod } from './calendar';
import {
  computeCoverage,
  type CoverageConnectorInput,
  type CoverageResult,
} from './coverage';
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
  type WpFlagEvent,
} from './types';
import {
  compareBigint,
  costOf,
  mhAmountOrZero,
  ratio,
  ratioValue,
  unavailable,
  sum,
  ZERO,
  type Jpy,
  type Mh,
  type MetricCoverage,
  type Ratio,
  type RatioMetric,
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
  /** Story 5.8: pin ceiling for `tracker_account_link_event` (ComputationInputs). */
  linkSeqMax?: number | null;
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
  /**
   * Story 5.10 / UX-DR23: every Mapping Rule's name by id — soft-deleted rules included, because
   * a Ticket a since-deleted rule moved to Unmapped still names it.
   */
  ruleNamesById?: ReadonlyMap<string, string>;
  /**
   * Story 5.11: Connectors for per-Connector coverage. When omitted, coverage still returns a
   * Project total from every pinned Ticket under the Project measurement basis.
   */
  connectorsForCoverage?: readonly CoverageConnectorInput[];
  /** trackerIssueId → owning Connector id (story 5.11). */
  ownerConnectorByTicket?: ReadonlyMap<string, string>;
  /** left_scope Tickets — excluded from FR-23 shares (5.13 owns captions). */
  leftScopeTicketIds?: ReadonlySet<string>;
  /**
   * Story 5.13: left_scope Tickets with key + hours for scope-change nesting.
   * Identity may be absent from the pinned snapshot.
   */
  leftScopeTicketDetails?: readonly {
    trackerIssueId: string;
    key: string;
    ownerConnectorId: string;
    hoursMh: Mh;
  }[];
  /**
   * Story 5.13: append-only `connector_scope_event` rows (read-only). Latest per
   * Connector with a predecessor becomes the Review scope-change surface.
   */
  connectorScopeEvents?: readonly {
    seq: number;
    connectorId: string;
    scope: string;
    at: string;
  }[];
  /** Project start for SM-5's 14-day window; null → SM-5 unavailable. */
  projectStart?: IsoDate | null;
  /**
   * Story 5.12: Catch-all flag events. Attribution / coverage judge at `wpFlagSeqMax`.
   */
  wpFlagEvents?: readonly WpFlagEvent[];
  /** Pin ceiling for `wp_flag_event` (ComputationInputs). */
  wpFlagSeqMax?: number | null;
}

/** Story 5.13 / UX-DR23: Opening Balance hours for one Connector. */
export interface OpeningBalanceByConnector {
  connectorId: string;
  label: string;
  mh: Mh;
}

/**
 * Story 5.13 / Q2→A: latest scope change per Connector (prev → new) with nested
 * left-scope Tickets and retained hours for that Connector.
 */
export interface ConnectorScopeChangeRow {
  connectorId: string;
  label: string;
  previousScope: string;
  newScope: string;
  at: string;
  leftScopeTickets: readonly {
    ticketId: string;
    key: string;
    hoursMh: Mh;
  }[];
}

/**
 * Story 5.10 / UX-DR23 / Harry Q3: a Ticket whose head at the pin is a `rule` event with
 * `wpId = null` — "moved to Unmapped by rule '…'" — flagged for as long as it stays unmapped.
 */
export interface RuleUnmappedRow {
  ticketId: string;
  key: string;
  title: string;
  /** The rule the Ticket left; null only for a legacy event that recorded none. */
  ruleId: string | null;
  ruleName: string | null;
  mh: Mh;
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
  /** Story 5.10: Tickets a rule moved to Unmapped, still unmapped at the pin (key order). */
  ruleUnmapped: RuleUnmappedRow[];
  /** Null while the Project has no Baseline: a milestone's slip is judged against it. */
  milestones: MilestoneRow[] | null;
  /** Null while the Project has no Baseline. */
  divergence: DivergenceRow[] | null;
  /**
   * Project-wide FR-23 figures — Review captions.
   * `mappedHourShare` matches SM-5 / Coverage `mappedExcludingCatchAll` (epic-5-retro F6):
   * mapped baselined + mapped non-baselined over total hours (Catch-all excluded).
   * Story 5.11 adds `perConnector` for Mapping › Coverage.
   */
  coverage: {
    mappedTicketShare: Ratio;
    mappedHourShare: Ratio;
    unmappedTickets: number;
    /** Story 5.11: per-Connector + Project total + SM-5. */
    perConnector: CoverageResult;
  };
  /**
   * SM-C1: Catch-all share of total hours — `(catchAllMh + catchAllOverflowMh) / totalMh`.
   * Unavailable when total hours are zero (never rendered as 0).
   */
  catchAllShare: RatioMetric;
  dispositions: DispositionEvent[];
  explainNotes: { note: string; ticketCount: number; mh: Mh }[];
  openingBalanceMh: Mh;
  /**
   * Story 5.13 / UX-DR23: Opening Balances per Connector (hours > 0 only).
   * Empty when no OB rows — never a misleading 0h claim.
   */
  openingBalanceByConnector: OpeningBalanceByConnector[];
  /** Story 5.13 / Q2→A: latest prev→new scope change per Connector. */
  latestScopeChanges: ConnectorScopeChangeRow[];
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
    wpFlagEvents: input.wpFlagEvents,
    wpFlagSeqMax: input.wpFlagSeqMax,
    ownerConnectorByTicket: input.ownerConnectorByTicket,
  });
  const wpById = new Map(input.wps.map((w) => [w.id, w]));
  const leftScope = input.leftScopeTicketIds ?? new Set<string>();
  const connectorLabel = (id: string): string =>
    input.connectorsForCoverage?.find((c) => c.id === id)?.label ?? id;

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

  // --- FR-28 / Story 5.13: every in-scope Ticket is mapped or listed unmapped
  // (null/absent/orphan head, including 0h). Left-scope stays out of this census.
  const dispositionByTicket = new Map<string, DispositionKind>();
  for (const d of [...input.dispositions].sort((a, b) => a.seq - b.seq))
    for (const t of d.ticketIds) dispositionByTicket.set(t, d.kind);

  const isMappedLeaf = (ticketId: string): boolean => {
    const m = head.get(ticketId);
    return Boolean(m?.wpId && wpById.has(m.wpId));
  };

  const groups = new Map<string, UnmappedGroup>();
  for (const t of input.pinnedSnapshot.tickets) {
    if (leftScope.has(t.trackerIssueId)) continue;
    if (isMappedLeaf(t.trackerIssueId)) continue;
    const mh = attribution.hoursByTicket.get(t.trackerIssueId) ?? 0n;
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

  // --- Story 5.10 / UX-DR23: "moved to Unmapped by rule '…'", persisting while unmapped (Q3).
  const ruleUnmapped: RuleUnmappedRow[] = input.pinnedSnapshot.tickets
    .flatMap((t) => {
      const m = head.get(t.trackerIssueId);
      if (!m || m.source !== 'rule' || m.wpId !== null) return [];
      const ruleId = m.ruleId ?? null;
      return [
        {
          ticketId: t.trackerIssueId,
          key: t.key,
          title: t.title,
          ruleId,
          ruleName: ruleId === null ? null : (input.ruleNamesById?.get(ruleId) ?? null),
          mh: attribution.hoursByTicket.get(t.trackerIssueId) ?? 0n,
        },
      ];
    })
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const divergence =
    baseline === null || evm === null
      ? null
      : divergenceRows(baseline, evm, input.wps, attribution.acByWp);

  // --- FR-23 coverage (legacy Project-wide: mapped includes Catch-all, for Review captions)
  const inScopePinned = input.pinnedSnapshot.tickets.filter(
    (t) => !leftScope.has(t.trackerIssueId),
  );
  const totalTickets = inScopePinned.length;
  const unmappedTickets = inScopePinned.filter((t) => !isMappedLeaf(t.trackerIssueId)).length;
  const connectorsForCoverage: CoverageConnectorInput[] =
    input.connectorsForCoverage && input.connectorsForCoverage.length > 0
      ? [...input.connectorsForCoverage]
      : [
          {
            id: 'project',
            label: 'Project',
            measurementBasis,
          },
        ];
  const ownerConnectorByTicket =
    input.ownerConnectorByTicket ??
    new Map(input.pinnedSnapshot.tickets.map((t) => [t.trackerIssueId, connectorsForCoverage[0]!.id]));
  const perConnector = computeCoverage({
    tickets: input.pinnedSnapshot.tickets,
    head,
    wps: input.wps,
    ledger: input.ledger,
    baselineVersions: input.baselineVersions,
    resources: input.resources,
    project: input.project,
    period: input.period,
    connectors: connectorsForCoverage,
    ownerConnectorByTicket,
    leftScopeTicketIds: input.leftScopeTicketIds,
    projectStart: input.projectStart ?? null,
    asOf: input.asOf,
    wpFlagEvents: input.wpFlagEvents,
    wpFlagSeqMax: input.wpFlagSeqMax,
  });
  const mappedExcludingCatchAllMh =
    attribution.cumulative.mappedBaselinedMh + attribution.cumulative.mappedNonBaselinedMh;
  const coverage = {
    mappedTicketShare:
      totalTickets === 0
        ? ZERO
        : ratio(BigInt(totalTickets - unmappedTickets), BigInt(totalTickets)),
    // Epic-5-retro F6: align with SM-5 / Coverage (exclude Catch-all within + overflow).
    mappedHourShare:
      attribution.cumulative.totalMh === 0n
        ? ZERO
        : ratio(mappedExcludingCatchAllMh, attribution.cumulative.totalMh),
    unmappedTickets,
    perConnector,
  };

  const c = attribution.cumulative;
  // SM-C1: Catch-all share of total hours — never 0 when unavailable.
  const catchAllShare: RatioMetric =
    c.totalMh === 0n
      ? unavailable('no_hours')
      : ratioValue(ratio(c.catchAllMh + c.catchAllOverflowMh, c.totalMh));
  const scopeTotal = c.totalMh === 0n ? 1n : c.totalMh;
  // `label` is the stable key — ScopeLedgerBar translates via next-intl (story 5.11).
  const scopeLedger = [
    { key: 'mapped-baselined', label: 'mapped-baselined', mh: c.mappedBaselinedMh },
    { key: 'mapped-non-baselined', label: 'mapped-non-baselined', mh: c.mappedNonBaselinedMh },
    { key: 'catch-all', label: 'catch-all', mh: c.catchAllMh },
    { key: 'catch-all-overflow', label: 'catch-all-overflow', mh: c.catchAllOverflowMh },
    { key: 'unmapped', label: 'unmapped', mh: c.unmappedMh },
  ].map((s) => ({ ...s, share: ratio(s.mh, scopeTotal) }));

  const explainNotes = input.dispositions
    .filter((d) => d.kind === 'explain' && d.note)
    .map((d) => ({
      note: d.note!,
      ticketCount: d.ticketIds.length,
      mh: sum(d.ticketIds.map((t) => attribution.hoursByTicket.get(t) ?? 0n)),
    }));

  // Story 5.13 / UX-DR23: per-Connector OB (omit zero / empty — never a misleading 0h claim).
  const openingBalanceByConnector: OpeningBalanceByConnector[] = [
    ...attribution.openingBalanceMhByConnector.entries(),
  ]
    .filter(([, mh]) => mh !== 0n)
    .map(([connectorId, mh]) => ({
      connectorId,
      label: connectorLabel(connectorId),
      mh,
    }))
    .sort((a, b) =>
      a.connectorId < b.connectorId ? -1 : a.connectorId > b.connectorId ? 1 : 0,
    );

  // Story 5.13 / Q2→A: latest scope change per Connector (requires a predecessor).
  const leftScopeDetails = input.leftScopeTicketDetails ?? [];
  const eventsByConnector = new Map<
    string,
    { seq: number; connectorId: string; scope: string; at: string }[]
  >();
  for (const e of input.connectorScopeEvents ?? []) {
    const list = eventsByConnector.get(e.connectorId) ?? [];
    list.push(e);
    eventsByConnector.set(e.connectorId, list);
  }
  const latestScopeChanges: ConnectorScopeChangeRow[] = [];
  for (const [connectorId, events] of eventsByConnector) {
    const ordered = [...events].sort((a, b) => a.seq - b.seq);
    if (ordered.length < 2) continue;
    const previous = ordered[ordered.length - 2]!;
    const latest = ordered[ordered.length - 1]!;
    latestScopeChanges.push({
      connectorId,
      label: connectorLabel(connectorId),
      previousScope: previous.scope,
      newScope: latest.scope,
      at: latest.at,
      leftScopeTickets: leftScopeDetails
        .filter((t) => t.ownerConnectorId === connectorId)
        .map((t) => ({
          ticketId: t.trackerIssueId,
          key: t.key,
          hoursMh: t.hoursMh,
        }))
        .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
    });
  }
  latestScopeChanges.sort((a, b) =>
    a.connectorId < b.connectorId ? -1 : a.connectorId > b.connectorId ? 1 : 0,
  );

  return {
    formulaVersion: input.formulaVersion ?? FORMULA_VERSION,
    snapshot: {
      id: input.pinnedSnapshot.snapshotId,
      observedAt: input.pinnedSnapshot.observedAt,
      // Full pin length — left-scope Tickets stay in the snapshot chrome; coverage uses in-scope only.
      ticketCount: input.pinnedSnapshot.tickets.length,
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
    ruleUnmapped,
    milestones,
    divergence,
    coverage,
    catchAllShare,
    dispositions: input.dispositions,
    explainNotes,
    openingBalanceMh: attribution.openingBalanceMh,
    openingBalanceByConnector,
    latestScopeChanges,
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
        // Story 5.12: show the Baseline pin when present; else the live cache (display only).
        isCatchAll: b?.isCatchAll ?? w.isCatchAll,
        nonBaselined: !b,
      };
    })
    .sort((a, b) =>
      compareWp({ id: a.wpId, wbsCode: a.wbsCode }, { id: b.wpId, wbsCode: b.wbsCode }),
    );
}

export type { MappingHeadEntry };
