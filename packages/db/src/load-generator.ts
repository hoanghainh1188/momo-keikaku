/**
 * In-process NFR-P1 load fixture (story 1.8): 5 Projects × 500 Work Packages + Resources.
 * Deterministic from a fixed seed — two builds produce identical ids, trees, Rates and
 * assignments. Tickets are out of scope (Epic 5). Prefer a shallow wide WBS over a deep chain.
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
  type LedgerEntry,
} from '@momo/domain';
import { mulberry32 } from './fixture-prng';
import { integerFromJson, mhFromJson, type DemoState, type FixtureProject } from './fixtures';

/** Fixed seed — changing it is a deliberate fixture revision, not a silent drift. */
export const LOAD_FIXTURE_SEED = 20260922;

export const LOAD_PROJECT_COUNT = 5;
export const LOAD_WP_PER_PROJECT = 500;
/** Shallow wide tree: phase roots + leaves = 500. */
const PHASE_COUNT = 10;
const LEAVES_PER_PHASE = 49; // 10 + 490 = 500

const H = 1000;
const hm = (h: number) => Math.round(h * H);

const day = 86_400_000;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`).getTime();
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const addDays = (s: string, n: number) => iso(d(s) + n * day);

export interface LoadResourceSpec {
  id: string;
  name: string;
  accountId: string;
  yenPerHour: number;
  role: string;
}

export interface LoadProjectShape {
  id: string;
  name: string;
  clientName: string;
  wps: WorkPackage[];
  baseline: FixtureProject['baseline'];
}

export interface LoadFixtureShape {
  anchor: string;
  tenant: { id: string; name: string };
  department: { id: string; name: string };
  program: { id: string; name: string };
  resources: LoadResourceSpec[];
  projects: LoadProjectShape[];
}

/**
 * Pure generator: 5 Projects × 500 WPs + Resources. No Tickets, no snapshots.
 * `seed` defaults to {@link LOAD_FIXTURE_SEED}.
 */
export function generateLoadFixture(seed: number = LOAD_FIXTURE_SEED): LoadFixtureShape {
  const rnd = mulberry32(seed);
  const PROJECT_START = '2026-01-05';
  const PROJECT_FINISH = '2026-12-18';
  const anchor = '2026-09-16T09:00:00.000Z';

  const resources: LoadResourceSpec[] = Array.from({ length: 24 }, (_, i) => {
    const n = i + 1;
    return {
      id: `res-load-${String(n).padStart(2, '0')}`,
      name: `Load Resource ${n}`,
      accountId: `bk-load-${2000 + n}`,
      yenPerHour: 3000 + Math.floor(rnd() * 4000),
      role: n % 5 === 1 ? 'PM' : n % 5 === 2 ? 'Tech lead' : n % 5 === 3 ? 'QA' : 'Engineer',
    };
  });

  const projects: LoadProjectShape[] = [];
  for (let p = 1; p <= LOAD_PROJECT_COUNT; p += 1) {
    const projectId = `prj-load-${p}`;
    const wps: WorkPackage[] = [];
    const baselineWps: FixtureProject['baseline']['wps'] = [];

    for (let phase = 1; phase <= PHASE_COUNT; phase += 1) {
      const phaseCode = String(phase);
      const phaseId = `wp-load-${p}-${phaseCode}`;
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
        const id = `wp-load-${p}-${phase}-${leaf}`;
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
        id: `bl-load-${p}`,
        seq: p,
        reason: 'Initial load-fixture Baseline',
        recordedAt: '2026-01-10T02:00:00.000Z',
        wps: baselineWps,
      },
    });
  }

  return {
    anchor,
    tenant: { id: 'ten-load', name: 'Load Fixture Tenant' },
    department: { id: 'dep-load', name: 'Load Delivery' },
    program: { id: 'prg-load', name: 'Load programme' },
    resources,
    projects,
  };
}

/**
 * Structural fingerprint for determinism tests — ids, tree shape, Rates, assignments.
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
  for (const p of shape.projects) {
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
  }
  return lines.join('\n');
}

/**
 * One Project's worth of `DemoState` for the shared `writeTenantRows` path. The load seed
 * writes the Tenant shell once, then each project through the row writer with a shared
 * idPrefix discipline — see `seedLoadInTenant`.
 */
export function loadProjectAsDemoState(
  shape: LoadFixtureShape,
  projectIndex: number,
): DemoState {
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
    mappingRules: [] as MappingRule[],
    seedMappings: [],
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
      actor: 'user:load-fixture',
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

  const snapshots: (SnapshotRead & { snapshotId: string })[] = [];
  const ledger: LedgerEntry[] = [];
  const mappingEvents: MappingEvent[] = [];

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
    ledger,
    mappingEvents,
    mappingRules: [],
    leftScope: [],
    measurementBasis: 'hours',
  };
}
