/**
 * Story 2.13 — authorised Plan tree-grid read.
 *
 * Joins live WP/edge inputs with `wp_schedule` and the latest `schedule_run` outputs (exceptions,
 * anchor). Display order is always `compareWp` (AD-28). Writes stay on `applyPlanChange`.
 */
import { and, eq } from 'drizzle-orm';
import {
  compareWp,
  parseStoredInputs,
  parseStoredOutputs,
  remainingDuration,
  type ScheduleAnchor,
} from '@momo/domain';
import type { Bound } from '../../../db/src/bound';
import { projectNotFound } from '../../../db/src/project-not-found';
import { planInputRepositoryOn } from '../../../db/src/repositories/plan-input';
import { scheduleRepositoryOn } from '../../../db/src/repositories/schedule';
import * as s from '../../../db/src/schema';
import { authorize, PROJECT_REACH_ROLES } from '../authz/authorize';
import type { RequestContext } from '../authz/request-context';
import type { SchedulingBound } from '../ports/schedule-write';
import { ok, type Result } from '../result';
import type { ApplyPlanChangeDeps } from './apply-plan-change';

export const SUMMARY_NA_LABEL =
  'not applicable — summary work package, rolled up from its children';

export type PlanGridExceptionKind = 'violation' | 'out_of_sequence' | 'not_schedulable';

export interface PlanGridException {
  readonly kind: PlanGridExceptionKind;
  /** Glyph + word + number, e.g. "▲ Late 6d". */
  readonly label: string;
  readonly daysLate?: number;
}

export interface PlanGridPredecessorEdge {
  readonly predecessorWpId: string;
  readonly lagDays: number;
}

/** Leaf WP chip for predecessor autocomplete (UX-DR6). */
export interface PlanGridLeafCandidate {
  readonly wpId: string;
  readonly wbsCode: string;
  readonly name: string;
}

export interface PlanGridRow {
  readonly wpId: string;
  readonly wbsCode: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly isLeaf: boolean;
  readonly isMilestone: boolean;
  readonly isCatchAll: boolean;
  readonly level: number;
  readonly posInSet: number;
  readonly setSize: number;
  readonly hasChildren: boolean;
  readonly durationDays: number | null;
  readonly constraintType: string;
  readonly constraintDate: string | null;
  readonly constraintLabel: string;
  readonly predecessorsText: string;
  /** Live incoming edges for the predecessor editor (story 2.14). */
  readonly predecessorEdges: readonly PlanGridPredecessorEdge[];
  readonly earlyStart: string | null;
  readonly earlyFinish: string | null;
  readonly floatDays: number | null;
  readonly isCritical: boolean;
  readonly state: string | null;
  readonly notSchedulable: boolean;
  readonly stale: boolean;
  readonly actualStart: string | null;
  readonly actualFinish: string | null;
  readonly recordedPct: { readonly num: bigint; readonly den: bigint } | null;
  /** Recomputed for Progress — never stored (2.9 Q1→B). */
  readonly remainingDays: number | null;
  readonly exception: PlanGridException | null;
}

export interface PlanGridState {
  readonly projectId: string;
  readonly projectStart: string | null;
  readonly projectFinish: string | null;
  readonly dataDate: string | null;
  readonly tzOffsetMinutes: number;
  readonly anchor: ScheduleAnchor | null;
  readonly computedFinish: string | null;
  readonly haltedReason: string | null;
  readonly scheduleStale: boolean;
  readonly floatAnchorLabel: 'vs Project finish' | 'vs computed finish' | null;
  /** Leaf-only autocomplete candidates for predecessor cells (story 2.14). */
  readonly leafCandidates: readonly PlanGridLeafCandidate[];
  readonly rows: readonly PlanGridRow[];
}

function asBound(scheduling: SchedulingBound): Bound {
  return scheduling as Bound;
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** EN display date: `19 Sep 2026` (EXPERIENCE). */
export function formatPlanDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1] ?? 'Jan'} ${y}`;
}

export function formatConstraintLabel(
  constraintType: string,
  constraintDate: string | null,
): string {
  if (constraintType === 'must_start_on' && constraintDate) {
    return `Must start on ${formatPlanDate(constraintDate)}`;
  }
  if (constraintType === 'must_finish_on' && constraintDate) {
    return `Must finish on ${formatPlanDate(constraintDate)}`;
  }
  return 'As soon as possible';
}

/** MS-Project-shaped predecessor cell: `2.3FS+2d, 2.4`. */
export function formatPredecessorsText(
  successorWpId: string,
  edges: readonly { readonly predecessorWpId: string; readonly successorWpId: string; readonly lagDays: number }[],
  wbsById: ReadonlyMap<string, string>,
): string {
  const preds = edges
    .filter((e) => e.successorWpId === successorWpId)
    .map((e) => {
      const code = wbsById.get(e.predecessorWpId) ?? e.predecessorWpId;
      if (e.lagDays === 0) return code;
      const sign = e.lagDays > 0 ? '+' : '';
      return `${code}FS${sign}${e.lagDays}d`;
    })
    .sort((a, b) => a.localeCompare(b));
  return preds.join(', ');
}

export function floatAnchorHeader(
  anchor: ScheduleAnchor | null,
): 'vs Project finish' | 'vs computed finish' | null {
  if (anchor === null) return null;
  return anchor.kind === 'project_finish' ? 'vs Project finish' : 'vs computed finish';
}

export function inkTone(
  date: string | null,
  dataDate: string | null,
): 'muted' | 'full' | 'na' {
  if (date === null) return 'na';
  if (dataDate === null) return 'full';
  return date <= dataDate ? 'muted' : 'full';
}

export function formatFloatDisplay(floatDays: number | null, notSchedulable: boolean): {
  readonly text: string;
  readonly negative: boolean;
} {
  if (notSchedulable || floatDays === null) return { text: '—', negative: false };
  const sign = floatDays > 0 ? '+' : '';
  return { text: `${sign}${floatDays}`, negative: floatDays < 0 };
}

export function recordedPctDisplay(
  pct: { readonly num: bigint; readonly den: bigint } | null,
): string {
  if (pct === null || pct.den === 0n) return 'none — scheduled as 0%';
  const tenths = Number((pct.num * 1000n) / pct.den);
  const whole = Math.floor(tenths / 10);
  const frac = tenths % 10;
  return frac === 0 ? `${whole}%` : `${whole}.${frac}%`;
}

/**
 * Pick one Exception cell label: violation (worst) → out-of-sequence → not-schedulable.
 * Full explainer popovers stay in 2.16.
 */
export function resolveException(input: {
  readonly wpId: string;
  readonly isLeaf: boolean;
  readonly notSchedulableReason: string | null;
  readonly violationsByWp: ReadonlyMap<string, { readonly daysLate: number; readonly isMilestone: boolean }>;
  readonly oosWpIds: ReadonlySet<string>;
}): PlanGridException | null {
  if (!input.isLeaf) return null;
  const violation = input.violationsByWp.get(input.wpId);
  if (violation) {
    const glyph = violation.isMilestone ? '◆' : '▲';
    return {
      kind: 'violation',
      label: `${glyph} Late ${violation.daysLate}d`,
      daysLate: violation.daysLate,
    };
  }
  if (input.oosWpIds.has(input.wpId)) {
    return { kind: 'out_of_sequence', label: '⇄ Out of sequence' };
  }
  if (input.notSchedulableReason === 'no_duration') {
    return { kind: 'not_schedulable', label: '⊘ No duration' };
  }
  return null;
}

function depthOf(
  wpId: string,
  parentOf: ReadonlyMap<string, string | null>,
): number {
  let depth = 1;
  let cur: string | null | undefined = parentOf.get(wpId) ?? null;
  const seen = new Set<string>();
  while (cur) {
    if (seen.has(cur)) break;
    seen.add(cur);
    depth += 1;
    cur = parentOf.get(cur) ?? null;
  }
  return depth;
}

/** Authorised Plan-grid read for story 2.13. */
export async function getPlanGridState<Handle>(
  deps: ApplyPlanChangeDeps<Handle>,
  ctx: RequestContext,
  input: { readonly projectId: string },
): Promise<Result<PlanGridState>> {
  const roles = authorize(ctx, { roles: PROJECT_REACH_ROLES, projectId: input.projectId });
  if (!roles.ok) return roles;

  const value = await deps.transaction(deps.handle, ctx.tenantId, async (scope) => {
    const bound = asBound(scope.bound);
    const [project] = await bound.tx
      .select({
        projectStart: s.project.projectStart,
        projectFinish: s.project.projectFinish,
        dataDate: s.project.dataDate,
        tzOffsetMinutes: s.project.tzOffsetMinutes,
      })
      .from(s.project)
      .where(and(eq(s.project.tenantId, bound.tenantId), eq(s.project.id, input.projectId)));
    if (!project) throw projectNotFound(input.projectId);

    const planInput = planInputRepositoryOn(bound);
    const schedule = scheduleRepositoryOn(bound);

    const [wps, edges, wpSchedules, latest, planRows] = await Promise.all([
      planInput.listLiveWorkPackages(input.projectId),
      planInput.listLiveDependencies(input.projectId),
      schedule.loadWpSchedule(input.projectId),
      schedule.latestRun(input.projectId),
      schedule.loadPlanRows(input.projectId),
    ]);

    const ordered = [...wps].sort(compareWp);
    const wbsById = new Map(ordered.map((w) => [w.id, w.wbsCode] as const));
    const parentOf = new Map(ordered.map((w) => [w.id, w.parentId] as const));
    const childrenOf = new Map<string | null, typeof ordered>();
    for (const wp of ordered) {
      const key = wp.parentId;
      const list = childrenOf.get(key) ?? [];
      list.push(wp);
      childrenOf.set(key, list);
    }
    for (const [, kids] of childrenOf) {
      kids.sort(compareWp);
    }

    const scheduleByWp = new Map(wpSchedules.map((row) => [row.wpId, row] as const));
    const anyStale = wpSchedules.some((row) => row.stale);

    const milestoneIds = new Set(ordered.filter((w) => w.isMilestone).map((w) => w.id));
    const violationsByWp = new Map<string, { daysLate: number; isMilestone: boolean }>();
    const oosWpIds = new Set<string>();
    let anchor: ScheduleAnchor | null = null;
    let computedFinish: string | null = latest?.computedFinish ?? null;
    const haltedReason = latest?.haltedReason ?? null;

    if (latest?.outputs !== null && latest?.outputs !== undefined && latest.haltedReason === null) {
      try {
        const storedInputs = parseStoredInputs(latest.inputs);
        const storedOutputs = parseStoredOutputs(latest.outputs);
        const orderedIds = storedInputs.wps.map((w) => w.id);
        for (const v of storedOutputs.violations) {
          const wpId = orderedIds[v.wpId];
          if (wpId === undefined) continue;
          const prev = violationsByWp.get(wpId);
          if (prev === undefined || v.daysLate > prev.daysLate) {
            violationsByWp.set(wpId, {
              daysLate: v.daysLate,
              isMilestone: milestoneIds.has(wpId),
            });
          }
        }
        for (const e of storedOutputs.outOfSequence) {
          const succ = orderedIds[e.successorId];
          if (succ !== undefined) oosWpIds.add(succ);
        }
        anchor = storedOutputs.anchor;
        computedFinish = storedOutputs.computedFinish;
      } catch {
        // Malformed stored payload — infer kind from Project finish vs column date.
        if (latest.anchor) {
          const kind =
            project.projectFinish !== null && latest.anchor === project.projectFinish
              ? 'project_finish'
              : 'computed_finish';
          anchor = { kind, date: latest.anchor };
        }
      }
    } else if (latest?.anchor) {
      const kind =
        project.projectFinish !== null && latest.anchor === project.projectFinish
          ? 'project_finish'
          : 'computed_finish';
      anchor = { kind, date: latest.anchor };
    }

    const leafCandidates: PlanGridLeafCandidate[] = ordered
      .filter((w) => w.isLeaf)
      .map((w) => ({ wpId: w.id, wbsCode: w.wbsCode, name: w.name }));

    const rows: PlanGridRow[] = ordered.map((wp) => {
      const sched = scheduleByWp.get(wp.id);
      const notSchedulable = sched?.notSchedulableReason === 'no_duration';
      const siblings = childrenOf.get(wp.parentId) ?? [];
      const posInSet = siblings.findIndex((s) => s.id === wp.id) + 1;
      const status = planRows.statusHeads.get(wp.id);
      const pct = planRows.pctHeads.get(wp.id) ?? null;
      // Halted run or stale projection: matrix wants derived dates/Float/Critical as "—".
      const blankDerived = haltedReason !== null || (sched?.stale ?? false);
      let remaining: number | null = null;
      if (wp.isLeaf && wp.durationDays !== null) {
        try {
          remaining = remainingDuration(wp.durationDays, pct);
        } catch {
          remaining = null;
        }
      }
      const predecessorEdges: PlanGridPredecessorEdge[] = edges
        .filter((e) => e.successorWpId === wp.id)
        .map((e) => ({ predecessorWpId: e.predecessorWpId, lagDays: e.lagDays }));
      return {
        wpId: wp.id,
        wbsCode: wp.wbsCode,
        name: wp.name,
        parentId: wp.parentId,
        isLeaf: wp.isLeaf,
        isMilestone: wp.isMilestone,
        isCatchAll: wp.isCatchAll,
        level: depthOf(wp.id, parentOf),
        posInSet: posInSet > 0 ? posInSet : 1,
        setSize: siblings.length || 1,
        hasChildren: (childrenOf.get(wp.id) ?? []).length > 0,
        durationDays: wp.durationDays,
        constraintType: wp.constraintType,
        constraintDate: wp.constraintDate,
        constraintLabel: formatConstraintLabel(wp.constraintType, wp.constraintDate),
        predecessorsText: formatPredecessorsText(wp.id, edges, wbsById),
        predecessorEdges,
        earlyStart: blankDerived ? null : (sched?.earlyStart ?? null),
        earlyFinish: blankDerived ? null : (sched?.earlyFinish ?? null),
        floatDays: blankDerived ? null : (sched?.floatDays ?? null),
        isCritical: blankDerived ? false : (sched?.isCritical ?? false),
        state: sched?.state ?? null,
        notSchedulable,
        stale: sched?.stale ?? false,
        actualStart: status?.actualStart ?? null,
        actualFinish: status?.actualFinish ?? null,
        recordedPct: pct,
        remainingDays: remaining,
        exception: resolveException({
          wpId: wp.id,
          isLeaf: wp.isLeaf,
          notSchedulableReason: sched?.notSchedulableReason ?? null,
          violationsByWp,
          oosWpIds,
        }),
      };
    });

    return {
      projectId: input.projectId,
      projectStart: project.projectStart,
      projectFinish: project.projectFinish,
      dataDate: project.dataDate,
      tzOffsetMinutes: project.tzOffsetMinutes,
      anchor,
      computedFinish,
      haltedReason,
      scheduleStale: anyStale || haltedReason !== null,
      floatAnchorLabel: floatAnchorHeader(anchor),
      leafCandidates,
      rows,
    } satisfies PlanGridState;
  });

  return ok(value);
}
