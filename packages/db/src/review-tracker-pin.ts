/**
 * Story 6.7 / Q1→C: Tracker-side freeze for the Review's life.
 *
 * Resolves per-Connector snapshot ids (and the Project-overall display pin) either from a
 * persisted freeze or from live heads. Write-side PM watermark / `schedule_run_seq` re-capture
 * stays deferred to Story 6.9.
 */

export interface ReviewTrackerPin {
  /** Project-overall snapshot id shown in Review chrome (latest among Connectors at pin time). */
  readonly overallSnapshotId: string;
  /** Per-Connector snapshot ids that freeze ledger + observations. */
  readonly snapshotIdByConnector: Readonly<Record<string, string>>;
}

export interface SnapshotPinRow {
  readonly id: string;
  readonly seq: number;
  readonly connectorId: string;
  readonly observedAt: Date;
}

export interface ResolvedTrackerPins {
  readonly trackerSnapshotIdByConnector: Map<string, string>;
  readonly overallSnapshotId: string | undefined;
  /** True when the freeze was applied; false when live heads were used (missing/invalid freeze). */
  readonly usedFreeze: boolean;
}

/**
 * Pick per-Connector pins and the overall display snapshot.
 * An incomplete or unknown freeze falls back to live heads (never throw for a stale cookie).
 */
export function resolveTrackerPins(input: {
  readonly snapshotRows: readonly SnapshotPinRow[];
  readonly connectorIds: readonly string[];
  readonly freeze?: ReviewTrackerPin | null;
}): ResolvedTrackerPins {
  const liveByConnector = livePinsByConnector(input.snapshotRows, input.connectorIds);
  const liveOverall = overallLatest(input.snapshotRows)?.id;

  const freeze = input.freeze;
  if (
    freeze &&
    freeze.overallSnapshotId !== '' &&
    Object.keys(freeze.snapshotIdByConnector).length > 0 &&
    freezeIdsExist(freeze, input.snapshotRows)
  ) {
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
export function captureReviewTrackerPin(input: {
  readonly overallSnapshotId: string;
  readonly trackerSnapshotIdByConnector: ReadonlyMap<string, string>;
}): ReviewTrackerPin | null {
  if (!input.overallSnapshotId) return null;
  if (input.trackerSnapshotIdByConnector.size === 0) return null;
  const snapshotIdByConnector: Record<string, string> = {};
  for (const [connectorId, snapshotId] of input.trackerSnapshotIdByConnector) {
    snapshotIdByConnector[connectorId] = snapshotId;
  }
  return { overallSnapshotId: input.overallSnapshotId, snapshotIdByConnector };
}

function livePinsByConnector(
  snapshotRows: readonly SnapshotPinRow[],
  connectorIds: readonly string[],
): Map<string, string> {
  const out = new Map<string, string>();
  for (const connectorId of connectorIds) {
    const latest = snapshotRows
      .filter((snap) => snap.connectorId === connectorId)
      .sort(compareSnapNewestFirst)[0];
    if (latest) out.set(connectorId, latest.id);
  }
  return out;
}

function overallLatest(snapshotRows: readonly SnapshotPinRow[]): SnapshotPinRow | undefined {
  if (snapshotRows.length === 0) return undefined;
  return [...snapshotRows].sort(compareSnapNewestFirst)[0];
}

function compareSnapNewestFirst(a: SnapshotPinRow, b: SnapshotPinRow): number {
  const byTime = b.observedAt.getTime() - a.observedAt.getTime();
  if (byTime !== 0) return byTime;
  return b.seq - a.seq;
}

function freezeIdsExist(
  freeze: ReviewTrackerPin,
  snapshotRows: readonly SnapshotPinRow[],
): boolean {
  const ids = new Set(snapshotRows.map((r) => r.id));
  if (!ids.has(freeze.overallSnapshotId)) return false;
  for (const snapshotId of Object.values(freeze.snapshotIdByConnector)) {
    if (!ids.has(snapshotId)) return false;
  }
  return true;
}
