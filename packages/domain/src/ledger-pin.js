/**
 * AR-21 / AD-10: ledger entry selection for a ComputationInputs pin.
 *
 * Entries are filtered by `snapshot_id ≤ the pinned snapshot` **per Connector**, comparing
 * each snapshot's append-only `seq` (not the text id). `ledger_seq_max` is derived only as an
 * assertion over that filtered set — never used as the filter itself.
 */
/**
 * Select ledger rows visible under a per-Connector snapshot pin.
 *
 * Greenfield (empty pin map) → empty ledger. An entry whose Connector has no pin, or whose
 * snapshot is unknown / newer than the pin, is excluded.
 */
export function selectLedgerForPin(entries, pinnedSnapshotIdByConnector, snapshotSeqById) {
    if (pinnedSnapshotIdByConnector.size === 0) {
        return { entries: [], ledgerSeqMax: null };
    }
    for (const [connectorId, pinnedId] of pinnedSnapshotIdByConnector) {
        if (!snapshotSeqById.has(pinnedId)) {
            throw new Error(`unknown pin snapshot id "${pinnedId}" for connector "${connectorId}"`);
        }
    }
    const filtered = entries.filter((entry) => {
        const connectorId = entry.connectorId;
        const snapshotId = entry.snapshotId;
        if (connectorId == null || connectorId === '' || snapshotId == null || snapshotId === '') {
            return false;
        }
        const pinnedId = pinnedSnapshotIdByConnector.get(connectorId);
        if (pinnedId === undefined)
            return false;
        const entrySnapSeq = snapshotSeqById.get(snapshotId);
        const pinnedSnapSeq = snapshotSeqById.get(pinnedId);
        if (entrySnapSeq === undefined || pinnedSnapSeq === undefined)
            return false;
        return entrySnapSeq <= pinnedSnapSeq;
    });
    return { entries: filtered, ledgerSeqMax: ledgerSeqMaxOf(filtered) };
}
/** Assertion wall: recompute saw the same row set the pin recorded. */
export function assertLedgerSeqMax(entries, ledgerSeqMax) {
    const expected = ledgerSeqMaxOf(entries);
    if (expected !== ledgerSeqMax) {
        throw new Error(`ledger_seq_max assertion failed: expected ${String(expected)}, got ${String(ledgerSeqMax)}`);
    }
}
function ledgerSeqMaxOf(entries) {
    if (entries.length === 0)
        return null;
    let max = entries[0].seq;
    for (let i = 1; i < entries.length; i += 1) {
        const seq = entries[i].seq;
        if (seq > max)
            max = seq;
    }
    return max;
}
