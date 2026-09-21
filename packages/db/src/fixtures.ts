import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  applyRules,
  buildCalendar,
  DEFAULT_THRESHOLDS,
  ingestSnapshot,
  mappingHead,
  periodOf,
  projectDate,
  type BaselineVersion,
  type BaselineWp,
  type HolidayCalendar,
  type LedgerEntry,
  type MappingEvent,
  type MappingRule,
  type ProjectConfig,
  type Resource,
  type Mh,
  type SnapshotRead,
  type TicketObservation,
  type WorkPackage,
} from '@momo/domain';

/** Walk up from the working directory to the repo root (the folder holding `fixtures/`). */
function repoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(join(dir, 'fixtures', 'demo', 'project.json'))) return dir;
    dir = dirname(dir);
  }
  throw new Error('could not locate the repo root (no fixtures/demo/project.json found)');
}
const ROOT = repoRoot();

/**
 * The fixture files are JSON, so their effort and money are JSON numbers — integer milli-hours
 * and integer yen. The `Fixture*` types below say so honestly, and everything handed to the
 * domain is converted to `bigint` on the way in (AD-4), through `mhFromJson`, which refuses a
 * non-integer rather than rounding it.
 */
type RawTicket = Omit<TicketObservation, 'estimateMh' | 'actualMh'> & {
  estimateMh: number | null;
  actualMh: number | null;
};
type RawWorkPackage = Omit<WorkPackage, 'plannedMh'> & { plannedMh: number; baselineMh: number };
type RawBaselineWp = Omit<BaselineWp, 'baselineMh'> & { baselineMh: number };

/**
 * An integer JSON number as `bigint`, refusing anything that is not a SAFE integer: a fraction,
 * and also a number past 2^53, which `JSON.parse` has already rounded to the nearest double.
 * Effort (milli-hours) and yen both come in through here, so nothing is rounded on the way in.
 */
export function integerFromJson(n: number): bigint {
  if (!Number.isSafeInteger(n)) {
    throw new RangeError(`fixture value ${n} is not a safe integer, so it cannot be carried exactly`);
  }
  return BigInt(n);
}
export const mhFromJson = (n: number): Mh => integerFromJson(n);
const optionalMhFromJson = (n: number | null): Mh | null => (n === null ? null : mhFromJson(n));

const ticketFromJson = (t: RawTicket): TicketObservation => ({
  ...t,
  estimateMh: optionalMhFromJson(t.estimateMh),
  actualMh: optionalMhFromJson(t.actualMh),
});

export interface FixtureSnapshotFile {
  scenario: string;
  page: number;
  observedAtOffsetHours: number;
  recordedObservedAt: string;
  hoursFieldPresent: boolean;
  tickets: RawTicket[];
}

export interface FixtureProject {
  anchor: string;
  tenant: { id: string; name: string };
  department: { id: string; name: string };
  project: {
    id: string;
    name: string;
    clientName: string;
    contractType: '請負' | '準委任';
    tzOffsetMinutes: number;
    teireiWeekday: number;
    defaultRateYenPerHour: number;
    eacMethod: 'typical';
    calendar: { jp: boolean; vn: boolean };
    baselineStart: string;
    baselineFinish: string;
  };
  resources: { id: string; name: string; accountId: string; yenPerHour: number; role: string }[];
  unlinkedAccount: string;
  wps: RawWorkPackage[];
  baseline: {
    id: string;
    seq: number;
    reason: string;
    recordedAt: string;
    wps: RawBaselineWp[];
  };
  mappingRules: MappingRule[];
  seedMappings: { ticketId: string; wpId: string; source: 'manual' }[];
}

export function loadFixtureProject(): FixtureProject {
  return JSON.parse(readFileSync(join(ROOT, 'fixtures/demo/project.json'), 'utf8'));
}

/**
 * AD-6 fixture-replay adapter. Recorded times are REBASED onto the demo anchor
 * (architecture review G-5 fix (a)) so the demo's snapshot freshness and the
 * "current" Reporting Period behave as they did when the fixtures were recorded.
 */
export function loadFixtureSnapshots(anchorIso: string): (SnapshotRead & { snapshotId: string })[] {
  const dir = join(ROOT, 'fixtures/backlog/ec-phase2');
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const anchor = new Date(anchorIso).getTime();
  return files.map((f) => {
    const raw: FixtureSnapshotFile = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    return {
      snapshotId: `snap-${raw.scenario}-${String(raw.page).padStart(4, '0')}`,
      observedAt: new Date(anchor + raw.observedAtOffsetHours * 3600_000).toISOString(),
      hoursFieldPresent: raw.hoursFieldPresent,
      tickets: raw.tickets.map(ticketFromJson),
    };
  });
}

export interface DemoState {
  anchor: string;
  fixture: FixtureProject;
  project: ProjectConfig;
  calendar: HolidayCalendar;
  wps: WorkPackage[];
  baselineVersions: BaselineVersion[];
  activeBaselineSeq: number;
  resources: Resource[];
  snapshots: (SnapshotRead & { snapshotId: string })[];
  ledger: LedgerEntry[];
  mappingEvents: MappingEvent[];
  mappingRules: MappingRule[];
  leftScope: { ticketId: string; key: string }[];
  measurementBasis: 'hours' | 'count';
}

/**
 * Replays the fixture Connector: ingest each snapshot in order, deriving ledger
 * entries and re-evaluating Mapping Rules inside the same step (AD-7 (e)).
 * Deterministic for a given anchor, so the UI and the golden tests agree exactly.
 */
export function buildDemoState(anchorIso?: string): DemoState {
  const fixture = loadFixtureProject();
  const anchor = anchorIso ?? fixture.anchor;
  const snapshots = loadFixtureSnapshots(anchor);

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

  const calendar = buildCalendar('jp-vn-2026', {
    jp: fixture.project.calendar.jp,
    vn: fixture.project.calendar.vn,
  });

  const wps: WorkPackage[] = fixture.wps.map((w) => ({
    id: w.id,
    wbsCode: w.wbsCode,
    name: w.name,
    parentId: w.parentId,
    isLeaf: w.isLeaf,
    isMilestone: w.isMilestone,
    isCatchAll: w.isCatchAll,
    start: w.start,
    finish: w.finish,
    plannedMh: mhFromJson(w.plannedMh),
    completedAt: w.completedAt,
    milestoneDoneAt: w.milestoneDoneAt,
    assignedResourceIds: w.assignedResourceIds,
  }));

  const baselineVersions: BaselineVersion[] = [
    {
      seq: fixture.baseline.seq,
      id: fixture.baseline.id,
      reason: fixture.baseline.reason,
      recordedAt: fixture.baseline.recordedAt,
      wps: fixture.baseline.wps.map((b) => ({ ...b, baselineMh: mhFromJson(b.baselineMh) })),
    },
  ];

  const resources: Resource[] = fixture.resources.map((r) => ({
    id: r.id,
    name: r.name,
    departmentId: fixture.department.id,
    trackerAccountIds: [r.accountId],
    rates: [{ effectiveFrom: '2026-01-01', yenPerHour: integerFromJson(r.yenPerHour) }],
  }));

  // --- UJ-2: the PM's manual Mappings, recorded before the first snapshot.
  let mapSeq = 1;
  const mappingEvents: MappingEvent[] = fixture.seedMappings.map((m) => ({
    seq: mapSeq++,
    ticketId: m.ticketId,
    wpId: m.wpId,
    source: 'manual' as const,
    at: fixture.baseline.recordedAt,
    actor: 'user:linh',
  }));

  // --- replay the Connector
  let ledgerSeq = 1;
  const ledger: LedgerEntry[] = [];
  const leftScope: { ticketId: string; key: string }[] = [];
  let prev: SnapshotRead | null = null;
  let basis: 'hours' | 'count' = 'hours';

  for (const snap of snapshots) {
    // AD-7 / adversarial review H3: the active Baseline is the latest committed
    // version BY SEQUENCE, never by comparing fixture timestamps.
    const activeBaselineSeq = Math.max(...baselineVersions.map((b) => b.seq));
    const res = ingestSnapshot({
      prev,
      next: snap,
      activeBaselineVersionSeq: activeBaselineSeq,
      seqFrom: ledgerSeq,
    });
    ledger.push(...res.entries);
    leftScope.push(...res.leftScope);
    ledgerSeq = res.nextSeq;
    basis = res.measurementBasis;

    // FR-22: rules are live — re-evaluate every Ticket without a manual Mapping.
    const head = mappingHead(mappingEvents);
    const events = applyRules(fixture.mappingRules, snap.tickets, head, mapSeq, snap.observedAt);
    mappingEvents.push(...events);
    mapSeq += events.length;

    prev = snap;
  }

  return {
    anchor,
    fixture,
    project,
    calendar,
    wps,
    baselineVersions,
    activeBaselineSeq: fixture.baseline.seq,
    resources,
    snapshots,
    ledger,
    mappingEvents,
    mappingRules: fixture.mappingRules,
    leftScope,
    measurementBasis: basis,
  };
}

/** The Reporting Period the Review lands on: the one containing the anchor. */
export function currentPeriod(state: DemoState) {
  return periodOf(state.anchor, state.project.tzOffsetMinutes, state.project.teireiWeekday);
}

export function asOfDate(state: DemoState) {
  return projectDate(state.anchor, state.project.tzOffsetMinutes);
}
