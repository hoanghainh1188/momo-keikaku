/**
 * Snapshot schedule helpers and PM-facing pin / Refresh use cases (story 5.4 / FR-19 / AR-28).
 *
 * Due selection, Search-budget slowdown, next-run, and enqueue. The durable writer is 5.5 —
 * this story only puts jobs on the `stately` `ingest-snapshot` queue.
 */
import {
  buildCalendar,
  isSnapshotBusinessWindow,
  type HolidayCalendar,
  type RateLimitState,
} from '@momo/domain';
import { PROJECT_REACH, PROJECT_REACH_ROLES, authorize, type RoleDeclaration } from '../authz/authorize';
import type { RequestContext } from '../authz/request-context';
import type { Clock } from '../ports/clock';
import type {
  ConnectorPublicRow,
  ConnectorWriteDeps,
  LatestSnapshotRow,
  SnapshotAttemptRow,
} from '../ports/connector-write';
import type { IngestSnapshotQueuePort } from '../ports/ingest-snapshot-queue';
import { fail, ok, type Result } from '../result';
import { refuse } from './audited-write';

export const HOURLY_INTERVAL_MS = 60 * 60 * 1000;
export const OFF_WINDOW_INTERVAL_MS = 6 * HOURLY_INTERVAL_MS;
/** Backlog page size used by the Search-budget formula (story 5.3 / AR-13). */
export const SEARCH_PAGE_SIZE = 100;

export const READ_COMPLETE_WRITER_PENDING_REASON = 'read_complete_writer_pending' as const;
export const RATE_LIMIT_PACED_REASON = 'rate_limit_paced' as const;

export const READ_COMPLETE_WRITER_PENDING_MESSAGE =
  'The Backlog read completed. Writing the Actuals Ledger lands with the next story; figures stay at the last good snapshot until then.';

export const SEARCH_BUDGET_SLOWDOWN_MESSAGE =
  'Snapshot schedule slowed: one full Search would use more than 25% of the Search budget, so cadence is at least every 6 hours.';

export const RATE_LIMIT_PACED_MESSAGE =
  'Backlog rate limit is exhausted; the next snapshot is deferred until the bucket resets.';

/** JP+VN national calendar for the schedule handler (AR-28). */
export function snapshotScheduleCalendar(): HolidayCalendar {
  return buildCalendar('snapshot-schedule', { jp: true, vn: true });
}

/** Search calls for one full read: one per page plus before/after Count Issues. */
export function estimateSearchCalls(ticketCount: number): number {
  return Math.ceil(ticketCount / SEARCH_PAGE_SIZE) + 2;
}

/** True when one full read would exceed 25% of the Search bucket. */
export function exceedsSearchBudget(ticketCount: number, searchLimit: number): boolean {
  return estimateSearchCalls(ticketCount) * 4 > searchLimit;
}

/**
 * Search-budget slowdown for the schedule. `null` = fixture / unknown (no slowdown).
 * `searchLimit <= 0` is treated as already over budget (story 5.4 review).
 */
export function isSearchBudgetSlowdown(
  searchLimit: number | null,
  ticketCount: number,
): boolean {
  if (searchLimit == null) return false;
  if (searchLimit <= 0) return true;
  return exceedsSearchBudget(ticketCount, searchLimit);
}

/**
 * Due watermark: max(latest snapshot.observedAt, latest attempt.attemptedAt).
 * Null when the Connector has never been attempted or snapshotted.
 */
export function dueWatermark(
  latestSnapshotAt: Date | null,
  latestAttemptAt: Date | null,
): Date | null {
  if (latestSnapshotAt === null) return latestAttemptAt;
  if (latestAttemptAt === null) return latestSnapshotAt;
  return latestSnapshotAt.getTime() >= latestAttemptAt.getTime()
    ? latestSnapshotAt
    : latestAttemptAt;
}

/**
 * Whether a Connector should be enqueued on this tick.
 * Inside the business window → hourly (unless Search-budget slowdown forces the 6 h floor);
 * outside → at least every 6 hours.
 */
export function isConnectorDue(args: {
  readonly now: Date;
  readonly lastActivityAt: Date | null;
  readonly inBusinessWindow: boolean;
  readonly searchBudgetSlowdown: boolean;
}): boolean {
  const intervalMs =
    args.inBusinessWindow && !args.searchBudgetSlowdown
      ? HOURLY_INTERVAL_MS
      : OFF_WINDOW_INTERVAL_MS;
  if (args.lastActivityAt === null) return true;
  return args.now.getTime() - args.lastActivityAt.getTime() >= intervalMs;
}

/** Next scheduled instant for the pin popover. */
export function nextScheduledAt(args: {
  readonly now: Date;
  readonly lastActivityAt: Date | null;
  readonly inBusinessWindow: boolean;
  readonly searchBudgetSlowdown: boolean;
}): Date {
  const intervalMs =
    args.inBusinessWindow && !args.searchBudgetSlowdown
      ? HOURLY_INTERVAL_MS
      : OFF_WINDOW_INTERVAL_MS;
  if (args.lastActivityAt === null) return args.now;
  const dueAt = new Date(args.lastActivityAt.getTime() + intervalMs);
  return dueAt.getTime() > args.now.getTime() ? dueAt : args.now;
}

/**
 * When `rateLimit` says to wait, the instant to startAfter; otherwise null.
 * Treats remaining === 0 (or null with a future reset) as paced.
 */
export function rateLimitStartAfter(
  rateLimit: RateLimitState | null | undefined,
  now: Date,
): Date | null {
  if (!rateLimit?.resetAt) return null;
  const resetAt = new Date(rateLimit.resetAt);
  if (Number.isNaN(resetAt.getTime()) || resetAt.getTime() <= now.getTime()) return null;
  if (rateLimit.remaining === null || rateLimit.remaining <= 0) return resetAt;
  return null;
}

export interface DueConnector {
  readonly connector: ConnectorPublicRow;
  readonly searchBudgetSlowdown: boolean;
  readonly startAfter: Date | null;
}

export interface SelectDueConnectorsInput {
  readonly now: Date;
  readonly calendar?: HolidayCalendar;
  /** Optional last-known rate limit per connectorId (from a prior job). */
  readonly rateLimitsByConnectorId?: ReadonlyMap<string, RateLimitState | null>;
}

/**
 * Pure selection over already-loaded Connector rows + watermarks + ticket counts.
 * Worker loads rows under `withTenant` and calls this.
 */
export function selectDueConnectors(
  rows: readonly {
    readonly connector: ConnectorPublicRow;
    readonly lastActivityAt: Date | null;
    readonly latestTicketCount: number;
  }[],
  input: SelectDueConnectorsInput,
): readonly DueConnector[] {
  const cal = input.calendar ?? snapshotScheduleCalendar();
  const inWindow = isSnapshotBusinessWindow(input.now, cal);
  const due: DueConnector[] = [];
  for (const row of rows) {
    const slowdown = isSearchBudgetSlowdown(
      row.connector.searchLimit,
      row.latestTicketCount,
    );
    if (
      !isConnectorDue({
        now: input.now,
        lastActivityAt: row.lastActivityAt,
        inBusinessWindow: inWindow,
        searchBudgetSlowdown: slowdown,
      })
    ) {
      continue;
    }
    const rateLimit = input.rateLimitsByConnectorId?.get(row.connector.id);
    due.push({
      connector: row.connector,
      searchBudgetSlowdown: slowdown,
      startAfter: rateLimitStartAfter(rateLimit ?? null, input.now),
    });
  }
  return due;
}

// --- PM-facing use cases --------------------------------------------------------------------

export interface RequestSnapshotRefreshInput {
  readonly projectId: string;
  readonly connectorId?: string;
}

export type SnapshotScheduleDeps<Handle> = ConnectorWriteDeps<Handle> & {
  readonly queue: IngestSnapshotQueuePort;
};

/**
 * On-demand Refresh now — enqueue `ingest-snapshot` with `singletonKey = connectorId`.
 * When `connectorId` is omitted, refreshes the Project's Connector (R0: one per Project).
 */
export async function requestSnapshotRefresh<Handle>(
  deps: SnapshotScheduleDeps<Handle>,
  ctx: RequestContext,
  input: RequestSnapshotRefreshInput,
): Promise<Result<{ readonly connectorId: string }>> {
  const roles = authorize(ctx, { roles: PROJECT_REACH_ROLES, projectId: input.projectId });
  if (!roles.ok) return roles;

  try {
    const connectorId = await deps.transaction(deps.handle, ctx.tenantId, async (scope) => {
      const connector = input.connectorId
        ? await scope.connectorWrite.findConnector(input.connectorId)
        : await scope.connectorWrite.findConnectorForProject(input.projectId);
      if (!connector || connector.projectId !== input.projectId) refuse('not_found');
      return connector.id;
    });
    await deps.queue.enqueue({
      tenantId: ctx.tenantId,
      projectId: input.projectId,
      connectorId,
    });
    return ok({ connectorId });
  } catch (error) {
    if (error instanceof Error && error.message === 'refused: not_found') return fail('not_found');
    throw error;
  }
}

export interface ListSnapshotAttemptsInput {
  readonly projectId: string;
  readonly connectorId: string;
  readonly limit?: number;
}

export async function listSnapshotAttempts<Handle>(
  deps: ConnectorWriteDeps<Handle>,
  ctx: RequestContext,
  input: ListSnapshotAttemptsInput,
): Promise<Result<readonly SnapshotAttemptRow[]>> {
  const roles = authorize(ctx, { roles: PROJECT_REACH_ROLES, projectId: input.projectId });
  if (!roles.ok) return roles;

  try {
    const rows = await deps.transaction(deps.handle, ctx.tenantId, async (scope) => {
      const connector = await scope.connectorWrite.findConnector(input.connectorId);
      if (!connector || connector.projectId !== input.projectId) refuse('not_found');
      return scope.connectorWrite.listSnapshotAttempts(input.connectorId, input.limit ?? 20);
    });
    return ok(rows);
  } catch (error) {
    if (error instanceof Error && error.message === 'refused: not_found') return fail('not_found');
    throw error;
  }
}

export interface SnapshotPinConnector {
  readonly id: string;
  readonly spaceLabel: string;
  readonly searchBudgetSlowdown: boolean;
}

export interface SnapshotPinState {
  readonly latestSnapshot: LatestSnapshotRow | null;
  readonly snapshotAgeMinutes: number;
  readonly nextScheduledAt: Date;
  readonly connectors: readonly SnapshotPinConnector[];
  readonly searchBudgetSlowdown: boolean;
  readonly slowdownMessage: string | null;
  readonly attempts: readonly SnapshotAttemptRow[];
}

export interface GetSnapshotPinStateInput {
  readonly projectId: string;
  /** When set and older than `latestSnapshot`, the UI offers Re-pin. */
  readonly reviewPinnedSnapshotId?: string | null;
}

export interface SnapshotPinStateResult extends SnapshotPinState {
  readonly newerThanReviewPin: boolean;
}

export async function getSnapshotPinState<Handle>(
  deps: ConnectorWriteDeps<Handle> & { readonly clock: Clock },
  ctx: RequestContext,
  input: GetSnapshotPinStateInput,
): Promise<Result<SnapshotPinStateResult>> {
  const roles = authorize(ctx, { roles: PROJECT_REACH_ROLES, projectId: input.projectId });
  if (!roles.ok) return roles;

  try {
    const state = await deps.transaction(deps.handle, ctx.tenantId, async (scope) => {
      const connectors = (await scope.connectorWrite.listConnectors()).filter(
        (c) => c.projectId === input.projectId,
      );
      const latest = await scope.connectorWrite.latestSnapshotForProject(input.projectId);
      const now = deps.clock.now();
      const cal = snapshotScheduleCalendar();
      const inWindow = isSnapshotBusinessWindow(now, cal);

      let anySlowdown = false;
      const pinConnectors: SnapshotPinConnector[] = [];
      let earliestNext = now;
      let firstNext = true;
      let attempts: SnapshotAttemptRow[] = [];

      for (const connector of connectors) {
        const snap = await scope.connectorWrite.latestSnapshot(connector.id);
        const attemptAt = await scope.connectorWrite.latestAttemptAt(connector.id);
        const lastActivity = dueWatermark(snap?.observedAt ?? null, attemptAt);
        const ticketCount = snap?.ticketCount ?? 0;
        const slowdown = isSearchBudgetSlowdown(connector.searchLimit, ticketCount);
        if (slowdown) anySlowdown = true;
        pinConnectors.push({
          id: connector.id,
          spaceLabel: connector.spaceLabel,
          searchBudgetSlowdown: slowdown,
        });
        const next = nextScheduledAt({
          now,
          lastActivityAt: lastActivity,
          inBusinessWindow: inWindow,
          searchBudgetSlowdown: slowdown,
        });
        if (firstNext || next.getTime() < earliestNext.getTime()) {
          earliestNext = next;
          firstNext = false;
        }
        if (attempts.length === 0) {
          attempts = [...(await scope.connectorWrite.listSnapshotAttempts(connector.id, 10))];
        }
      }

      const ageMinutes = latest
        ? Math.max(0, Math.round((now.getTime() - latest.observedAt.getTime()) / 60_000))
        : 0;

      return {
        latestSnapshot: latest,
        snapshotAgeMinutes: ageMinutes,
        nextScheduledAt: earliestNext,
        connectors: pinConnectors,
        searchBudgetSlowdown: anySlowdown,
        slowdownMessage: anySlowdown ? SEARCH_BUDGET_SLOWDOWN_MESSAGE : null,
        attempts,
        newerThanReviewPin:
          latest != null &&
          input.reviewPinnedSnapshotId != null &&
          input.reviewPinnedSnapshotId !== '' &&
          input.reviewPinnedSnapshotId !== latest.id,
      } satisfies SnapshotPinStateResult;
    });
    return ok(state);
  } catch (error) {
    if (error instanceof Error && error.message === 'refused: not_found') return fail('not_found');
    throw error;
  }
}

export const CONNECTOR_SCHEDULE_ROLES = {
  requestSnapshotRefresh: PROJECT_REACH,
  listSnapshotAttempts: PROJECT_REACH,
  getSnapshotPinState: PROJECT_REACH,
} as const satisfies Readonly<Record<string, RoleDeclaration>>;
