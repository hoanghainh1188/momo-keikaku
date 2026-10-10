/**
 * Snapshot schedule helpers and PM-facing pin / Refresh use cases (story 5.4 / FR-19 / AR-28).
 *
 * Due selection, Search-budget slowdown, next-run, and enqueue. The durable writer is 5.5 —
 * this story only puts jobs on the `stately` `ingest-snapshot` queue.
 */
import { buildCalendar, isSnapshotBusinessWindow, } from '@momo/domain';
import { PROJECT_REACH, PROJECT_REACH_ROLES, authorize } from '../authz/authorize';
import { fail, ok } from '../result';
import { refuse } from './audited-write';
export const HOURLY_INTERVAL_MS = 60 * 60 * 1000;
export const OFF_WINDOW_INTERVAL_MS = 6 * HOURLY_INTERVAL_MS;
/** Backlog page size used by the Search-budget formula (story 5.3 / AR-13). */
export const SEARCH_PAGE_SIZE = 100;
export const READ_COMPLETE_WRITER_PENDING_REASON = 'read_complete_writer_pending';
export const RATE_LIMIT_PACED_REASON = 'rate_limit_paced';
export const READ_COMPLETE_WRITER_PENDING_MESSAGE = 'The Backlog read completed. Writing the Actuals Ledger lands with the next story; figures stay at the last good snapshot until then.';
export const SEARCH_BUDGET_SLOWDOWN_MESSAGE = 'Snapshot schedule slowed: one full Search would use more than 25% of the Search budget, so cadence is at least every 6 hours.';
export const RATE_LIMIT_PACED_MESSAGE = 'Backlog rate limit is exhausted; the next snapshot is deferred until the bucket resets.';
/** JP+VN national calendar for the schedule handler (AR-28). */
export function snapshotScheduleCalendar() {
    return buildCalendar('snapshot-schedule', { jp: true, vn: true });
}
/** Search calls for one full read: one per page plus before/after Count Issues. */
export function estimateSearchCalls(ticketCount) {
    return Math.ceil(ticketCount / SEARCH_PAGE_SIZE) + 2;
}
/** True when one full read would exceed 25% of the Search bucket. */
export function exceedsSearchBudget(ticketCount, searchLimit) {
    return estimateSearchCalls(ticketCount) * 4 > searchLimit;
}
/**
 * Search-budget slowdown for the schedule. `null` = fixture / unknown (no slowdown).
 * `searchLimit <= 0` is treated as already over budget (story 5.4 review).
 */
export function isSearchBudgetSlowdown(searchLimit, ticketCount) {
    if (searchLimit == null)
        return false;
    if (searchLimit <= 0)
        return true;
    return exceedsSearchBudget(ticketCount, searchLimit);
}
/**
 * Due watermark: max(latest snapshot.observedAt, latest attempt.attemptedAt).
 * Null when the Connector has never been attempted or snapshotted.
 */
export function dueWatermark(latestSnapshotAt, latestAttemptAt) {
    if (latestSnapshotAt === null)
        return latestAttemptAt;
    if (latestAttemptAt === null)
        return latestSnapshotAt;
    return latestSnapshotAt.getTime() >= latestAttemptAt.getTime()
        ? latestSnapshotAt
        : latestAttemptAt;
}
/**
 * Whether a Connector should be enqueued on this tick.
 * Inside the business window → hourly (unless Search-budget slowdown forces the 6 h floor);
 * outside → at least every 6 hours.
 */
export function isConnectorDue(args) {
    const intervalMs = args.inBusinessWindow && !args.searchBudgetSlowdown
        ? HOURLY_INTERVAL_MS
        : OFF_WINDOW_INTERVAL_MS;
    if (args.lastActivityAt === null)
        return true;
    return args.now.getTime() - args.lastActivityAt.getTime() >= intervalMs;
}
/** Next scheduled instant for the pin popover. */
export function nextScheduledAt(args) {
    const intervalMs = args.inBusinessWindow && !args.searchBudgetSlowdown
        ? HOURLY_INTERVAL_MS
        : OFF_WINDOW_INTERVAL_MS;
    if (args.lastActivityAt === null)
        return args.now;
    const dueAt = new Date(args.lastActivityAt.getTime() + intervalMs);
    return dueAt.getTime() > args.now.getTime() ? dueAt : args.now;
}
/**
 * When `rateLimit` says to wait, the instant to startAfter; otherwise null.
 * Treats remaining === 0 (or null with a future reset) as paced.
 */
export function rateLimitStartAfter(rateLimit, now) {
    if (!rateLimit?.resetAt)
        return null;
    const resetAt = new Date(rateLimit.resetAt);
    if (Number.isNaN(resetAt.getTime()) || resetAt.getTime() <= now.getTime())
        return null;
    if (rateLimit.remaining === null || rateLimit.remaining <= 0)
        return resetAt;
    return null;
}
/**
 * Pure selection over already-loaded Connector rows + watermarks + ticket counts.
 * Worker loads rows under `withTenant` and calls this.
 */
export function selectDueConnectors(rows, input) {
    const cal = input.calendar ?? snapshotScheduleCalendar();
    const inWindow = isSnapshotBusinessWindow(input.now, cal);
    const due = [];
    for (const row of rows) {
        const slowdown = isSearchBudgetSlowdown(row.connector.searchLimit, row.latestTicketCount);
        if (!isConnectorDue({
            now: input.now,
            lastActivityAt: row.lastActivityAt,
            inBusinessWindow: inWindow,
            searchBudgetSlowdown: slowdown,
        })) {
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
/**
 * On-demand Refresh now — enqueue `ingest-snapshot` with `singletonKey = connectorId`.
 * When `connectorId` is omitted, refreshes the Project's Connector (R0: one per Project).
 */
export async function requestSnapshotRefresh(deps, ctx, input) {
    const roles = authorize(ctx, { roles: PROJECT_REACH_ROLES, projectId: input.projectId });
    if (!roles.ok)
        return roles;
    try {
        const connectorId = await deps.transaction(deps.handle, ctx.tenantId, async (scope) => {
            const connector = input.connectorId
                ? await scope.connectorWrite.findConnector(input.connectorId)
                : await scope.connectorWrite.findConnectorForProject(input.projectId);
            if (!connector || connector.projectId !== input.projectId)
                refuse('not_found');
            return connector.id;
        });
        await deps.queue.enqueue({
            tenantId: ctx.tenantId,
            projectId: input.projectId,
            connectorId,
        });
        return ok({ connectorId });
    }
    catch (error) {
        if (error instanceof Error && error.message === 'refused: not_found')
            return fail('not_found');
        throw error;
    }
}
export async function listSnapshotAttempts(deps, ctx, input) {
    const roles = authorize(ctx, { roles: PROJECT_REACH_ROLES, projectId: input.projectId });
    if (!roles.ok)
        return roles;
    try {
        const rows = await deps.transaction(deps.handle, ctx.tenantId, async (scope) => {
            const connector = await scope.connectorWrite.findConnector(input.connectorId);
            if (!connector || connector.projectId !== input.projectId)
                refuse('not_found');
            return scope.connectorWrite.listSnapshotAttempts(input.connectorId, input.limit ?? 20);
        });
        return ok(rows);
    }
    catch (error) {
        if (error instanceof Error && error.message === 'refused: not_found')
            return fail('not_found');
        throw error;
    }
}
export async function getSnapshotPinState(deps, ctx, input) {
    const roles = authorize(ctx, { roles: PROJECT_REACH_ROLES, projectId: input.projectId });
    if (!roles.ok)
        return roles;
    try {
        const state = await deps.transaction(deps.handle, ctx.tenantId, async (scope) => {
            const connectors = (await scope.connectorWrite.listConnectors()).filter((c) => c.projectId === input.projectId);
            const latest = await scope.connectorWrite.latestSnapshotForProject(input.projectId);
            const now = deps.clock.now();
            const cal = snapshotScheduleCalendar();
            const inWindow = isSnapshotBusinessWindow(now, cal);
            let anySlowdown = false;
            const pinConnectors = [];
            let earliestNext = now;
            let firstNext = true;
            let attempts = [];
            for (const connector of connectors) {
                const snap = await scope.connectorWrite.latestSnapshot(connector.id);
                const attemptAt = await scope.connectorWrite.latestAttemptAt(connector.id);
                const lastActivity = dueWatermark(snap?.observedAt ?? null, attemptAt);
                const ticketCount = snap?.ticketCount ?? 0;
                const slowdown = isSearchBudgetSlowdown(connector.searchLimit, ticketCount);
                if (slowdown)
                    anySlowdown = true;
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
                newerThanReviewPin: latest != null &&
                    input.reviewPinnedSnapshotId != null &&
                    input.reviewPinnedSnapshotId !== '' &&
                    input.reviewPinnedSnapshotId !== latest.id,
            };
        });
        return ok(state);
    }
    catch (error) {
        if (error instanceof Error && error.message === 'refused: not_found')
            return fail('not_found');
        throw error;
    }
}
export const CONNECTOR_SCHEDULE_ROLES = {
    requestSnapshotRefresh: PROJECT_REACH,
    listSnapshotAttempts: PROJECT_REACH,
    getSnapshotPinState: PROJECT_REACH,
};
