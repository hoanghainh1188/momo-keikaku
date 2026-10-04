/**
 * Baseline writer repository (story 4.1, AR-22 / AD-11 / AD-20).
 *
 * Bound to one transaction and one Tenant. Only `packages/app/src/baseline` may import this
 * module (`.dependency-cruiser.cjs` `BASELINE_REPOSITORIES`). INSERT-only — never UPDATE/DELETE
 * (`baseline_version` / `baseline_wp` are append-only). `lockWatermark` is taken on the Project
 * key immediately before the first Baseline INSERT.
 */
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import type { Bound } from '../../bound';
import { projectNotFound } from '../../project-not-found';
import * as s from '../../schema';
import { lockWatermark } from '../../watermark-lock';

export interface BaselineLeafProjection {
  readonly wpId: string;
  readonly plannedMh: bigint;
  readonly isMilestone: boolean;
  readonly isCatchAll: boolean;
  readonly durationDays: number | null;
}

export interface AppendBaselineVersion {
  readonly projectId: string;
  readonly id: string;
  readonly scheduleRunSeq: number;
  readonly reason: string;
  readonly actor: string;
  readonly at: Date;
}

export interface AppendBaselineWpRow {
  readonly id: string;
  readonly wpId: string;
  readonly start: string;
  readonly finish: string;
  readonly baselineMh: bigint;
  readonly isMilestone: boolean;
  readonly isCatchAll: boolean;
}

export function baselineRepositoryOn(bound: Bound) {
  const { tx, tenantId } = bound;

  return {
    /** Highest `baseline_version.seq` for the Project, or null when none. */
    async latestVersionSeq(projectId: string): Promise<number | null> {
      const [row] = await tx
        .select({ seq: s.baselineVersion.seq })
        .from(s.baselineVersion)
        .where(
          and(
            eq(s.baselineVersion.tenantId, tenantId),
            eq(s.baselineVersion.projectId, projectId),
          ),
        )
        .orderBy(desc(s.baselineVersion.seq))
        .limit(1);
      return row?.seq ?? null;
    },

    /**
     * Every `schedule_run_seq` a Baseline version still pins, plus each pin's immediate
     * `prev_run_seq` when present (AR-11 retention / Epic 4 retro F8).
     *
     * Story 4.2 `reDerivePinnedBaseline` loads prev inputs for `recalculateAt`; the pin's
     * prev is typically older than the oldest Baseline pin, so it must be in the pin set or
     * `scheduleRunRetention` would mark those inputs droppable. Immediate prev only — not a
     * full cause/history walk.
     */
    async pinnedScheduleRunSeqs(projectId: string): Promise<readonly number[]> {
      const rows = await tx
        .select({
          scheduleRunSeq: s.baselineVersion.scheduleRunSeq,
          prevRunSeq: s.scheduleRun.prevRunSeq,
        })
        .from(s.baselineVersion)
        .innerJoin(
          s.scheduleRun,
          and(
            eq(s.scheduleRun.tenantId, s.baselineVersion.tenantId),
            eq(s.scheduleRun.projectId, s.baselineVersion.projectId),
            eq(s.scheduleRun.seq, s.baselineVersion.scheduleRunSeq),
          ),
        )
        .where(
          and(
            eq(s.baselineVersion.tenantId, tenantId),
            eq(s.baselineVersion.projectId, projectId),
          ),
        );
      const seqs = new Set<number>();
      for (const row of rows) {
        seqs.add(row.scheduleRunSeq);
        if (row.prevRunSeq !== null) seqs.add(row.prevRunSeq);
      }
      return [...seqs].sort((a, b) => a - b);
    },

    /**
     * Story 4.2: the latest Baseline version's pinned `schedule_run_seq`, or null when none.
     * Gate path: this pin → `schedule.runBySeq` — never Current Plan / `latestRun`.
     */
    async latestPinnedScheduleRunSeq(projectId: string): Promise<number | null> {
      const [row] = await tx
        .select({ scheduleRunSeq: s.baselineVersion.scheduleRunSeq })
        .from(s.baselineVersion)
        .where(
          and(
            eq(s.baselineVersion.tenantId, tenantId),
            eq(s.baselineVersion.projectId, projectId),
          ),
        )
        .orderBy(desc(s.baselineVersion.seq))
        .limit(1);
      return row?.scheduleRunSeq ?? null;
    },

    /**
     * Story 4.4: pinned `schedule_run_seq` for one Baseline version seq, or null when unknown.
     * Compare path loads two pins then `schedule.runBySeq` ×2 — never Current Plan.
     */
    async scheduleRunSeqForVersion(
      projectId: string,
      baselineVersionSeq: number,
    ): Promise<number | null> {
      const [row] = await tx
        .select({ scheduleRunSeq: s.baselineVersion.scheduleRunSeq })
        .from(s.baselineVersion)
        .where(
          and(
            eq(s.baselineVersion.tenantId, tenantId),
            eq(s.baselineVersion.projectId, projectId),
            eq(s.baselineVersion.seq, baselineVersionSeq),
          ),
        )
        .limit(1);
      return row?.scheduleRunSeq ?? null;
    },

    /**
     * Story 4.5: leaf `baseline_wp` rows for the active Baseline (max `seq`), or [] when none.
     * Display / Divergence projection only — never a schedule input.
     */
    async loadActiveBaselineWps(projectId: string): Promise<
      readonly {
        readonly wpId: string;
        readonly start: string;
        readonly finish: string;
        readonly baselineMh: bigint;
      }[]
    > {
      const [head] = await tx
        .select({ seq: s.baselineVersion.seq })
        .from(s.baselineVersion)
        .where(
          and(
            eq(s.baselineVersion.tenantId, tenantId),
            eq(s.baselineVersion.projectId, projectId),
          ),
        )
        .orderBy(desc(s.baselineVersion.seq))
        .limit(1);
      if (head === undefined) return [];
      return tx
        .select({
          wpId: s.baselineWp.wpId,
          start: s.baselineWp.start,
          finish: s.baselineWp.finish,
          baselineMh: s.baselineWp.baselineMh,
        })
        .from(s.baselineWp)
        .where(
          and(
            eq(s.baselineWp.tenantId, tenantId),
            eq(s.baselineWp.projectId, projectId),
            eq(s.baselineWp.baselineVersionSeq, head.seq),
          ),
        );
    },

    async projectStart(projectId: string): Promise<string | null> {
      const [row] = await tx
        .select({ projectStart: s.project.projectStart })
        .from(s.project)
        .where(and(eq(s.project.tenantId, tenantId), eq(s.project.id, projectId)));
      if (!row) throw projectNotFound(projectId);
      return row.projectStart;
    },

    /**
     * Live leaf WPs for the cost projection at set time: effort + flags from current schema
     * columns (M-2). Duration is used only for the incomplete-plan refuse gate.
     */
    async loadLeafProjections(projectId: string): Promise<readonly BaselineLeafProjection[]> {
      const [project] = await tx
        .select({ id: s.project.id })
        .from(s.project)
        .where(and(eq(s.project.tenantId, tenantId), eq(s.project.id, projectId)));
      if (!project) throw projectNotFound(projectId);

      return tx
        .select({
          wpId: s.workPackage.id,
          plannedMh: s.workPackage.plannedMh,
          isMilestone: s.workPackage.isMilestone,
          isCatchAll: s.workPackage.isCatchAll,
          durationDays: s.workPackage.durationDays,
        })
        .from(s.workPackage)
        .where(
          and(
            eq(s.workPackage.tenantId, tenantId),
            eq(s.workPackage.projectId, projectId),
            eq(s.workPackage.isLeaf, true),
            isNull(s.workPackage.deletedAt),
          ),
        );
    },

    /**
     * Append one Baseline version under the Project watermark, then its leaf cost-projection
     * rows. Caller must have already refused incomplete / halted / second-set cases.
     */
    async appendVersionWithWps(
      version: AppendBaselineVersion,
      wps: readonly AppendBaselineWpRow[],
    ): Promise<{ readonly seq: number }> {
      const [project] = await tx
        .select({ id: s.project.id })
        .from(s.project)
        .where(and(eq(s.project.tenantId, tenantId), eq(s.project.id, version.projectId)));
      if (!project) throw projectNotFound(version.projectId);

      await lockWatermark(bound, { kind: 'project', projectId: version.projectId });

      const [row] = await tx
        .insert(s.baselineVersion)
        .values({
          id: version.id,
          tenantId,
          projectId: version.projectId,
          scheduleRunSeq: version.scheduleRunSeq,
          reason: version.reason,
          recordedAt: version.at,
          actor: version.actor,
        })
        .returning({ seq: s.baselineVersion.seq });

      if (wps.length > 0) {
        await tx.insert(s.baselineWp).values(
          wps.map((wp) => ({
            id: wp.id,
            tenantId,
            projectId: version.projectId,
            baselineVersionSeq: row!.seq,
            wpId: wp.wpId,
            wpIsLeaf: true as const,
            start: wp.start,
            finish: wp.finish,
            baselineMh: wp.baselineMh,
            isMilestone: wp.isMilestone,
            isCatchAll: wp.isCatchAll,
          })),
        );
      }

      return { seq: row!.seq };
    },
  };
}

export type BaselineRepository = ReturnType<typeof baselineRepositoryOn>;
