/**
 * `app/calendar.publishCalendarVersion` (story 2.12 / AR-54 / AR-57 / AD-29).
 *
 * Operator / PM use case: resolve the exhaustive non-working-day set, take one Project lock,
 * append a `holiday_calendar_version`, recalculate with run cause `calendar`, write per-Project
 * `audit_log` only (operator_audit deferred — Q1→B). Serial fan-out never holds two Project
 * locks at once.
 */
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { resolveCalendarVersion } from '@momo/domain';
import type { Bound } from '../../../db/src/bound';
import { lockWatermark } from '../../../db/src/watermark-lock';
import { scheduleRepositoryOn } from '../../../db/src/repositories/schedule';
import * as s from '../../../db/src/schema';
import { authorize, PROJECT_REACH_ROLES } from '../authz/authorize';
import type { RequestContext } from '../authz/request-context';
import { audit } from '../audit';
import type { WriteStamp } from '../ports/audited-write';
import type { SchedulingBound } from '../ports/schedule-write';
import { fail, ok, type Result } from '../result';
import { refuse, runAuditedWrite, invalidInputDetails } from '../use-cases/audited-write';
import {
  recalculateProject,
  type RecalculateProjectResult,
} from '../schedule/recalculate-project';
import { isProjectNotFound } from '../ports/project-read';
import type { ApplyPlanChangeDeps } from '../schedule/apply-plan-change';

function asBound(bound: SchedulingBound): Bound {
  return bound as Bound;
}

const noNul = (value: string) => !value.includes('\0');
const id = z.string().min(1).refine(noNul, 'must not contain a NUL character');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const publishSchema = z.object({
  projectId: id,
  reason: z.string().max(500).nullable().optional(),
  rangeStart: isoDate.optional(),
  rangeEnd: isoDate.optional(),
});

const fanOutSchema = z.object({
  projectIds: z.array(id).min(1),
  reason: z.string().max(500).nullable().optional(),
  rangeStart: isoDate.optional(),
  rangeEnd: isoDate.optional(),
});

const patchFlagsSchema = z.object({
  projectId: id,
  calendarJp: z.boolean(),
  calendarVn: z.boolean(),
});

const daySchema = z.object({
  projectId: id,
  day: isoDate,
});

export type PublishCalendarResult = {
  readonly calendarVersionSeq: number;
  readonly run: RecalculateProjectResult;
};

export type FanOutProjectResult =
  | {
      readonly projectId: string;
      readonly status: 'ok';
      readonly calendarVersionSeq: number;
      readonly runSeq: number | null;
    }
  | {
      readonly projectId: string;
      readonly status: 'halted';
      readonly calendarVersionSeq: number;
      readonly haltedReason: string | null;
    }
  | { readonly projectId: string; readonly status: 'failed'; readonly error: string };

export type CalendarWriteDeps<Handle> = ApplyPlanChangeDeps<Handle>;

async function publishInsideTx(
  bound: Bound,
  stamp: WriteStamp,
  command: {
    readonly projectId: string;
    readonly reason?: string | null;
    readonly rangeStart?: string;
    readonly rangeEnd?: string;
  },
): Promise<PublishCalendarResult> {
  const schedule = scheduleRepositoryOn(bound);
  await lockWatermark(bound, { kind: 'project', projectId: command.projectId });

  const flags = await schedule.projectCalendarFlags(command.projectId);
  const projectDays = await schedule.liveProjectNonWorkingDays(command.projectId);
  const resolved = resolveCalendarVersion({
    calendarJp: flags.calendarJp,
    calendarVn: flags.calendarVn,
    projectDays,
    ...(command.rangeStart !== undefined ? { rangeStart: command.rangeStart } : {}),
    ...(command.rangeEnd !== undefined ? { rangeEnd: command.rangeEnd } : {}),
  });

  const calendarVersionSeq = await schedule.appendCalendarVersion(
    command.projectId,
    {
      nonWorkingDays: resolved.nonWorkingDays,
      rangeStart: resolved.rangeStart,
      rangeEnd: resolved.rangeEnd,
      nationalSets: resolved.nationalSets,
      nationalDatasetVersion: resolved.nationalDatasetVersion,
      reason: command.reason ?? null,
    },
    { actor: stamp.actor, at: stamp.at },
  );

  const [project] = await bound.tx
    .select({
      projectStart: s.project.projectStart,
      dataDate: s.project.dataDate,
    })
    .from(s.project)
    .where(and(eq(s.project.tenantId, bound.tenantId), eq(s.project.id, command.projectId)));
  if (!project) throw new Error(`project ${command.projectId} missing after flag read`);

  // Version is the pin even when the Project is not yet schedulable.
  if (project.projectStart === null || project.dataDate === null) {
    return {
      calendarVersionSeq,
      run: { seq: null, kind: 'cleared', haltedReason: null, outputs: null },
    };
  }

  const run = await recalculateProject({
    bound,
    projectId: command.projectId,
    cause: 'calendar',
    actor: stamp.actor,
    at: stamp.at,
  });

  return { calendarVersionSeq, run };
}

/**
 * Publish one Project's Holiday Calendar version and recalculate (run cause `calendar`).
 */
export async function publishCalendarVersion<Handle>(
  deps: CalendarWriteDeps<Handle>,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<PublishCalendarResult>> {
  const roles = authorize(ctx, { roles: PROJECT_REACH_ROLES });
  if (!roles.ok) return roles;

  return runAuditedWrite(
    publishSchema,
    deps,
    ctx,
    input,
    {
      at: (scope, command) => scope.projectWrite.projectAnchor(command.projectId),
      isNotFound: (error, command) => isProjectNotFound(error, command.projectId),
      authorize: (caller, command) =>
        authorize(caller, { roles: PROJECT_REACH_ROLES, projectId: command.projectId }),
    },
    async (scope, stamp, command) => {
      const bound = asBound(scope.bound);
      const result = await publishInsideTx(bound, stamp, command);
      await audit.record(scope, stamp, 'calendar.publish_version', command.projectId, {
        calendarVersionSeq: result.calendarVersionSeq,
        runSeq: result.run.seq,
        kind: result.run.kind,
        haltedReason: result.run.haltedReason,
        reason: command.reason ?? null,
      });
      return result;
    },
  );
}

/**
 * Operator national-table correction fan-out: one Project lock at a time, serial. A halt or
 * failure on one Project does not abort the rest. Per-Project `audit_log` only (Q1→B).
 */
export async function publishCalendarVersionFanOut<Handle>(
  deps: CalendarWriteDeps<Handle>,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<{ readonly results: readonly FanOutProjectResult[] }>> {
  const roles = authorize(ctx, { roles: PROJECT_REACH_ROLES });
  if (!roles.ok) return roles;

  const parsed = fanOutSchema.safeParse(input);
  if (!parsed.success) {
    return fail('invalid_input', invalidInputDetails(parsed.error));
  }

  const results: FanOutProjectResult[] = [];
  for (const projectId of parsed.data.projectIds) {
    const one = await publishCalendarVersion(deps, ctx, {
      projectId,
      reason: parsed.data.reason ?? 'national dataset correction',
      rangeStart: parsed.data.rangeStart,
      rangeEnd: parsed.data.rangeEnd,
    });
    if (!one.ok) {
      results.push({
        projectId,
        status: 'failed',
        error: one.error.code,
      });
      continue;
    }
    if (one.value.run.kind === 'halted') {
      results.push({
        projectId,
        status: 'halted',
        calendarVersionSeq: one.value.calendarVersionSeq,
        haltedReason: one.value.run.haltedReason,
      });
      continue;
    }
    results.push({
      projectId,
      status: 'ok',
      calendarVersionSeq: one.value.calendarVersionSeq,
      runSeq: one.value.run.seq,
    });
  }
  return ok({ results });
}

/** Patch JP/VN flags then publish a new version for that Project (settings Q2→A). */
export async function patchNationalCalendarFlags<Handle>(
  deps: CalendarWriteDeps<Handle>,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<PublishCalendarResult>> {
  const roles = authorize(ctx, { roles: PROJECT_REACH_ROLES });
  if (!roles.ok) return roles;

  return runAuditedWrite(
    patchFlagsSchema,
    deps,
    ctx,
    input,
    {
      at: (scope, command) => scope.projectWrite.projectAnchor(command.projectId),
      isNotFound: (error, command) => isProjectNotFound(error, command.projectId),
      authorize: (caller, command) =>
        authorize(caller, { roles: PROJECT_REACH_ROLES, projectId: command.projectId }),
    },
    async (scope, stamp, command) => {
      const bound = asBound(scope.bound);
      const schedule = scheduleRepositoryOn(bound);
      await lockWatermark(bound, { kind: 'project', projectId: command.projectId });
      await schedule.patchNationalFlags(command.projectId, {
        calendarJp: command.calendarJp,
        calendarVn: command.calendarVn,
      });
      const result = await publishInsideTx(bound, stamp, {
        projectId: command.projectId,
        reason: 'national calendar flags changed',
      });
      await audit.record(scope, stamp, 'calendar.publish_version', command.projectId, {
        calendarVersionSeq: result.calendarVersionSeq,
        runSeq: result.run.seq,
        kind: result.run.kind,
        haltedReason: result.run.haltedReason,
        reason: 'national calendar flags changed',
        calendarJp: command.calendarJp,
        calendarVn: command.calendarVn,
      });
      return result;
    },
  );
}

/** Add a Project non-working day then publish. */
export async function addProjectNonWorkingDay<Handle>(
  deps: CalendarWriteDeps<Handle>,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<PublishCalendarResult>> {
  const roles = authorize(ctx, { roles: PROJECT_REACH_ROLES });
  if (!roles.ok) return roles;

  return runAuditedWrite(
    daySchema,
    deps,
    ctx,
    input,
    {
      at: (scope, command) => scope.projectWrite.projectAnchor(command.projectId),
      isNotFound: (error, command) => isProjectNotFound(error, command.projectId),
      authorize: (caller, command) =>
        authorize(caller, { roles: PROJECT_REACH_ROLES, projectId: command.projectId }),
    },
    async (scope, stamp, command) => {
      const bound = asBound(scope.bound);
      const schedule = scheduleRepositoryOn(bound);
      try {
        await schedule.appendCalendarDayEvent({
          projectId: command.projectId,
          day: command.day,
          effect: 'add',
          actor: stamp.actor,
          at: stamp.at,
        });
      } catch (error) {
        if (
          error instanceof Error &&
          (error as { code?: string }).code === 'duplicate_calendar_day'
        ) {
          refuse('invalid_input', { day: ['duplicate'] });
        }
        throw error;
      }
      const result = await publishInsideTx(bound, stamp, {
        projectId: command.projectId,
        reason: `project day added: ${command.day}`,
      });
      await audit.record(scope, stamp, 'calendar.publish_version', command.projectId, {
        calendarVersionSeq: result.calendarVersionSeq,
        runSeq: result.run.seq,
        kind: result.run.kind,
        haltedReason: result.run.haltedReason,
        reason: `project day added: ${command.day}`,
        day: command.day,
        effect: 'add',
      });
      return result;
    },
  );
}

/** Remove a Project non-working day (tombstone) then publish. */
export async function removeProjectNonWorkingDay<Handle>(
  deps: CalendarWriteDeps<Handle>,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<PublishCalendarResult>> {
  const roles = authorize(ctx, { roles: PROJECT_REACH_ROLES });
  if (!roles.ok) return roles;

  return runAuditedWrite(
    daySchema,
    deps,
    ctx,
    input,
    {
      at: (scope, command) => scope.projectWrite.projectAnchor(command.projectId),
      isNotFound: (error, command) => isProjectNotFound(error, command.projectId),
      authorize: (caller, command) =>
        authorize(caller, { roles: PROJECT_REACH_ROLES, projectId: command.projectId }),
    },
    async (scope, stamp, command) => {
      const bound = asBound(scope.bound);
      const schedule = scheduleRepositoryOn(bound);
      await schedule.appendCalendarDayEvent({
        projectId: command.projectId,
        day: command.day,
        effect: 'remove',
        actor: stamp.actor,
        at: stamp.at,
      });
      const result = await publishInsideTx(bound, stamp, {
        projectId: command.projectId,
        reason: `project day removed: ${command.day}`,
      });
      await audit.record(scope, stamp, 'calendar.publish_version', command.projectId, {
        calendarVersionSeq: result.calendarVersionSeq,
        runSeq: result.run.seq,
        kind: result.run.kind,
        haltedReason: result.run.haltedReason,
        reason: `project day removed: ${command.day}`,
        day: command.day,
        effect: 'remove',
      });
      return result;
    },
  );
}
