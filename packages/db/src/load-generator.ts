/**
 * In-process NFR-P1 load fixture (stories 1.8 + 5.15): 5 Projects × 500 Work Packages +
 * Resources, and — since 5.15 — 2,000 synthetic Tickets per Project over a 4-week snapshot
 * history (1,700 / 1,800 / 1,900 / 2,000), replayed through the same domain path as the demo
 * (`replayConnector`: `ingestSnapshot` + `applyRules`) so observations, Mappings and the ledger
 * come out deterministically from {@link LOAD_FIXTURE_SEED}. Nothing is committed as JSON.
 *
 * Every Ticket field sits inside the FR-19 whitelist (AR-41): synthetic keys `LOAD-<p>-<n>`,
 * titles `Load ticket <n>`, accounts `bk-load-*`; no descriptions, no comments.
 */
import {
  buildCalendar,
  DEFAULT_THRESHOLDS,
  type BaselineVersion,
  type HolidayCalendar,
  type MappingEvent,
  type MappingRule,
  type ProjectConfig,
  type Resource,
  type WorkPackage,
  type SnapshotRead,
  type TicketAttribute,
  type TicketObservation,
  type TrackerAccountObservation,
} from '@momo/domain';
import { mulberry32 } from './fixture-prng';
import {
  integerFromJson,
  mhFromJson,
  replayConnector,
  type DemoState,
  type FixtureProject,
} from './fixtures';

/** Fixed seed — changing it is a deliberate fixture revision, not a silent drift. */
export const LOAD_FIXTURE_SEED = 20260922;

export const LOAD_PROJECT_COUNT = 5;
export const LOAD_WP_PER_PROJECT = 500;
/** Shallow wide tree: phase roots + leaves = 500. */
const PHASE_COUNT = 10;
const LEAVES_PER_PHASE = 49; // 10 + 490 = 500

/** Story 5.15: Tickets in each weekly snapshot, oldest first (+100 a week, none leave scope). */
export const LOAD_TICKET_HISTORY: readonly number[] = [1_700, 1_800, 1_900, 2_000];
/** The latest snapshot's Ticket count — NFR-P1's 2,000-Ticket shape. */
export const LOAD_TICKETS_PER_PROJECT = 2_000;
/**
 * Width of each load Project's ledger / Mapping `seq` band. `seq` is a global primary key, and
 * five Projects replayed from 1 would collide; Project `i` allocates from `i × band + 1`.
 */
export const LOAD_SEQ_BAND_PER_PROJECT = 100_000;
/** Default id namespace: `ten-load`, `prj-load-1`, `wp-load-1-1-1`, … */
export const LOAD_NAMESPACE = 'load';

/** Mapping-attribute ids the two load rules match on (story 5.15). */
export const LOAD_RULE_CATEGORY_ID = 'cat-load-ops';
export const LOAD_RULE_MILESTONE_ID = 'ms-load-r1';
/** The synthetic actor the load fixture's seeded manual Mappings and Baseline carry. */
const LOAD_ACTOR = 'user:load-fixture';

const H = 1000;
const hm = (h: number) => Math.round(h * H);

const day = 86_400_000;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`).getTime();
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const addDays = (s: string, n: number) => iso(d(s) + n * day);
const isoAt = (t: number) => new Date(t).toISOString();

export interface LoadResourceSpec {
  id: string;
  name: string;
  accountId: string;
  yenPerHour: number;
  role: string;
}

/** One replayable snapshot — a complete `SnapshotRead` with the id the seed writes it under. */
export type LoadSnapshot = SnapshotRead & { snapshotId: string };

export interface LoadProjectShape {
  id: string;
  name: string;
  clientName: string;
  wps: WorkPackage[];
  baseline: FixtureProject['baseline'];
  /** Story 5.15: four weekly complete snapshots, oldest first. */
  snapshots: LoadSnapshot[];
  /** Story 5.15: two priority-ordered rules (category, milestone). */
  mappingRules: MappingRule[];
  /** Story 5.15: the PM's manual Mappings, recorded before the first snapshot. */
  seedMappings: FixtureProject['seedMappings'];
}

export interface LoadFixtureShape {
  /** The id namespace every generated id carries (`load` unless a probe asks otherwise). */
  namespace: string;
  /** The seed the shape was generated from — the week-5 builder derives its PRNG from it. */
  seed: number;
  anchor: string;
  tenant: { id: string; name: string };
  department: { id: string; name: string };
  program: { id: string; name: string };
  resources: LoadResourceSpec[];
  projects: LoadProjectShape[];
}

export interface LoadFixtureOptions {
  /**
   * Replaces `load` in every generated id (`ten-<ns>`, `prj-<ns>-1`, `wp-<ns>-1-1-1`, …) so a
   * probe Tenant can carry the full shape beside another without colliding on globally unique
   * primary keys. Ticket keys, issue ids and account ids are Tenant-scoped and stay as they are.
   * Does not touch the PRNG: every namespace yields the same numbers.
   */
  readonly namespace?: string;
}

/** Weekly observation instants: week 4 is the anchor itself, so the fixture Clock reads it. */
function weekObservedAt(anchor: string): number[] {
  const at = Date.parse(anchor);
  return LOAD_TICKET_HISTORY.map((_, k) => at - (LOAD_TICKET_HISTORY.length - 1 - k) * 7 * day);
}

/** The status a synthetic Ticket reports for its hours so far (adapters report `statusId` only). */
function statusFor(actualMh: number, estimateMh: number): string {
  if (actualMh >= estimateMh) return 'Closed';
  return actualMh > 0 ? 'In Progress' : 'Open';
}

/** What a synthetic Ticket is for the life of the history; its hours are per week. */
interface TicketPlan {
  n: number;
  firstWeek: number;
  hoursMh: number[]; // indexed by week, 0 before `firstWeek`
  estimateMh: number;
  assigneeAccountId: string;
  issueTypeId: string;
  createdAt: string;
  attributes: TicketAttribute[];
  /** n mod 20: 0–13 manual, 14–15 category rule, 16 milestone rule, 17 Catch-all, 18–19 Unmapped. */
  bucket: number;
}

const CATEGORY_ATTR: TicketAttribute = { kind: 'category', id: LOAD_RULE_CATEGORY_ID, label: 'Ops' };
const MILESTONE_ATTR: TicketAttribute = {
  kind: 'milestone',
  id: LOAD_RULE_MILESTONE_ID,
  label: 'Release 1',
};

function planTickets(
  seed: number,
  projectNumber: number,
  resources: readonly LoadResourceSpec[],
  weeks: readonly number[],
): TicketPlan[] {
  // A PRNG of its own per Project, so the Ticket half never shifts the WP half's numbers.
  const rnd = mulberry32(((seed ^ 0x5eed_7e57) + projectNumber * 7919) | 0);
  const plans: TicketPlan[] = [];
  for (let n = 1; n <= LOAD_TICKETS_PER_PROJECT; n += 1) {
    const firstWeek = LOAD_TICKET_HISTORY.findIndex((count) => n <= count);
    if (firstWeek < 0) throw new Error(`load ticket ${n} falls outside the history`);
    const hoursMh: number[] = LOAD_TICKET_HISTORY.map(() => 0);
    let current = hm(firstWeek === 0 ? 1 + Math.floor(rnd() * 30) : 1 + Math.floor(rnd() * 8));
    for (let w = firstWeek; w < LOAD_TICKET_HISTORY.length; w += 1) {
      if (w > firstWeek && rnd() < 0.6) current += hm(0.5 * (1 + Math.floor(rnd() * 16)));
      hoursMh[w] = current;
    }
    const createdMs =
      firstWeek === 0
        ? weeks[0]! - (1 + Math.floor(rnd() * 60)) * day
        : weeks[firstWeek - 1]! + (1 + Math.floor(rnd() * 5)) * day;
    const bucket = n % 20;
    plans.push({
      n,
      firstWeek,
      hoursMh,
      estimateMh: hm(4 + Math.floor(rnd() * 40)),
      assigneeAccountId: resources[Math.floor(rnd() * resources.length)]!.accountId,
      issueTypeId: rnd() < 0.2 ? 'Bug' : 'Task',
      createdAt: isoAt(createdMs),
      attributes:
        bucket === 14 || bucket === 15 ? [CATEGORY_ATTR] : bucket === 16 ? [MILESTONE_ATTR] : [],
      bucket,
    });
  }
  return plans;
}

function observe(plan: TicketPlan, projectNumber: number, actualMh: number): TicketObservation {
  return {
    trackerIssueId: `load-issue-${projectNumber}-${plan.n}`,
    key: `LOAD-${projectNumber}-${plan.n}`,
    title: `Load ticket ${plan.n}`,
    statusId: statusFor(actualMh, plan.estimateMh),
    estimateMh: mhFromJson(plan.estimateMh),
    actualMh: mhFromJson(actualMh),
    assigneeAccountId: plan.assigneeAccountId,
    createdAt: plan.createdAt,
    parentIssueId: null,
    issueTypeId: plan.issueTypeId,
    trackerProjectId: `LOAD-${projectNumber}`,
    attributes: plan.attributes.map((a) => ({ ...a })),
  };
}

function accountsOf(resources: readonly LoadResourceSpec[]): TrackerAccountObservation[] {
  return resources.map((r) => ({ accountId: r.accountId, displayName: r.name }));
}

/** Refuses a history that drifted from 1,700 / 1,800 / 1,900 / 2,000 complete reads. */
export function assertLoadHistory(projectId: string, snapshots: readonly LoadSnapshot[]): void {
  const counts = snapshots.map((s) => s.tickets.length);
  const drift =
    counts.length !== LOAD_TICKET_HISTORY.length ||
    counts.some((c, i) => c !== LOAD_TICKET_HISTORY[i]) ||
    counts.at(-1) !== LOAD_TICKETS_PER_PROJECT ||
    snapshots.some((s) => s.complete !== true);
  if (drift) {
    throw new Error(
      `load fixture ${projectId} snapshot history drifted: [${counts.join(', ')}]; expected ` +
        `[${LOAD_TICKET_HISTORY.join(', ')}], all complete`,
    );
  }
}

function buildTicketHalf(
  seed: number,
  ns: string,
  projectNumber: number,
  anchor: string,
  resources: readonly LoadResourceSpec[],
  wps: readonly WorkPackage[],
): Pick<LoadProjectShape, 'snapshots' | 'mappingRules' | 'seedMappings'> {
  const weeks = weekObservedAt(anchor);
  const plans = planTickets(seed, projectNumber, resources, weeks);
  const accounts = accountsOf(resources);

  const snapshots: LoadSnapshot[] = weeks.map((at, w) => ({
    snapshotId: `snap-${ns}-${projectNumber}-w${w + 1}`,
    observedAt: isoAt(at),
    hoursFieldPresent: true,
    complete: true,
    accounts: accounts.map((a) => ({ ...a })),
    rateLimit: null,
    adapterKind: 'fixture' as const,
    tickets: plans
      .filter((plan) => plan.firstWeek <= w)
      .map((plan) => observe(plan, projectNumber, plan.hoursMh[w]!)),
  }));
  assertLoadHistory(`prj-${ns}-${projectNumber}`, snapshots);

  const leaves = wps.filter((w) => w.isLeaf && !w.isCatchAll);
  const catchAll = wps.find((w) => w.isCatchAll);
  if (!catchAll || leaves.length < 2) {
    throw new Error(`load fixture project ${projectNumber} needs a Catch-all and two leaves`);
  }
  const mappingRules: MappingRule[] = [
    {
      id: `rule-${ns}-${projectNumber}-cat`,
      priority: 1,
      name: 'Ops category',
      wpId: leaves[0]!.id,
      match: { field: 'category', value: LOAD_RULE_CATEGORY_ID },
    },
    {
      id: `rule-${ns}-${projectNumber}-ms`,
      priority: 2,
      name: 'Release 1 milestone',
      wpId: leaves[LEAVES_PER_PHASE]!.id,
      match: { field: 'milestone', value: LOAD_RULE_MILESTONE_ID },
    },
  ];
  const seedMappings: FixtureProject['seedMappings'] = plans.flatMap((plan) => {
    const ticketId = `load-issue-${projectNumber}-${plan.n}`;
    if (plan.bucket <= 13) {
      return [{ ticketId, wpId: leaves[(plan.n * 37) % leaves.length]!.id, source: 'manual' as const }];
    }
    if (plan.bucket === 17) return [{ ticketId, wpId: catchAll.id, source: 'manual' as const }];
    return [];
  });

  return { snapshots, mappingRules, seedMappings };
}

/**
 * Pure generator: 5 Projects × 500 WPs + Resources + (story 5.15) 2,000 Tickets per Project
 * over four weekly snapshots, with two Mapping Rules and the PM's manual Mappings.
 * `seed` defaults to {@link LOAD_FIXTURE_SEED}.
 */
export function generateLoadFixture(
  seed: number = LOAD_FIXTURE_SEED,
  options: LoadFixtureOptions = {},
): LoadFixtureShape {
  const ns = options.namespace ?? LOAD_NAMESPACE;
  const rnd = mulberry32(seed);
  const PROJECT_START = '2026-01-05';
  const anchor = '2026-09-16T09:00:00.000Z';

  const resources: LoadResourceSpec[] = Array.from({ length: 24 }, (_, i) => {
    const n = i + 1;
    return {
      id: `res-${ns}-${String(n).padStart(2, '0')}`,
      name: `Load Resource ${n}`,
      accountId: `bk-load-${2000 + n}`,
      yenPerHour: 3000 + Math.floor(rnd() * 4000),
      role: n % 5 === 1 ? 'PM' : n % 5 === 2 ? 'Tech lead' : n % 5 === 3 ? 'QA' : 'Engineer',
    };
  });

  const projects: LoadProjectShape[] = [];
  for (let p = 1; p <= LOAD_PROJECT_COUNT; p += 1) {
    const projectId = `prj-${ns}-${p}`;
    const wps: WorkPackage[] = [];
    const baselineWps: FixtureProject['baseline']['wps'] = [];

    for (let phase = 1; phase <= PHASE_COUNT; phase += 1) {
      const phaseCode = String(phase);
      const phaseId = `wp-${ns}-${p}-${phaseCode}`;
      wps.push({
        id: phaseId,
        wbsCode: phaseCode,
        name: `Phase ${phase}`,
        parentId: null,
        isLeaf: false,
        isMilestone: false,
        isCatchAll: false,
        plannedMh: 0n,
        actualStart: null,
        actualFinish: null,
        assignedResourceIds: [],
      });

      for (let leaf = 1; leaf <= LEAVES_PER_PHASE; leaf += 1) {
        const code = `${phase}.${leaf}`;
        const id = `wp-${ns}-${p}-${phase}-${leaf}`;
        const startOffset = (phase - 1) * 20 + leaf;
        const start = addDays(PROJECT_START, startOffset);
        const finish = addDays(start, 10 + Math.floor(rnd() * 10));
        const hours = 8 + Math.floor(rnd() * 40);
        const plannedMh = hm(hours);
        const res = resources[Math.floor(rnd() * resources.length)]!;
        wps.push({
          id,
          wbsCode: code,
          name: `WP ${code}`,
          parentId: phaseId,
          isLeaf: true,
          isMilestone: false,
          isCatchAll: leaf === LEAVES_PER_PHASE && phase === PHASE_COUNT,
          plannedMh: mhFromJson(plannedMh),
          actualStart: null,
          actualFinish: null,
          assignedResourceIds: [res.id],
        });
        baselineWps.push({
          wpId: id,
          start,
          finish,
          baselineMh: plannedMh,
          isMilestone: false,
          isCatchAll: leaf === LEAVES_PER_PHASE && phase === PHASE_COUNT,
        });
      }
    }

    if (wps.length !== LOAD_WP_PER_PROJECT) {
      throw new Error(
        `load fixture project ${p} has ${wps.length} WPs; expected ${LOAD_WP_PER_PROJECT}`,
      );
    }

    projects.push({
      id: projectId,
      name: `Load project ${p}`,
      clientName: `Load Client ${p} KK`,
      wps,
      baseline: {
        id: `bl-${ns}-${p}`,
        seq: p,
        reason: 'Initial load-fixture Baseline',
        recordedAt: '2026-01-10T02:00:00.000Z',
        wps: baselineWps,
      },
      ...buildTicketHalf(seed, ns, p, anchor, resources, wps),
    });
  }

  return {
    namespace: ns,
    seed,
    anchor,
    tenant: { id: `ten-${ns}`, name: 'Load Fixture Tenant' },
    department: { id: `dep-${ns}`, name: 'Load Delivery' },
    program: { id: `prg-${ns}`, name: 'Load programme' },
    resources,
    projects,
  };
}

/**
 * Week 5 for one load Project (story 5.15's timed snapshot): the same 2,000 Tickets, hours
 * advanced on most of them, observed a week after the anchor — so `writeIngestSnapshot` derives
 * deltas against week 4 on a load-shaped Project rather than Opening Balances on an empty one.
 */
export function loadWeek5Read(shape: LoadFixtureShape, projectIndex: number): LoadSnapshot {
  const project = shape.projects[projectIndex];
  const week4 = project?.snapshots.at(-1);
  if (!project || !week4) throw new Error(`load fixture has no project at index ${projectIndex}`);
  const rnd = mulberry32(((shape.seed ^ 0x0005_7eed) + (projectIndex + 1) * 104_729) | 0);
  const projectNumber = projectIndex + 1;
  const tickets = week4.tickets.map((t) => {
    const before = Number(t.actualMh ?? 0n);
    const after = rnd() < 0.7 ? before + hm(0.5 * (1 + Math.floor(rnd() * 8))) : before;
    return {
      ...t,
      statusId: statusFor(after, Number(t.estimateMh ?? 0n)),
      actualMh: mhFromJson(after),
      attributes: t.attributes.map((a) => ({ ...a })),
    };
  });
  return {
    snapshotId: `snap-${shape.namespace}-${projectNumber}-w5`,
    observedAt: isoAt(Date.parse(week4.observedAt) + 7 * day),
    hoursFieldPresent: true,
    complete: true,
    accounts: (week4.accounts ?? []).map((a) => ({ ...a })),
    rateLimit: null,
    adapterKind: 'fixture',
    tickets,
  };
}

const ticketLine = (snapId: string, t: TicketObservation): string =>
  `obs:${snapId}:${t.trackerIssueId}:${t.key}:${t.title}:${t.statusId}:` +
  `${t.estimateMh?.toString() ?? ''}:${t.actualMh?.toString() ?? ''}:${t.assigneeAccountId ?? ''}:` +
  `${t.createdAt}:${t.issueTypeId}:${t.trackerProjectId ?? ''}:` +
  t.attributes.map((a) => `${a.kind}=${a.id}`).join(',');

/**
 * Structural fingerprint for determinism tests — ids, tree shape, Rates, assignments and
 * (story 5.15) every observation, rule, Mapping event and ledger entry the replay derives.
 * Built without `JSON.stringify` (AD-4 / bigint ban): a stable, hand-rolled encoding.
 */
export function loadFixtureFingerprint(shape: LoadFixtureShape): string {
  const lines: string[] = [];
  lines.push(`tenant:${shape.tenant.id}:${shape.tenant.name}`);
  lines.push(`dept:${shape.department.id}:${shape.department.name}`);
  lines.push(`prog:${shape.program.id}:${shape.program.name}`);
  for (const r of shape.resources) {
    lines.push(`res:${r.id}:${r.accountId}:${r.yenPerHour}:${r.role}`);
  }
  shape.projects.forEach((p, index) => {
    lines.push(`prj:${p.id}:${p.name}`);
    for (const w of p.wps) {
      lines.push(
        `wp:${w.id}:${w.wbsCode}:${w.parentId ?? ''}:${w.isLeaf ? 1 : 0}:${w.plannedMh.toString()}:${w.assignedResourceIds.join(',')}:${w.actualStart ?? ''}:${w.actualFinish ?? ''}`,
      );
    }
    lines.push(`bl:${p.baseline.id}:${p.baseline.seq}`);
    for (const b of p.baseline.wps) {
      lines.push(`blwp:${b.wpId}:${b.baselineMh}:${b.start}:${b.finish}`);
    }
    for (const r of p.mappingRules) {
      lines.push(`rule:${r.id}:${r.priority}:${r.wpId}:${r.match.field}=${r.match.value}`);
    }
    for (const snap of p.snapshots) {
      lines.push(`snap:${snap.snapshotId}:${snap.observedAt}:${snap.tickets.length}`);
      for (const t of snap.tickets) lines.push(ticketLine(snap.snapshotId, t));
    }
    const state = loadProjectAsDemoState(shape, index);
    for (const m of state.mappingEvents) {
      lines.push(`map:${m.seq}:${m.ticketId}:${m.wpId ?? ''}:${m.source}:${m.ruleId ?? ''}:${m.at}`);
    }
    for (const e of state.ledger) {
      lines.push(
        `led:${e.seq}:${e.ticketId}:${e.kind}:${e.deltaMh.toString()}:${e.windowStart ?? ''}:${e.windowEnd}:${e.assigneeAccountId ?? ''}`,
      );
    }
  });
  return lines.join('\n');
}

/**
 * One Project's worth of `DemoState` for the shared `writeTenantRows` path, with its snapshot
 * history replayed through `replayConnector` (story 5.15). The load seed writes the Tenant
 * shell once, then each project through the row writer — see `writeLoadTenantRows`.
 *
 * Ledger and Mapping `seq` values come from this Project's own band
 * (`projectIndex × LOAD_SEQ_BAND_PER_PROJECT + 1`), so five Projects never share a key.
 */
export function loadProjectAsDemoState(shape: LoadFixtureShape, projectIndex: number): DemoState {
  const projectShape = shape.projects[projectIndex];
  if (!projectShape) {
    throw new Error(`load fixture has no project at index ${projectIndex}`);
  }

  const fixture: FixtureProject = {
    anchor: shape.anchor,
    tenant: shape.tenant,
    department: shape.department,
    program: shape.program,
    project: {
      id: projectShape.id,
      name: projectShape.name,
      clientName: projectShape.clientName,
      contractType: '準委任',
      tzOffsetMinutes: 540,
      teireiWeekday: 4,
      defaultRateYenPerHour: 4000,
      eacMethod: 'typical',
      calendar: { jp: true, vn: true },
      baselineStart: '2026-01-05',
      baselineFinish: '2026-12-18',
    },
    resources: shape.resources,
    unlinkedAccount: 'bk-load-unlinked',
    wps: projectShape.wps.map((w) => ({
      ...w,
      plannedMh: Number(w.plannedMh),
      baselineMh: Number(w.plannedMh),
    })),
    baseline: projectShape.baseline,
    mappingRules: projectShape.mappingRules,
    seedMappings: projectShape.seedMappings,
  };

  const project: ProjectConfig = {
    id: fixture.project.id,
    name: fixture.project.name,
    clientName: fixture.project.clientName,
    contractType: fixture.project.contractType,
    tzOffsetMinutes: fixture.project.tzOffsetMinutes,
    teireiWeekday: fixture.project.teireiWeekday,
    defaultRateYenPerHour: integerFromJson(fixture.project.defaultRateYenPerHour),
    eacMethod: 'typical',
    thresholds: DEFAULT_THRESHOLDS,
  };

  const calendar: HolidayCalendar = buildCalendar('jp-vn-2026', {
    jp: true,
    vn: true,
  });

  const baselineVersions: BaselineVersion[] = [
    {
      seq: fixture.baseline.seq,
      id: fixture.baseline.id,
      reason: fixture.baseline.reason,
      recordedAt: fixture.baseline.recordedAt,
      actor: LOAD_ACTOR,
      wps: fixture.baseline.wps.map((b) => ({ ...b, baselineMh: mhFromJson(b.baselineMh) })),
    },
  ];

  const resources: Resource[] = shape.resources.map((r) => ({
    id: r.id,
    name: r.name,
    departmentId: shape.department.id,
    trackerAccountIds: [r.accountId],
    rates: [{ seq: 1, effectiveFrom: '2026-01-01', yenPerHour: integerFromJson(r.yenPerHour) }],
  }));

  const seqBase = projectIndex * LOAD_SEQ_BAND_PER_PROJECT;
  const seedMappingEvents: MappingEvent[] = projectShape.seedMappings.map((m, i) => ({
    seq: seqBase + i + 1,
    ticketId: m.ticketId,
    wpId: m.wpId,
    source: 'manual' as const,
    at: fixture.baseline.recordedAt,
    actor: LOAD_ACTOR,
  }));
  const snapshots = projectShape.snapshots;
  const replayed = replayConnector({
    snapshots,
    baselineVersions,
    mappingRules: projectShape.mappingRules,
    seedMappingEvents,
    ledgerSeqFrom: seqBase + 1,
    mappingSeqFrom: seqBase + seedMappingEvents.length + 1,
  });

  return {
    anchor: shape.anchor,
    fixture,
    project,
    calendar,
    wps: projectShape.wps,
    baselineVersions,
    activeBaselineSeq: fixture.baseline.seq,
    resources,
    snapshots,
    ledger: replayed.ledger,
    mappingEvents: replayed.mappingEvents,
    mappingRules: projectShape.mappingRules,
    leftScope: replayed.leftScope,
    measurementBasis: replayed.measurementBasis,
  };
}
