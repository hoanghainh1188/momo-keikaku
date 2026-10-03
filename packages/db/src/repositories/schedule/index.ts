/**
 * `schedule_run` INSERT and `wp_schedule` rebuild / stale-mark (story 2.9, AD-26).
 *
 * Bound to one transaction and one Tenant. Only `packages/app/src/schedule` may import this
 * module. `lockWatermark` is taken on the Project key immediately before the first
 * `schedule_run` INSERT (AD-20). `schedule_run` is INSERT-only; `wp_schedule` is rebuilt
 * (DELETE + INSERT) on success or stale-marked on a calendar-range halt.
 */
import { and, desc, eq, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import type { Bound } from '../../bound';
import { projectNotFound } from '../../project-not-found';
import * as s from '../../schema';
import { lockWatermark } from '../../watermark-lock';

export interface AppendScheduleRun {
  readonly projectId: string;
  readonly holidayCalendarVersionSeq: number;
  readonly cause: string;
  readonly actor: string;
  readonly at: Date;
  readonly inputs: unknown;
  readonly outputs: unknown | null;
  readonly engineVersion: string;
  readonly anchor: string | null;
  readonly computedFinish: string | null;
  readonly haltedReason: string | null;
}

export interface WpScheduleRow {
  readonly wpId: string;
  readonly earlyStart: string | null;
  readonly earlyFinish: string | null;
  readonly lateStart: string | null;
  readonly lateFinish: string | null;
  readonly floatDays: number | null;
  readonly isCritical: boolean;
  readonly state: string | null;
  readonly notSchedulableReason: string | null;
}

export interface LatestRunRow {
  readonly seq: number;
  readonly inputs: unknown;
  readonly outputs: unknown;
  readonly engineVersion: string;
  readonly cause: string;
  readonly actor: string;
  readonly at: Date;
  readonly haltedReason: string | null;
  readonly anchor: string | null;
  readonly computedFinish: string | null;
  readonly holidayCalendarVersionSeq: number;
}

const runSelect = {
  seq: s.scheduleRun.seq,
  inputs: s.scheduleRun.inputs,
  outputs: s.scheduleRun.outputs,
  engineVersion: s.scheduleRun.engineVersion,
  cause: s.scheduleRun.cause,
  actor: s.scheduleRun.actor,
  at: s.scheduleRun.at,
  haltedReason: s.scheduleRun.haltedReason,
  anchor: s.scheduleRun.anchor,
  computedFinish: s.scheduleRun.computedFinish,
  holidayCalendarVersionSeq: s.scheduleRun.holidayCalendarVersionSeq,
} as const;

export function scheduleRepositoryOn(bound: Bound) {
  const { tx, tenantId } = bound;

  return {
    async latestRun(projectId: string): Promise<LatestRunRow | null> {
      const [row] = await tx
        .select(runSelect)
        .from(s.scheduleRun)
        .where(and(eq(s.scheduleRun.tenantId, tenantId), eq(s.scheduleRun.projectId, projectId)))
        .orderBy(desc(s.scheduleRun.seq))
        .limit(1);
      return row ?? null;
    },

    /**
     * Story 4.1: latest successful (non-halted, outputs present) run for Baseline pin.
     * Differs from `latestRun` when the head run halted — a Baseline must never pin that head.
     */
    async latestSuccessfulRun(projectId: string): Promise<LatestRunRow | null> {
      const [row] = await tx
        .select(runSelect)
        .from(s.scheduleRun)
        .where(
          and(
            eq(s.scheduleRun.tenantId, tenantId),
            eq(s.scheduleRun.projectId, projectId),
            isNull(s.scheduleRun.haltedReason),
            isNotNull(s.scheduleRun.outputs),
          ),
        )
        .orderBy(desc(s.scheduleRun.seq))
        .limit(1);
      return row ?? null;
    },

    /**
     * Story 2.15: previous successful (non-halted, outputs present) run before `beforeSeq`,
     * for What-moved before→after join. Null when this is the first successful run.
     */
    async previousSuccessfulRun(
      projectId: string,
      beforeSeq: number,
    ): Promise<LatestRunRow | null> {
      const [row] = await tx
        .select(runSelect)
        .from(s.scheduleRun)
        .where(
          and(
            eq(s.scheduleRun.tenantId, tenantId),
            eq(s.scheduleRun.projectId, projectId),
            lt(s.scheduleRun.seq, beforeSeq),
            isNull(s.scheduleRun.haltedReason),
            isNotNull(s.scheduleRun.outputs),
          ),
        )
        .orderBy(desc(s.scheduleRun.seq))
        .limit(1);
      return row ?? null;
    },

    /**
     * Story 2.13: read published `wp_schedule` projection for the Plan grid (dates, Float,
     * Critical, state, stale). Writers stay fence-only — this is read-only.
     */
    async loadWpSchedule(projectId: string): Promise<
      readonly (WpScheduleRow & { readonly stale: boolean })[]
    > {
      return tx
        .select({
          wpId: s.wpSchedule.wpId,
          earlyStart: s.wpSchedule.earlyStart,
          earlyFinish: s.wpSchedule.earlyFinish,
          lateStart: s.wpSchedule.lateStart,
          lateFinish: s.wpSchedule.lateFinish,
          floatDays: s.wpSchedule.floatDays,
          isCritical: s.wpSchedule.isCritical,
          state: s.wpSchedule.state,
          notSchedulableReason: s.wpSchedule.notSchedulableReason,
          stale: s.wpSchedule.stale,
        })
        .from(s.wpSchedule)
        .where(and(eq(s.wpSchedule.tenantId, tenantId), eq(s.wpSchedule.projectId, projectId)));
    },

    async latestCalendarVersionSeq(projectId: string): Promise<number | null> {
      const [row] = await tx
        .select({ seq: s.holidayCalendarVersion.seq })
        .from(s.holidayCalendarVersion)
        .where(
          and(
            eq(s.holidayCalendarVersion.tenantId, tenantId),
            eq(s.holidayCalendarVersion.projectId, projectId),
          ),
        )
        .orderBy(desc(s.holidayCalendarVersion.seq))
        .limit(1);
      return row?.seq ?? null;
    },

    /**
     * Append a resolved Holiday Calendar version (story 2.12 / AD-29). Always inserts — never
     * edits. Takes the Project watermark first (no-op when the caller already holds it).
     */
    async appendCalendarVersion(
      projectId: string,
      calendar: {
        readonly nonWorkingDays: readonly string[];
        readonly rangeStart: string;
        readonly rangeEnd: string;
        readonly nationalSets: readonly string[];
        readonly nationalDatasetVersion: string;
        readonly reason?: string | null;
      },
      stamp: { readonly actor: string; readonly at: Date },
    ): Promise<number> {
      await lockWatermark(bound, { kind: 'project', projectId });
      const [row] = await tx
        .insert(s.holidayCalendarVersion)
        .values({
          tenantId,
          projectId,
          nonWorkingDays: [...calendar.nonWorkingDays],
          rangeStart: calendar.rangeStart,
          rangeEnd: calendar.rangeEnd,
          nationalSets: [...calendar.nationalSets],
          nationalDatasetVersion: calendar.nationalDatasetVersion,
          reason: calendar.reason ?? null,
          actor: stamp.actor,
          at: stamp.at,
        })
        .returning({ seq: s.holidayCalendarVersion.seq });
      return row!.seq;
    },

    /** Live Project non-working days: head `effect = 'add'` per day (tombstones excluded). */
    async liveProjectNonWorkingDays(projectId: string): Promise<readonly string[]> {
      const rows = await tx
        .select({
          day: s.calendarDayEvent.day,
          effect: s.calendarDayEvent.effect,
          seq: s.calendarDayEvent.seq,
        })
        .from(s.calendarDayEvent)
        .where(
          and(
            eq(s.calendarDayEvent.tenantId, tenantId),
            eq(s.calendarDayEvent.projectId, projectId),
          ),
        );
      const head = new Map<string, { readonly effect: string; readonly seq: number }>();
      for (const row of rows) {
        const prev = head.get(row.day);
        if (prev === undefined || row.seq > prev.seq) {
          head.set(row.day, { effect: row.effect, seq: row.seq });
        }
      }
      return [...head.entries()]
        .filter(([, v]) => v.effect === 'add')
        .map(([day]) => day)
        .sort();
    },

    /**
     * Append a Project non-working-day event (`add` or tombstone `remove`). Refuses a duplicate
     * live `add`. Locks the Project watermark first.
     */
    async appendCalendarDayEvent(
      command: {
        readonly projectId: string;
        readonly day: string;
        readonly effect: 'add' | 'remove';
        readonly actor: string;
        readonly at: Date;
      },
    ): Promise<{ readonly seq: number }> {
      await lockWatermark(bound, { kind: 'project', projectId: command.projectId });
      if (command.effect === 'add') {
        const live = await this.liveProjectNonWorkingDays(command.projectId);
        if (live.includes(command.day)) {
          const err = new Error('duplicate live calendar day');
          (err as { code?: string }).code = 'duplicate_calendar_day';
          throw err;
        }
      }
      const [row] = await tx
        .insert(s.calendarDayEvent)
        .values({
          tenantId,
          projectId: command.projectId,
          day: command.day,
          effect: command.effect,
          actor: command.actor,
          at: command.at,
        })
        .returning({ seq: s.calendarDayEvent.seq });
      return { seq: row!.seq };
    },

    async patchNationalFlags(
      projectId: string,
      flags: { readonly calendarJp: boolean; readonly calendarVn: boolean },
    ): Promise<void> {
      const updated = await tx
        .update(s.project)
        .set({ calendarJp: flags.calendarJp, calendarVn: flags.calendarVn })
        .where(and(eq(s.project.tenantId, tenantId), eq(s.project.id, projectId)))
        .returning({ id: s.project.id });
      if (updated.length === 0) throw projectNotFound(projectId);
    },

    async projectCalendarFlags(projectId: string): Promise<{
      readonly calendarJp: boolean;
      readonly calendarVn: boolean;
    }> {
      const [row] = await tx
        .select({
          calendarJp: s.project.calendarJp,
          calendarVn: s.project.calendarVn,
        })
        .from(s.project)
        .where(and(eq(s.project.tenantId, tenantId), eq(s.project.id, projectId)));
      if (!row) throw projectNotFound(projectId);
      return row;
    },

    async appendRun(command: AppendScheduleRun): Promise<{ readonly seq: number }> {
      const [project] = await tx
        .select({ id: s.project.id })
        .from(s.project)
        .where(eq(s.project.id, command.projectId));
      if (!project) throw projectNotFound(command.projectId);

      const prev = await this.latestRun(command.projectId);

      // AD-20: lock before INSERT. No-op when the fence already holds the Project key
      // (`watermark-lock` remembers per-tx); still required for any non-fence caller.
      await lockWatermark(bound, { kind: 'project', projectId: command.projectId });

      const [row] = await tx
        .insert(s.scheduleRun)
        .values({
          tenantId,
          projectId: command.projectId,
          prevRunSeq: prev?.seq ?? null,
          holidayCalendarVersionSeq: command.holidayCalendarVersionSeq,
          cause: command.cause,
          actor: command.actor,
          at: command.at,
          inputs: command.inputs,
          outputs: command.outputs,
          engineVersion: command.engineVersion,
          anchor: command.anchor,
          computedFinish: command.computedFinish,
          haltedReason: command.haltedReason,
        })
        .returning({ seq: s.scheduleRun.seq });
      return { seq: row!.seq };
    },

    /** Rebuild `wp_schedule` from a successful run (`stale = false`). */
    async rebuildWpSchedule(
      projectId: string,
      scheduleRunSeq: number,
      rows: readonly WpScheduleRow[],
    ): Promise<void> {
      await tx
        .delete(s.wpSchedule)
        .where(and(eq(s.wpSchedule.tenantId, tenantId), eq(s.wpSchedule.projectId, projectId)));

      if (rows.length === 0) return;

      await tx.insert(s.wpSchedule).values(
        rows.map((row) => ({
          tenantId,
          projectId,
          wpId: row.wpId,
          scheduleRunSeq,
          earlyStart: row.earlyStart,
          earlyFinish: row.earlyFinish,
          lateStart: row.lateStart,
          lateFinish: row.lateFinish,
          floatDays: row.floatDays,
          // Domain may have no anchor (no Float) — mirror false, never null.
          isCritical: row.isCritical,
          state: row.state,
          notSchedulableReason: row.notSchedulableReason,
          stale: false,
        })),
      );
    },

    /** Mark every existing `wp_schedule` row for the Project stale (calendar-range halt). */
    async markWpScheduleStale(projectId: string): Promise<void> {
      await tx
        .update(s.wpSchedule)
        .set({ stale: true })
        .where(and(eq(s.wpSchedule.tenantId, tenantId), eq(s.wpSchedule.projectId, projectId)));
    },

    /** Load plan rows the fence resolves into `ScheduleInputs`. */
    async loadPlanRows(projectId: string): Promise<{
      readonly project: {
        readonly projectStart: string | null;
        readonly projectFinish: string | null;
        readonly dataDate: string | null;
      };
      readonly wps: readonly {
        readonly id: string;
        readonly wbsCode: string;
        readonly parentId: string | null;
        readonly isMilestone: boolean;
        readonly durationDays: number | null;
        readonly constraintType: string;
        readonly constraintDate: string | null;
        readonly plannedMh: bigint;
      }[];
      readonly edges: readonly {
        readonly predecessorWpId: string;
        readonly successorWpId: string;
        readonly lagDays: number;
      }[];
      readonly statusHeads: ReadonlyMap<
        string,
        { readonly actualStart: string | null; readonly actualFinish: string | null }
      >;
      /** AR-48: max `wp_status_event.seq` for the Project (0 when none). */
      readonly wpStatusSeqMax: number;
      readonly pctHeads: ReadonlyMap<
        string,
        { readonly num: bigint; readonly den: bigint }
      >;
      /** AR-48: max `pct_override_event.seq` for the Project (0 when none). */
      readonly pctOverrideSeqMax: number;
      readonly calendar: {
        readonly seq: number;
        readonly nonWorkingDays: string[];
        readonly rangeStart: string;
        readonly rangeEnd: string;
      } | null;
    }> {
      const [project] = await tx
        .select({
          projectStart: s.project.projectStart,
          projectFinish: s.project.projectFinish,
          dataDate: s.project.dataDate,
        })
        .from(s.project)
        .where(eq(s.project.id, projectId));
      if (!project) throw projectNotFound(projectId);

      const wps = await tx
        .select({
          id: s.workPackage.id,
          wbsCode: s.workPackage.wbsCode,
          parentId: s.workPackage.parentId,
          isMilestone: s.workPackage.isMilestone,
          durationDays: s.workPackage.durationDays,
          constraintType: s.workPackage.constraintType,
          constraintDate: s.workPackage.constraintDate,
          plannedMh: s.workPackage.plannedMh,
        })
        .from(s.workPackage)
        .where(
          and(
            eq(s.workPackage.tenantId, tenantId),
            eq(s.workPackage.projectId, projectId),
            sql`${s.workPackage.deletedAt} IS NULL`,
          ),
        );

      const edges = await tx
        .select({
          predecessorWpId: s.wpDependency.predecessorWpId,
          successorWpId: s.wpDependency.successorWpId,
          lagDays: s.wpDependency.lagDays,
        })
        .from(s.wpDependency)
        .where(
          and(eq(s.wpDependency.tenantId, tenantId), eq(s.wpDependency.projectId, projectId)),
        );

      // Head status per WP: max seq.
      const statusRows = await tx
        .select({
          wpId: s.wpStatusEvent.wpId,
          actualStart: s.wpStatusEvent.actualStart,
          actualFinish: s.wpStatusEvent.actualFinish,
          seq: s.wpStatusEvent.seq,
        })
        .from(s.wpStatusEvent)
        .where(
          and(eq(s.wpStatusEvent.tenantId, tenantId), eq(s.wpStatusEvent.projectId, projectId)),
        );
      const statusHeads = new Map<
        string,
        { readonly actualStart: string | null; readonly actualFinish: string | null }
      >();
      const maxSeq = new Map<string, number>();
      let wpStatusSeqMax = 0;
      for (const row of statusRows) {
        if (row.seq > wpStatusSeqMax) wpStatusSeqMax = row.seq;
        // Skip defective heads (finish without start) — seed demos can carry them; the fence
        // refuses them at recalculate. A real writer (2.10) will not produce that pair.
        if (row.actualFinish !== null && row.actualStart === null) continue;
        const prev = maxSeq.get(row.wpId);
        if (prev === undefined || row.seq > prev) {
          maxSeq.set(row.wpId, row.seq);
          statusHeads.set(row.wpId, {
            actualStart: row.actualStart,
            actualFinish: row.actualFinish,
          });
        }
      }

      const pctRows = await tx
        .select({
          wpId: s.pctOverrideEvent.wpId,
          recordedPctNum: s.pctOverrideEvent.recordedPctNum,
          recordedPctDen: s.pctOverrideEvent.recordedPctDen,
          seq: s.pctOverrideEvent.seq,
        })
        .from(s.pctOverrideEvent)
        .where(
          and(
            eq(s.pctOverrideEvent.tenantId, tenantId),
            eq(s.pctOverrideEvent.projectId, projectId),
          ),
        );
      const pctHeads = new Map<string, { readonly num: bigint; readonly den: bigint }>();
      const pctMaxSeq = new Map<string, number>();
      let pctOverrideSeqMax = 0;
      for (const row of pctRows) {
        if (row.seq > pctOverrideSeqMax) pctOverrideSeqMax = row.seq;
        const prev = pctMaxSeq.get(row.wpId);
        if (prev === undefined || row.seq > prev) {
          pctMaxSeq.set(row.wpId, row.seq);
          pctHeads.set(row.wpId, { num: row.recordedPctNum, den: row.recordedPctDen });
        }
      }

      const calSeq = await this.latestCalendarVersionSeq(projectId);
      let calendar: {
        readonly seq: number;
        readonly nonWorkingDays: string[];
        readonly rangeStart: string;
        readonly rangeEnd: string;
      } | null = null;
      if (calSeq !== null) {
        const [cal] = await tx
          .select({
            seq: s.holidayCalendarVersion.seq,
            nonWorkingDays: s.holidayCalendarVersion.nonWorkingDays,
            rangeStart: s.holidayCalendarVersion.rangeStart,
            rangeEnd: s.holidayCalendarVersion.rangeEnd,
          })
          .from(s.holidayCalendarVersion)
          .where(
            and(
              eq(s.holidayCalendarVersion.tenantId, tenantId),
              eq(s.holidayCalendarVersion.projectId, projectId),
              eq(s.holidayCalendarVersion.seq, calSeq),
            ),
          );
        if (cal) calendar = cal;
      }

      return {
        project,
        wps,
        edges,
        statusHeads,
        wpStatusSeqMax,
        pctHeads,
        pctOverrideSeqMax,
        calendar,
      };
    },
  };
}

export type ScheduleRepository = ReturnType<typeof scheduleRepositoryOn>;
