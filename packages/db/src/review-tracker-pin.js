/**
 * Story 6.7 / Q1→C: Tracker-side freeze for the Review's life.
 *
 * Resolves per-Connector snapshot ids (and the Project-overall display pin) either from a
 * persisted freeze or from live heads. Write-side PM watermark / `schedule_run_seq` re-capture
 * stays deferred to Story 6.9.
 */
/**
 * Pick per-Connector pins and the overall display snapshot.
 * An incomplete or unknown freeze falls back to live heads (never throw for a stale cookie).
 */
export function resolveTrackerPins(input) {
    const liveByConnector = livePinsByConnector(input.snapshotRows, input.connectorIds);
    const liveOverall = overallLatest(input.snapshotRows)?.id;
    const freeze = input.freeze;
    if (freeze && freezeCoversConnectors(freeze, input.snapshotRows, input.connectorIds)) {
        return {
            trackerSnapshotIdByConnector: new Map(Object.entries(freeze.snapshotIdByConnector)),
            overallSnapshotId: freeze.overallSnapshotId,
            usedFreeze: true,
        };
    }
    return {
        trackerSnapshotIdByConnector: liveByConnector,
        overallSnapshotId: liveOverall,
        usedFreeze: false,
    };
}
/** Capture a persistable freeze from the Maps a successful load just used. */
export function captureReviewTrackerPin(input) {
    if (!input.overallSnapshotId)
        return null;
    if (input.trackerSnapshotIdByConnector.size === 0)
        return null;
    const snapshotIdByConnector = {};
    for (const [connectorId, snapshotId] of input.trackerSnapshotIdByConnector) {
        snapshotIdByConnector[connectorId] = snapshotId;
    }
    return { overallSnapshotId: input.overallSnapshotId, snapshotIdByConnector };
}
function livePinsByConnector(snapshotRows, connectorIds) {
    const out = new Map();
    for (const connectorId of connectorIds) {
        const latest = snapshotRows
            .filter((snap) => snap.connectorId === connectorId)
            .sort(compareSnapNewestFirst)[0];
        if (latest)
            out.set(connectorId, latest.id);
    }
    return out;
}
function overallLatest(snapshotRows) {
    if (snapshotRows.length === 0)
        return undefined;
    return [...snapshotRows].sort(compareSnapNewestFirst)[0];
}
function compareSnapNewestFirst(a, b) {
    const byTime = b.observedAt.getTime() - a.observedAt.getTime();
    if (byTime !== 0)
        return byTime;
    return b.seq - a.seq;
}
/**
 * Freeze is valid only when every current connector is mapped and each mapped snapshot
 * belongs to that connector (partial / mismatched maps fall back to live).
 */
function freezeCoversConnectors(freeze, snapshotRows, connectorIds) {
    if (freeze.overallSnapshotId === '' || connectorIds.length === 0)
        return false;
    if (!snapshotRows.some((row) => row.id === freeze.overallSnapshotId))
        return false;
    for (const connectorId of connectorIds) {
        const snapshotId = freeze.snapshotIdByConnector[connectorId];
        if (snapshotId === undefined || snapshotId === '')
            return false;
        const row = snapshotRows.find((snap) => snap.id === snapshotId);
        if (!row || row.connectorId !== connectorId)
            return false;
    }
    return true;
}
